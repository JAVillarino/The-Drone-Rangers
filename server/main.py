from flask import Flask, jsonify, request
from flask_cors import CORS
import random
from draft import herding
import time
import threading

app = Flask(__name__)

CORS(app, origins=["http://localhost:5173"])

policy = herding.ShepherdPolicy()
# backend_adapter = 

state = {
    "flock": [
        {"id": i, "position": [random.uniform(-100, 100), random.uniform(-100, 100)]}
        for i in range(50)  # 10 flock entities
    ],
    "drone": {
        "position": [0.0, 0.0]  # Drone starts at origin
    },
    "target": None,
}

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

    app.run(debug=True)
    
    while True:
        # We receive the new state of the world from the backend adapter, and we compute what we should do based on the planner. We send that back to the backend adapter.
        # plan = policy.plan(backend_adapter.state)
        # backend_adapter.step(plan)
        
        time.sleep(0.1)
