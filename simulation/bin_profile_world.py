# simulation/bin_profile_world.py
import os, sys, importlib, io
import numpy as np
import cProfile, pstats

SIM_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.dirname(SIM_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from planning.plan_type import DoNothing

BOUNDS = (0.0, 250.0, 0.0, 250.0)
DOG = np.array([125.0, 125.0])
TARGET = np.array([200.0, 200.0])

def reload_world(disable_jit: bool):
    if disable_jit:
        os.environ["NUMBA_DISABLE_JIT"] = "1"
    else:
        os.environ.pop("NUMBA_DISABLE_JIT", None)
    if "simulation.world" in sys.modules:
        del sys.modules["simulation.world"]
    import simulation.world as world_mod
    importlib.reload(world_mod)
    return world_mod

def square(cx, cy, hw):
    return np.array([[cx-hw, cy-hw],[cx+hw, cy-hw],[cx+hw, cy+hw],[cx-hw, cy+hw]], float)

def make_world(World, N=256, with_obstacles=True, seed=0):
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = BOUNDS
    sheep_xy = np.column_stack([
        rng.uniform(xmin + 10, xmax - 10, size=N),
        rng.uniform(ymin + 10, ymax - 10, size=N)
    ])
    polys = [square(90, 90, 25), square(160, 140, 18)] if with_obstacles else None
    return World(sheep_xy, DOG, TARGET, bounds=BOUNDS,
                 obstacles_polygons=polys, boundary="reflect", seed=seed)

def main():
    disable_jit = os.environ.get("DR_PERF_NOJIT", "0") == "1"
    steps = int(os.environ.get("DR_PERF_STEPS", "300"))
    N = int(os.environ.get("DR_PERF_N", "256"))
    with_obstacles = os.environ.get("DR_PERF_OBS", "1") == "1"
    out = os.environ.get("DR_PERF_OUT", "profile.prof")

    world_mod = reload_world(disable_jit)
    World = world_mod.World
    w = make_world(World, N=N, with_obstacles=with_obstacles)

    # Warm-up
    for _ in range(20):
        w.step(DoNothing())

    pr = cProfile.Profile()
    pr.enable()
    for _ in range(steps):
        w.step(DoNothing())
    pr.disable()

    pr.dump_stats(out)
    s = io.StringIO()
    pstats.Stats(pr, stream=s).sort_stats("cumulative").print_stats(30)
    print(s.getvalue())
    print(f"Saved cProfile stats to {out}")

if __name__ == "__main__":
    main()
