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
