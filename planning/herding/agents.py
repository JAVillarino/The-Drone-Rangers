from __future__ import annotations
import numpy as np

class Sheep:
    __slots__ = ("pos", "vel")
    def __init__(self, pos, vel=None):
        self.pos = np.asarray(pos, float)
        self.vel = np.zeros(2) if vel is None else np.asarray(vel, float)


class Shepherd:
    __slots__ = ("pos",)
    def __init__(self, pos):
        self.pos = np.asarray(pos, float)