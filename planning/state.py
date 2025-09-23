from dataclasses import dataclass

import numpy as np

@dataclass
class State:
    # n-by-2 of the positions of all of the animals in the flock.
    flock: np.ndarray
    
    # 1-by-2 of the position of the drone.
    drone: np.ndarray

    # 1-by-2 of the position of the drone.
    target: np.ndarray | None