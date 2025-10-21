from __future__ import annotations
import numpy as np
from planning.herding.utils import norm, smooth_push
from planning import state
from planning.plan_type import DoNothing, DronePositions, Plan

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
        shepherd_xy: np.ndarray, # n-by-2 of the positions of all of the shepherds.
        target_xy: list[float] | None = None,
        *,
        # geometry (paper)
        ra: float = 4.0,          # agent-agent distance
        rs: float = 65.0,         # shepherd detection
        k_nn: int = 21,           # nearest neighbors

        # timing & speeds (paper: 1 m/ts, dog 1.5 m/ts)
        dt: float = 1.0,
        vmax: float = 1.0,
        umax: float = 1.5,

        # weights (paper-ish)
        wr: float = 50.0,          # ρ_a repulsion
        wa: float = 1.05,         # c attraction
        ws: float = 10.0,          # ρ_s dog repulsion
        wm: float = 20,          # h inertia
        w_align: float = 0.0,     # no alignment in base paper

        # far-field grazing
        graze_alpha: float = 0.0,   # paper doesn't add separate wander

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
        boundary: str = "none",
        bounds: tuple[float,float,float,float] = (0.0, 250.0, 0.0, 250.0),
        restitution: float = 0.85,
        
        # polygon obstacles
        obstacles_polygons: list[np.ndarray] | None = None,
        obstacle_influence: float = 8.0,
        w_obs: float = 4.0,
        w_tan: float = 12.0,
        keep_out: float = 6.0,
        world_keep_out: float = 5.0,
        wall_follow_boost: float = 6.0,
        stuck_speed_ratio: float = 0.08,
        near_wall_ratio: float = 0.8,

        # rng
        seed: int = 0,
        **_kw_ignore,
    ):
        self.N = sheep_xy.shape[0]
        
        # Initialize contiguous NumPy arrays for positions and velocities
        self.P = np.ascontiguousarray(sheep_xy, dtype=np.float64)  # shape (N, 2)
        self.V = np.zeros((self.N, 2), dtype=np.float64, order='C')  # shape (N, 2)
        
        self.dogs = shepherd_xy
        self.target = np.asarray(target_xy, float) if target_xy is not None else None
        self.paused = False
        
        # polygon obstacles
        self.polys = []
        self.poly_edges = []
        if obstacles_polygons is not None:
            for poly in obstacles_polygons:
                self.add_polygon(poly)

        # params
        self.ra, self.rs, self.k_nn = ra, rs, k_nn
        self.dt, self.vmax, self.umax = dt, vmax, umax
        self.wr, self.wa, self.ws, self.wm, self.w_align = wr, wa, ws, wm, w_align
        self.graze_alpha = graze_alpha
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

        # polygon obstacle parameters
        self.obstacle_influence = obstacle_influence
        self.w_obs = w_obs
        self.w_tan = w_tan
        self.keep_out = keep_out
        self.world_keep_out = world_keep_out
        self.wall_follow_boost = wall_follow_boost
        self.stuck_speed_ratio = stuck_speed_ratio
        self.near_wall_ratio = near_wall_ratio

        self.graze_p = graze_p

        self.rng = np.random.default_rng(seed)
        
        # The -2 is because every sheep has n - 1 neighbors and k_nn is 0 indexed.
        assert self.k_nn <= self.N - 1
        
        # Sanitize initial positions if polygons exist
        if self.polys:
            self._sanitize_initial_positions()

        # Neighbor cache and movement tracking
        self.nb_idx = -np.ones((self.N, self.k_nn), dtype=np.int32)
        self.prev_P = self.P.copy()
        self._rr_cursor = 0
        self.eps_move = max(1e-6, 0.4*self.ra)
        # Auto-toggle: enable cache for large flocks only
        self.use_neighbor_cache = (self.N >= 512)

    # ---------- polygon management ----------
    def add_polygon(self, polygon: np.ndarray) -> None:
        """Add a polygon obstacle and precompute its edge data."""
        poly = np.asarray(polygon, float)
        if poly.ndim == 1:
            poly = poly.reshape(1, -1)
        
        self.polys.append(poly)
        self.poly_edges.append(self._precompute_polygon_edges(poly))
    
    def add_polygons(self, polygons: list[np.ndarray]) -> None:
        """Add multiple polygon obstacles."""
        for poly in polygons:
            self.add_polygon(poly)
    
    def clear_polygons(self) -> None:
        """Remove all polygon obstacles."""
        self.polys = []
        self.poly_edges = []
    
    def get_polygons(self) -> list[np.ndarray]:
        """Get current polygon obstacles."""
        return [p.copy() for p in self.polys]

    # ---------- vectorized geometry kernels ----------
    def _precompute_polygon_edges(self, poly: np.ndarray) -> dict:
        """Precompute edge vectors, normals, and lengths for a polygon."""
        V = poly
        E = np.roll(V, -1, axis=0) - V  # edge vectors
        L = np.sqrt(np.sum(E**2, axis=1))  # edge lengths
        # Unit normals pointing outward (rotate edge vector 90° CW: [x,y] -> [y,-x])
        N = np.column_stack([E[:, 1], -E[:, 0]])
        nonzero_mask = L > 1e-9
        N[nonzero_mask] /= L[nonzero_mask, None]
        
        return {'V': V, 'E': E, 'N': N, 'L': L}

    def _point_in_poly_batch(self, P: np.ndarray, V: np.ndarray) -> np.ndarray:
        """Vectorized ray casting for point-in-polygon test."""
        if NUMBA_AVAILABLE:
            return _point_in_poly_batch_numba(P, V)
        else:
            n_points = P.shape[0]
            n_vertices = V.shape[0]
            inside = np.zeros(n_points, dtype=bool)
            
            for i in range(n_points):
                px, py = P[i]
                j = n_vertices - 1
                
                for k in range(n_vertices):
                    xi, yi = V[k]
                    xj, yj = V[j]
                    
                    denom = (yj - yi)
                    if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (denom + 1e-12) + xi):
                        inside[i] = not inside[i]
                    j = k
                    
            return inside

    def _closest_point_on_polygon(self, P: np.ndarray, edges: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Find closest points on polygon boundary for batch of points."""
        if NUMBA_AVAILABLE:
            return _closest_point_on_polygon_numba(P, edges['V'], edges['E'], edges['L'])
        else:
            V, E, L = edges['V'], edges['E'], edges['L']
            n_points = P.shape[0]
            n_edges = V.shape[0]
            
            Q = np.zeros((n_points, 2))
            n = np.zeros((n_points, 2))
            s = np.zeros(n_points)
            
            for i in range(n_points):
                min_dist_sq = np.inf
                closest_point = P[i]
                closest_normal = np.array([0, 0])
                
                for j in range(n_edges):
                    v0, v1 = V[j], V[(j + 1) % n_edges]
                    edge_vec = v1 - v0
                    to_point = P[i] - v0
                    
                    if L[j] > 1e-9:
                        t = np.clip(np.dot(to_point, edge_vec) / (L[j]**2), 0, 1)
                    else:
                        t = 0
                    
                    closest_on_edge = v0 + t * edge_vec
                    dist_sq = np.sum((P[i] - closest_on_edge)**2)
                    
                    if dist_sq < min_dist_sq:
                        min_dist_sq = dist_sq
                        closest_point = closest_on_edge
                        closest_normal = edges['N'][j]
                
                Q[i] = closest_point
                n[i] = closest_normal
                s[i] = np.sqrt(min_dist_sq)
            
            # Apply sign based on inside/outside
            inside = self._point_in_poly_batch(P, V)
            s[inside] = -s[inside]
            
            return Q, n, s

    def _nearest_polygon(self, P: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Find nearest polygon for each point."""
        if not self.polys:
            return np.zeros((P.shape[0], 2)), np.zeros((P.shape[0], 2)), np.full(P.shape[0], np.inf)
        
        n_points = P.shape[0]
        best_Q = np.zeros((n_points, 2))
        best_n = np.zeros((n_points, 2))
        best_s = np.full(n_points, np.inf)
        
        for poly_edges in self.poly_edges:
            Q, n, s = self._closest_point_on_polygon(P, poly_edges)
            
            better_mask = np.abs(s) < np.abs(best_s)
            best_Q[better_mask] = Q[better_mask]
            best_n[better_mask] = n[better_mask]
            best_s[better_mask] = s[better_mask]
        
        return best_Q, best_n, best_s

    def _rect_signed_distance(self, P: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Compute signed distance to world rectangle boundary."""
        # Distance to each wall
        d_left = P[:, 0] - self.xmin
        d_right = self.xmax - P[:, 0]
        d_bottom = P[:, 1] - self.ymin
        d_top = self.ymax - P[:, 1]
        
        # Find closest wall for each point
        walls = np.column_stack([d_left, d_right, d_bottom, d_top])
        closest_wall = np.argmin(walls, axis=1)
        
        d_signed = np.min(walls, axis=1)
        n = np.zeros((P.shape[0], 2))
        
        # Normals pointing inward
        n[closest_wall == 0] = [1, 0]   # left wall
        n[closest_wall == 1] = [-1, 0]  # right wall
        n[closest_wall == 2] = [0, 1]   # bottom wall
        n[closest_wall == 3] = [0, -1]  # top wall
        
        return d_signed, n

    def _obstacle_tangent_dir(self, n: np.ndarray) -> np.ndarray:
        """Rotate normals +90° to get tangent direction."""
        return np.column_stack([-n[:, 1], n[:, 0]])

    def _obstacle_avoid(self, P: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Compute obstacle avoidance and tangential forces."""
        if not self.polys:
            return np.zeros((P.shape[0], 2)), np.zeros((P.shape[0], 2)), np.full(P.shape[0], np.inf)
        
        Q, n, s = self._nearest_polygon(P)
        
        # Avoidance weight: 1 at boundary, 0 at obstacle_influence distance
        w = np.clip(1 - np.abs(s) / self.obstacle_influence, 0, 1)
        avoid = w[:, None] * n
        
        # Tangent direction for wall following
        tan = self._obstacle_tangent_dir(n)
        
        return avoid, tan, s

    # ---------- keep-out & anti-pin ----------
    def _sanitize_initial_positions(self):
        """Move agents outside polygon keep-out zones at initialization."""
        if not self.polys:
            return
        
        Q, n, s = self._nearest_polygon(self.P)
        inside_mask = s < -self.keep_out
        
        if np.any(inside_mask):
            # Project agents outward to keep_out distance
            self.P[inside_mask] = Q[inside_mask] + (self.keep_out + 1e-3) * n[inside_mask]

    def _resolve_polygon_penetration(self):
        """Project agents outward from polygon keep-out zones with capped correction."""
        if not self.polys:
            return
        Q, n, s = self._nearest_polygon(self.P)
        penetration = (self.keep_out - s)  # positive when inside band
        mask = penetration > 0.0
        if not np.any(mask):
            return

        # Cap correction to a fraction of a normal step to avoid jumps
        max_corr = 0.25 * (self.vmax * self.dt)  # 25% of a frame's move
        corr = np.minimum(penetration[mask], max_corr)
        # Normalize normals
        n_unit = n[mask]
        Ln = np.sqrt(np.sum(n_unit*n_unit, axis=1)) + 1e-12
        n_unit = n_unit / Ln[:, None]

        self.P[mask] += (corr[:, None] * n_unit)

        # Reflect only if velocity is heading into the wall
        v_into = np.sum(self.V[mask]*n_unit, axis=1)
        neg = v_into < 0.0
        if np.any(neg):
            self.V[mask][neg] -= (1.0 + self.restitution) * v_into[neg, None] * n_unit[neg]

    def _resolve_world_keepout(self):
        """Push agents away from world walls with capped correction."""
        d_wall, n_wall = self._rect_signed_distance(self.P)
        penetration = self.world_keep_out - d_wall  # positive when inside band
        mask = penetration > 0.0
        if not np.any(mask):
            return
        
        # Cap correction to a fraction of a normal step to avoid jumps
        max_corr = 0.25 * (self.vmax * self.dt)  # 25% of a frame's move
        corr = np.minimum(penetration[mask], max_corr)
        
        self.P[mask] += corr[:, None] * n_wall[mask]
        
        # Reflect only if velocity is heading into the wall
        v_into = np.sum(self.V[mask] * n_wall[mask], axis=1)
        neg = v_into < 0.0
        if np.any(neg):
            self.V[mask][neg] -= (1.0 + self.restitution) * v_into[neg, None] * n_wall[mask][neg]



    def enforce_keepout_all(self):
        """Enforce all keep-out constraints."""
        self._resolve_polygon_penetration()
        self._resolve_world_keepout()

    # ---------- neighbor ops ----------
    def _kNN_vec(self, i: int, K: int) -> np.ndarray:
        """Vectorized k-nearest neighbors using contiguous arrays."""
        if NUMBA_AVAILABLE:
            return _kNN_numba(self.P, i, K)
        else:
            d2 = np.sum((self.P - self.P[i])**2, axis=1)
            idx = np.argpartition(d2, K+1)[:K+1]
            idx = idx[d2[idx] > 0]
            return idx[:K]
        return idx[:K]

    def _repel_close_vec(self, i: int) -> np.ndarray:
        """Vectorized repulsion from close neighbors using contiguous arrays."""
        if NUMBA_AVAILABLE:
            return _repel_close_numba(self.P, i, self.ra)
        else:
            d_sq = np.sum((self.P - self.P[i])**2, axis=1)
            mask = (d_sq > 1e-18) & (d_sq < self.ra_sq)
            if not np.any(mask):
                return np.zeros(2)
            d_vec = self.P[mask] - self.P[i]
            d = np.sqrt(np.sum(d_vec**2, axis=1)) + 1e-9
            inv_d = 1.0 / d
            vecs = -(d_vec * inv_d[:, None])
            return vecs.sum(axis=0)

    def _lcm_vec(self, i: int) -> np.ndarray:
        """Vectorized local center of mass calculation using contiguous arrays."""
        if self.use_neighbor_cache:
            idx = self.nb_idx[i]; k = np.count_nonzero(idx >= 0)
            if k == 0:
                # Fallback to base path if cache empty
                idx2 = self._kNN_vec(i, self.k_nn)
                if idx2.size == 0:
                    return self.P[i].copy()
                return np.mean(self.P[idx2], axis=0)
            return np.mean(self.P[idx[:k]], axis=0)
        else:
            idx = self._kNN_vec(i, self.k_nn)
            if idx.size == 0:
                return self.P[i].copy()
            return np.mean(self.P[idx], axis=0)

    def _align_vec(self, i: int) -> np.ndarray:
        """Vectorized velocity alignment calculation using contiguous arrays."""
        if self.use_neighbor_cache:
            idx = self.nb_idx[i]; k = np.count_nonzero(idx >= 0)
            if k == 0:
                # Fallback to base path if cache empty
                idx2 = self._kNN_vec(i, self.k_nn)
                if idx2.size == 0:
                    return np.zeros(2)
                vbar = np.mean(self.V[idx2], axis=0)
            else:
                vbar = np.mean(self.V[idx[:k]], axis=0)
        else:
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
        """Apply boundaries to a a list of positions (used for drone positions).
        pos should be (N_drones, 2).
        """
        # pos can now be (2,) or (N_drones, 2)
        if self.boundary == "none":
            return pos.copy()

        x, y = pos[:, 0], pos[:, 1]
        xmin, xmax, ymin, ymax = self.xmin, self.xmax, self.ymin, self.ymax

        if self.boundary == "wrap":
            Lx, Ly = (xmax - xmin), (ymax - ymin)
            x = xmin + ((x - xmin) % Lx)
            y = ymin + ((y - ymin) % Ly)
        
        else: # reflect
            x[x < xmin] = xmin + (xmin - x[x < xmin])
            x[x > xmax] = xmax - (x[x > xmax] - xmax)
            y[y < ymin] = ymin + (ymin - y[y < ymin])
            y[y > ymax] = ymax - (y[y > ymax] - ymax)

        return np.column_stack([x, y])


    # ---------- sheep step ----------
    def _gcm_vec(self) -> np.ndarray:
        """Vectorized global center of mass calculation using contiguous arrays."""
        return np.mean(self.P, axis=0)
    
    def _should_ignore_dog_repulsion(self, near_indices: np.ndarray, G: np.ndarray, tol: float = 0.0) -> bool:
        """
        Return True if the summed local intent (wr*R + wa*A) of sheep near the dog
        points radially outward from the global COM G. Outward ⇒ repulsion would make it worse.
        """
        radial_sum = 0.0
        for i in near_indices:
            R = self._repel_close_vec(i)
            A = self._lcm_vec(i) - self.P[i]
            v_local = self.wr * R + self.wa * A  # ONLY local forces; no dog term

            g = self.P[i] - G
            g_norm = np.linalg.norm(g)
            if g_norm > 1e-9:
                u_out = g / g_norm               # unit outward from G at sheep i
                radial_sum += np.dot(v_local, u_out)

        return radial_sum > tol                  # tol can add hysteresis if needed


    def _sheep_step(self):
        """Optimized sheep step using vectorized operations where possible."""
        G = self._gcm_vec()
        
        # TODO: Make this vectorized again.
        dog_distances_sq = np.zeros((self.P.shape[0], self.dogs.shape[0]))
        for i in range(self.dogs.shape[0]):
            dog_distances_sq[:, i] = np.sum((self.P - self.dogs[i])**2, axis=1)

        # If a given drone isn't applying repulsion, just make it seem like that drone is a bajillion miles away.
        # dog_distances_sq[:, self.apply_repulsion] = 1_000_000
        dog_distances_sq[:, self.apply_repulsion == 0] = 1_000_000
        
        # Get the distance to the *closest* drone
        min_dog_distances_sq = np.min(dog_distances_sq, axis=1)
        
        # Use the closest distance to determine near/far
        far_mask = min_dog_distances_sq > self.rs_sq
        near_mask = ~far_mask
        
        # Handle far sheep (grazing behavior)
        if np.any(far_mask):
            self._handle_far_sheep(far_mask, G)
        
        # Handle near sheep (flocking behavior) 
        if np.any(near_mask):
            # Only compute actual distances for near sheep when needed            
            min_near_distances = np.sqrt(min_dog_distances_sq[near_mask])
            self._handle_near_sheep(near_mask, dog_distances_sq[near_mask], G, min_near_distances)

        # TODO: Add this back.
        # Soft keep-out (see change below) then bounds
        # self.enforce_keepout_all()
        # self._apply_bounds_sheep_inplace()

        # Safety
        bad = ~np.isfinite(self.P).all(axis=1)
        if np.any(bad):
            cx, cy = 0.5*(self.xmin+self.xmax), 0.5*(self.ymin+self.ymax)
            self.P[bad] = np.array([cx, cy])
            self.V[bad] = 0.0
    
    def _handle_far_sheep(self, far_mask: np.ndarray, G: np.ndarray):
        """Handle sheep that are far from the dog (grazing behavior)."""
        far_indices = np.where(far_mask)[0]

        decay = 0.80

        for i in far_indices:
            # Bernoulli: move with probability p while grazing
            if self.graze_p < 1.0 and self.rng.random() > self.graze_p:
                self.V[i] *= decay  # smooth decay
                self.P[i] += self.V[i] * self.dt
                continue

            # Start with a random unit heading so motion never vanishes when far
            rnd = self.rng.normal(size=2) * 0.2
            R  = self._repel_close_vec(i)
            H = self.wr * R + rnd

            # Normalize final heading and move a FULL grazing step (paper)
            h = norm(H)
            
            # Obstacle handling for far sheep
            if self.polys:
                avoid_far, tan_far, s_far = self._obstacle_avoid(self.P[i:i+1])
                nrm_f = avoid_far[0]
                tng_f = tan_far[0]
            else:
                nrm_f = np.zeros(2); tng_f = np.zeros(2); s_far = np.array([np.inf])

            # heading vector h is already unit; convert to force-like H to project
            H = h.copy()

            # If heading into wall, add tangent
            if np.dot(H, nrm_f) < 0.0:
                H += (self.w_tan * tng_f)

            # Always add small normal push to keep grazing off the wall
            H += (0.5 * self.w_obs) * nrm_f  # smaller than near-dog

            # Project out of wall if inside keep-out
            if s_far[0] <= self.keep_out:
                n_unit = nrm_f
                L = np.sqrt(np.dot(n_unit, n_unit)) + 1e-12
                n_unit = n_unit / L
                into = np.dot(H, n_unit)
                if into < 0.0:
                    H = H - into * n_unit

            # Renormalize H → h
            Hn = np.linalg.norm(H)
            if Hn > 0:
                h = H / Hn
            
            # Momentum update
            v_des = self.vmax * h
            v_new = decay * self.V[i] + (1.0 - decay) * v_des
            sp = np.linalg.norm(v_new)
            if sp > self.vmax:
                v_new *= (self.vmax / sp)

            self.P[i] += v_new * self.dt
            self.V[i]  = v_new
    
    def _handle_near_sheep(self, near_mask: np.ndarray, near_dog_distances_sq: np.ndarray, G: np.ndarray, min_near_distances: np.ndarray):
        """Handle sheep that are near a drone (flocking behavior)."""
        near_indices = np.where(near_mask)[0]

        # turn_off_now = self._should_ignore_dog_repulsion(near_indices, G)
        # print("Should ignore", turn_off_now)
        ws_global = self.ws
        
        # Compute obstacle forces for all near sheep at once (unchanged)
        if self.polys and len(near_indices) > 0:
            avoid, tan, s = self._obstacle_avoid(self.P[near_indices])
        else:
            avoid = np.zeros((len(near_indices), 2))
            tan = np.zeros((len(near_indices), 2))
            s = np.full(len(near_indices), np.inf)
        
        nrm = avoid; tng = tan
        
        # --- Drone Repulsion: SUM over all drones ---
        # near_dog_distances_sq is (N_near, num_drones)
        # Dog positions are self.dogs (num_drones, 2)
        
        # Initialize total dog repulsion force (S) to zero
        S_total = np.zeros((len(near_indices), 2))

        # Sheep positions for near indices
        P_near = self.P[near_indices]

        # Iterate over drones to compute combined repulsion
        for j in range(self.dogs.shape[0]):
            # TODO: Add this back.
            # Skip if repulsion is ignored for this drone
            # if not self.apply_repulsion[j]:
            #     continue
            
            D = self.dogs[j] # Drone position
            d_sq = near_dog_distances_sq[:, j] # Distances to this drone
            d = np.sqrt(d_sq) # Distance to this drone
            
            push = smooth_push(d, self.rs)
            inv_d = 1.0 / d
            
            # Vector from drone D to sheep P
            vec_DP = P_near - D 
            
            # Repulsion force S for drone j
            S_j = push[:, None] * vec_DP * inv_d[:, None]
            
            S_total += S_j
        
        # S_total is now the combined dog repulsion for all near sheep
        
        for idx, i in enumerate(near_indices):
            # Flocking forces
            R = self._repel_close_vec(i)
            A = self._lcm_vec(i) - self.P[i]
            
            # S is pre-calculated as S_total[idx]
            S = S_total[idx]

            AL = self._align_vec(i)
            
            # Previous velocity (inertia)
            vel_sq = np.sum(self.V[i]**2)
            if vel_sq > 0:
                vel_norm = np.sqrt(vel_sq)
                inv_vel_norm = 1.0 / (vel_norm + 1e-9)
                prev = self.V[i] * inv_vel_norm
            else:
                vel_norm = 0.0
                prev = np.zeros(2)
            
            # Combine forces (0.0 for flyover)
            # ws_eff = 0.0 if self.ignore_dog_repulsion else self.ws
            # H = self.wr*R + self.wa*A + ws_eff*S + self.wm*prev + self.w_align*AL
            H = self.wr*R + self.wa*A + ws_global*S + self.wm*prev + self.w_align*AL
            
            # Normal push (already weighted by distance ramp)
            H += self.w_obs * nrm[idx]
            if np.dot(tng[idx], tng[idx]) > 0.0 and np.dot(H, nrm[idx]) < 0.0:
                H += self.w_tan * tng[idx]

            if s[idx] <= self.keep_out:
                n_unit = nrm[idx]
                L = np.sqrt(np.dot(n_unit, n_unit)) + 1e-12
                n_unit = n_unit / L
                into = np.dot(H, n_unit)
                if into < 0.0:
                    H = H - into * n_unit
            
            # Global tug toward center
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
        if self.paused:
            return
        
        if self.use_neighbor_cache:
            self._refresh_neighbors()

        # Apply planner output
        match plan:
            case DoNothing():
                self.apply_repulsion = np.zeros(self.dogs.shape[0])
            case DronePositions(positions=pos, apply_repulsion=apply, target_sheep_indices=_):
                dog_count = self.dogs.shape[0]
                if pos.shape[0] != dog_count or apply.size != dog_count:
                    raise ValueError(f"DronePositions plan must have {self.num_drones} positions and repulsion flags.")
                
                # Apply bounds to all drone positions
                new_dogs_pos = self._apply_bounds_point(pos)
                self.dogs = new_dogs_pos
                self.apply_repulsion = apply.copy()
            case _ as unexpected_plan:
                raise Exception("Unexpected plan type", unexpected_plan)

        # Then move sheep using the new dog pos + flag
        self._sheep_step()

    def get_state(self) -> state.State:
        return state.State(
            flock=self.P.copy(),
            drones=self.dogs.copy(),
            target=self.target.copy() if self.target is not None else None,
            polygons=[p.copy() for p in self.polys],
        )
    
    def pause(self):
        self.paused = not self.paused

    def _refresh_neighbors(self):
        if not self.use_neighbor_cache:
            return
        moved = np.sqrt(np.sum((self.P - self.prev_P)**2, axis=1)) > self.eps_move
        batch = np.zeros(self.N, dtype=bool)
        half = max(1, self.N // 12)
        # If very few moved, shrink batch further
        if np.count_nonzero(moved) < max(2, self.N // 20):
            half = max(1, self.N // 16)
        start = self._rr_cursor
        end = min(self._rr_cursor + half, self.N)
        batch[start:end] = True
        self._rr_cursor = 0 if end >= self.N else end
        need = moved | batch
        if not np.any(need):
            return
        idxs = np.where(need)[0]
        # Use fast NumPy argpartition path for kNN refresh to minimize overhead
        for i in idxs:
            self.nb_idx[i, :self.k_nn] = self._kNN_vec(i, self.k_nn)
        self.prev_P[need] = self.P[need]


@njit
def _point_in_poly_batch_numba(P: np.ndarray, V: np.ndarray) -> np.ndarray:
    """Numba-optimized batch point-in-polygon test using ray casting."""
    n_points = P.shape[0]
    n_vertices = V.shape[0]
    inside = np.zeros(n_points, dtype=np.bool_)
    
    for i in range(n_points):
        px, py = P[i, 0], P[i, 1]
        j = n_vertices - 1
        
        for k in range(n_vertices):
            xi, yi = V[k, 0], V[k, 1]
            xj, yj = V[j, 0], V[j, 1]
            
            denom = (yj - yi)
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (denom + 1e-12) + xi):
                inside[i] = not inside[i]
            j = k
            
    return inside

@njit
def _closest_point_on_polygon_numba(P: np.ndarray, V: np.ndarray, E: np.ndarray, L: np.ndarray) -> tuple:
    """Numba-optimized closest point calculation on polygon boundary."""
    n_points = P.shape[0]
    n_edges = V.shape[0]
    
    Q = np.zeros((n_points, 2), dtype=np.float64)
    n = np.zeros((n_points, 2), dtype=np.float64)
    s = np.zeros(n_points, dtype=np.float64)
    
    # Precompute normals
    N = np.zeros((n_edges, 2), dtype=np.float64)
    for j in range(n_edges):
        if L[j] > 1e-9:
            N[j, 0] = E[j, 1] / L[j]
            N[j, 1] = -E[j, 0] / L[j]
    
    for i in range(n_points):
        min_dist_sq = np.inf
        closest_point = np.array([P[i, 0], P[i, 1]])
        closest_normal = np.array([0.0, 0.0])
        
        for j in range(n_edges):
            v0 = V[j]
            v1 = V[(j + 1) % n_edges]
            edge_vec = v1 - v0
            to_point = P[i] - v0
            
            if L[j] > 1e-9:
                t = max(0.0, min(1.0, np.dot(to_point, edge_vec) / (L[j] * L[j])))
            else:
                t = 0.0
            
            closest_on_edge = v0 + t * edge_vec
            diff = P[i] - closest_on_edge
            dist_sq = diff[0] * diff[0] + diff[1] * diff[1]
            
            if dist_sq < min_dist_sq:
                min_dist_sq = dist_sq
                closest_point = closest_on_edge
                closest_normal = N[j]
        
        Q[i] = closest_point
        n[i] = closest_normal
        s[i] = np.sqrt(min_dist_sq)
    
    # Apply sign based on inside/outside
    inside = _point_in_poly_batch_numba(P, V)
    for i in range(n_points):
        if inside[i]:
            s[i] = -s[i]
    
    return Q, n, s

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



def is_goal_satisfied(w: World, goal_tolerance: float) -> bool:
    """
    Return True if every sheep in the world's flock is within the goal tolerance
    of the world's target.
    """
    
    if w.P.size == 0:
        return True

    # squared comparison for speed / numerical stability
    tol_sq = goal_tolerance * goal_tolerance

    # distances squared from each sheep to the target
    diffs = w.P - w.target.reshape(1, 2)
    d2 = np.sum(diffs * diffs, axis=1)

    return np.all(d2 <= tol_sq)
