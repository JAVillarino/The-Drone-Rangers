from dataclasses import dataclass

import numpy as np

# Right now, the only kind of plan that the planning algorithm can send to the simulator is to say exactly where the new position of the drone is.

@dataclass
class DronePosition:
    position: np.ndarray
    
    # Extra info for debugging. Later we should refactor this if not every drone position plan has the same debugging info.
    target_sheep_index: int | None

@dataclass
class DoNothing:
    pass

Plan = DronePosition | DoNothing