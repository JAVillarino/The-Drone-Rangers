from __future__ import annotations
import numpy as np
from .utils import norm
import plan_type
import state

class ShepherdPolicy:
    """
    Collect/drive policy extracted from the original World methods.
    Behavior and formulas are unchanged.
    """
    
    def __init__(self, *, fN: float, umax: float, too_close: float, collect_standoff: int, drive_standoff: int):
        self.fN = fN # world.ra * (world.N ** (2.0/3.0))
        # Lowkey umax should be in the sim, not in the shepherd policy. That's fine though I guess.
        self.umax = umax
        self.too_close = too_close
        self.collect_standoff = collect_standoff
        self.drive_standoff = drive_standoff
    
    def _gcm(self, world: state.State) -> np.ndarray:
        # TODO: Should this maybe be transposed?
        return np.mean([s for s in world.flock], axis=1)

    def _cohesive(self, world: state.State, G: np.ndarray) -> bool:
        r = np.max([np.linalg.norm(s - G) for s in world.flock], axis=1)
        return r <= self.fN

    def _drive_point(self, world: state.State, G: np.ndarray) -> np.ndarray:
        ghat = norm(world.target - G)
        return G - ghat * self.drive_standoff

    def _collect_point(self, world: state.State, G: np.ndarray) -> np.ndarray:
        dists = np.array([np.linalg.norm(s - G) for s in world.flock])
        j = int(np.argmax(dists))
        c = norm(G - world.flock[j])
        return world.flock[j] - c * self.collect_standoff

    def plan(self, world: state.State, dt: float) -> plan_type.Plan:
        """Return None if no update should be made."""
        # safety stop if too close to any flock (prevents splitting)
        if any(np.linalg.norm(s - world.drone) < self.too_close for s in world.flock):
            return plan_type.DoNothing()

        G = self._gcm(world)
        P = self._drive_point(world, G) if self._cohesive(world, G) else self._collect_point(world, G)

        # move toward chosen point and apply boundary
        return plan_type.DronePosition(world.drone + self.umax * dt * norm(P - world.drone))
        