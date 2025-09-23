from __future__ import annotations
import numpy as np

def norm(v: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    x = np.linalg.norm(v)
    return v / (x + eps)


def smooth_push(dist: float, rs: float, eps: float = 1e-9) -> float:
    """Dog influence scalar in [0,1]: 1 when very close, linearly → 0 at/after rs."""
    if dist >= rs:
        return 0.0
    return max(0.0, 1.0 - dist / (rs + eps))