from flask import Flask, jsonify, request, Response, stream_with_context
import random
from planning import herding, state
from simulation import world
import time
import threading
import numpy as np
from typing import Optional
from datetime import datetime, timezone
import json

# Thread-safe lock for world reinitialization
world_lock = threading.RLock()
current_scenario_id = None  # Track what scenario is currently loaded


class JobCache:
    """Cache for jobs that maintains both list and O(1) dict lookup."""
    def __init__(self, initial=None):
        self.list = []
        self.map = {}
        if initial:
            for j in initial:
                self.add(j)

    def add(self, job):
        """Add a job, ensuring no duplicates by ID."""
        if job.id in self.map:
            return self.map[job.id]
        self.list.append(job)
        self.map[job.id] = job
        return job

    def get(self, job_id):
        """Get job by ID in O(1) time."""
        return self.map.get(job_id)

    def remove(self, job_id):
        """Remove job by ID."""
        j = self.map.pop(job_id, None)
        if j is not None:
            # Remove by identity
            self.list = [x for x in self.list if x is not j]
        return j

def _create_policy_for_world(w: world.World) -> herding.ShepherdPolicy:
    """Create a herding policy matched to the given world's flock size."""
    total_area = 0.5 * w.N * (w.ra ** 2)
    collected_herd_radius = np.sqrt(total_area)
    return herding.ShepherdPolicy(
        fN=collected_herd_radius,
        umax=w.umax,
        too_close=1.5 * w.ra,
        collect_standoff=1.0 * w.ra,
    )

def initialize_sim():
    """Initialize a new simulation with default parameters."""
    from datetime import datetime
    from server import jobs_api
    
    flock_size = 50
    # Calculate appropriate k_nn based on flock size (must be <= N-1)
    k_nn = min(21, max(1, flock_size - 1))
    
    backend_adapter = world.World(
        sheep_xy=np.array([[random.uniform(0, 200), random.uniform(0, 200)] for _ in range(flock_size)]),
        shepherd_xy=np.array([[0.0, 0.0]]),
        target_xy=None,  # No target by default - user must set via frontend
        boundary="none",
        k_nn=k_nn,
        dt=0.1,
    )
    backend_adapter.paused = True  # Start paused since there's no target yet
    policy = _create_policy_for_world(backend_adapter)

    # Load existing jobs from database (for recovery after restart)
    repo = jobs_api.get_repo()
    db_jobs = repo.list()
    
    # Filter: keep running and scheduled jobs for recovery
    # Completed/cancelled jobs are kept in DB but don't need to be in-memory
    active_jobs = [j for j in db_jobs if j.status in ("running", "scheduled", "pending")]
    
    # If no jobs exist, create a default pending job
    if not db_jobs:
        now = datetime.now(timezone.utc).timestamp()
        default_job = repo.create(
            target=None,
            target_radius=policy.fN * 1.5,
            is_active=False,
            drones=1,
            status="pending",
            start_at=None,
            scenario_id=None,  # Default job is not scenario-specific
        )
        active_jobs = [default_job]
    
    return backend_adapter, policy, JobCache(active_jobs)

backend_adapter, policy, jobs_cache = initialize_sim()
jobs = jobs_cache.list  # Convenience alias for iteration

app = Flask(__name__)

# Allowed origins for CORS (development)
ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

def get_allowed_origin():
    """Get the allowed origin from the request, or return the first allowed origin."""
    origin = request.headers.get('Origin')
    if origin in ALLOWED_ORIGINS:
        return origin
    # Default to first allowed origin if no match or no origin header
    return ALLOWED_ORIGINS[0]

# Manual CORS handling - handle ALL requests including OPTIONS preflight
@app.before_request
def handle_preflight():
    """Handle CORS preflight OPTIONS requests."""
    if request.method == "OPTIONS":
        response = Response()
        allowed_origin = get_allowed_origin()
        response.headers['Access-Control-Allow-Origin'] = allowed_origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response

# Add CORS headers to ALL responses
@app.after_request
def after_request(response):
    """Add CORS headers to all responses."""
    # For streaming responses, headers are set directly in the Response object
    # This handler applies to non-streaming responses
    if response.mimetype == 'text/event-stream':
        # Streaming responses already have CORS headers set directly
        return response
    
    origin = request.headers.get('Origin')
    # Always add CORS headers if there's an Origin header (browser request)
    if origin:
        allowed_origin = get_allowed_origin()
        response.headers['Access-Control-Allow-Origin'] = allowed_origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control'
        response.headers['Access-Control-Expose-Headers'] = 'Content-Type, Cache-Control'
    return response

# Register scenarios API blueprint
from server.scenarios_api import scenarios_bp, REPO
from server.drone_management import create_drones_blueprint
from server import jobs_api
app.register_blueprint(scenarios_bp)
app.register_blueprint(create_drones_blueprint(backend_adapter))

# Register jobs API blueprint
api_jobs_bp = jobs_api.create_jobs_blueprint(world_lock, jobs_cache)
app.register_blueprint(api_jobs_bp)

@app.route("/state", methods=["GET", "OPTIONS"])
def get_state():
    """Get current simulation state with pause status."""
    if request.method == 'OPTIONS':
        return Response(status=200)
    with world_lock:
        state = backend_adapter.get_state()
        state.jobs = jobs
        state_dict = state.to_dict()
        state_dict["paused"] = backend_adapter.paused
        return jsonify(state_dict)

@app.route("/stream/state", methods=["GET", "OPTIONS"])
def stream_state():
    """Stream simulation state via Server-Sent Events (SSE)."""
    # Handle preflight OPTIONS request for CORS
    if request.method == 'OPTIONS':
        response = Response()
        allowed_origin = get_allowed_origin()
        response.headers['Access-Control-Allow-Origin'] = allowed_origin
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response
    
    def generate():
        try:
            while True:
                try:
                    # Acquire lock for thread-safe state access
                    with world_lock:
                        state = backend_adapter.get_state()
                        state.jobs = jobs
                        state_dict = state.to_dict()
                        state_dict["paused"] = backend_adapter.paused
                        
                        # Transform job status from "running" to "active" for frontend compatibility
                        if "jobs" in state_dict:
                            for job in state_dict["jobs"]:
                                if job.get("status") == "running":
                                    job["status"] = "active"
                    
                    # Format as SSE event
                    event_data = f"event: stateUpdate\ndata: {json.dumps(state_dict)}\n\n"
                    yield event_data
                    
                    # Sleep for ~16.67ms to achieve ~60 FPS
                    time.sleep(0.01667)
                    
                except GeneratorExit:
                    # Client disconnected
                    break
                except Exception as e:
                    # Log error but continue streaming
                    # Send comment keepalive to maintain connection
                    yield ": keepalive\n\n"
                    time.sleep(0.01667)
        finally:
            pass
    
    # Set proper headers for SSE with explicit CORS
    # Note: Flask's after_request may not work with streaming responses,
    # so we must set all CORS headers directly here
    allowed_origin = get_allowed_origin()
    response = Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',  # Disable proxy buffering
            'Access-Control-Allow-Origin': allowed_origin,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Cache-Control',
            'Access-Control-Expose-Headers': 'Content-Type, Cache-Control',
        }
    )
    return response

@app.route("/target", methods=["POST"])
def set_target():
    """Set the target position for the herding simulation."""
    data = request.get_json()
    if not data or "position" not in data:
        return jsonify({"error": "Missing 'position' field"}), 400

    try:
        pos = np.asarray(data["position"], float).reshape(2)
    except (ValueError, TypeError):
        return jsonify({"error": "'position' must be [x, y]"}), 400
    
    if not np.all(np.isfinite(pos)):
        return jsonify({"error": "position values must be finite numbers"}), 400

    if len(jobs) == 0:
        return
    
    with world_lock:
        jobs[0].target = pos
        # Also set the world's target and unpause if there's a target
        backend_adapter.target = pos
        if backend_adapter.paused and pos is not None:
            backend_adapter.paused = False
        
    return jsonify(backend_adapter.get_state().to_dict())

@app.route("/restart", methods=["POST"])
def restart_sim():
    """Restart simulation with default parameters."""
    global backend_adapter, policy, jobs_cache, jobs, current_scenario_id
    
    with world_lock:
        backend_adapter, policy, jobs_cache = initialize_sim()
        jobs = jobs_cache.list  # Update the alias
        current_scenario_id = None  # Clear any loaded scenario
        # Ensure it starts paused since there's no target
        backend_adapter.paused = True
    
    return jsonify(backend_adapter.get_state().to_dict())

def _ensure_polygon_array(poly_like):
    """Validate and normalize polygon input to Nx2 array with N>=3."""
    arr = np.asarray(poly_like, dtype=float)
    if arr.ndim != 2 or arr.shape[1] != 2 or len(arr) < 3:
        raise ValueError("polygon must be an Nx2 array with N>=3")
    # Accept closed rings; drop duplicate closing vertex if present
    if np.allclose(arr[0], arr[-1]):
        arr = arr[:-1]
    return arr

@app.route("/state", methods=["PATCH"])
def patch_state():
    data = request.get_json(silent=True) or {}

    with world_lock:
        # 1) clear polygons 
        try:
            if data.get("clear") is True:
                backend_adapter.clear_polygons()
        except Exception as e:
            return jsonify({"ok": False, "error": f"failed to clear polygons: {e}"}), 400

        # 2) add multiple polygons
        if "polygons" in data:
            polys_in = data["polygons"]
            if not isinstance(polys_in, list) or len(polys_in) == 0:
                return jsonify({"ok": False, "error": "'polygons' must be a non-empty list of Nx2 arrays"}), 400
            try:
                polys = [_ensure_polygon_array(p) for p in polys_in]
                backend_adapter.add_polygons(polys)
            except ValueError as ve:
                return jsonify({"ok": False, "error": str(ve)}), 400
            except Exception as e:
                return jsonify({"ok": False, "error": f"failed to add polygons: {e}"}), 400

        # 3) add single polygon
        if "polygon" in data:
            try:
                poly = _ensure_polygon_array(data["polygon"])
                backend_adapter.add_polygon(poly)
            except ValueError as ve:
                return jsonify({"ok": False, "error": str(ve)}), 400
            except Exception as e:
                return jsonify({"ok": False, "error": f"failed to add polygon: {e}"}), 400

        # 4) set target
        if "target" in data:
            try:
                pos = np.asarray(data["target"], dtype=float).reshape(2)
            except Exception:
                return jsonify({"ok": False, "error": "'target' must be [x, y]"}), 400
            try:
                backend_adapter.target = pos  # let world clamp/bounds as it already does
            except Exception as e:
                return jsonify({"ok": False, "error": f"failed to set target: {e}"}), 400

        # 5) set pause (boolean setter, not toggle)
        if "pause" in data:
            try:
                backend_adapter.paused = bool(data["pause"])
            except Exception as e:
                return jsonify({"ok": False, "error": f"failed to set pause: {e}"}), 400

        # Return the same shape as GET /state to avoid regressions
        try:
            return jsonify(backend_adapter.get_state().to_dict()), 200
        except Exception as e:
            return jsonify({"ok": False, "error": f"failed to serialize state: {e}"}), 500

@app.route("/pause", methods=["POST"])
def play_pause():
    """Toggle pause state (play/pause)."""
    with world_lock:
        backend_adapter.pause()
        paused_state = backend_adapter.paused
    return jsonify({"paused": paused_state}), 200

@app.route("/load-scenario/<uuid:scenario_id>", methods=["POST"])
def load_scenario(scenario_id):
    """Load a scenario from the repository into the running simulation."""
    global backend_adapter, policy, current_scenario_id, jobs_cache, jobs
    
    scenario = REPO.get(scenario_id)
    if not scenario:
        return jsonify({"error": {"type": "NotFound", "message": "scenario not found"}}), 404
    
    # Validate scenario has required entities
    if not scenario.sheep or len(scenario.sheep) == 0:
        return jsonify({"error": {"type": "Validation", "message": "scenario must have at least one sheep"}}), 422
    if not scenario.drones or len(scenario.drones) == 0:
        return jsonify({"error": {"type": "Validation", "message": "scenario must have at least one drone"}}), 422
    
    try:
        with world_lock:
            from datetime import datetime
            
            # Calculate appropriate k_nn based on flock size
            # k_nn must be <= N-1, where N is number of sheep
            num_sheep = len(scenario.sheep)
            k_nn = min(21, max(1, num_sheep - 1))  # Default is 21, but cap at N-1
            
            # Reinitialize world with scenario data
            backend_adapter = world.World(
                sheep_xy=np.array(scenario.sheep, dtype=float),
                shepherd_xy=np.array(scenario.drones, dtype=float),
                target_xy=np.array(scenario.targets[0], dtype=float) if scenario.targets else None,
                boundary=scenario.boundary,
                k_nn=k_nn,
                dt=0.1,
            )
            
            # Recompute policy parameters for new flock size
            policy = _create_policy_for_world(backend_adapter)
            
            # Initialize jobs for the scenario
            target_pos = np.array(scenario.targets[0], dtype=float) if scenario.targets else None
            from server import jobs_api
            repo = jobs_api.get_repo()
            scenario_job = repo.create(
                target=target_pos,
                target_radius=policy.fN * 1.5,
                is_active=True if target_pos is not None else False,
                drones=len(scenario.drones),
                status="running" if target_pos is not None else "pending",
                start_at=None,
                scenario_id=str(scenario_id),  # Link job to the loaded scenario
            )
            # Replace jobs cache with only the scenario job (fresh start)
            jobs_cache = JobCache([scenario_job])
            jobs = jobs_cache.list  # Update the alias
            
            # Track what's loaded
            current_scenario_id = str(scenario_id)
            
            # Pause the simulation so user can see the setup
            backend_adapter.paused = True
            
        return jsonify({
            "ok": True,
            "loaded_scenario_id": str(scenario_id),
            "scenario_name": scenario.name,
            "num_sheep": len(scenario.sheep),
            "num_drones": len(scenario.drones),
            "boundary": scenario.boundary,
            "has_target": len(scenario.targets) > 0 if scenario.targets else False,
            "paused": backend_adapter.paused,
        }), 200
        
    except Exception as e:
        import traceback
        error_details = {
            "type": "ServerError",
            "message": f"Failed to load scenario: {str(e)}",
            "scenario_id": str(scenario_id),
            "scenario_found": scenario is not None,
            "scenario_data": {
                "name": scenario.name if scenario else None,
                "sheep_count": len(scenario.sheep) if scenario and scenario.sheep else 0,
                "drones_count": len(scenario.drones) if scenario and scenario.drones else 0,
                "targets_count": len(scenario.targets) if scenario and scenario.targets else 0,
                "boundary": scenario.boundary if scenario else None,
                "bounds": scenario.bounds if scenario else None,
                "sheep_sample": scenario.sheep[:3] if scenario and scenario.sheep else None,
                "drones_sample": scenario.drones[:3] if scenario and scenario.drones else None,
                "targets_sample": scenario.targets[:3] if scenario and scenario.targets else None,
            },
            "traceback": traceback.format_exc()
        }
        print(f"Load scenario error: {error_details}")
        return jsonify({"error": error_details}), 500

@app.route("/current-scenario", methods=["GET"])
def get_current_scenario():
    """Get information about the currently loaded scenario (if any)."""
    with world_lock:
        scenario_id = current_scenario_id
    
    if scenario_id is None:
        return jsonify({
            "loaded": False,
            "scenario_id": None,
            "message": "No scenario loaded (using default initialization)"
        }), 200
    
    scenario = REPO.get(scenario_id)
    if not scenario:
        return jsonify({
            "loaded": False,
            "scenario_id": scenario_id,
            "message": "Previously loaded scenario no longer exists in repository"
        }), 200
    
    return jsonify({
        "loaded": True,
        "scenario_id": str(scenario.id),
        "scenario_name": scenario.name,
        "num_sheep": len(scenario.sheep),
        "num_drones": len(scenario.drones),
    }), 200


def run_flask():
    app.run(debug=True, use_reloader=False, port=5000, host='127.0.0.1')


if __name__ == "__main__":
    # Start Flask in a background thread.
    threading.Thread(target=run_flask, daemon=True).start()
    
    # Throttle remaining_time DB writes (once per second)
    last_rem_sync_ts = 0.0
    
    while True:
        time.sleep(0.05)  # 20 FPS update rate for simulation loop (original speed)
        
        # Update job statuses and remaining times
        jobs_to_sync = set()  # Use set to avoid duplicate syncs
        with world_lock:
            # Promote any scheduled jobs that should now start
            now = datetime.now(timezone.utc).timestamp()
            for j in jobs:
                if j.status == "scheduled" and j.start_at is not None and j.start_at <= now:
                    j.status = "running"
                    jobs_to_sync.add(j.id)
            
            # Check goal satisfaction and update remaining_time
            for job in jobs:
                if job.target is None:
                    job.remaining_time = None
                elif job.status == "completed" or job.status == "cancelled":
                    # Don't update completed/cancelled jobs
                    pass
                elif job.status == "running" and job.is_active:
                    # Only check goal for running+active jobs
                    if herding.policy.is_goal_satisfied(backend_adapter.get_state(), job.target, job.target_radius):
                        job.remaining_time = 0
                        # Double-check status before marking completed (race protection)
                        if job.status == "running" and job.is_active:
                            job.status = "completed"
                            job.is_active = False
                            job.completed_at = datetime.now(timezone.utc).timestamp()
                            jobs_to_sync.add(job.id)
                    else:
                        job.remaining_time = None
                else:
                    job.remaining_time = None
        
        # Persist status changes to database (outside lock to avoid blocking)
        if jobs_to_sync:
            for job_id in jobs_to_sync:
                job_obj = jobs_cache.get(job_id)  # O(1) lookup instead of linear search
                if job_obj:
                    try:
                        jobs_api.sync_job_status_to_db(job_obj)
                    except Exception as e:
                        # Don't crash - DB sync failure shouldn't stop simulation
                        print(f"Warning: Failed to sync job {job_id} to DB: {e}")
        
        # Throttled remaining_time sync (once per second for running jobs)
        current_time = time.time()
        if current_time - last_rem_sync_ts >= 1.0:
            for job in jobs:
                if job.status == "running" and job.remaining_time is not None:
                    try:
                        jobs_api.sync_job_status_to_db(job)
                    except Exception as e:
                        print(f"Warning: Failed to sync remaining_time for job {job.id}: {e}")
            last_rem_sync_ts = current_time
        
        # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
        with world_lock:
            # Sync target from active job to world, and auto-unpause if there's an active job with a target
            active_job = None
            for job in jobs:
                if job.is_active and job.status in ("running", "active"):
                    active_job = job
                    break
            
            if active_job and active_job.target is not None:
                # Sync job target to world target
                backend_adapter.target = active_job.target
                # Auto-unpause if paused
                if backend_adapter.paused:
                    backend_adapter.paused = False
            elif active_job and active_job.target is None:
                # Active job but no target yet - keep running for visualization (sheep will graze)
                if backend_adapter.paused:
                    backend_adapter.paused = False
                backend_adapter.target = None
            else:
                # No active job - allow simulation to run for live monitoring (grazing behavior)
                # This allows users to see the simulation even without jobs
                if backend_adapter.paused:
                    backend_adapter.paused = False
                backend_adapter.target = None
            
            for _ in range(15):
                plan = policy.plan(backend_adapter.get_state(), jobs, backend_adapter.dt)
                backend_adapter.step(plan)
        
