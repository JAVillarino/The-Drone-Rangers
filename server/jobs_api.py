from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from flask import Blueprint, jsonify, request

from planning.state import Job, JobStatus


DB_PATH = Path(__file__).parent / "tmp" / "jobs.sqlite3"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


# -------- Shared Utility Functions --------

def _get_conn() -> sqlite3.Connection:
    """Get a SQLite connection with Row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_txn():
    """Context manager for atomic database transactions."""
    conn = _get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _init_db() -> None:
    """Initialize the jobs database table if it doesn't exist."""
    with _get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                target_x REAL,
                target_y REAL,
                target_radius REAL NOT NULL,
                remaining_time REAL,
                is_active INTEGER NOT NULL,
                drones INTEGER NOT NULL,
                status TEXT NOT NULL,
                start_at REAL,
                completed_at REAL,
                scenario_id TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.commit()


def _parse_iso_timestamp(s: Optional[str]) -> Optional[float]:
    """Parse ISO 8601 timestamp string to UNIX timestamp."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "")).timestamp()
    except (ValueError, TypeError):
        return None


def _timestamp_to_iso(ts: Optional[float]) -> Optional[str]:
    """Convert UNIX timestamp to ISO 8601 string with Z suffix."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_target(data: dict) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """Parse and validate target from request data. Returns (target, error_msg)."""
    if "target" not in data or data["target"] is None:
        return None, None
    
    try:
        target = np.asarray(data["target"], dtype=float).reshape(2)
        if not np.all(np.isfinite(target)):
            return None, "target coordinates must be finite numbers"
        return target, None
    except (ValueError, TypeError):
        return None, "target must be [x, y] array or null"


def _normalize_drone_count(data: dict) -> Tuple[int, Optional[str]]:
    """
    Extract drone count from request, handling both 'drones' and 'drone_count' fields.
    
    Defaults to 1 if neither field is provided.
    """
    # Explicitly check for None to handle 0 as a valid key
    drone_count = data.get("drone_count") if "drone_count" in data else data.get("drones")
    if drone_count is None:
        return 1, None  # Default: 1 drone
    
    try:
        count = int(drone_count)
        if count < 1:
            return 0, "drone count must be at least 1"
        return count, None
    except (ValueError, TypeError):
        return 0, "drone count must be an integer"


VALID_STATUSES = {"pending", "scheduled", "running", "completed", "cancelled"}


def _normalize_status(status: str) -> Tuple[JobStatus, Optional[str]]:
    """Normalize status from frontend format to internal format."""
    # Map frontend "active" to backend "running"
    if status == "active":
        status = "running"
    
    if status not in VALID_STATUSES:
        return "pending", f"Invalid status: {status}. Must be one of: pending, scheduled, running, completed, cancelled"
    
    return status, None


def decide_initial_status(start_at_ts: Optional[float], activate_immediately: bool, 
                         has_target: bool, now_ts: float) -> Tuple[JobStatus, bool]:
    """
    Centralized logic to determine initial status and is_active for a new job.
    
    Returns: (status, is_active)
    """
    if start_at_ts is not None and start_at_ts > now_ts:
        # Future scheduled job
        return "scheduled", True
    if activate_immediately:
        # Immediate activation
        return ("running" if has_target else "pending"), has_target
    # Default: pending
    return "pending", False


def _frontend_status_from_internal(internal_status: JobStatus) -> str:
    """Convert internal status to frontend-expected format."""
    return "active" if internal_status == "running" else internal_status


def _job_to_frontend_dict(job: Job) -> dict:
    """Convert internal Job to frontend-compatible dictionary."""
    job_type = "scheduled" if (job.status == "scheduled" and job.start_at is not None) else "immediate"
    
    return {
        "id": job.id,
        "job_type": job_type,
        "scheduled_time": _timestamp_to_iso(job.start_at) if job_type == "scheduled" else None,
        "is_recurring": False,  # Not currently supported
        "target": None if job.target is None else job.target.tolist(),
        "target_radius": job.target_radius,
        "drone_count": job.drones,
        "status": _frontend_status_from_internal(job.status),
        "created_at": _timestamp_to_iso(job.created_at),
        "updated_at": _timestamp_to_iso(job.updated_at),
        "duration": None,  # Not calculated yet
    }


def _sync_remaining_time_from_memory(db_job: Job, jobs_cache) -> None:
    """Update remaining_time from in-memory job if found."""
    mem_job = jobs_cache.get(db_job.id)
    if mem_job:
        db_job.remaining_time = mem_job.remaining_time


# -------- Job Repository --------

class JobRepo:
    """Repository for persisting and retrieving jobs from SQLite."""

    def __init__(self) -> None:
        _init_db()

    def create(
        self,
        *,
        target: Optional[np.ndarray],
        target_radius: float,
        is_active: bool,
        drones: int,
        status: JobStatus,
        start_at: Optional[float],
        scenario_id: Optional[str],
    ) -> Job:
        """Create a new job in the database."""
        now = datetime.now(timezone.utc).timestamp()
        tx = None if target is None else float(target[0])
        ty = None if target is None else float(target[1])

        with _get_conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO jobs
                (target_x, target_y, target_radius, remaining_time,
                 is_active, drones, status, start_at, completed_at,
                 scenario_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tx,
                    ty,
                    target_radius,
                    None,
                    1 if is_active else 0,
                    drones,
                    status,
                    start_at,
                    None,
                    scenario_id,
                    now,
                    now,
                ),
            )
            job_id = cur.lastrowid
            conn.commit()

        return Job(
            id=job_id,
            target=target,
            target_radius=target_radius,
            remaining_time=None,
            is_active=is_active,
            drones=drones,
            status=status,
            start_at=start_at,
            completed_at=None,
            scenario_id=scenario_id,
            created_at=now,
            updated_at=now,
        )

    def get(self, job_id: int) -> Optional[Job]:
        """Retrieve a job by ID."""
        with _get_conn() as conn:
            cur = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
            row = cur.fetchone()

        if row is None:
            return None
        return self._row_to_job(row)

    def list(self, status: Optional[JobStatus] = None) -> List[Job]:
        """List all jobs, optionally filtered by status."""
        with _get_conn() as conn:
            if status is None:
                cur = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC")
            else:
                cur = conn.execute(
                    "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC",
                    (status,),
                )
            rows = cur.fetchall()

        return [self._row_to_job(r) for r in rows]

    def update_fields(self, job_id: int, **fields) -> Optional[Job]:
        """Update specific fields of a job."""
        if not fields:
            return self.get(job_id)

        allowed = {
            "target_x",
            "target_y",
            "target_radius",
            "remaining_time",
            "is_active",
            "drones",
            "status",
            "start_at",
            "completed_at",
            "scenario_id",
        }

        sets = []
        params = []
        for k, v in fields.items():
            if k not in allowed:
                continue
            sets.append(f"{k} = ?")
            params.append(v)

        if not sets:
            return self.get(job_id)

        params.append(datetime.now(timezone.utc).timestamp())  # updated_at
        params.append(job_id)

        with _get_conn() as conn:
            conn.execute(
                f"""
                UPDATE jobs
                SET {", ".join(sets)}, updated_at = ?
                WHERE id = ?
                """,
                params,
            )
            conn.commit()

        return self.get(job_id)

    def delete(self, job_id: int) -> bool:
        """
        Delete a job from the database.
        
        Returns True if job was deleted, False if job was not found.
        """
        with _get_conn() as conn:
            cur = conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            conn.commit()
            return cur.rowcount > 0

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> Job:
        """Convert a database row to a Job object."""
        tx = row["target_x"]
        ty = row["target_y"]
        target = None
        if tx is not None and ty is not None:
            target = np.array([tx, ty], dtype=float)

        return Job(
            id=row["id"],
            target=target,
            target_radius=row["target_radius"],
            remaining_time=row["remaining_time"],
            is_active=bool(row["is_active"]),
            drones=row["drones"],
            status=row["status"],
            start_at=row["start_at"],
            completed_at=row["completed_at"],
            scenario_id=row["scenario_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# -------- API Blueprint Factory --------

def create_jobs_blueprint(world_lock, jobs_cache) -> Blueprint:
    """
    Factory to create a unified jobs API blueprint.
    
    Provides /api/jobs endpoints that handle both:
    - Frontend requests (with job_type, drone_count, etc.)
    - Internal requests (with drones, activate_immediately, etc.)
    
    All field names are normalized internally for compatibility.
    """
    repo = get_repo()  # Use shared singleton instance
    bp = Blueprint("api_jobs", __name__, url_prefix="/api")

    @bp.route("/jobs", methods=["POST"])
    def create_job():
        """Create a new job. Supports both frontend and internal formats."""
        data = request.get_json(silent=True) or {}

        # Parse target
        target, target_error = _normalize_target(data)
        if target_error:
            return jsonify({"error": target_error}), 400

        # Parse common fields
        try:
            target_radius = float(data.get("target_radius", 10.0))
            if target_radius <= 0:
                return jsonify({"error": "target_radius must be positive"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "target_radius must be a number"}), 400

        drone_count, drone_error = _normalize_drone_count(data)
        if drone_error:
            return jsonify({"error": drone_error}), 400

        # Determine job type and scheduling
        job_type = data.get("job_type", "immediate")
        scheduled_time = data.get("scheduled_time") or data.get("start_at")
        activate_immediately = data.get("activate_immediately", False)
        
        # Parse scheduled_time if provided
        start_at = None
        if job_type == "scheduled" or scheduled_time:
            start_at = _parse_iso_timestamp(scheduled_time)
            if start_at is None and job_type == "scheduled":
                return jsonify({"error": "scheduled_time must be provided for scheduled jobs"}), 400

        # Determine status and activation using centralized logic
        now = datetime.now(timezone.utc).timestamp()
        status, is_active = decide_initial_status(
            start_at_ts=start_at,
            activate_immediately=(job_type == "immediate" or activate_immediately),
            has_target=(target is not None),
            now_ts=now
        )
        
        # Validation: is_active=True requires a target
        if is_active and target is None:
            return jsonify({"error": "Cannot activate job without a target"}), 400

        # Create job
        job = repo.create(
            target=target,
            target_radius=target_radius,
            is_active=is_active,
            drones=drone_count,
            status=status,
            start_at=start_at,
            scenario_id=data.get("scenario_id"),
        )

        # Add to in-memory cache (ensures single instance per ID)
        with world_lock:
            jobs_cache.add(job)

        return jsonify(_job_to_frontend_dict(job)), 201

    @bp.route("/jobs", methods=["GET"])
    def list_jobs():
        """List jobs with optional filtering by status, start_date, end_date."""
        status = request.args.get("status")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")

        # Normalize status if provided
        normalized_status: Optional[JobStatus] = None
        if status:
            normalized_status, status_error = _normalize_status(status)
            if status_error:
                return jsonify({"error": status_error}), 400

        db_jobs = repo.list(status=normalized_status)

        # Filter by date range if provided
        # For calendar views, filter by scheduled time (start_at), fallback to created_at for immediate jobs
        if start_date or end_date:
            start_ts = _parse_iso_timestamp(start_date) if start_date else None
            end_ts = _parse_iso_timestamp(end_date) if end_date else None

            def in_date_range(job: Job) -> bool:
                # Use start_at (scheduled time) for scheduled jobs, created_at for immediate jobs
                job_date = job.start_at if job.start_at is not None else job.created_at
                if start_ts and job_date < start_ts:
                    return False
                if end_ts and job_date > end_ts:
                    return False
                return True

            db_jobs = [j for j in db_jobs if in_date_range(j)]

        # Sync remaining_time from in-memory jobs
        with world_lock:
            for db_job in db_jobs:
                _sync_remaining_time_from_memory(db_job, jobs_cache)

        return jsonify({
            "jobs": [_job_to_frontend_dict(j) for j in db_jobs],
            "total": len(db_jobs),
        }), 200

    @bp.route("/jobs/<job_id>", methods=["GET"])
    def get_job(job_id):
        """Get a specific job by ID."""
        try:
            job_id_int = int(job_id)
        except ValueError:
            return jsonify({"error": "Invalid job ID"}), 400

        job = repo.get(job_id_int)
        if job is None:
            return jsonify({"error": f"Job {job_id} not found"}), 404

        # Sync remaining_time from in-memory
        with world_lock:
            _sync_remaining_time_from_memory(job, jobs_cache)

        return jsonify(_job_to_frontend_dict(job)), 200

    @bp.route("/jobs/<job_id>", methods=["PATCH"])
    def update_job(job_id):
        """Update a job. Supports both frontend and internal field names."""
        try:
            job_id_int = int(job_id)
        except ValueError:
            return jsonify({"error": "Invalid job ID"}), 400

        data = request.get_json(silent=True) or {}
        updates_db = {}
        updates_mem = {}

        # Handle target
        if "target" in data:
            target, target_error = _normalize_target(data)
            if target_error:
                return jsonify({"error": target_error}), 400
            if target is None:
                updates_db["target_x"] = None
                updates_db["target_y"] = None
                updates_mem["target"] = None
            else:
                updates_db["target_x"] = float(target[0])
                updates_db["target_y"] = float(target[1])
                updates_mem["target"] = target

        # Handle target_radius
        if "target_radius" in data:
            try:
                radius = float(data["target_radius"])
                if radius <= 0:
                    return jsonify({"error": "target_radius must be positive"}), 400
                updates_db["target_radius"] = radius
                updates_mem["target_radius"] = radius
            except (ValueError, TypeError):
                return jsonify({"error": "target_radius must be a number"}), 400

        # Handle drone count (both field names)
        if "drone_count" in data or "drones" in data:
            drone_count, drone_error = _normalize_drone_count(data)
            if drone_error:
                return jsonify({"error": drone_error}), 400
            updates_db["drones"] = drone_count
            updates_mem["drones"] = drone_count

        # Handle is_active
        if "is_active" in data:
            is_active = bool(data["is_active"])
            updates_db["is_active"] = 1 if is_active else 0
            updates_mem["is_active"] = is_active

        # Handle status (with normalization)
        if "status" in data:
            normalized_status, status_error = _normalize_status(data["status"])
            if status_error:
                return jsonify({"error": status_error}), 400
            updates_db["status"] = normalized_status
            updates_mem["status"] = normalized_status

        # Atomic update: DB and memory together under lock
        with world_lock:
            # Get existing job for validation
            existing_job = jobs_cache.get(job_id_int)
            if existing_job is None:
                # Try to get from DB
                existing_job = repo.get(job_id_int)
                if existing_job is None:
                    return jsonify({"error": f"Job {job_id} not found"}), 404
            
            # Validation: check for inconsistent is_active/target combination
            # If setting is_active=True, ensure target exists (either in update or existing)
            if "is_active" in updates_mem and updates_mem["is_active"]:
                new_target = updates_mem.get("target") if "target" in updates_mem else existing_job.target
                if new_target is None:
                    return jsonify({"error": "Cannot activate job without a target"}), 400
            
            # Update in database
            updated_job = repo.update_fields(job_id_int, **updates_db)
            if updated_job is None:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            # Update in-memory job (same object)
            job = jobs_cache.get(job_id_int)
            if job:
                for key, value in updates_mem.items():
                    setattr(job, key, value)
                # Sync updated_at from DB to maintain consistency
                job.updated_at = updated_job.updated_at

        return jsonify(_job_to_frontend_dict(updated_job)), 200

    @bp.route("/jobs/<job_id>", methods=["DELETE"])
    def delete_job(job_id):
        """Delete a job permanently from database and memory."""
        try:
            job_id_int = int(job_id)
        except ValueError:
            return jsonify({"error": "Invalid job ID"}), 400

        # Atomic delete: DB and memory together under lock
        with world_lock:
            # Get job before deleting (for response)
            job = repo.get(job_id_int)
            if job is None:
                return jsonify({"error": f"Job {job_id} not found"}), 404
            
            # Delete from database
            deleted = repo.delete(job_id_int)
            if not deleted:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            # Remove from in-memory cache
            jobs_cache.remove(job_id_int)

        return jsonify(_job_to_frontend_dict(job)), 200

    return bp


# -------- Main Loop Status Sync --------

_repo_instance: Optional[JobRepo] = None


def get_repo() -> JobRepo:
    """Get the global JobRepo instance, creating if needed."""
    global _repo_instance
    if _repo_instance is None:
        _repo_instance = JobRepo()
    return _repo_instance


def sync_job_status_to_db(job: Job) -> None:
    """
    Sync a job's status, is_active, completed_at, and remaining_time to the database.
    
    This is called from the main loop when jobs are promoted or completed.
    It updates status-related fields and remaining_time for recovery.
    """
    repo = get_repo()
    updates = {
        "status": job.status,
        "is_active": 1 if job.is_active else 0,
        "remaining_time": job.remaining_time,
    }
    if job.completed_at is not None:
        updates["completed_at"] = job.completed_at
    repo.update_fields(job.id, **updates)
