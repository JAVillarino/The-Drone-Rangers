from __future__ import annotations
import numpy as np
from .agents import Sheep, Shepherd
from .utils import norm, smooth_push
from .policy import ShepherdPolicy

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
        shepherd_xy,
        target_xy,
        *,
        # geometry
        ra: float = 2.0,            # neighbor repulsion radius
        rs: float = 14.0,           # dog influence radius (≥ drive standoff)
        k_nn: int = 12,             # k-NN for LCM & alignment
        # timing & speeds
        dt: float = 0.2,
        vmax: float = 0.9,          # sheep max speed (m/s)
        umax: float = 2.2,          # shepherd max speed (m/s)
        # weights (sheep near-dog branch)
        wr: float = 1.2,            # repel close neighbors
        wa: float = 0.7,            # attract to local COM
        ws: float = 1.0,            # repel from shepherd (scaled by distance)
        wm: float = 0.15,           # inertia (previous velocity)
        w_align: float = 0.5,       # align with neighbors' average velocity
        # point factors
        drive_k: float = 0.8,       # drive standoff = drive_k * ra * sqrt(N)
        collect_k: float = 1.2,     # collect standoff behind stray
        # far-from-dog grazing (random walk)
        graze_alpha: float = 0.05,  # gentle random wander
        inertia_alpha: float = 0.15,# mild inertia while grazing
        # tiny global cohesion tug (near & far controlled below)
        g_tug: float = 0.15,
        # noise
        sigma: float = 0.02,
        # --- NEW: Far-field knobs ---
        wa_far: float = 0.0,        # local cohesion when dog is far (0 = none)
        g_tug_far: float = 0.0,     # global tug when dog is far (0 = none)
        wr_far: float = 0.25,       # anti-crowding during far grazing
        pre_gather: bool = False,   # ramp up wa_far/g_tug_far as dog approaches
        pre_gather_scale: float = 1.5,  # ramp distance multiplier on rs
        # boundaries
        boundary: str = "reflect",  # "reflect" | "wrap" | "none"
        bounds: tuple[float,float,float,float] = (-25.0, 65.0, -40.0, 35.0),
        restitution: float = 0.85,
        # rng seed
        seed: int = 0,
        # policy
        policy: ShepherdPolicy | None = None,
    ):
        self.N = sheep_xy.shape[0]
        self.sheep = [Sheep(sheep_xy[i]) for i in range(self.N)]
        self.dog = Shepherd(np.asarray(shepherd_xy, float))
        self.target = np.asarray(target_xy, float)

        # params
        self.ra, self.rs, self.k_nn = ra, rs, k_nn
        self.dt, self.vmax, self.umax = dt, vmax, umax
        self.wr, self.wa, self.ws, self.wm, self.w_align = wr, wa, ws, wm, w_align
        self.drive_k, self.collect_k = drive_k, collect_k
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

        self.rng = np.random.default_rng(seed)

        # policy
        self.policy = ShepherdPolicy() if policy is None else policy

    # ---------- neighbor ops ----------
    def _kNN(self, i: int, K: int) -> np.ndarray:
        P = np.stack([s.pos for s in self.sheep], axis=0)
        d = np.linalg.norm(P - P[i], axis=1)
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
        D = self.dog.pos
        G = self._gcm()
        for i, s in enumerate(self.sheep):
            dSD = np.linalg.norm(s.pos - D)

            if dSD > self.rs:
                # FAR: free grazing — by default, no self-gathering (wa_far=g_tug_far=0)
                R_far = self._repel_close(i)
                base = (
                    self.wr_far * norm(R_far) +
                    self.graze_alpha * norm(self.rng.normal(size=2))
                )
                if np.linalg.norm(s.vel) > 0:
                    base += self.inertia_alpha * norm(s.vel)

                # Optional pre-gather ramp as the dog gets within ~1.5*rs
                if self.pre_gather and (self.wa_far > 0.0 or self.g_tug_far > 0.0):
                    pre = max(0.0, 1.0 - dSD / (self.pre_gather_scale * self.rs))
                else:
                    pre = 1.0

                if self.wa_far > 0.0 or self.g_tug_far > 0.0:
                    L = self._lcm(i) - s.pos
                    base += pre * ( self.wa_far * norm(L) + self.g_tug_far * norm(G - s.pos) )

                h = norm(base)
                step = 0.4 * self.vmax * self.dt       # cap grazing at 40% speed
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
    def step(self):
        self._sheep_step()
        self.policy.step(self)

    def pack_positions(self):
        P = np.stack([s.pos for s in self.sheep], axis=0)
        return P, self.dog.pos.copy(), self.target.copy()

    def get_bounds(self):
        return (self.xmin, self.xmax, self.ymin, self.ymax)