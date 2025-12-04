"""
Herding Utilities

This module provides common mathematical utility functions used across the herding
planning and simulation logic, such as vector normalization and force smoothing.
"""
from __future__ import annotations

import numpy as np

# -----------------------------------------------------------------------------
# Vector Operations
# -----------------------------------------------------------------------------

def norm(v: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """
    Normalize a vector `v` to unit length.
    
    Args:
        v: Input vector (NumPy array).
        eps: Small epsilon to prevent division by zero.
        
    Returns:
        The normalized unit vector.
    """
    x = np.linalg.norm(v)
    return v / (x + eps)


# -----------------------------------------------------------------------------
# Force Functions
# -----------------------------------------------------------------------------

def smooth_push(dist: float | np.ndarray, rs: float, eps: float = 1e-9) -> float | np.ndarray:
    """
    Calculate a smooth influence scalar in [0, 1] based on distance.
    
    The influence is 1.0 when distance is 0, and linearly decreases to 0.0
    at distance `rs`. Beyond `rs`, the influence is 0.0.
    
    Args:
        dist: Distance from the source (float or NumPy array).
        rs: The sensing radius or maximum influence distance.
        eps: Small epsilon (unused in this formula but kept for consistency).
        
    Returns:
        Influence value in [0, 1].
    """
    # Note: eps is not strictly needed for division here but kept for signature consistency
    return np.maximum(0.0, 1.0 - dist / (rs + eps))