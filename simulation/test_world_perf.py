# simulation/test_world_perf.py - Performance testing with bottleneck isolation

# Run all benchmarks (fast)

# pytest simulation/test_world_perf.py --benchmark-columns=min,mean,max,rounds --benchmark-sort=mean

# # Run bottleneck analysis
# pytest simulation/test_world_perf.py::test_bottleneck_analysis -v -s

# # Run scaling analysis  
# pytest simulation/test_world_perf.py::test_scaling_analysis -v -s
import os, sys, importlib
import numpy as np
import pytest
import time
import cProfile
import pstats
from io import StringIO

# Ensure repo root is on sys.path (so "planning" imports resolve)
SIM_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.dirname(SIM_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from planning.plan_type import DoNothing

BOUNDS = (0.0, 250.0, 0.0, 250.0)
DOG = np.array([125.0, 125.0])
TARGET = np.array([200.0, 200.0])

def _square(cx=125.0, cy=125.0, hw=30.0):
    return np.array([[cx-hw, cy-hw],[cx+hw, cy-hw],[cx+hw, cy+hw],[cx-hw, cy+hw]], float)

def _reload_world(disable_jit: bool):
    # Flip Numba JIT via env var
    if disable_jit:
        os.environ["NUMBA_DISABLE_JIT"] = "1"
    else:
        os.environ.pop("NUMBA_DISABLE_JIT", None)

    # Fresh import so the env var takes effect
    if "simulation.world" in sys.modules:
        del sys.modules["simulation.world"]
    import simulation.world as world_mod
    importlib.reload(world_mod)
    return world_mod

def _make_world(World, N: int, with_obstacles: bool, seed: int = 0):
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = BOUNDS
    sheep_xy = np.column_stack([
        rng.uniform(xmin + 10, xmax - 10, size=N),
        rng.uniform(ymin + 10, ymax - 10, size=N)
    ])
    polys = None
    if with_obstacles:
        polys = [_square(90, 90, 25), _square(160, 140, 18)]
    return World(
        sheep_xy=sheep_xy,
        shepherd_xy=DOG,
        target_xy=TARGET,
        bounds=BOUNDS,
        obstacles_polygons=polys,
        boundary="reflect",
        seed=seed,
    )

# Fast test parameters - reasonable performance testing
@pytest.mark.parametrize("N", [64, 128, 256])
@pytest.mark.parametrize("with_obstacles", [False, True])
@pytest.mark.parametrize("jit", ["on", "off"])
def test_world_step_throughput(benchmark, N, with_obstacles, jit):
    """Benchmark steps/sec for different sizes & obstacle settings."""
    # Skip extremely slow combinations
    if jit == "off" and N >= 256:
        pytest.skip("Skipping slow JIT-off combinations")
    
    world_mod = _reload_world(disable_jit=(jit == "off"))
    World = world_mod.World
    world = _make_world(World, N, with_obstacles)

    # Adaptive warm-up based on N
    warmup_steps = max(3, min(10, N // 32))
    for _ in range(warmup_steps):
        world.step(DoNothing())

    # Adaptive step count based on N
    STEPS = max(10, min(50, 2000 // N))
    def run_steps():
        for _ in range(STEPS):
            world.step(DoNothing())

    benchmark(run_steps)

    # Basic sanity
    assert world.P.shape == (N, 2)
    assert np.isfinite(world.P).all()

def test_bottleneck_analysis():
    """Detailed bottleneck analysis for N=128 with obstacles."""
    world_mod = _reload_world(disable_jit=False)
    World = world_mod.World
    world = _make_world(World, N=128, with_obstacles=True)

    print("\n=== BOTTLENECK ANALYSIS ===")
    
    # Profile the sheep step function
    profiler = cProfile.Profile()
    profiler.enable()
    
    # Run multiple steps for better profiling
    for _ in range(20):
        world.step(DoNothing())
    
    profiler.disable()
    
    # Get profiling results
    s = StringIO()
    ps = pstats.Stats(profiler, stream=s).sort_stats('cumulative')
    ps.print_stats(20)  # Top 20 functions
    
    print("Top 20 functions by cumulative time:")
    print(s.getvalue())
    
    # Manual timing of key components
    print("\n=== MANUAL TIMING ===")
    
    # Time individual components
    start = time.perf_counter()
    for _ in range(10):
        world._sheep_step()
    sheep_time = time.perf_counter() - start
    print(f"Sheep step (10 iterations): {sheep_time:.4f}s")
    
    # Time kNN calculations
    start = time.perf_counter()
    for _ in range(10):
        for i in range(min(10, world.N)):  # Sample first 10 sheep
            world._kNN_vec(i, world.k_nn)
    knn_time = time.perf_counter() - start
    print(f"kNN calculations (10 sheep, 10 iterations): {knn_time:.4f}s")
    
    # Time repulsion calculations
    start = time.perf_counter()
    for _ in range(10):
        for i in range(min(10, world.N)):  # Sample first 10 sheep
            world._repel_close_vec(i)
    repel_time = time.perf_counter() - start
    print(f"Repulsion calculations (10 sheep, 10 iterations): {repel_time:.4f}s")
    
    # Time obstacle avoidance
    if world.polys:
        start = time.perf_counter()
        for _ in range(10):
            world._obstacle_avoid(world.P[:10])  # Sample first 10 sheep
        obstacle_time = time.perf_counter() - start
        print(f"Obstacle avoidance (10 sheep, 10 iterations): {obstacle_time:.4f}s")
    
    # Time boundary handling
    start = time.perf_counter()
    for _ in range(10):
        world._apply_bounds_sheep_inplace()
    bounds_time = time.perf_counter() - start
    print(f"Boundary handling (10 iterations): {bounds_time:.4f}s")

def test_scaling_analysis():
    """Analyze how performance scales with N."""
    print("\n=== SCALING ANALYSIS ===")
    
    world_mod = _reload_world(disable_jit=False)
    World = world_mod.World
    
    N_values = [32, 64, 128, 256]
    times = []
    
    for N in N_values:
        world = _make_world(World, N, with_obstacles=False)
        
        # Warm up
        for _ in range(3):
            world.step(DoNothing())
        
        # Time 10 steps
        start = time.perf_counter()
        for _ in range(10):
            world.step(DoNothing())
        elapsed = time.perf_counter() - start
        
        times.append(elapsed)
        print(f"N={N:3d}: {elapsed:.4f}s ({elapsed/N:.6f}s per sheep)")
    
    # Calculate scaling ratios
    print("\nScaling ratios:")
    for i in range(1, len(N_values)):
        ratio = times[i] / times[i-1]
        n_ratio = N_values[i] / N_values[i-1]
        efficiency = ratio / n_ratio
        print(f"{N_values[i-1]} -> {N_values[i]}: {ratio:.2f}x time, {n_ratio:.1f}x N, efficiency: {efficiency:.2f}")

def test_jit_impact():
    """Compare JIT vs no-JIT performance."""
    print("\n=== JIT IMPACT ANALYSIS ===")
    
    N = 128
    world_mod_jit = _reload_world(disable_jit=False)
    world_mod_nojit = _reload_world(disable_jit=True)
    
    World_jit = world_mod_jit.World
    World_nojit = world_mod_nojit.World
    
    # Test with JIT
    world_jit = _make_world(World_jit, N, with_obstacles=False)
    for _ in range(5):  # Warm up JIT
        world_jit.step(DoNothing())
    
    start = time.perf_counter()
    for _ in range(20):
        world_jit.step(DoNothing())
    jit_time = time.perf_counter() - start
    
    # Test without JIT
    world_nojit = _make_world(World_nojit, N, with_obstacles=False)
    start = time.perf_counter()
    for _ in range(20):
        world_nojit.step(DoNothing())
    nojit_time = time.perf_counter() - start
    
    speedup = nojit_time / jit_time
    print(f"JIT enabled:  {jit_time:.4f}s")
    print(f"JIT disabled: {nojit_time:.4f}s")
    print(f"JIT speedup:  {speedup:.2f}x")

if __name__ == "__main__":
    # Run bottleneck analysis when script is executed directly
    test_bottleneck_analysis()
    test_scaling_analysis()
    test_jit_impact()
