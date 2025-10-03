from __future__ import annotations
import numpy as np
from .utils import norm
from planning.plan_type import DoNothing, DronePosition, Plan
from planning import state

class ShepherdPolicy:
    """
    Collect/drive policy extracted from the original World methods.
    Behavior and formulas are unchanged.
    """
    
    def __init__(self, *, fN: float, umax: float, too_close: float, collect_standoff: int, drive_standoff: int, flyover_on_collect: bool = True):
        self.fN = fN
        # Lowkey umax should be in the sim, not in the shepherd policy. That's fine though I guess.
        self.umax = umax
        self.too_close = too_close
        self.collect_standoff = collect_standoff
        self.drive_standoff = drive_standoff
        self.flyover_on_collect = flyover_on_collect
    
    def _gcm(self, world: state.State) -> np.ndarray:
        return np.mean([s for s in world.flock], axis=0)

    def _cohesive(self, world: state.State, G: np.ndarray) -> bool:
        r = np.max([np.linalg.norm(s - G) for s in world.flock])
        return r <= self.fN

    def _drive_point(self, world: state.State, G: np.ndarray) -> np.ndarray:
        ghat = norm(world.target - G)
        return G - ghat * self.drive_standoff

    def _collect_point(self, world: state.State, G: np.ndarray) -> tuple[np.ndarray, int]:
        """Returns the target point and the target sheep index."""
        P = world.flock                         # (N,2)
        D = world.drone                         # (2,)

        dG = np.linalg.norm(P - G, axis=1)      # distance to global COM
        dGoal = np.linalg.norm(P - world.target, axis=1)      # distance to goal
        dD = np.linalg.norm(P - D, axis=1)      # distance to dog

        score = dG - 0.1 * dD + 0.2 * dGoal    # your trade-off
        j = int(np.argmax(score))               # winning sheep index

        # point behind that sheep, pointing toward G
        dir_to_G = G - P[j]
        c = dir_to_G / (np.linalg.norm(dir_to_G) + 1e-9)
        return P[j] - c * self.collect_standoff, j
    
    def _needs_flyover(self, world: state.State, target: np.ndarray, corridor: float) -> bool:
        P = np.asarray(world.flock)

        A = world.drone
        B = target
        AB = B - A
        ab2 = float(np.dot(AB, AB)) + 1e-12  # avoid div-by-zero

        # Project each sheep onto the segment A→B
        t = np.clip(((P - A) @ AB) / ab2, 0.0, 1.0)
        closest = A + t[:, None] * AB
        d = np.linalg.norm(P - closest, axis=1)

        return np.any(d <= corridor * self.too_close)


    def plan(self, world: state.State, dt: float) -> Plan:
        """Return None if no update should be made."""
        # safety stop if too close to any flock (prevents splitting)
        G = self._gcm(world)
        is_cohesive = self._cohesive(world, G)

        if is_cohesive:
            # DRIVE: keep safety stop (repulsion ON)
            if any(np.linalg.norm(s - world.drone) < self.too_close for s in world.flock):
                return DoNothing()
            P = self._drive_point(world, G)
            ignore_repulsion = False
            target_sheep_index = None
        else:
            # COLLECT: candidate standoff point
            P, target_sheep_index = self._collect_point(world, G)
            # Only fly-over if the straight-line approach would pass near sheep
            ignore_repulsion = self.flyover_on_collect and self._needs_flyover(world, P, corridor=0.40)

        step = world.drone + self.umax * dt * norm(P - world.drone)
        return DronePosition(step, target_sheep_index=target_sheep_index, ignore_repulsion=ignore_repulsion)
