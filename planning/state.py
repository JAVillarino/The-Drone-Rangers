from dataclasses import dataclass
from typing import List
from itertools import count
from dataclasses import dataclass, field

import numpy as np

@dataclass
class Job:
    """State of a given herding job."""

    # 1-by-2 of the position of the drone.
    target: np.ndarray | None
    target_radius: float

    # Estimate of the remaining time in seconds required before the job will finish.
    remaining_time: float | None
    
    # If the user pauses a job, this becomes false.
    is_active: bool

    # UUID.
    id: int = field(default_factory=count().__next__)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "target": None if self.target is None else self.target.tolist(),
            "target_radius": self.target_radius,
            "remaining_time": self.remaining_time,
            "is_active": self.is_active,
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
            "jobs": list(map(lambda j : j.to_dict(), self.jobs)),
            "polygons": [poly.tolist() for poly in self.polygons],
        }

    