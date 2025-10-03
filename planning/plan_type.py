from dataclasses import dataclass

import numpy as np

# Right now, the only kind of plan that the planning algorithm can send to the simulator is to say exactly where the new position of the drone is.

@dataclass
class DronePosition:
    position: np.ndarray
    ignore_repulsion: bool = False

@dataclass
class DoNothing:
    pass

Plan = DronePosition | DoNothing