from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from planning import herding
from simulation import world
import time
import threading
import numpy as np
from dataclasses import asdict

app = Flask(__name__)

CORS(app, origins=["http://localhost:5173"])

flock_size = 50

backend_adapter = world.World(
    sheep_xy=np.array([[random.uniform(-100, 100), random.uniform(-100, 100)] for _ in range(flock_size)]),
    shepherd_xy=[0.0, 0.0],
    target_xy=[5, 5],
    ra=2,
)
policy = herding.ShepherdPolicy(
    fN=backend_adapter.ra * backend_adapter.N ** (2.0/3.0),
    umax=1.5,
    too_close=3*backend_adapter.ra,
    collect_standoff = backend_adapter.ra,
    drive_standoff = backend_adapter.ra * np.sqrt(flock_size),
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

def run_flask():
    app.run(debug=True, use_reloader=False)  # disable reloader for threads


if __name__ == "__main__":
    # Start Flask in a background thread
    threading.Thread(target=run_flask, daemon=True).start()
    
    while True:
        # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
        plan = policy.plan(backend_adapter.get_state(), backend_adapter.dt)
        backend_adapter.step(plan)
        
        time.sleep(0.1)
