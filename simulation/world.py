from __future__ import annotations
import numpy as np
from planning.herding.utils import norm, smooth_push
from planning import state
from planning.plan_type import DoNothing, DronePosition, Plan

class Sheep:
    __slots__ = ("pos", "vel")
    def __init__(self, pos, vel=None):
        self.pos = np.asarray(pos, float)
        self.vel = np.zeros(2) if vel is None else np.asarray(vel, float)

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
        graze_alpha: float = 0.0,   # paper doesn’t add separate wander
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

        # boundaries (paper: 150×150 field)
        boundary: str = "reflect",
        bounds: tuple[float,float,float,float] = (0.0, 250.0, 0.0, 250.0),
        restitution: float = 0.85,
        # obstacles
        obstacles: np.ndarray | None = None,  # n-by-2 array of obstacle positions

        # shepherd standoffs (paper)
        drive_k: float = 1.0,     # r_a * sqrt(N)
        collect_k: float = 1.0,   # r_a behind stray

        graze_p: float = 0.05,

        # rng
        seed: int = 0,
    ):
        self.N = sheep_xy.shape[0]
        self.sheep = [Sheep(sheep_xy[i]) for i in range(self.N)]
        self.dog = np.asarray(shepherd_xy, float)
        self.target = np.asarray(target_xy, float)
        
        # obstacles
        self.obstacles = obstacles if obstacles is not None else np.empty((0, 2))

        # params
        self.ra, self.rs, self.k_nn = ra, rs, k_nn
        self.dt, self.vmax, self.umax = dt, vmax, umax
        self.wr, self.wa, self.ws, self.wm, self.w_align = wr, wa, ws, wm, w_align
        self.graze_alpha, self.inertia_alpha = graze_alpha, inertia_alpha
        self.g_tug, self.sigma = g_tug, sigma

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
    def _kNN(self, i: int, K: int) -> np.ndarray:
        P = np.stack([s.pos for s in self.sheep], axis=0)
        d = np.linalg.norm(P - P[i], axis=1)
        K = min(self.N - 2, K+1)
        idx = np.argpartition(d, K+1)[:K+1]   # includes self
        idx = idx[d[idx] > 0]                 # drop self
        return idx[:K]

    def _repel_close(self, i: int) -> np.ndarray:
        P = np.stack([s.pos for s in self.sheep], axis=0)
        d = np.linalg.norm(P - P[i], axis=1)
        mask = (d > 1e-9) & (d < self.ra)
        if not np.any(mask): 
            return np.zeros(2)
        vecs = (P[i] - P[mask]) / (d[mask][:, None] + 1e-9)
        return vecs.sum(axis=0)

    def _lcm(self, i: int) -> np.ndarray:
        idx = self._kNN(i, self.k_nn)
        if idx.size == 0:
            return self.sheep[i].pos
        return np.mean([self.sheep[j].pos for j in idx], axis=0)

    def _align(self, i: int) -> np.ndarray:
        idx = self._kNN(i, self.k_nn)
        if idx.size == 0:
            return np.zeros(2)
        V = [self.sheep[j].vel for j in idx]
        vbar = np.mean(V, axis=0)
        if np.linalg.norm(vbar) == 0:
            return np.zeros(2)
        return vbar / (np.linalg.norm(vbar) + 1e-9)

    # ---------- boundaries ----------
    def _apply_bounds_sheep(self, pos: np.ndarray, vel: np.ndarray) -> tuple[np.ndarray,np.ndarray]:
        if self.boundary == "none":
            return pos, vel

        x, y = pos
        vx, vy = vel
        xmin, xmax, ymin, ymax = self.xmin, self.xmax, self.ymin, self.ymax

        if self.boundary == "wrap":
            # torus
            Lx, Ly = (xmax - xmin), (ymax - ymin)
            x = xmin + ((x - xmin) % Lx)
            y = ymin + ((y - ymin) % Ly)
            return np.array([x, y]), vel

        # reflect
        if x < xmin:
            x = xmin + (xmin - x)
            vx = abs(vx) * self.restitution
        elif x > xmax:
            x = xmax - (x - xmax)
            vx = -abs(vx) * self.restitution
        if y < ymin:
            y = ymin + (ymin - y)
            vy = abs(vy) * self.restitution
        elif y > ymax:
            y = ymax - (y - ymax)
            vy = -abs(vy) * self.restitution

        return np.array([x, y]), np.array([vx, vy])

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
    def _gcm(self) -> np.ndarray:
        return np.mean([s.pos for s in self.sheep], axis=0)

    def _sheep_step(self):
        D = self.dog
        G = self._gcm()
        for i, s in enumerate(self.sheep):
            dSD = np.linalg.norm(s.pos - D)

            if dSD > self.rs:
                # Bernoulli: move with probability p while grazing (paper)
                if self.graze_p < 1.0 and self.rng.random() > self.graze_p:
                    s.vel *= 0.0
                    s.pos, s.vel = self._apply_bounds_sheep(s.pos, s.vel)
                    continue

                # Start with a random unit heading so motion never vanishes when far
                rnd = self.rng.normal(size=2)
                h = rnd / (np.linalg.norm(rnd) + 1e-9)

                # Normalize final heading and move a FULL grazing step (paper)
                h = h / (np.linalg.norm(h) + 1e-9)
                step = self.vmax * self.dt   # full step when grazing moves
            else:
                # NEAR: full flocking under pressure (distance-scaled dog push)
                R  = self._repel_close(i)
                A  = self._lcm(i) - s.pos
                d  = max(1e-9, np.linalg.norm(s.pos - D))
                push = smooth_push(d, self.rs)         # 1 close → 0 at rs
                S  = push * (s.pos - D) / d            # vector away from dog, scaled
                AL = self._align(i)
                prev = norm(s.vel) if np.linalg.norm(s.vel) > 0 else np.zeros(2)

                H = self.wr*R + self.wa*A + self.ws*S + self.wm*prev + self.w_align*AL
                H += self.g_tug * norm(G - s.pos)

                # tempered noise (scale with sqrt(dt); less if already moving)
                noise = self.sigma * np.sqrt(self.dt) * self.rng.normal(size=2)
                if np.linalg.norm(s.vel) > 0.3*self.vmax:
                    noise *= 0.5
                H = H + noise

                h = norm(H)
                step = self.vmax * self.dt

            new_pos = s.pos + step * h
            s.vel = (new_pos - s.pos) / self.dt
            s.pos = new_pos

            # apply boundaries to sheep
            s.pos, s.vel = self._apply_bounds_sheep(s.pos, s.vel)

    # ---------- public API ----------
    def step(self, plan: Plan):
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
            flock=np.stack([s.pos for s in self.sheep], axis=0),
            drone=self.dog.copy(),
            target=self.target.copy(),
            obstacles=self.obstacles.copy() if self.obstacles.size > 0 else None,
        )
