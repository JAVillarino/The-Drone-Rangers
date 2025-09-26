import argparse
import numpy as np
import matplotlib as mpl
import matplotlib.pyplot as plt
from simulation import world
from planning.herding import policy
from simulation.scenarios import *

# ---------- main ----------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--N", type=int, default=100)
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

    W = world.World(sheep_xy, dog_xy, target_xy, seed=args.seed)

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
    plt.ion()
    fig, ax = plt.subplots(figsize=(6,6))
    ax.set_aspect('equal'); ax.grid(True)
    ax.set_xlim(xmin, xmax); ax.set_ylim(ymin, ymax)
    # draw fence
    ax.plot([xmin,xmax,xmax,xmin,xmin],[ymin,ymin,ymax,ymax,ymin], linestyle="--")

    state = W.get_state()
    sheep_sc = ax.scatter(state.flock[:,0], state.flock[:,1], s=20)
    dog_sc   = ax.scatter([state.drone[0]],[state.drone[1]], marker='x')
    targ_sc  = ax.scatter([state.target[0]],[state.target[1]], marker='*')

    for t in range(args.steps):
        plan = shepherd_policy.plan(W.get_state(), W.dt)
        W.step(plan)
        
        #if t % 2 == 0:
        state = W.get_state()
        sheep_sc.set_offsets(state.flock)
        dog_sc.set_offsets([state.drone])
        ax.set_title(f"Step {t}  |  spawn={args.spawn}")
        fig.canvas.draw_idle()
        plt.pause(0.01)

    plt.ioff()
    plt.show()
