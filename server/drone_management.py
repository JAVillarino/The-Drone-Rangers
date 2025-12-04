from flask import Blueprint, jsonify, request
import sqlite3, os, pathlib, re
from simulation import world
import numpy as np

TMP_DIRECTORY = os.path.join(os.path.dirname(__file__), "tmp")
pathlib.Path(TMP_DIRECTORY).mkdir(exist_ok=True)
DB_PATH = os.path.join(TMP_DIRECTORY, "drones.sqlite3")


def _get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _generate_next_drone_id(conn: sqlite3.Connection) -> str:
    cur = conn.execute("SELECT id FROM drones")
    max_num = 0
    for row in cur.fetchall():
        m = re.match(r"^DR-(\d{3,})$", row["id"])  # allow 3+ digits
        if m:
            max_num = max(max_num, int(m.group(1)))
    return f"DR-{(max_num + 1):03d}"


def create_drones_blueprint(W: world.World):
    """Factory to create a drones blueprint with a dependency."""
    
    # Build the database if it doesn't exist.
    conn = _get_db_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS drones (
                id TEXT PRIMARY KEY,
                make TEXT NOT NULL,
                model TEXT NOT NULL
            )
            """
        )
        conn.commit()
        
        # Try to initialize the drone's positions in the world based on what's stored in the database.
        rows = conn.execute("SELECT id FROM drones").fetchall()
        W.dogs = np.random.rand(len(rows), 2) * 5
    finally:
        conn.close()
        

    drones_bp = Blueprint("drones", __name__)

    @drones_bp.route("/drones", methods=["GET"])
    def list_drones():
        conn = _get_db_connection()
        try:
            rows = conn.execute("SELECT id, make, model FROM drones ORDER BY id").fetchall()
            items = [dict(row) for row in rows]
            return jsonify({"items": items, "total": len(items)}), 200
        finally:
            conn.close()

    @drones_bp.route("/drones", methods=["POST"])
    def create_drone():
        data = request.get_json(silent=True) or {}
        make = (data.get("make") or "").strip()
        model = (data.get("model") or "").strip()
        if not make or not model:
            return jsonify({"error": "'make' and 'model' are required"}), 400

        conn = _get_db_connection()
        try:
            drone_id = _generate_next_drone_id(conn)
            conn.execute(
                "INSERT INTO drones (id, make, model) VALUES (?, ?, ?)",
                (drone_id, make, model),
            )
            conn.commit()
            # TODO: Do something a little bit smarter with tracking the ID dog-by-dog.
            W.dogs = np.concatenate([W.dogs, np.random.randint(0, 6, size=(1, 2))])
            
            return jsonify({"id": drone_id, "make": make, "model": model}), 201
        finally:
            conn.close()
            
    @drones_bp.route("/drones/<drone_id>", methods=["DELETE"])
    def delete_drone(drone_id: str):
        conn = _get_db_connection()
        try:
            cur = conn.execute("DELETE FROM drones WHERE id = ?", (drone_id,))
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "drone not found"}), 404

            # TODO: Do something a little bit smarter with tracking the ID dog-by-dog.
            W.dogs = W.dogs[:-1]

            return ("", 204)
        finally:
            conn.close()

    return drones_bp