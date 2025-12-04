"""
World Simulation Profiling Script

This script profiles the performance of the simulation World class, specifically
the `step` function. It supports toggling Numba JIT compilation and configuring
simulation parameters via environment variables.
"""
import cProfile
import importlib
import io
import os
import pstats
import sys
from typing import Any, List, Optional, Tuple

import numpy as np

# Ensure project root is in path
SIM_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.dirname(SIM_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from planning.plan_type import DoNothing

# -----------------------------------------------------------------------------
# Constants & Configuration
# -----------------------------------------------------------------------------

BOUNDS = (0.0, 250.0, 0.0, 250.0)
DOG_START = np.array([125.0, 125.0])
TARGET_POS = np.array([200.0, 200.0])


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def reload_world(disable_jit: bool) -> Any:
    """
    Reloads the simulation.world module with or without JIT enabled.
    
    Args:
        disable_jit: If True, sets NUMBA_DISABLE_JIT=1.
        
    Returns:
        The reloaded module.
    """
    if disable_jit:
        os.environ["NUMBA_DISABLE_JIT"] = "1"
    else:
        os.environ.pop("NUMBA_DISABLE_JIT", None)
        
    if "simulation.world" in sys.modules:
        del sys.modules["simulation.world"]
        
    import simulation.world as world_mod
    importlib.reload(world_mod)
    return world_mod


def square(cx: float, cy: float, hw: float) -> np.ndarray:
    """Creates a square polygon centered at (cx, cy) with half-width hw."""
    return np.array([
        [cx - hw, cy - hw],
        [cx + hw, cy - hw],
        [cx + hw, cy + hw],
        [cx - hw, cy + hw]
    ], float)


def make_world(
    WorldClass: Any, 
    N: int = 256, 
    with_obstacles: bool = True, 
    seed: int = 0
) -> Any:
    """
    Creates a World instance with specified parameters.
    
    Args:
        WorldClass: The World class from the (re)loaded module.
        N: Number of sheep.
        with_obstacles: Whether to include obstacles.
        seed: Random seed.
        
    Returns:
        An instance of WorldClass.
    """
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = BOUNDS
    
    sheep_xy = np.column_stack([
        rng.uniform(xmin + 10, xmax - 10, size=N),
        rng.uniform(ymin + 10, ymax - 10, size=N)
    ])
    
    polys = [square(90, 90, 25), square(160, 140, 18)] if with_obstacles else None
    
    return WorldClass(
        sheep_xy, 
        DOG_START, 
        TARGET_POS, 
        bounds=BOUNDS,
        obstacles_polygons=polys, 
        boundary="reflect", 
        seed=seed
    )


# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

def main():
    # Configuration from environment variables
    disable_jit = os.environ.get("DR_PERF_NOJIT", "0") == "1"
    steps = int(os.environ.get("DR_PERF_STEPS", "300"))
    N = int(os.environ.get("DR_PERF_N", "256"))
    with_obstacles = os.environ.get("DR_PERF_OBS", "1") == "1"
    out_file = os.environ.get("DR_PERF_OUT", "profile.prof")

    print(f"Profiling Configuration:")
    print(f"  JIT Disabled: {disable_jit}")
    print(f"  Steps:        {steps}")
    print(f"  Agents (N):   {N}")
    print(f"  Obstacles:    {with_obstacles}")
    print("-" * 40)

    # Load World class
    world_mod = reload_world(disable_jit)
    World = world_mod.World
    w = make_world(World, N=N, with_obstacles=with_obstacles)

    # Warm-up (JIT compilation happens here if enabled)
    print("Warming up...")
    for _ in range(20):
        w.step(DoNothing())

    # Profiling
    print("Running profile...")
    pr = cProfile.Profile()
    pr.enable()
    for _ in range(steps):
        w.step(DoNothing())
    pr.disable()

    # Output results
    pr.dump_stats(out_file)
    s = io.StringIO()
    pstats.Stats(pr, stream=s).sort_stats("cumulative").print_stats(30)
    print(s.getvalue())
    print(f"Saved cProfile stats to {out_file}")


if __name__ == "__main__":
    main()
