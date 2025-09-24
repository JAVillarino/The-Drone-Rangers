import numpy as np

def spawn_uniform(N, bounds, seed=2):
    """Generates N points uniformly within the given bounds."""
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = bounds
    x = rng.uniform(xmin + 1, xmax - 1, N)
    y = rng.uniform(ymin + 1, ymax - 1, N)
    return np.stack([x, y], axis=1)


def spawn_clusters(N, k, bounds, spread=3.5, seed=2):
    """Generates N points in k clusters."""
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = bounds
    centers = np.stack([
        rng.uniform(xmin + 6, xmax - 6, k),
        rng.uniform(ymin + 6, ymax - 6, k)
    ], axis=1)
    pts = []
    base = N // k
    extras = N - base * k
    sizes = [base + (1 if i < extras else 0) for i in range(k)]
    for i, c in enumerate(centers):
        cov = np.eye(2) * (spread ** 2)
        pts.append(rng.multivariate_normal(c, cov, sizes[i]))
    return np.vstack(pts)


def spawn_corners(N, bounds, jitter=2.0, seed=2):
    """Generates N points distributed among four corners."""
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = bounds
    corners = np.array([
        [xmin + 2, ymin + 2],
        [xmin + 2, ymax - 2],
        [xmax - 2, ymin + 2],
        [xmax - 2, ymax - 2],
    ], dtype=float)
    pts = []
    for i in range(N):
        c = corners[i % 4]
        pts.append(c + rng.normal(scale=jitter, size=2))
    return np.array(pts)


def spawn_line(N, bounds, seed=2, y=None):
    """Generates N points along a horizontal line."""
    rng = np.random.default_rng(seed)
    xmin, xmax, ymin, ymax = bounds
    if y is None:
        y = rng.uniform(ymin + 5, ymax - 5)
    xs = np.linspace(xmin + 2, xmax - 2, N)
    ys = rng.normal(loc=y, scale=1.0, size=N)
    return np.stack([xs, ys], axis=1)


def spawn_circle(N, center=(0,0), radius=5.0, seed=2):
    """Generates N points within a circle."""
    rng = np.random.default_rng(seed)
    c = np.array(center, float)
    th = rng.random(N)*2*np.pi
    r  = radius*np.sqrt(rng.random(N))
    return c + np.stack([r*np.cos(th), r*np.sin(th)], axis=1)

