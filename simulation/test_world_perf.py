# simulation/test_world_perf.py - FIXED VERSION
import os, sys, importlib
import numpy as np
import pytest
import cProfile
import time
from io import StringIO
import pstats

# Add project root to path
REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from planning.plan_type import DoNothing

def _reload_world(disable_jit: bool):
    """Reload world module with or without JIT."""
    if disable_jit:
        os.environ["NUMBA_DISABLE_JIT"] = "1"
    else:
        os.environ.pop("NUMBA_DISABLE_JIT", None)
    
    # Clear module cache
    if "simulation.world" in sys.modules:
        del sys.modules["simulation.world"]
    
    import simulation.world as world_mod
    importlib.reload(world_mod)
    return world_mod

def _make_world(World, N=128, with_obstacles=True, seed=0):
    """Create a test world with specified parameters."""
    rng = np.random.default_rng(seed)
    bounds = (0.0, 250.0, 0.0, 250.0)
    xmin, xmax, ymin, ymax = bounds
    
    # Generate sheep positions
    sheep_xy = np.column_stack([
        rng.uniform(xmin + 10, xmax - 10, size=N),
        rng.uniform(ymin + 10, ymax - 10, size=N)
    ])
    
    # Add obstacles if requested
    obstacles = None
    if with_obstacles:
        obstacles = [
            np.array([[90, 90], [110, 90], [110, 110], [90, 110]]),
            np.array([[160, 140], [180, 140], [180, 160], [160, 160]])
        ]
    
    return World(
        sheep_xy=sheep_xy,
        shepherd_xy=[125, 125],
        target_xy=[200, 200],
        bounds=bounds,
        obstacles_polygons=obstacles,
        boundary='reflect',
        seed=seed
    )

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
    
    # FIXED: Much more aggressive warm-up to eliminate JIT compilation
    warmup_steps = max(50, N // 4)  # Scale warm-up with N
    print(f"Warming up with {warmup_steps} steps...")
    for _ in range(warmup_steps):
        world.step(DoNothing())
    
    # FIXED: More steps for better accuracy
    STEPS = max(50, min(200, 10000 // N))  # Scale steps with N
    print(f"Profiling with {STEPS} steps...")
    
    def run_steps():
        for _ in range(STEPS):
            world.step(DoNothing())
    
    benchmark(run_steps)
    
    # Basic sanity checks
    assert world.P.shape == (N, 2)
    assert np.isfinite(world.P).all()

def test_bottleneck_analysis():
    """FIXED: Detailed bottleneck analysis with proper warm-up and more steps."""
    world_mod = _reload_world(disable_jit=False)
    World = world_mod.World
    world = _make_world(World, N=128, with_obstacles=True)

    print("\n=== BOTTLENECK ANALYSIS (FIXED) ===")
    
    # FIXED: Much more aggressive warm-up to eliminate JIT compilation
    print("Warming up to eliminate JIT compilation overhead...")
    warmup_steps = 100  # Much more warm-up
    for _ in range(warmup_steps):
        world.step(DoNothing())
    print(f"Completed {warmup_steps} warm-up steps")
    
    # FIXED: Profile with many more steps for accurate measurement
    profiler = cProfile.Profile()
    profiler.enable()
    
    profiling_steps = 200  # Much more profiling steps
    print(f"Profiling {profiling_steps} steps...")
    for _ in range(profiling_steps):
        world.step(DoNothing())
    
    profiler.disable()
    
    # Get profiling results
    s = StringIO()
    ps = pstats.Stats(profiler, stream=s).sort_stats('cumulative')
    ps.print_stats(20)  # Top 20 functions
    
    print("Top 20 functions by cumulative time:")
    print(s.getvalue())
    
    # FIXED: Manual timing with more iterations
    print("\n=== MANUAL TIMING (FIXED) ===")
    
    # Time sheep step with more iterations
    start = time.perf_counter()
    for _ in range(50):  # More iterations
        world._sheep_step()
    sheep_time = time.perf_counter() - start
    print(f"Sheep step (50 iterations): {sheep_time:.4f}s")
    
    # Time kNN calculations
    start = time.perf_counter()
    for _ in range(20):  # More iterations
        for i in range(min(20, world.N)):  # More sheep
            world._kNN_vec(i, world.k_nn)
    knn_time = time.perf_counter() - start
    print(f"kNN calculations (20 sheep, 20 iterations): {knn_time:.4f}s")
    
    # Time repulsion calculations
    start = time.perf_counter()
    for _ in range(20):  # More iterations
        for i in range(min(20, world.N)):  # More sheep
            world._repel_close_vec(i)
    repel_time = time.perf_counter() - start
    print(f"Repulsion calculations (20 sheep, 20 iterations): {repel_time:.4f}s")
    
    # Time obstacle avoidance
    if world.polys:
        start = time.perf_counter()
        for _ in range(20):  # More iterations
            world._obstacle_avoid(world.P[:20])  # More sheep
        obstacle_time = time.perf_counter() - start
        print(f"Obstacle avoidance (20 sheep, 20 iterations): {obstacle_time:.4f}s")
    
    # Time boundary handling
    start = time.perf_counter()
    for _ in range(50):  # More iterations
        world._apply_bounds_sheep_inplace()
    bounds_time = time.perf_counter() - start
    print(f"Boundary handling (50 iterations): {bounds_time:.4f}s")
    
    # FIXED: Performance regression detection
    print("\n=== PERFORMANCE REGRESSION DETECTION ===")
    total_time = sheep_time + knn_time + repel_time + (obstacle_time if world.polys else 0) + bounds_time
    print(f"Total computation time: {total_time:.4f}s")
    
    # Set performance thresholds (adjust based on your requirements)
    MAX_SHEEP_TIME = 0.100  # 100ms for 50 sheep steps
    MAX_KNN_TIME = 0.050    # 50ms for kNN calculations
    MAX_REPEL_TIME = 0.010  # 10ms for repulsion calculations
    
    assert sheep_time <= MAX_SHEEP_TIME, f"Sheep step too slow: {sheep_time:.4f}s > {MAX_SHEEP_TIME}s"
    assert knn_time <= MAX_KNN_TIME, f"kNN calculations too slow: {knn_time:.4f}s > {MAX_KNN_TIME}s"
    assert repel_time <= MAX_REPEL_TIME, f"Repulsion calculations too slow: {repel_time:.4f}s > {MAX_REPEL_TIME}s"
    
    print("✅ Performance thresholds met!")
    assert True

def test_scaling_analysis():
    """FIXED: Analyze how performance scales with N."""
    print("\n=== SCALING ANALYSIS (FIXED) ===")
    world_mod = _reload_world(disable_jit=False)
    World = world_mod.World
    
    N_values = [32, 64, 128, 256]
    times = []
    
    for N in N_values:
        world = _make_world(World, N, with_obstacles=False)
        
        # FIXED: More warm-up for each N
        warmup_steps = max(50, N // 4)
        for _ in range(warmup_steps):
            world.step(DoNothing())
        
        # FIXED: More profiling steps
        start = time.perf_counter()
        for _ in range(100):  # More steps
            world.step(DoNothing())
        end = time.perf_counter()
        
        t = end - start
        times.append(t)
        print(f"N={N:3d}: {t:.4f}s ({t/N:.6f}s per sheep)")
    
    print("\nScaling ratios:")
    for i in range(len(N_values) - 1):
        ratio_time = times[i+1] / times[i]
        ratio_N = N_values[i+1] / N_values[i]
        efficiency = ratio_time / ratio_N
        print(f"{N_values[i]} -> {N_values[i+1]}: {ratio_time:.2f}x time, {ratio_N:.1f}x N, efficiency: {efficiency:.2f}")
    
    # FIXED: Performance regression detection for scaling
    print("\n=== SCALING REGRESSION DETECTION ===")
    for i in range(len(N_values) - 1):
        efficiency = times[i+1] / times[i] / (N_values[i+1] / N_values[i])
        assert efficiency <= 2.0, f"Scaling efficiency too poor: {efficiency:.2f} > 2.0"
    
    print("✅ Scaling efficiency acceptable!")
    assert True

def test_jit_impact():
    """FIXED: Compare JIT vs no-JIT performance."""
    print("\n=== JIT IMPACT ANALYSIS (FIXED) ===")
    
    N = 128
    world_mod_jit = _reload_world(disable_jit=False)
    world_mod_nojit = _reload_world(disable_jit=True)
    
    World_jit = world_mod_jit.World
    World_nojit = world_mod_nojit.World
    
    # FIXED: Much more warm-up for both versions
    print("Warming up JIT version...")
    world_jit = _make_world(World_jit, N, with_obstacles=False)
    for _ in range(100):  # More warm-up
        world_jit.step(DoNothing())
    
    print("Warming up no-JIT version...")
    world_nojit = _make_world(World_nojit, N, with_obstacles=False)
    for _ in range(50):  # Some warm-up for no-JIT
        world_nojit.step(DoNothing())
    
    # FIXED: More profiling steps
    print("Profiling JIT version...")
    start_jit = time.perf_counter()
    for _ in range(100):  # More steps
        world_jit.step(DoNothing())
    end_jit = time.perf_counter()
    time_jit = end_jit - start_jit
    print(f"JIT ON (N={N}): {time_jit:.4f}s")
    
    print("Profiling no-JIT version...")
    start_nojit = time.perf_counter()
    for _ in range(100):  # More steps
        world_nojit.step(DoNothing())
    end_nojit = time.perf_counter()
    time_nojit = end_nojit - start_nojit
    print(f"JIT OFF (N={N}): {time_nojit:.4f}s")
    
    if time_jit > 0:
        speedup = time_nojit / time_jit
        print(f"JIT speedup: {speedup:.2f}x")
        
        # FIXED: Performance regression detection
        assert speedup >= 1.5, f"JIT speedup too low: {speedup:.2f}x < 1.5x"
    
    print("✅ JIT performance acceptable!")
    assert True

def test_performance_regression_detection():
    """NEW: Comprehensive performance regression detection."""
    print("\n=== PERFORMANCE REGRESSION DETECTION ===")
    
    # Test with different configurations
    configs = [
        (64, False, "small_no_obstacles"),
        (128, False, "medium_no_obstacles"), 
        (128, True, "medium_with_obstacles"),
        (256, False, "large_no_obstacles")
    ]
    
    for N, with_obstacles, name in configs:
        print(f"\nTesting {name} (N={N}, obstacles={with_obstacles})...")
        
        world_mod = _reload_world(disable_jit=False)
        World = world_mod.World
        world = _make_world(World, N, with_obstacles)
        
        # Warm-up
        warmup_steps = max(50, N // 4)
        for _ in range(warmup_steps):
            world.step(DoNothing())
        
        # Measure performance
        start = time.perf_counter()
        for _ in range(100):
            world.step(DoNothing())
        end = time.perf_counter()
        
        total_time = end - start
        time_per_step = total_time / 100
        time_per_sheep = time_per_step / N
        
        print(f"  Total time: {total_time:.4f}s")
        print(f"  Time per step: {time_per_step:.6f}s")
        print(f"  Time per sheep: {time_per_sheep:.8f}s")
        
        # Performance thresholds (adjust based on your requirements)
        MAX_TIME_PER_STEP = 0.010  # 10ms per step
        MAX_TIME_PER_SHEEP = 0.0001  # 0.1ms per sheep
        
        assert time_per_step <= MAX_TIME_PER_STEP, f"Step too slow: {time_per_step:.6f}s > {MAX_TIME_PER_STEP}s"
        assert time_per_sheep <= MAX_TIME_PER_SHEEP, f"Per-sheep too slow: {time_per_sheep:.8f}s > {MAX_TIME_PER_SHEEP}s"
        
        print(f"  ✅ {name} performance acceptable!")
    
    print("\n✅ All performance regression tests passed!")
    assert True
