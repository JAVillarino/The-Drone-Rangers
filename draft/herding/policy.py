from __future__ import annotations
import numpy as np
from .utils import norm

class ShepherdPolicy:
    """
    Collect/drive policy extracted from the original World methods.
    Behavior and formulas are unchanged.
    """
    def _gcm(self, world) -> np.ndarray:
        return np.mean([s.pos for s in world.sheep], axis=0)

    def _cohesive(self, world, G: np.ndarray) -> bool:
        r = np.max([np.linalg.norm(s.pos - G) for s in world.sheep])
        fN = world.ra * (world.N ** (2.0/3.0))
        return r <= fN

    def _drive_point(self, world, G: np.ndarray) -> np.ndarray:
        ghat = norm(world.target - G)
        return G - ghat * (world.drive_k * world.ra * np.sqrt(world.N))

    def _collect_point(self, world, G: np.ndarray) -> np.ndarray:
        dists = np.array([np.linalg.norm(s.pos - G) for s in world.sheep])
        j = int(np.argmax(dists))
        c = norm(G - world.sheep[j].pos)
        return world.sheep[j].pos - c * (world.collect_k * world.ra)

    def step(self, world) -> None:
        # safety stop if too close to any sheep (prevents splitting)
        if any(np.linalg.norm(s.pos - world.dog.pos) < 3*world.ra for s in world.sheep):
            return

        G = self._gcm(world)
        P = self._drive_point(world, G) if self._cohesive(world, G) else self._collect_point(world, G)

        # move toward chosen point and apply boundary
        new_dog = world.dog.pos + world.umax*world.dt * norm(P - world.dog.pos)
        world.dog.pos = world._apply_bounds_point(new_dog)