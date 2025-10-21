from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from planning import herding, plan_type, state
from simulation import world
import time
import threading
import numpy as np

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

# Register scenarios API blueprint
from scenarios_api import scenarios_bp, REPO
app.register_blueprint(scenarios_bp)

# Thread-safe lock for world reinitialization
world_lock = threading.RLock()
current_scenario_id = None  # Track what scenario is currently loaded

# TODO: Need to make the scenarios work with separate jobs instead of a target.

def _create_policy_for_world(w: world.World) -> herding.ShepherdPolicy:
    """Create a herding policy matched to the given world's flock size."""
    total_area = 0.5 * w.N * (w.ra ** 2)
    collected_herd_radius = np.sqrt(total_area)
    return herding.ShepherdPolicy(
        fN=collected_herd_radius,
        umax=w.umax,
        too_close=1.5 * w.ra,
        collect_standoff=1.0 * w.ra,
        drive_standoff=1.0 * w.ra + collected_herd_radius,
    )

def initialize_sim():
    """Initialize a new simulation with default parameters."""
    flock_size = 50
    backend_adapter = world.World(
        sheep_xy=np.array([[random.uniform(0, 200), random.uniform(0, 200)] for _ in range(flock_size)]),
        shepherd_xy=np.array([[0.0, 0.0]]),
        target_xy=[5, 5],
        boundary="none",
        dt=0.1,
    )
    policy = _create_policy_for_world(backend_adapter)

    return backend_adapter, policy, [
        state.Job(
            target=None,
            target_radius=policy.fN * 1.5,
            remaining_time=None,
            is_active=True,
        )
    ]

backend_adapter, policy, jobs = initialize_sim()

@app.route("/state", methods=["GET"])
def get_state():
    """Get current simulation state with pause status."""
    with world_lock:
        state = backend_adapter.get_state()
        state.jobs = jobs
        state_dict = state.to_dict()
        state_dict["paused"] = backend_adapter.paused
        return jsonify(state_dict)

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
        
    return jsonify(backend_adapter.get_state().to_dict())

@app.route("/restart", methods=["POST"])
def restart_sim():
    """Restart simulation with default parameters."""
    global backend_adapter, policy, jobs, current_scenario_id
    
    with world_lock:
        backend_adapter, policy, jobs = initialize_sim()
        current_scenario_id = None  # Clear any loaded scenario
    
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
    global backend_adapter, policy, current_scenario_id
    
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
            # Reinitialize world with scenario data
            backend_adapter = world.World(
                sheep_xy=np.array(scenario.sheep, dtype=float),
                shepherd_xy=np.array(scenario.drones, dtype=float),
                target_xy=scenario.targets[0] if scenario.targets else None,
                boundary=scenario.boundary,
                dt=0.1,
            )
            
            # Recompute policy parameters for new flock size
            policy = _create_policy_for_world(backend_adapter)
            
            # Track what's loaded
            current_scenario_id = str(scenario_id)
            
            # Start paused after loading - user must unpause to begin
            backend_adapter.paused = True
            
        return jsonify({
            "ok": True,
            "loaded_scenario_id": str(scenario_id),
            "scenario_name": scenario.name,
            "num_sheep": len(scenario.sheep),
            "num_drones": len(scenario.drones),
            "boundary": scenario.boundary,
            "paused": backend_adapter.paused,
        }), 200
        
    except Exception as e:
        return jsonify({"error": {"type": "ServerError", "message": f"Failed to load scenario: {str(e)}"}}), 500

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


@app.route("/jobs/<int:job_id>", methods=["PATCH"])
def patch_job(job_id):
    """Update a specific job by its ID."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    with world_lock:
        job_to_update = None
        for j in jobs:
            if j.id == job_id:
                job_to_update = j
                break

        if not job_to_update:
            return jsonify({"error": f"Job with ID {job_id} not found"}), 404

        try:
            if "target" in data:
                if data["target"] is None:
                    job_to_update.target = None
                else:
                    pos = np.asarray(data["target"], dtype=float).reshape(2)
                    if not np.all(np.isfinite(pos)):
                        raise ValueError("Target values must be finite numbers")
                    job_to_update.target = pos

            if "target_radius" in data:
                radius = float(data["target_radius"])
                if not np.isfinite(radius) or radius < 0:
                    raise ValueError("Target radius must be a non-negative number")
                job_to_update.target_radius = radius

            if "remaining_time" in data:
                if data["remaining_time"] is None:
                    job_to_update.remaining_time = None
                else:
                    time_val = float(data["remaining_time"])
                    if not np.isfinite(time_val):
                        raise ValueError("Remaining time must be a finite number")
                    job_to_update.remaining_time = time_val

            if "is_active" in data:
                job_to_update.is_active = bool(data["is_active"])

        except (ValueError, TypeError) as e:
            return jsonify({"error": f"Invalid data format: {e}"}), 400

        return jsonify(job_to_update.to_dict())


def run_flask():
    app.run(debug=True, use_reloader=False)  # disable reloader for threads


if __name__ == "__main__":
    # Start Flask in a background thread.
    threading.Thread(target=run_flask, daemon=True).start()
    
    while True:
        time.sleep(0.05)
    
        with world_lock:
            # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
            for _ in range(5):
                plan = policy.plan(backend_adapter.get_state(), jobs, backend_adapter.dt)
                backend_adapter.step(plan)
        
