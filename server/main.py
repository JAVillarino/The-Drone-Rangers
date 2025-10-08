from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from planning import herding
from simulation import world
import time
import threading
import numpy as np

app = Flask(__name__)
CORS(app, origins=["http://localhost:5173"])

play = False

flock_size = 50
backend_adapter = world.World(
    sheep_xy=np.array([[random.uniform(0, 200), random.uniform(0, 200)] for _ in range(flock_size)]),
    shepherd_xy=np.array([[0.0, 0.0]]),
    target_xy=[5, 5],
    boundary="none",
    dt=0.1,
)
total_area = 0.5 * backend_adapter.N * (backend_adapter.ra ** 2)
# area = pi * r^2 => r = sqrt(area / pi) (but pi's cancel.)
collected_herd_radius = np.sqrt(total_area)
policy = herding.ShepherdPolicy(
    fN = collected_herd_radius,
    umax = backend_adapter.umax,
    too_close = 1.5 * backend_adapter.ra,
    collect_standoff = 1.0 * backend_adapter.ra,
    drive_standoff   = 1.0 * backend_adapter.ra + collected_herd_radius,
)

@app.route("/state", methods=["GET"])
def get_state():
    return jsonify(backend_adapter.get_state().to_dict())

@app.route("/target", methods=["POST"])
def set_target():
    data = request.get_json()  # Expect JSON body
    if not data or "position" not in data:
        return jsonify({"error": "Missing 'position' field"}), 400

    backend_adapter.target = np.asarray(data["position"], float)
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
    backend_adapter.pause()

def run_flask():
    app.run(debug=True, use_reloader=False)  # disable reloader for threads


if __name__ == "__main__":
    # Start Flask in a background thread.
    threading.Thread(target=run_flask, daemon=True).start()
    
    while True:
        # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
        for _ in range(10):
            plan = policy.plan(backend_adapter.get_state(), backend_adapter.dt)
            backend_adapter.step(plan)
        
        time.sleep(0.1)
