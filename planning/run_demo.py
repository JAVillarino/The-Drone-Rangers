import argparse
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from simulation import world
from planning.herding import policy
from simulation.scenarios import *

class Renderer:
    def __init__(self, world, bounds=(0.0, 250.0, 0.0, 250.0)):
        """Initialize figure, axes, and scatter plots."""
        xmin, xmax, ymin, ymax = bounds

        plt.ion()
        self.fig, self.ax = plt.subplots(figsize=(6, 6))
        self.ax.set_aspect('equal')
        self.ax.grid(True)
        self.ax.set_xlim(xmin, xmax)
        self.ax.set_ylim(ymin, ymax)

        # Draw world bounds (fence)
        self.ax.plot(
            [xmin, xmax, xmax, xmin, xmin],
            [ymin, ymin, ymax, ymax, ymin],
            linestyle="--"
        )

        # Initial state
        state = world.get_state()
        self.sheep_sc = self.ax.scatter(state.flock[:, 0], state.flock[:, 1], s=20)
        self.dog_sc   = self.ax.scatter([state.drone[0]], [state.drone[1]], marker='x')
        self.targ_sc  = self.ax.scatter([state.target[0]], [state.target[1]], marker='*')

    def render_world(self, world, plan, t, debug=False):
        """Update the scatter plots for the current state of the world."""
        state = world.get_state()

        # Update sheep positions
        self.sheep_sc.set_offsets(state.flock)

        if debug:
            # Highlight target sheep if specified
            if getattr(plan, "target_sheep_index", None) is not None:
                colors = [(0.0, 0.0, 1.0, 1.0)] * len(state.flock)  # all blue
                colors[plan.target_sheep_index] = (1.0, 0.0, 0.0, 1.0)  # target sheep red
                self.sheep_sc.set_facecolor(colors)

        # Update dog and target markers
        self.dog_sc.set_offsets([state.drone])
        self.targ_sc.set_offsets([state.target])

        # Title
        self.ax.set_title(f"Step {t}")

        # Redraw
        self.fig.canvas.draw_idle()

# ---------- main ----------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--N", type=int, default=200)
    p.add_argument("--spawn", choices=["circle","uniform","clusters","corners","line"],
                   default="circle", help="initial sheep distribution")
    p.add_argument("--clusters", type=int, default=3, help="#clusters for spawn=clusters")
    p.add_argument("--seed", type=int, default=2)
    p.add_argument("--steps", type=int, default=10000)
    args = p.parse_args()

    # Bounds (match World defaults so plotting aligns)
    bounds = (0.0, 250.0, 0.0, 250.0) 
    xmin, xmax, ymin, ymax = bounds

    # --- choose spawn pattern ---
    if args.spawn == "circle":
        sheep_xy = spawn_circle(args.N, center=(100,100), radius=5.0, seed=args.seed)
    elif args.spawn == "uniform":
        sheep_xy = spawn_uniform(args.N, bounds, seed=args.seed)
    elif args.spawn == "clusters":
        sheep_xy = spawn_clusters(args.N, args.clusters, bounds, spread=4.0, seed=args.seed)
    elif args.spawn == "corners":
        sheep_xy = spawn_corners(args.N, bounds, jitter=2.0, seed=args.seed)
    else:  # line
        sheep_xy = spawn_line(args.N, bounds, seed=args.seed)

    dog_xy    = np.array([0.0, 0.0])
    target_xy = np.array([240.0, 240.0])

    # Create example polygon obstacles
    # Rectangle
    # rect = np.array([
    #     [80.0, 80.0],
    #     [120.0, 80.0],
    #     [120.0, 120.0],
    #     [80.0, 120.0]
    # ])
    
    # # Triangle
    # triangle = np.array([
    #     [150.0, 50.0],
    #     [180.0, 50.0],
    #     [165.0, 80.0]
    # ])
    
    # # L-shape
    # l_shape = np.array([
    #     [50.0, 150.0],
    #     [90.0, 150.0],
    #     [90.0, 170.0],
    #     [70.0, 170.0],
    #     [70.0, 200.0],
    #     [50.0, 200.0]
    # ])
    
    # obstacles_polygons = [rect, triangle, l_shape]

    W = world.World(
        sheep_xy, dog_xy, target_xy, 
        seed=args.seed,
        # # obstacles_polygons=obstacles_polygons,
        # obstacle_influence=30.0,
        w_obs=5.0,
        w_tan=12.0,
        keep_out=5.0,
        world_keep_out=5.0,
        wall_follow_boost=6.0,
        stuck_speed_ratio=0.08,
        near_wall_ratio=0.8,
        microsteps_max=3
    )

    total_area = 0.5 * W.N * (W.ra ** 2)
    # area = pi * r^2 => r = sqrt(area / pi) (but pi's cancel.)
    collected_herd_radius = np.sqrt(total_area)
    shepherd_policy = policy.ShepherdPolicy(
        fN = collected_herd_radius,   # cohesion radius
        umax = W.umax,                    # keep in sync with world
        too_close = 1.5 * W.ra,             # safety stop
        collect_standoff = 1.0 * W.ra,    # paper: r_a behind the stray
        drive_standoff   = 1.0 * W.ra + collected_herd_radius,  # paper: r_a * sqrt(N) behind COM
    )

    # --- live plot ---
    # # Draw polygon obstacles
    # polygon_patches = []
    # for poly in obstacles_polygons:
    #     # Close the polygon by adding the first vertex at the end
    #     closed_poly = np.vstack([poly, poly[0]])
    #     patch = Polygon(closed_poly[:-1], facecolor='red', alpha=0.3, edgecolor='red')
    #     ax.add_patch(patch)
        # polygon_patches.append(patch)
    
    renderer = Renderer(W)
    for t in range(args.steps):
        plan = shepherd_policy.plan(W.get_state(), W.dt)
        W.step(plan)
        
        if t % 2 == 0:
            state = W.get_state()
            renderer.render_world(W, plan, t, debug=True)
    
        plt.pause(0.01)

    plt.ioff()
    plt.show()
