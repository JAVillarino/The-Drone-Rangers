from dataclasses import dataclass
from typing import List, Optional

import numpy as np

# State coming from the world.
@dataclass
class State:
    # n-by-2 of the positions of all of the animals in the flock.
    flock: np.ndarray
    
    # n-by-2 of the position of the drone.
    drones: np.ndarray

    # 1-by-2 of the position of the drone.
    target: np.ndarray | None
    
    # List of polygon obstacles, each polygon is (m,2) array of vertices.
    polygons: List[np.ndarray]
    
    def to_dict(self) -> dict:
        return {
            "flock": self.flock.tolist(),
            "drones": self.drones.tolist(),
            "target": None if self.target is None else self.target.tolist(),
            "polygons": [poly.tolist() for poly in self.polygons],
        }

