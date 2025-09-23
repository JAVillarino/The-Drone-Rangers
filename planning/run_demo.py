import argparse
import numpy as np
import matplotlib as mpl
mpl.use("TkAgg")  # helpful on macOS; harmless elsewhere
import matplotlib.pyplot as plt
from simulation import world
from herding import policy
from simulation.scenarios import *

# ---------- main ----------
if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--N", type=int, default=40)
    p.add_argument("--spawn", choices=["circle","uniform","clusters","corners","line"],
                   default="uniform", help="initial sheep distribution")
    p.add_argument("--clusters", type=int, default=3, help="#clusters for spawn=clusters")
    p.add_argument("--seed", type=int, default=2)
    p.add_argument("--steps", type=int, default=10000)
    # world/behavior tweaks (override if you want)
    p.add_argument("--rs", type=float, default=14.0)
    p.add_argument("--wa", type=float, default=0.7)
    p.add_argument("--ws", type=float, default=1.0)
    p.add_argument("--w_align", type=float, default=0.5)
    p.add_argument("--boundary", choices=["reflect","wrap","none"], default="reflect")
    # Far-field knobs: keep default 0 to prevent self-gathering
    p.add_argument("--wa_far", type=float, default=0.0)
    p.add_argument("--g_tug_far", type=float, default=0.0)
    p.add_argument("--wr_far", type=float, default=0.25)
    p.add_argument("--pre_gather", action="store_true", help="ramp far-field cohesion as dog approaches")
    args = p.parse_args()

    # Bounds (match World defaults so plotting aligns)
    bounds = (-25.0, 65.0, -40.0, 35.0)
    xmin, xmax, ymin, ymax = bounds

    # --- choose spawn pattern ---
    if args.spawn == "circle":
        sheep_xy = spawn_circle(args.N, center=(0,0), radius=5.0, seed=args.seed)
    elif args.spawn == "uniform":
        sheep_xy = spawn_uniform(args.N, bounds, seed=args.seed)
    elif args.spawn == "clusters":
        sheep_xy = spawn_clusters(args.N, args.clusters, bounds, spread=4.0, seed=args.seed)
    elif args.spawn == "corners":
        sheep_xy = spawn_corners(args.N, bounds, jitter=2.0, seed=args.seed)
    else:  # line
        sheep_xy = spawn_line(args.N, bounds, seed=args.seed)

    dog_xy = np.array([xmin + 5.0, 0.0])   # start near left
    target_xy = np.array([xmax - 5.0, ymax - 5.0])   # goal top right

    # --- build world (unchanged defaults) ---
    world_kwargs = {
        # geometry / behavior you actually tweak from the CLI
        "rs": args.rs,
        "wa": args.wa,
        "ws": args.ws,
        "w_align": args.w_align,

        # far-field behavior (off by default in World; override if user asks)
        "wa_far": args.wa_far,
        "g_tug_far": args.g_tug_far,
        "wr_far": args.wr_far,
        "pre_gather": args.pre_gather,

        # boundaries / RNG
        "boundary": args.boundary,
        "bounds": bounds,        # keep so plot and world agree on the same box
        "seed": args.seed,
    }

    W = world.World(sheep_xy, dog_xy, target_xy, **world_kwargs)
    shepherd_policy = policy.ShepherdPolicy(
        fN=W.ra * W.N ** (2.0/3.0),
        umax=2.2,
        too_close=3*W.ra,
        collect_standoff = 1.2 * W.ra, # collect standoff behind stray far-from-dog grazing (random walk)
        drive_standoff = 0.8 * W.ra * np.sqrt(sheep_xy.shape[0])
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
        
        if t % 2 == 0:
            state = W.get_state()
            sheep_sc.set_offsets(state.flock)
            dog_sc.set_offsets([state.drone])
            ax.set_title(f"Step {t}  |  spawn={args.spawn}")
            fig.canvas.draw_idle()
            plt.pause(0.01)

    plt.ioff()
    plt.show()
