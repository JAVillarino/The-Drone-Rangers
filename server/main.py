from flask import Flask, jsonify
from flask_cors import CORS
import random

app = Flask(__name__)

CORS(app, origins=["http://localhost:5173"])

# Example state
state = {
    "flock": [
        {"id": i, "position": [random.uniform(-100, 100), random.uniform(-100, 100)]}
        for i in range(50)  # 10 flock entities
    ],
    "drone": {
        "position": [0.0, 0.0]  # Drone starts at origin
    }
}

@app.route("/state", methods=["GET"])
def get_state():
    """
    Returns the current state of the app: 
    a flock of entities and a drone.
    """
    return jsonify(state)

if __name__ == "__main__":
    app.run(debug=True)
