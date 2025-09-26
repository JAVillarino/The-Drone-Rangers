from __future__ import annotations
import numpy as np
from planning.herding.utils import norm, smooth_push
from planning import state
from planning.plan_type import DoNothing, DronePosition, Plan

# Optional Numba import with fallback
try:
    from numba import njit
    NUMBA_AVAILABLE = True
except ImportError:
    NUMBA_AVAILABLE = False
    def njit(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

class World:
    """
    Stable flock + rectangular boundaries.
      boundary ∈ {"reflect","wrap","none"}

    Far-field behavior is controllable:
      - wa_far, g_tug_far: 0.0 → no self-gathering when dog is far
      - wr_far: gentle anti-crowding during grazing
      - pre-gather ramp (optional) via pre_gather=True to ease grouping as dog approaches
    
    """
    def __init__(
        self,
        sheep_xy: np.ndarray,
        shepherd_xy: list[float],
        target_xy: list[float],
        *,
        # geometry (paper)
        ra: float = 2.0,          # agent-agent distance
        rs: float = 40.0,         # shepherd detection
        k_nn: int = 51,           # nearest neighbors

        # timing & speeds (paper: 1 m/ts, dog 1.5 m/ts)
        dt: float = 1.0,
        vmax: float = 1.0,
        umax: float = 1.5,

        # weights (paper-ish)
        wr: float = 2.0,          # ρ_a repulsion
        wa: float = 1.05,         # c attraction
        ws: float = 1.0,          # ρ_s dog repulsion
        wm: float = 0.5,          # h inertia
        w_align: float = 0.0,     # no alignment in base paper

        # far-field grazing
        graze_alpha: float = 0.0,   # paper doesn't add separate wander
        inertia_alpha: float = 0.0, # while grazing

        # global tug
        g_tug: float = 0.0,       # off in base paper

        # noise (use vector noise as your stand-in for angular e≈0.3)
        sigma: float = 0.3,

        # far-field knobs off (paper)
        wa_far: float = 0.0,
        g_tug_far: float = 0.0,
        wr_far: float = 0.0,
        pre_gather: bool = False,
        pre_gather_scale: float = 1.5,

        graze_p: float = 0.05,
        
        # boundaries
        boundary: str = "reflect",
        bounds: tuple[float,float,float,float] = (0.0, 250.0, 0.0, 250.0),
        restitution: float = 0.85,
        # obstacles
        obstacles: np.ndarray | None = None,  # n-by-2 array of obstacle positions

        # rng
        seed: int = 0,
    ):
        self.N = sheep_xy.shape[0]
        
        # Initialize contiguous NumPy arrays for positions and velocities
        self.P = np.ascontiguousarray(sheep_xy, dtype=np.float64)  # shape (N, 2)
        self.V = np.zeros((self.N, 2), dtype=np.float64, order='C')  # shape (N, 2)
        
        self.dog = np.asarray(shepherd_xy, float)
        self.target = np.asarray(target_xy, float)
        self.paused = False
        
        # obstacles
        self.obstacles = obstacles if obstacles is not None else np.empty((0, 2))

        # params
        self.ra, self.rs, self.k_nn = ra, rs, k_nn
        self.dt, self.vmax, self.umax = dt, vmax, umax
        self.wr, self.wa, self.ws, self.wm, self.w_align = wr, wa, ws, wm, w_align
        self.graze_alpha, self.inertia_alpha = graze_alpha, inertia_alpha
        self.g_tug, self.sigma = g_tug, sigma

        # Cache squared distances for performance
        self.ra_sq = ra * ra
        self.rs_sq = rs * rs

        # far-field behavior
        self.wa_far, self.g_tug_far, self.wr_far = wa_far, g_tug_far, wr_far
        self.pre_gather = pre_gather
        self.pre_gather_scale = max(1.0, float(pre_gather_scale))

        # boundaries
        self.boundary = boundary
        self.xmin, self.xmax, self.ymin, self.ymax = bounds
        self.restitution = float(np.clip(restitution, 0.0, 1.0))

        self.graze_p = graze_p

        self.rng = np.random.default_rng(seed)
        
        # The -2 is because every sheep has n - 1 neighbors and k_nn is 0 indexed.
        assert(self.k_nn <= self.N - 2)

    # ---------- obstacle management ----------
    def add_obstacle(self, position: np.ndarray) -> None:
        """Add a single obstacle at the given position."""
        pos = np.asarray(position, float).reshape(1, -1)
        if self.obstacles.size == 0:
            self.obstacles = pos
        else:
            self.obstacles = np.vstack([self.obstacles, pos])
    
    def add_obstacles(self, positions: np.ndarray) -> None:
        """Add multiple obstacles at the given positions."""
        if positions.size == 0:
            return
        positions = np.asarray(positions, float)
        if positions.ndim == 1:
            positions = positions.reshape(1, -1)
        
        if self.obstacles.size == 0:
            self.obstacles = positions
        else:
            self.obstacles = np.vstack([self.obstacles, positions])
    
    def remove_obstacle(self, index: int) -> None:
        """Remove obstacle at the given index."""
        if 0 <= index < len(self.obstacles):
            self.obstacles = np.delete(self.obstacles, index, axis=0)
    
    def clear_obstacles(self) -> None:
        """Remove all obstacles."""
        self.obstacles = np.empty((0, 2))
    
    def get_obstacles(self) -> np.ndarray:
        """Get current obstacle positions."""
        return self.obstacles.copy()

    # ---------- neighbor ops ----------
    def _kNN_vec(self, i: int, K: int) -> np.ndarray:
        """Vectorized k-nearest neighbors using contiguous arrays."""
        if NUMBA_AVAILABLE:
            return _kNN_numba(self.P, i, K)
        else:
            d = np.sqrt(np.sum((self.P - self.P[i])**2, axis=1))
            idx = np.argpartition(d, K+1)[:K+1]   # includes self
            idx = idx[d[idx] > 0]                 # drop self
            return idx[:K]

    def _repel_close_vec(self, i: int) -> np.ndarray:
        """Vectorized repulsion from close neighbors using contiguous arrays."""
        if NUMBA_AVAILABLE:
            return _repel_close_numba(self.P, i, self.ra)
        else:
            # Calculate squared distances to all other agents (avoid sqrt)
            d_sq = np.sum((self.P - self.P[i])**2, axis=1)
            mask = (d_sq > 1e-18) & (d_sq < self.ra_sq)
            
            if not np.any(mask): 
                return np.zeros(2)
            
            # Vectorized repulsion calculation using cached inverse distances
            d = np.sqrt(d_sq[mask])
            inv_d = 1.0 / (d + 1e-9)
            vecs = (self.P[i] - self.P[mask]) * inv_d[:, None]
            return vecs.sum(axis=0)

    def _lcm_vec(self, i: int) -> np.ndarray:
        """Vectorized local center of mass calculation using contiguous arrays."""
        idx = self._kNN_vec(i, self.k_nn)
        if idx.size == 0:
            return self.P[i].copy()
        return np.mean(self.P[idx], axis=0)

    def _align_vec(self, i: int) -> np.ndarray:
        """Vectorized velocity alignment calculation using contiguous arrays."""
        idx = self._kNN_vec(i, self.k_nn)
        if idx.size == 0:
            return np.zeros(2)
        
        vbar = np.mean(self.V[idx], axis=0)
        vbar_norm = np.sqrt(np.sum(vbar**2))
        
        if vbar_norm == 0:
            return np.zeros(2)
        return vbar / (vbar_norm + 1e-9)

    # ---------- boundaries ----------
    def _apply_bounds_sheep_inplace(self):
        """In-place boundary application for all sheep positions and velocities."""
        if self.boundary == "none":
            return
        
        P, V = self.P, self.V
        
        if self.boundary == "wrap":
            Lx, Ly = self.xmax - self.xmin, self.ymax - self.ymin
            P[:, 0] = self.xmin + ((P[:, 0] - self.xmin) % Lx)
            P[:, 1] = self.ymin + ((P[:, 1] - self.ymin) % Ly)
            return
        
        # Reflection boundaries - in-place
        m = P[:, 0] < self.xmin;  P[m, 0] = self.xmin + (self.xmin - P[m, 0]); V[m, 0] = np.abs(V[m, 0]) * self.restitution
        m = P[:, 0] > self.xmax;  P[m, 0] = self.xmax - (P[m, 0] - self.xmax);  V[m, 0] = -np.abs(V[m, 0]) * self.restitution
        m = P[:, 1] < self.ymin;  P[m, 1] = self.ymin + (self.ymin - P[m, 1]); V[m, 1] = np.abs(V[m, 1]) * self.restitution
        m = P[:, 1] > self.ymax;  P[m, 1] = self.ymax - (P[m, 1] - self.ymax); V[m, 1] = -np.abs(V[m, 1]) * self.restitution

    def _apply_bounds_point(self, pos: np.ndarray) -> np.ndarray:
        if self.boundary == "none":
            return pos

        x, y = pos
        xmin, xmax, ymin, ymax = self.xmin, self.xmax, self.ymin, self.ymax

        if self.boundary == "wrap":
            Lx, Ly = (xmax - xmin), (ymax - ymin)
            x = xmin + ((x - xmin) % Lx)
            y = ymin + ((y - ymin) % Ly)
            return np.array([x, y])

        # reflect (just clamp & mirror step)
        if x < xmin:  x = xmin + (xmin - x)
        if x > xmax:  x = xmax - (x - xmax)
        if y < ymin:  y = ymin + (ymin - y)
        if y > ymax:  y = ymax - (y - ymax)
        return np.array([x, y])

    # ---------- sheep step ----------
    def _gcm_vec(self) -> np.ndarray:
        """Vectorized global center of mass calculation using contiguous arrays."""
        return np.mean(self.P, axis=0)

    def _sheep_step(self):
        """Optimized sheep step using vectorized operations where possible."""
        D = self.dog
        G = self._gcm_vec()
        
        # Calculate squared distances to dog for all sheep (avoid sqrt)
        dog_distances_sq = np.sum((self.P - D)**2, axis=1)
        far_mask = dog_distances_sq > self.rs_sq
        near_mask = ~far_mask
        
        # Handle far sheep (grazing behavior)
        if np.any(far_mask):
            self._handle_far_sheep(far_mask, G)
        
        # Handle near sheep (flocking behavior) 
        if np.any(near_mask):
            # Only compute actual distances for near sheep when needed
            near_distances = np.sqrt(dog_distances_sq[near_mask])
            self._handle_near_sheep(near_mask, D, G, near_distances)
        
        # Apply boundaries to all sheep at once - in-place
        self._apply_bounds_sheep_inplace()
    
    def _handle_far_sheep(self, far_mask: np.ndarray, G: np.ndarray):
        """Handle sheep that are far from the dog (grazing behavior)."""
        far_indices = np.where(far_mask)[0]
        
        for i in far_indices:
            # Bernoulli: move with probability p while grazing  
            if self.graze_p < 1.0 and self.rng.random() > self.graze_p:
                self.V[i] = 0.0
                continue
            
            # Random unit heading for grazing
            rnd = self.rng.normal(size=2)
            h = rnd / (np.sqrt(np.sum(rnd**2)) + 1e-9)
            
            # Full grazing step
            step = self.vmax * self.dt
            new_pos = self.P[i] + step * h
            self.V[i] = (new_pos - self.P[i]) / self.dt
            self.P[i] = new_pos
    
    def _handle_near_sheep(self, near_mask: np.ndarray, D: np.ndarray, G: np.ndarray, near_distances: np.ndarray):
        """Handle sheep that are near the dog (flocking behavior)."""
        near_indices = np.where(near_mask)[0]
        
        for idx, i in enumerate(near_indices):
            # Flocking forces
            R = self._repel_close_vec(i)
            A = self._lcm_vec(i) - self.P[i]
            d = max(1e-9, near_distances[idx])
            push = smooth_push(d, self.rs)
            inv_d = 1.0 / d  # Cache inverse distance
            S = push * (self.P[i] - D) * inv_d
            AL = self._align_vec(i)
            
            # Previous velocity (inertia) - cache inverse norm
            vel_sq = np.sum(self.V[i]**2)
            if vel_sq > 0:
                vel_norm = np.sqrt(vel_sq)
                inv_vel_norm = 1.0 / (vel_norm + 1e-9)
                prev = self.V[i] * inv_vel_norm
            else:
                vel_norm = 0.0
                prev = np.zeros(2)
            
            # Combine forces
            H = self.wr*R + self.wa*A + self.ws*S + self.wm*prev + self.w_align*AL
            
            # Global tug toward center - cache inverse norm
            gcm_vec = G - self.P[i]
            gcm_sq = np.sum(gcm_vec**2)
            if gcm_sq > 0:
                gcm_norm = np.sqrt(gcm_sq)
                inv_gcm_norm = 1.0 / (gcm_norm + 1e-9)
                H += self.g_tug * gcm_vec * inv_gcm_norm
            
            # Tempered noise
            noise = self.sigma * np.sqrt(self.dt) * self.rng.normal(size=2)
            if vel_norm > 0.3 * self.vmax:
                noise *= 0.5
            H = H + noise
            
            # Normalize and step - cache inverse norm
            h_sq = np.sum(H**2)
            if h_sq > 0:
                h_norm = np.sqrt(h_sq)
                inv_h_norm = 1.0 / (h_norm + 1e-9)
                h = H * inv_h_norm
            else:
                h = np.zeros(2)
            step = self.vmax * self.dt
            
            new_pos = self.P[i] + step * h
            self.V[i] = (new_pos - self.P[i]) / self.dt
            self.P[i] = new_pos

    # ---------- public API ----------
    def step(self, plan: Plan):
        if not self.paused:
            self._sheep_step()
        
            # Use the plan to update the position of the shepherd.
            match plan:
                case DoNothing():
                    pass
                case DronePosition(position=pos):
                    self.dog = self._apply_bounds_point(pos)
                case _ as unexpected_plan:
                    raise Exception("Unexpected plan type", unexpected_plan)

    def get_state(self) -> state.State:
        return state.State(
            flock=self.P.copy(),
            drone=self.dog.copy(),
            target=self.target.copy(),
            obstacles=self.obstacles.copy() if self.obstacles.size > 0 else None,
        )
    
    def pause(self):
        self.paused = not self.paused


# Numba-optimized functions (defined outside class)
@njit
def _kNN_numba(P: np.ndarray, i: int, K: int) -> np.ndarray:
    """Numba-optimized k-nearest neighbors."""
    N = P.shape[0]
    distances = np.empty(N, dtype=np.float64)
    
    # Calculate squared distances to avoid sqrt
    for j in range(N):
        dx = P[j, 0] - P[i, 0]
        dy = P[j, 1] - P[i, 1]
        distances[j] = dx*dx + dy*dy
    
    # Find K+1 smallest (includes self)
    indices = np.empty(K, dtype=np.int32)
    count = 0
    
    for _ in range(K+1):
        min_idx = -1
        min_dist = np.inf
        for j in range(N):
            if distances[j] < min_dist:
                min_dist = distances[j]
                min_idx = j
        
        if min_idx != i and count < K:  # skip self
            indices[count] = min_idx
            count += 1
        distances[min_idx] = np.inf  # mark as used
        
    return indices[:count]

@njit
def _repel_close_numba(P: np.ndarray, i: int, ra: float) -> np.ndarray:
    """Numba-optimized repulsion calculation using squared distances."""
    repulsion = np.zeros(2, dtype=np.float64)
    pos_i = P[i]
    ra_sq = ra * ra
    
    for j in range(P.shape[0]):
        if i == j:
            continue
            
        dx = pos_i[0] - P[j, 0]
        dy = pos_i[1] - P[j, 1]
        d_sq = dx*dx + dy*dy
        
        if d_sq > 1e-18 and d_sq < ra_sq:
            d = np.sqrt(d_sq)
            inv_d = 1.0 / (d + 1e-9)
            repulsion[0] += dx * inv_d
            repulsion[1] += dy * inv_d
            
    return repulsion
