from dataclasses import dataclass, field
from typing import List, Optional, Literal, Union
from itertools import count
from datetime import datetime, timezone
import uuid

import numpy as np

JobStatus = Literal["pending", "scheduled", "running", "completed", "cancelled"]
MaintainUntil = Union[Literal["target_is_reached"], float]  # "target_is_reached" or UNIX timestamp

@dataclass
class Circle:
    center: np.ndarray
    radius: Optional[float]

    def to_dict(self) -> dict:
        return {
            "center": self.center.tolist(),
            "radius": self.radius,
        }

@dataclass
class Polygon:
    points: np.ndarray

    def to_dict(self) -> dict:
        return {
            "points": self.points.tolist(),
        }

Target = Union[Circle, Polygon]

@dataclass
class Job:
    """State of a given herding job."""
    target: Optional[Target]
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
    
    # When to stop maintaining the target:
    # - "target_is_reached": maintain until target condition is satisfied
    # - float: maintain until this UNIX timestamp
    maintain_until: MaintainUntil
    
    created_at: float  # UNIX timestamp
    updated_at: float  # UNIX timestamp

    # UUID.
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    
    def to_dict(self) -> dict:
        def ts_to_iso(ts: Optional[float]) -> Optional[str]:
            if ts is None:
                return None
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")
        
        def maintain_until_to_dict(mu: MaintainUntil) -> str:
            """Convert maintain_until to dict representation."""
            if mu == "target_is_reached":
                return "target_is_reached"
            else:
                # mu is a float timestamp here, so ts_to_iso will return a string (not None)
                result = ts_to_iso(mu)
                return result if result is not None else ""
        
        return {
            "id": self.id,
            "target": self.target.to_dict() if self.target is not None else None,
            "remaining_time": self.remaining_time,
            "is_active": self.is_active,
            "drones": self.drones,
            "status": self.status,
            "start_at": ts_to_iso(self.start_at),
            "completed_at": ts_to_iso(self.completed_at),
            "scenario_id": self.scenario_id,
            "maintain_until": maintain_until_to_dict(self.maintain_until),
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

    