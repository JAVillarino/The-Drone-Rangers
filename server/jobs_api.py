from __future__ import annotations

import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple
from uuid import uuid4
import uuid

import numpy as np
from flask import Blueprint, jsonify, request

from planning import state
from planning.state import Job, JobStatus


DB_PATH = Path(__file__).parent / "tmp" / "jobs.pkl"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

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


def _normalize_target(data: dict) -> Tuple[Optional[state.Target], Optional[str]]:
    """Parse and validate target from request data. Returns (target, error_msg)."""
    if "target" not in data or data["target"] is None:
        return None, "Target not provided"

    target = data["target"]
    if target["type"] == "circle":
        return state.Circle(center=np.asarray(target["center"], dtype=float).reshape(2), radius=float(target["radius"])), None
    elif target["type"] == "polygon":
        return state.Polygon(points=np.asarray(target["points"], dtype=float).reshape(2, -1)), None
    else:
        return None, "Invalid target type"
    

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
        return "pending", f"Invalid status: {status}. Must be one of: scheduled, pending, running, completed, cancelled"
    
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


def _sync_remaining_time_from_memory(db_job: Job, jobs_cache) -> None:
    """Update remaining_time from in-memory job if found."""
    mem_job = jobs_cache.get(db_job.id)
    if mem_job:
        db_job.remaining_time = mem_job.remaining_time


# -------- Job Repository --------

class JobRepo:
    """Repository for persisting and retrieving jobs from PKL.
    
    Every method starts by loading the jobs from the database and ends by saving the jobs back to the database if they've been modified.
    """

    def _load_jobs(self) -> List[Job]:
        """Load the jobs from the database."""
        if not DB_PATH.exists():
            DB_PATH.touch()
            self._save_jobs([])

        with open(DB_PATH, "rb") as f:
            return pickle.load(f)

    def _save_jobs(self, jobs: List[Job]):
        """Save the jobs to the database."""
        with open(DB_PATH, "wb") as f:
            pickle.dump(jobs, f)

    def create(
        self,
        *,
        target: Optional[state.Target],
        is_active: bool,
        drones: int,
        status: JobStatus,
        start_at: Optional[float],
        scenario_id: Optional[str],
    ) -> Job:
        """Create a new job in the database."""

        jobs = self._load_jobs()

        now = datetime.now(timezone.utc).timestamp()
        new_job = Job(
            id=uuid4(),
            target=target,
            remaining_time=None,
            is_active=is_active,
            drones=drones,
            status=status,
            start_at=start_at,
            completed_at=None,
            scenario_id=scenario_id,
            created_at=now,
            updated_at=now,
            maintain_until="target_is_reached",
        )

        jobs.append(new_job)
        self._save_jobs(jobs)

        return new_job

    def get(self, job_id: uuid.UUID) -> Optional[Job]:
        """Retrieve a job by ID."""
        jobs = self._load_jobs()

        for job in jobs:
            if job.id == job_id:
                return job
        return None

    def list(self, status: Optional[JobStatus] = None) -> List[Job]:
        """List all jobs, optionally filtered by status."""
        jobs = self._load_jobs()
        if status:
            return [j for j in jobs if j.status == status]
        else:
            return jobs

    def update_fields(self, job_id: uuid.UUID, **fields) -> Optional[Job]:
        """Update specific fields of a job."""

        print("Updating fields:", fields)

        if not fields:
            return self.get(job_id)

        jobs = self._load_jobs()
        job = None
        for j in jobs:
            if j.id == job_id:
                job = j
                break
        if job is None:
            return None

        for k, v in fields.items():
            setattr(job, k, v)
        job.updated_at = datetime.now(timezone.utc).timestamp()
        self._save_jobs(jobs)

        return job

    def delete(self, job_id: uuid.UUID):
        """
        Delete a job from the database.
        
        Returns True if job was deleted, False if job was not found.
        """
        jobs = self._load_jobs()
        jobs = [j for j in jobs if j.id != job_id]
        self._save_jobs(jobs)

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
            is_active=is_active,
            drones=drone_count,
            status=status,
            start_at=start_at,
            scenario_id=data.get("scenario_id"),
        )

        # Add to in-memory cache (ensures single instance per ID)
        with world_lock:
            jobs_cache.add(job)

        return jsonify(job.to_dict()), 201

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
        print("db_jobs in list_jobs:", db_jobs);

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
            "jobs": [j.to_dict() for j in db_jobs],
            "total": len(db_jobs),
        }), 200

    @bp.route("/jobs/<job_id>", methods=["GET"])
    def get_job(job_id):
        """Get a specific job by ID."""
        try:
            job_id_uuid = uuid.UUID(job_id)
        except ValueError as e:
            return jsonify({"error": f"Invalid job ID: {e}"}), 400

        job = repo.get(job_id_uuid)
        if job is None:
            return jsonify({"error": f"Job {job_id} not found"}), 404

        # Sync remaining_time from in-memory
        with world_lock:
            _sync_remaining_time_from_memory(job, jobs_cache)

        return jsonify(job.to_dict()), 200

    @bp.route("/jobs/<job_id>", methods=["PATCH"])
    def update_job(job_id):
        """Update a job. Supports both frontend and internal field names."""
        try:
            job_id_uuid = uuid.UUID(job_id)
        except ValueError as e:
            return jsonify({"error": f"Invalid job ID: {e}"}), 400

        data = request.get_json(silent=True) or {}
        updates_db = {}
        updates_mem = {}

        # Handle target
        if "target" in data:
            target, target_error = _normalize_target(data)
            if target_error:
                return jsonify({"error": target_error}), 400
            updates_db["target"] = target
            updates_mem["target"] = target

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
            existing_job = jobs_cache.get(job_id_uuid)
            if existing_job is None:
                # Try to get from DB
                existing_job = repo.get(job_id_uuid)
                if existing_job is None:
                    return jsonify({"error": f"Job {job_id} not found"}), 404
            
            # Validation: check for inconsistent is_active/target combination
            # If setting is_active=True, ensure target exists (either in update or existing)
            if "is_active" in updates_mem and updates_mem["is_active"]:
                new_target = updates_mem.get("target") if "target" in updates_mem else existing_job.target
                if new_target is None:
                    return jsonify({"error": "Cannot activate job without a target"}), 400
            
            # Update in database
            updated_job = repo.update_fields(job_id_uuid, **updates_db)
            if updated_job is None:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            # Update in-memory job (same object)
            job = jobs_cache.get(job_id_uuid)
            if job:
                for key, value in updates_mem.items():
                    setattr(job, key, value)
                # Sync updated_at from DB to maintain consistency
                job.updated_at = updated_job.updated_at

        return jsonify(updated_job.to_dict()), 200

    @bp.route("/jobs/<job_id>", methods=["DELETE"])
    def delete_job(job_id):
        """Delete a job permanently from database and memory."""
        try:
            job_id_uuid = uuid.UUID(job_id)
        except ValueError as e:
            return jsonify({"error": f"Invalid job ID: {e}"}), 400

        # Atomic delete: DB and memory together under lock
        with world_lock:
            # Get job before deleting (for response)
            job = repo.get(job_id_uuid)
            if job is None:
                return jsonify({"error": f"Job {job_id} not found"}), 404
            
            # Delete from database
            deleted = repo.delete(job_id_uuid)
            if not deleted:
                return jsonify({"error": f"Job {job_id} not found"}), 404

            # Remove from in-memory cache
            jobs_cache.remove(job_id_uuid)

        return jsonify(job.to_dict()), 200

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
