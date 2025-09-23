from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from planning import herding, state
from simulation import world
import time
import threading
import numpy as np

app = Flask(__name__)

CORS(app, origins=["http://localhost:5173"])

flock_size = 50

initial_state = state.State(
    flock=np.array([[random.uniform(-100, 100), random.uniform(-100, 100)] for _ in range(50)]),
    drone=np.array([0.0, 0.0]),
    target=np.array([5, 5]),
)

backend_adapter = world.World(initial_state)
policy = herding.ShepherdPolicy(
    fN=backend_adapter.ra * backend_adapter.N ** (2.0/3.0),
    umax=2.2,
    too_close=3*backend_adapter.ra,
    collect_standoff = 1.2 * backend_adapter.ra, # collect standoff behind stray far-from-dog grazing (random walk)
    drive_standoff = 0.8 * backend_adapter.ra * np.sqrt(flock_size)
)

@app.route("/state", methods=["GET"])
def get_state():
    return jsonify(state)

@app.route("/target", methods=["POST"])
def set_target():
    data = request.get_json()  # Expect JSON body
    if not data or "position" not in data:
        return jsonify({"error": "Missing 'position' field"}), 400

    state["target"] = data["position"]
    return jsonify(state)

def run_flask():
    app.run(debug=True, use_reloader=False)  # disable reloader for threads


if __name__ == "__main__":
    # Start Flask in a background thread
    threading.Thread(target=run_flask, daemon=True).start()
    
    while True:
        # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
        plan = policy.plan(backend_adapter.state)
        backend_adapter.step(plan)
        
        time.sleep(0.1)
