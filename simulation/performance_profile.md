# Performance Testing Documentation

## Overview

The `simulation/test_world_perf.py` file provides comprehensive performance testing and bottleneck analysis for the drone herding simulation. It includes both benchmark testing and detailed performance profiling tools.

## Quick Start

```bash
# Activate virtual environment
source venv/bin/activate

# Run all benchmarks (recommended)
pytest simulation/test_world_perf.py --benchmark-columns=min,mean,max,rounds --benchmark-sort=mean

# Run bottleneck analysis
pytest simulation/test_world_perf.py::test_bottleneck_analysis -v -s

# Run scaling analysis
pytest simulation/test_world_perf.py::test_scaling_analysis -v -s
```

## Test Components

### 1. Main Benchmark Test (`test_world_step_throughput`)

**Purpose**: Measures simulation performance across different configurations.

**Parameters Tested**:
- **N (flock size)**: 64, 128, 256 sheep
- **Obstacles**: With/without polygon obstacles
- **JIT**: Enabled/disabled Numba JIT compilation

**Smart Optimizations**:
- Skips extremely slow combinations (JIT-off with N≥256)
- Adaptive step counts based on flock size
- Adaptive warm-up based on complexity

**Expected Runtime**: ~11 seconds

### 2. Bottleneck Analysis (`test_bottleneck_analysis`)

**Purpose**: Identifies performance bottlenecks using detailed profiling.

**Output Includes**:
- **Top 20 functions** by cumulative time (cProfile)
- **Manual timing** of key components:
  - Sheep step execution
  - kNN neighbor calculations
  - Repulsion force calculations
  - Obstacle avoidance
  - Boundary handling

**Usage**:
```bash
pytest simulation/test_world_perf.py::test_bottleneck_analysis -v -s
```

**Sample Output**:
```
=== BOTTLENECK ANALYSIS ===
Top 20 functions by cumulative time:
[Detailed cProfile output showing function call counts and timing]

=== MANUAL TIMING ===
Sheep step (10 iterations): 0.0153s
kNN calculations (10 sheep, 10 iterations): 0.0006s
Repulsion calculations (10 sheep, 10 iterations): 0.0001s
Obstacle avoidance (10 sheep, 10 iterations): 0.0004s
Boundary handling (10 iterations): 0.0002s
```

### 3. Scaling Analysis (`test_scaling_analysis`)

**Purpose**: Analyzes how performance scales with flock size.

**Output Includes**:
- **Time per sheep** for different flock sizes
- **Scaling efficiency** (how close to linear scaling)
- **Performance ratios** between different sizes

**Usage**:
```bash
pytest simulation/test_world_perf.py::test_scaling_analysis -v -s
```

**Sample Output**:
```
=== SCALING ANALYSIS ===
N= 32: 0.0036s (0.000111s per sheep)
N= 64: 0.0071s (0.000111s per sheep)
N=128: 0.0134s (0.000105s per sheep)
N=256: 0.0327s (0.000128s per sheep)

Scaling ratios:
32 -> 64: 1.99x time, 2.0x N, efficiency: 1.00
64 -> 128: 1.90x time, 2.0x N, efficiency: 0.95
128 -> 256: 2.44x time, 2.0x N, efficiency: 1.22
```

### 4. JIT Impact Analysis (`test_jit_impact`)

**Purpose**: Compares performance with and without Numba JIT compilation.

**Note**: This test may fail due to Numba compilation issues in some environments.

## Benchmark Results Interpretation

### Performance Ranking (Typical Results)

1. **JIT + No Obstacles**: ~4ms (fastest)
2. **JIT + Obstacles**: ~13ms (3x slower)
3. **No JIT + No Obstacles**: ~73ms (17x slower)
4. **No JIT + Obstacles**: ~191ms (44x slower)

### Key Performance Insights

**JIT Impact**: Numba JIT provides 17-44x speedup
**Obstacle Impact**: Obstacles add ~3x overhead
**Scaling**: Nearly linear scaling (95-100% efficiency)

## Advanced Usage

### Custom Benchmark Parameters

To modify test parameters, edit the parametrize decorators in `test_world_step_throughput`:

```python
@pytest.mark.parametrize("N", [64, 128, 256])  # Modify flock sizes
@pytest.mark.parametrize("with_obstacles", [False, True])  # Toggle obstacles
@pytest.mark.parametrize("jit", ["on", "off"])  # Toggle JIT
```

### Running Specific Test Combinations

```bash
# Test only JIT-enabled runs
pytest simulation/test_world_perf.py -k "on" --benchmark-columns=min,mean,max,rounds

# Test only small flock sizes
pytest simulation/test_world_perf.py -k "64" --benchmark-columns=min,mean,max,rounds

# Skip slow combinations
pytest simulation/test_world_perf.py -k "not (off and (256 or 512))" --benchmark-columns=min,mean,max,rounds
```

### Benchmark Output Options

```bash
# Basic benchmark output
pytest simulation/test_world_perf.py --benchmark-columns=min,mean,max,rounds --benchmark-sort=mean

# Save benchmark results
pytest simulation/test_world_perf.py --benchmark-save=my_benchmark --benchmark-columns=min,mean,max,rounds

# Compare with previous results
pytest simulation/test_world_perf.py --benchmark-compare=my_benchmark --benchmark-columns=min,mean,max,rounds

# Generate JSON output
pytest simulation/test_world_perf.py --benchmark-json=results.json --benchmark-columns=min,mean,max,rounds
```

## Troubleshooting

### Test Never Terminates

**Problem**: Tests appear to hang indefinitely.

**Solution**: The test file now includes smart optimizations:
- Skips extremely slow combinations
- Uses adaptive step counts
- Completes in ~11 seconds instead of hours

### Numba Compilation Errors

**Problem**: JIT-related tests fail with compilation errors.

**Solution**: 
- Use JIT-enabled tests only: `pytest simulation/test_world_perf.py -k "on"`
- Or disable JIT globally: Set `NUMBA_DISABLE_JIT=1` environment variable

### Memory Issues with Large Flocks

**Problem**: Out of memory errors with large N values.

**Solution**:
- Reduce maximum N in test parameters
- Use fewer benchmark rounds
- Increase system memory or use smaller test sizes

### Slow Performance

**Problem**: Tests run very slowly.

**Solutions**:
1. **Use JIT**: Ensure Numba JIT is enabled (`jit="on"`)
2. **Reduce flock size**: Test with smaller N values
3. **Skip obstacles**: Test without obstacles first
4. **Use fast test**: Run only the essential combinations

## Performance Optimization Tips

### For Development

1. **Use JIT**: Always enable Numba JIT for production
2. **Avoid obstacles**: Remove obstacles if not needed
3. **Optimize kNN**: The kNN calculation is a major bottleneck
4. **Vectorize operations**: Use NumPy vectorized operations where possible

### For Production

1. **Pre-compile JIT**: Warm up JIT functions before timing
2. **Batch operations**: Process multiple sheep simultaneously
3. **Cache calculations**: Reuse expensive computations
4. **Profile regularly**: Use bottleneck analysis to identify new issues

## File Structure

```
simulation/
├── test_world_perf.py          # Main performance test file
├── world.py                    # Simulation implementation
└── scenarios.py               # Test scenarios

docs/
└── performance_testing.md     # This documentation
```

## Dependencies

- `pytest`: Test framework
- `pytest-benchmark`: Benchmarking plugin
- `numba`: JIT compilation
- `numpy`: Numerical computations
- `cProfile`: Performance profiling

## Contributing

When adding new performance tests:

1. **Follow naming convention**: `test_*_performance` or `test_*_bottleneck`
2. **Include docstrings**: Explain what the test measures
3. **Use parametrize**: Test multiple configurations
4. **Add assertions**: Verify correctness of results
5. **Update documentation**: Add new tests to this guide

## Examples

### Complete Performance Analysis

```bash
# Run full analysis suite
source venv/bin/activate

# 1. Run benchmarks
pytest simulation/test_world_perf.py::test_world_step_throughput --benchmark-columns=min,mean,max,rounds --benchmark-sort=mean

# 2. Analyze bottlenecks
pytest simulation/test_world_perf.py::test_bottleneck_analysis -v -s

# 3. Check scaling
pytest simulation/test_world_perf.py::test_scaling_analysis -v -s
```

### Quick Performance Check

```bash
# Fast performance check (JIT only, small flocks)
pytest simulation/test_world_perf.py -k "on and (64 or 128)" --benchmark-columns=min,mean,max,rounds
```

### Development Workflow

```bash
# During development - quick checks
pytest simulation/test_world_perf.py::test_bottleneck_analysis -v -s

# Before commits - full benchmarks
pytest simulation/test_world_perf.py --benchmark-columns=min,mean,max,rounds --benchmark-sort=mean

# Performance regression testing
pytest simulation/test_world_perf.py --benchmark-compare=baseline --benchmark-columns=min,mean,max,rounds
```
EOF