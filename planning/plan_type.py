from dataclasses import dataclass

import numpy as np

# Right now, the only kind of plan that the planning algorithm can send to the simulator is to say exactly where the new position of the drone is.

@dataclass
class DronePositions:
    # n-by-2 array of all of the sheep positions.
    positions: np.ndarray
    # n-by-1 arrary of zeros if the drone is too high to be applying repulsion and ones if it is applying repulsion.
    apply_repulsion: np.ndarray

    # Extra info for debugging. Later we should refactor this if not every drone position plan has the same debugging info.
    target_sheep_indices: int | None

@dataclass
class DoNothing:
    pass

Plan = DronePositions | DoNothing