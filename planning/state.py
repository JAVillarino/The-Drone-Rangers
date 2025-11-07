from dataclasses import dataclass, field
from typing import List, Optional, Literal
from itertools import count
from datetime import datetime, timezone

import numpy as np

JobStatus = Literal["pending", "scheduled", "running", "completed", "cancelled"]

@dataclass
class Job:
    """State of a given herding job."""

    # 1-by-2 of the position of the drone.
    target: Optional[np.ndarray]
    target_radius: float

    # Estimate of the remaining time in seconds required before the job will finish.
    remaining_time: Optional[float]
    
    # If the user pauses a job, this becomes false.
    is_active: bool
    
    drones: int

    # Lifecycle and scheduling fields
    status: JobStatus  # "pending", "scheduled", "running", "completed", "cancelled"
    start_at: Optional[float]  # UNIX timestamp for when to start; None = immediate
    completed_at: Optional[float]  # UNIX timestamp when completed; None = not completed
    scenario_id: Optional[str]  # UUID pointing to a scenario
    
    created_at: float  # UNIX timestamp
    updated_at: float  # UNIX timestamp

    # UUID.
    id: int = field(default_factory=count().__next__)
    
    def to_dict(self) -> dict:
        def ts_to_iso(ts: Optional[float]) -> Optional[str]:
            if ts is None:
                return None
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")

        return {
            "id": self.id,
            "target": None if self.target is None else self.target.tolist(),
            "target_radius": self.target_radius,
            "remaining_time": self.remaining_time,
            "is_active": self.is_active,
            "drones": self.drones,
            "status": self.status,
            "start_at": ts_to_iso(self.start_at),
            "completed_at": ts_to_iso(self.completed_at),
            "scenario_id": self.scenario_id,
            "created_at": ts_to_iso(self.created_at),
            "updated_at": ts_to_iso(self.updated_at),
        }

# State coming from the world.
@dataclass
class State:
    # n-by-2 of the positions of all of the animals in the flock.
    flock: np.ndarray
    
    # n-by-2 of the position of the drones.
    drones: np.ndarray
    
    # List of polygon obstacles, each polygon is (m,2) array of vertices.
    polygons: List[np.ndarray]
    
    jobs: List[Job]
    
    def to_dict(self) -> dict:
        return {
            "flock": self.flock.tolist(),
            "drones": self.drones.tolist(),
            "jobs": [j.to_dict() for j in self.jobs],
            "polygons": [poly.tolist() for poly in self.polygons],
        }

    