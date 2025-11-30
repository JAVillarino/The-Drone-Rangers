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


# NOTE: It is not clear that we need a cache for the jobs. We should probably just use the list directly. We aren't going to have a bajillion jobs at once.
class JobCache:
    """Cache for jobs that maintains both list and O(1) dict lookup."""
    def __init__(self, initial=None):
        self.list : list[state.Job] = []
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
            # Remove in-place to maintain list reference
            try:
                self.list.remove(j)
            except ValueError:
                pass  # Job not in list (already removed)
        return j

    def clear(self):
        """Clear all jobs from the cache."""
        self.list.clear()
        self.map.clear()

    def reset_with(self, jobs):
        """Clear and replace with new jobs (maintains same cache object reference)."""
        self.clear()
        for j in jobs:
            self.add(j)

def _create_policy_for_world(w: world.World) -> herding.ShepherdPolicy:
    """
    Create a herding policy matched to the given world's flock size.
    
    Uses the new build_policy helper with default config.
    """
    from planning.policy_configs import build_policy
    return build_policy(w, policy_config=None)  # None means use "default" preset

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
    
    # Filter out jobs with invalid targets (must be Circle or Polygon, or None)
    valid_jobs = []
    for job in db_jobs:
        if job.target is None or isinstance(job.target, (state.Circle, state.Polygon)):
            valid_jobs.append(job)
        else:
            print(f"Warning: Discarding job {job.id} with invalid target type: {type(job.target)}")
    db_jobs = valid_jobs
    
    # If no jobs exist, create a default pending job
    if not db_jobs:
        active_jobs = []
    else:
        # Filter: keep running and scheduled jobs for recovery
        # Completed/cancelled jobs are kept in DB but don't need to be in-memory
        active_jobs = [j for j in db_jobs if j.status in ("running", "scheduled", "pending")]

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
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control, Idempotency-Key'
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
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control, Idempotency-Key'
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
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Cache-Control, Idempotency-Key'
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
                    event_data = f"data: {json.dumps(state_dict)}\n\n"
                    yield event_data
                    
                    # Sleep for ~16.67ms to achieve ~60 FPS
                    time.sleep(0.01667)
                    
                except GeneratorExit:
                    # Client disconnected
                    break
                except Exception as e:
                    print("Error in stream_state:", e)
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
            'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Idempotency-Key',
            'Access-Control-Expose-Headers': 'Content-Type, Cache-Control',
        }
    )
    return response

@app.route("/restart", methods=["POST"])
def restart_sim():
    """Restart simulation with default parameters."""
    global backend_adapter, policy, current_scenario_id
    
    with world_lock:
        backend_adapter, policy, new_cache = initialize_sim()
        # Reset the existing cache with new jobs (maintains same cache object reference)
        jobs_cache.reset_with(new_cache.list)
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
            from planning.policy_configs import build_policy
            
            # Calculate appropriate k_nn based on flock size
            # k_nn must be <= N-1, where N is number of sheep
            num_sheep = len(scenario.sheep)
            k_nn = min(21, max(1, num_sheep - 1))  # Default is 21, but cap at N-1
            
            # Build world_params: start with defaults, overlay scenario.world_config
            world_params = {
                "k_nn": k_nn,
                "dt": 0.1,
                "boundary": scenario.boundary,
                "bounds": scenario.bounds,
            }
            
            # Overlay scenario-specific world config if provided
            if scenario.world_config is not None:
                world_params.update(scenario.world_config)
            
            # Convert obstacles to world format
            obstacles_polygons = []
            if scenario.obstacles:
                for obs in scenario.obstacles:
                    if "polygon" in obs:
                        poly = np.array(obs["polygon"], dtype=float)
                        obstacles_polygons.append(poly)
            
            # Initialize world with scenario data and config
            backend_adapter = world.World(
                sheep_xy=np.array(scenario.sheep, dtype=float),
                shepherd_xy=np.array(scenario.drones, dtype=float),
                target_xy=np.array(scenario.targets[0], dtype=float) if scenario.targets else None,
                obstacles_polygons=obstacles_polygons if obstacles_polygons else None,
                **world_params,
            )
            
            # Build policy using the new config system
            policy = build_policy(backend_adapter, scenario.policy_config)
            
            # Initialize jobs for the scenario
            # Convert target position to a Circle target (required by Job type)
            target = None
            if scenario.targets and len(scenario.targets) > 0:
                target_pos = np.array(scenario.targets[0], dtype=float)
                # Create a Circle target with the position and a reasonable radius
                target = state.Circle(center=target_pos, radius=policy.fN * 1.5)
            
            # Create an in-memory job for the simulation (NOT persisted to database)
            # This keeps simulation state separate from farm jobs
            from uuid import uuid4
            now = datetime.now(timezone.utc).timestamp()
            scenario_job = state.Job(
                id=uuid4(),
                target=target,
                remaining_time=None,
                is_active=True,  # Always active so simulation shows immediately
                drones=len(scenario.drones),
                status="running",  # Always running - will show grazing if no target
                start_at=None,
                completed_at=None,
                scenario_id=str(scenario_id),  # Link job to the loaded scenario
                maintain_until="target_is_reached",
                created_at=now,
                updated_at=now,
            )
            # Reset jobs cache with only the scenario job (fresh start)
            # Important: use reset_with() to maintain the same cache object reference
            # that the jobs_api blueprint uses
            jobs_cache.reset_with([scenario_job])
            
            # Track what's loaded
            current_scenario_id = str(scenario_id)
            
            # Don't pause - let the simulation start immediately
            # Users can set a target on the map to begin herding
            backend_adapter.paused = False
            
        return jsonify({
            "ok": True,
            "loaded_scenario_id": str(scenario_id),
            "scenario_name": scenario.name,
            "num_sheep": len(scenario.sheep),
            "num_drones": len(scenario.drones),
            "boundary": scenario.boundary,
            "has_target": len(scenario.targets) > 0 if scenario.targets else False,
            "world_config_applied": scenario.world_config is not None,
            "policy_config_applied": scenario.policy_config is not None,
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

@app.route("/policy-presets", methods=["GET"])
def get_policy_presets():
    """
    Get all available policy presets.
    
    Returns a dictionary mapping preset keys to their full configurations.
    """
    from planning.policy_configs import POLICY_PRESETS
    
    presets_dict = {
        key: config.to_dict()
        for key, config in POLICY_PRESETS.items()
    }
    
    return jsonify(presets_dict), 200


@app.route("/scenario-types", methods=["GET"])
def get_scenario_types():
    """
    Get all available scenario type definitions.
    
    Returns a list of scenario type definitions that can be used as templates
    for creating new scenarios.
    """
    from server.scenario_types import SCENARIO_TYPES
    
    types_list = [
        st.to_dict() for st in SCENARIO_TYPES.values()
    ]
    
    return jsonify(types_list), 200


@app.route("/scenario-types/<key>", methods=["GET"])
def get_scenario_type(key: str):
    """
    Get a specific scenario type definition by key.
    """
    from server.scenario_types import get_scenario_type
    
    scenario_type = get_scenario_type(key)
    if not scenario_type:
        return jsonify({"error": {"type": "NotFound", "message": f"scenario type '{key}' not found"}}), 404
    
    return jsonify(scenario_type.to_dict()), 200


@app.route("/scenario-types/<key>/instantiate", methods=["POST"])
def instantiate_scenario_type(key: str):
    """
    Create a new scenario from a scenario type template.
    
    Request body (all optional):
    - name: str - Name for the new scenario
    - num_agents: int - Override number of agents
    - num_controllers: int - Override number of controllers
    - seed: int - Random seed for layout generation
    - overrides: dict - Additional scenario field overrides
    
    Returns the created scenario.
    """
    from server.scenario_types import get_scenario_type, generate_initial_layout
    from uuid import uuid4
    from datetime import datetime, timezone
    
    scenario_type = get_scenario_type(key)
    if not scenario_type:
        return jsonify({"error": {"type": "NotFound", "message": f"scenario type '{key}' not found"}}), 404
    
    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}
    
    # Get optional overrides
    name = body.get("name") or f"{scenario_type.name} - {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    num_agents = body.get("num_agents")
    num_controllers = body.get("num_controllers")
    seed = body.get("seed")
    overrides = body.get("overrides") or {}
    
    # Generate initial layout
    bounds = (0.0, 250.0, 0.0, 250.0)
    layout = generate_initial_layout(
        scenario_type,
        num_agents=num_agents,
        num_controllers=num_controllers,
        bounds=bounds,
        seed=seed,
    )
    
    # Build the scenario
    from server.scenarios_api import Scenario, REPO
    
    # Merge world_config and policy_config from type with any overrides
    world_config = scenario_type.default_world_config.copy() if scenario_type.default_world_config else {}
    if overrides.get("world_config"):
        world_config.update(overrides["world_config"])
    
    policy_config = scenario_type.default_policy_config.copy() if scenario_type.default_policy_config else {}
    if overrides.get("policy_config"):
        policy_config.update(overrides["policy_config"])
    
    appearance = {"themeKey": scenario_type.default_theme_key} if scenario_type.default_theme_key else None
    if overrides.get("appearance"):
        if appearance:
            appearance.update(overrides["appearance"])
        else:
            appearance = overrides["appearance"]
    
    scenario = Scenario(
        id=uuid4(),
        name=name,
        description=overrides.get("description") or scenario_type.description,
        tags=scenario_type.tags.copy() if scenario_type.tags else [],
        visibility="public",
        seed=seed,
        sheep=layout["sheep"],
        drones=layout["drones"],
        targets=layout["targets"],
        obstacles=overrides.get("obstacles") or [],
        goals=overrides.get("goals") or [],
        boundary=world_config.get("boundary", "none"),
        bounds=bounds,
        world_config=world_config if world_config else None,
        policy_config=policy_config if policy_config else None,
        target_sequence=None,
        scenario_type=key,
        appearance=appearance,
    )
    
    REPO.create(scenario)
    
    from dataclasses import asdict
    return jsonify(asdict(scenario)), 201, {"Location": f"/scenarios/{scenario.id}"}


# ============== Phase 5: Metrics & Evaluation API ==============

@app.route("/metrics/current", methods=["GET"])
def get_current_metrics():
    """
    Get metrics for the currently running simulation.
    
    Returns partial metrics if run is in progress, or None if no run is active.
    """
    from server.metrics import get_collector
    
    collector = get_collector()
    current = collector.get_current_run()
    
    if current is None:
        return jsonify({
            "active": False,
            "run_id": None,
            "message": "No active metrics run"
        }), 200
    
    return jsonify({
        "active": True,
        "run_id": current.run_id,
        "num_steps": len(current.steps),
        "started_at": current.started_at,
        "latest_step": current.steps[-1].to_dict() if current.steps else None,
    }), 200


@app.route("/metrics/runs", methods=["GET"])
def list_metrics_runs():
    """
    List all completed metrics runs.
    """
    from server.metrics import get_collector
    
    collector = get_collector()
    runs = [
        {
            "run_id": run.run_id,
            "started_at": run.started_at,
            "ended_at": run.ended_at,
            "num_steps": len(run.steps),
            "summary": run.summary,
        }
        for run in collector.completed_runs.values()
    ]
    
    return jsonify({"runs": runs, "count": len(runs)}), 200


@app.route("/metrics/runs/<run_id>", methods=["GET"])
def get_metrics_run(run_id: str):
    """
    Get detailed metrics for a specific run.
    
    Includes summary statistics and recent step data.
    """
    from server.metrics import get_collector
    
    collector = get_collector()
    run = collector.get_run(run_id)
    
    if run is None:
        return jsonify({"error": {"type": "NotFound", "message": f"run '{run_id}' not found"}}), 404
    
    return jsonify(run.to_dict()), 200


@app.route("/metrics/start", methods=["POST"])
def start_metrics_collection():
    """
    Manually start metrics collection for the current simulation.
    
    Optional body: { "run_id": "custom-id" }
    """
    from server.metrics import start_metrics_run
    import uuid
    
    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}
    
    run_id = body.get("run_id") or str(uuid.uuid4())[:8]
    run = start_metrics_run(run_id)
    
    return jsonify({
        "started": True,
        "run_id": run.run_id,
        "started_at": run.started_at,
    }), 200


@app.route("/metrics/stop", methods=["POST"])
def stop_metrics_collection():
    """
    Stop the current metrics collection and compute summary.
    """
    from server.metrics import end_metrics_run
    
    run = end_metrics_run()
    
    if run is None:
        return jsonify({
            "stopped": False,
            "message": "No active metrics run to stop"
        }), 200
    
    return jsonify({
        "stopped": True,
        "run_id": run.run_id,
        "summary": run.summary,
    }), 200


def run_flask():
    app.run(debug=True, use_reloader=False, port=5001, host='127.0.0.1')


if __name__ == "__main__":
    # Start Flask in a background thread.
    threading.Thread(target=run_flask, daemon=True).start()
    
    # Throttle remaining_time DB writes (once per second)
    last_rem_sync_ts = 0.0
    
    while True:
        # TODO: This sleep should be within the loop of frames.
        time.sleep(0.05)  # 20 FPS update rate for simulation loop (original speed)
        # Update job statuses and remaining times
        jobs_to_sync = set()  # Use set to avoid duplicate syncs
        with world_lock:
            # Promote any scheduled jobs that should now start
            now = datetime.now(timezone.utc).timestamp()
            for j in jobs:
                if j.status == "scheduled" and j.start_at is not None and j.start_at <= now:
                    # Deactivate all other active jobs first (one active at a time)
                    for other in jobs:
                        if other.id != j.id and other.is_active:
                            other.is_active = False
                            jobs_to_sync.add(other.id)
                    
                    # Promote this job to running and activate it
                    j.status = "running"
                    j.is_active = True
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
                    if herding.policy.is_goal_satisfied(backend_adapter.get_state(), job.target):
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
            # TODO: This is jank.
            # Sync target from active job to world, and auto-unpause if there's an active job with a target
            active_job = None
            for job in jobs:
                if job.is_active and job.status in ("running", "active"):
                    active_job = job
                    break
            
            if active_job and active_job.target is not None:
                # Sync job target to world target
                # Extract center coordinates from Circle/Polygon for the World (which expects numpy array)
                if isinstance(active_job.target, state.Circle):
                    backend_adapter.target = active_job.target.center
                elif isinstance(active_job.target, state.Polygon):
                    # For polygon, use centroid as target
                    backend_adapter.target = active_job.target.points.mean(axis=0)
                else:
                    raise TypeError(f"Job target must be Circle or Polygon, got {type(active_job.target)}")
                
                # Sync drone count from job to world
                if active_job.drones != backend_adapter.num_controllers:
                    backend_adapter.set_drone_count(active_job.drones)
                
                # Auto-unpause if paused
                if backend_adapter.paused:
                    backend_adapter.paused = False
            elif active_job and active_job.target is None:
                # Active job but no target yet - keep running for visualization (sheep will graze)
                # Also sync drone count
                if active_job.drones != backend_adapter.num_controllers:
                    backend_adapter.set_drone_count(active_job.drones)
                if backend_adapter.paused:
                    backend_adapter.paused = False
                backend_adapter.target = None
            else:
                # No active job - allow simulation to run for live monitoring (grazing behavior)
                # This allows users to see the simulation even without jobs
                if backend_adapter.paused:
                    backend_adapter.paused = False
                backend_adapter.target = None
            
            for job in list(jobs):  # Copy to avoid modifying list while iterating
                if job.completed_at is not None:
                    jobs_cache.remove(job.id)
            
            
            for _ in range(15):
                plan = policy.plan(backend_adapter.get_state(), jobs, backend_adapter.dt)
                backend_adapter.step(plan)
            
            # Record metrics if collection is active
            from server.metrics import get_collector
            collector = get_collector()
            if collector.get_current_run() is not None:
                world_state = backend_adapter.get_state()
                target = active_job.target if active_job else None
                t = backend_adapter.t if hasattr(backend_adapter, 't') else 0.0
                fN = policy.fN if hasattr(policy, 'fN') else 50.0
                collector.record_step(world_state, target, t, fN)
        
