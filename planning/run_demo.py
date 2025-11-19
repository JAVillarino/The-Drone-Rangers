import argparse
import time
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from simulation import world
from planning.herding import policy
from planning.state import Job
from simulation.scenarios import *
from planning import plan_type

class Renderer:
    def __init__(self, world, target, bounds=(0.0, 500.0, 0.0, 500.0), obstacles_polygons=None):
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

        # Draw polygon obstacles
        self.polygon_patches = []
        if obstacles_polygons:
            for poly in obstacles_polygons:
                # Close the polygon by adding the first vertex at the end
                closed_poly = np.vstack([poly, poly[0]])
                patch = Polygon(closed_poly[:-1], facecolor='red', alpha=0.3, edgecolor='red')
                self.ax.add_patch(patch)
                self.polygon_patches.append(patch)

        # Initial state
        state = world.get_state()
        self.sheep_sc = self.ax.scatter(state.flock[:, 0], state.flock[:, 1], s=20)
        self.dog_sc   = self.ax.scatter([state.drones[:, 0]], [state.drones[:, 1]], marker='x')
        self.targ_sc  = self.ax.scatter([target[0]], [target[1]], marker='*')
        
        # TODO: Make this move around every iteration.
        self.circle = plt.Circle((0, 0), 0, color='b', fill=False)
        self.ax.add_patch(self.circle)


    def render_world(self, world, plan: plan_type.Plan, step_number, target, debug=False):
        """Update the scatter plots for the current state of the world."""
        state = world.get_state()

        # Update sheep positions
        self.sheep_sc.set_offsets(state.flock)

        if debug:
            match plan:
                case plan_type.DoNothing():
                    pass
                case plan_type.DronePositions(positions=pos, apply_repulsion=apply, target_sheep_indices=_, gcm=gcm, radius=r):
                    # Highlight target sheep if specified
                    colors = [(0.0, 0.0, 1.0, 1.0)] * len(state.flock)  # all blue
                    for i in plan.target_sheep_indices:
                        colors[i] = (1.0, 0.0, 0.0, 1.0)  # target sheep red
                    self.sheep_sc.set_facecolor(colors)
                    
                    self.circle.center = gcm
                    self.circle.radius = r
                case _ as unexpected_plan:
                    raise Exception("Unexpected plan type", unexpected_plan)

        # Update dog and target markers
        self.dog_sc.set_offsets(state.drones)
        self.targ_sc.set_offsets([target])

        # Title
        self.ax.set_title(f"Step {step_number}")
        
        # Redraw
        self.fig.canvas.draw_idle()

# ---------- main ----------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--N", type=int, default=200)
    p.add_argument("--spawn", choices=["circle","uniform","clusters","corners","line"],
                   default="uniform", help="initial sheep distribution")
    p.add_argument("--clusters", type=int, default=3, help="#clusters for spawn=clusters")
    p.add_argument("--seed", type=int, default=3)
    p.add_argument("--steps", type=int, default=10000)
    p.add_argument("--obstacles", action="store_true", default=True, help="enable obstacles (default: True)")
    p.add_argument("--no-obstacles", dest="obstacles", action="store_false", help="disable obstacles")
    args = p.parse_args()

    # Bounds (match World defaults so plotting aligns)
    spawn_bounds = (0.0, 250.0, 0.0, 250.0) 
    xmin, xmax, ymin, ymax = spawn_bounds

    # --- choose spawn pattern ---
    if args.spawn == "circle":
        sheep_xy = spawn_circle(args.N, center=(100,100), radius=5.0, seed=args.seed)
    elif args.spawn == "uniform":
        sheep_xy = spawn_uniform(args.N, spawn_bounds, seed=args.seed)
    elif args.spawn == "clusters":
        sheep_xy = spawn_clusters(args.N, args.clusters, spawn_bounds, spread=4.0, seed=args.seed)
    elif args.spawn == "corners":
        sheep_xy = spawn_corners(args.N, spawn_bounds, jitter=2.0, seed=args.seed)
    else:  # line
        sheep_xy = spawn_line(args.N, spawn_bounds, seed=args.seed)

    dog_xy = np.array(np.array([[-20, -36]]),)
    target_xy = np.array([240.0, 240.0])

    # Create example polygon obstacles
    obstacles_polygons = None
    if args.obstacles:
        # Rectangle
        rect = np.array([
            [200.0, 1.0],
            [200.0, 200.0],
            [1.0, 200.0],
            [1.0, 1.0],
        ])
        
        # Triangle
        triangle = np.array([
            [150.0, 50.0],
            [180.0, 50.0],
            [165.0, 80.0]
        ])
        
        # L-shape
        l_shape = np.array([
            [50.0, 150.0],
            [90.0, 150.0],
            [90.0, 170.0],
            [70.0, 170.0],
            [70.0, 200.0],
            [50.0, 200.0]
        ])
        
        obstacles_polygons = [rect]

    W = world.World(
        sheep_xy, dog_xy, target_xy, 
        seed=args.seed,
        obstacles_polygons=obstacles_polygons,
        obstacle_influence=30.0,
        w_obs=5.0,
        w_tan=12.0,
        keep_out=5.0,
        world_keep_out=5.0,
        wall_follow_boost=6.0,
        stuck_speed_ratio=0.08,
        near_wall_ratio=0.8,
        k_nn=8,
        dt=1,
    )

    total_area = 0.5 * W.N * (W.ra ** 2)
    # area = pi * r^2 => r = sqrt(area / pi) (but pi's cancel.)
    collected_herd_radius = np.sqrt(total_area)
    shepherd_policy = policy.ShepherdPolicy(
        fN = collected_herd_radius,   # cohesion radius
        umax = W.umax,                    # keep in sync with world
        too_close = 1.5 * W.ra,             # safety stop
        collect_standoff = 1.0 * W.ra,    # paper: r_a behind the stray
        conditionally_apply_repulsion=True,
    )

    s0 = W.get_state()
    num_drones = s0.drones.shape[0]

    current_time = time.time()
    jobs = [Job(
        target=target_xy.copy(),
        target_radius=10.0,
        remaining_time=None,
        is_active=True,
        drones=num_drones,
        status="running",
        start_at=None,
        completed_at=None,
        scenario_id=None,
        created_at=current_time,
        updated_at=current_time,
    )]
    
    renderer = Renderer(W, jobs[0].target, bounds=(0.0, 500.0, 0.0, 500.0), obstacles_polygons=obstacles_polygons)

    for t in range(args.steps):
        plan = shepherd_policy.plan(W.get_state(), jobs, W.dt)
        W.step(plan)
        
        if t % 2 == 0:
            state = W.get_state()
            renderer.render_world(W, plan, t, jobs[0].target, debug=True)
    
        plt.pause(0.01)

    plt.ioff()
    plt.show()
