"""
Runs the given policy on a variety of scenarios, aggregating:
- whether the scenario could be completed.
- completion time for successfully completed scenarios
over n different random seeds for a scenario.
"""

import numpy as np
import pandas as pd
from simulation import world
from herding import policy
# Assumes spawn functions are in this module
from simulation.scenarios import spawn_circle, spawn_uniform, spawn_clusters, spawn_corners, spawn_line
from datetime import datetime
import os
import time
from itertools import product
from planning.run_demo import Renderer

import matplotlib.pyplot as plt

base_config = {
    "max_steps": 2000,
    "boundary": "none",
    "clusters": 3,
    "dog_xy": np.array([[-20, -35]]),
}


def run_one_trial(config, spawn_type, seed, current_trial, total_trials, visualize=False):
    """
    Initializes and runs a single simulation trial for one scenario and seed.
    Returns a tuple: (was_successful, steps_taken).
    """
    # Define world geometry
    spawn_bounds = (-25.0, 65.0, -40.0, 35.0)

    # Spawn sheep based on the specified scenario
    if spawn_type == "circle":
        sheep_xy = spawn_circle(config["N"], center=(0, 0), radius=5.0, seed=seed)
    elif spawn_type == "uniform":
        sheep_xy = spawn_uniform(config["N"], spawn_bounds, seed=seed)
    elif spawn_type == "clusters":
        sheep_xy = spawn_clusters(config["N"], config["clusters"], spawn_bounds, spread=4.0, seed=seed)
    elif spawn_type == "corners":
        sheep_xy = spawn_corners(config["N"], spawn_bounds, jitter=2.0, seed=seed)
    else:  # line
        sheep_xy = spawn_line(config["N"], spawn_bounds, seed=seed)

    dog_xy = config["dog_xy"]
    target_xy = np.array([60, 30])

    # Build world with simulation parameters
    world_kwargs = {
        **config, "bounds": spawn_bounds, "seed": seed,
    }
    W = world.World(
        sheep_xy, 
        dog_xy, 
        target_xy, 
        w_obs=0,
        w_tan=0,
        keep_out=0,
        world_keep_out=0,
        wall_follow_boost=0,
        stuck_speed_ratio=0,
        near_wall_ratio=0,
        **world_kwargs)

    # Initialize the herding policy
    total_area = 0.5 * W.N * (W.ra ** 2)
    # area = pi * r^2 => r = sqrt(area / pi) (but pi's cancel.)
    collected_herd_radius = np.sqrt(total_area)
    shepherd_policy = policy.ShepherdPolicy(
        fN = collected_herd_radius,
        umax = W.umax,
        # TODO: Initialize these from the config.
        too_close = 1.5 * W.ra,
        collect_standoff = 1.0 * W.ra,
        drive_standoff   = 1.0 * W.ra + collected_herd_radius,
        conditionally_apply_repulsion=config["conditionally_apply_repulsion"],
    )
    
    if visualize:
        renderer = Renderer(W, bounds=(-50, 100, -50, 100))

    # Main simulation loop for this trial
    for t in range(config["max_steps"]):
        plan = shepherd_policy.plan(W.get_state(), W.dt)
        W.step(plan)

        # Check for success condition
        state = W.get_state()
        farthest = np.max(np.linalg.norm(state.flock - state.target, axis=1))

        if farthest < config["success_radius"]:
            return True, t  # Success!
        
        if visualize:
            renderer.render_world(W, plan, t)
            plt.pause(0.05)
            
        # Print the progress on a single line
        progress_str = (
            f"  Trial {current_trial + 1:>2}/{total_trials} | "
            f"Step: {t + 1:<5}/{config['max_steps']}, "
            f"Flock Distance: {farthest:.0f}/{config['success_radius']:.0f}      "
        )
        print(progress_str, end='\r', flush=True)
    
    plt.ioff()
    plt.show()

    return False, config["max_steps"]  # Failure due to timeout


if __name__ == "__main__":
    out_dir = "./planning/results"
    os.makedirs(out_dir, exist_ok=True)

    date = datetime.now().strftime("%Y-%m-%d--%H-%M-%S")

    # Run the evaluation and collect trial-by-trial data
    Ns = [200]
    spawn_types = ["uniform"]
    seeds = range(2, 12)
    flyovers = [False]
    dog_xy = [
        np.array([[-20, -35]]),
        np.array([[-20, -36], [-20, -34]]),
        np.array([[-20, -36], [-20, -35], [-20, -34]]),
    ]
    scenarios_to_run = [
        {**base_config, "dog_xy": dog_xy, "conditionally_apply_repulsion": flyover, "N": N, "spawn_type": pattern, "seed": seed, "success_radius": N ** (1/2) * 4 }
        for seed, N, pattern, flyover, dog_xy in product(seeds, Ns, spawn_types, flyovers, dog_xy)
    ]

    trial_results_list = []

    print(f"\nRunning evaluation: {len(scenarios_to_run)} scenarios.")
    print("-" * 65)

    for s_idx, config in enumerate(scenarios_to_run):
        # Time the execution of a single trial
        start_time = time.perf_counter()
        success, completion_steps = run_one_trial(config, config["spawn_type"], config["seed"], s_idx, len(scenarios_to_run), visualize=True)
        end_time = time.perf_counter()
        trial_duration = end_time - start_time

        trial_results_list.append({
            "Success": success,
            "Completion Steps": completion_steps if success else np.nan,
            "Wall Time (s)": trial_duration,
            **config
        })

    # Create and save the detailed, trial-by-trial DataFrame
    trials_df = pd.DataFrame(trial_results_list)
    output_csv_file = f"{out_dir}/{date}--evaluation_trials.csv"
    trials_df.to_csv(output_csv_file, index=False)
    print(f"\nTrial-by-trial results saved to '{output_csv_file}'")

    # Generate and print the aggregate summary from the detailed DataFrame
    summary_df = trials_df.groupby('spawn_type').agg(
        Trials=('seed', 'count'),
        Successes=('Success', 'sum'),
        Avg_Steps=('Completion Steps', 'mean'),
        Avg_Wall_Time=('Wall Time (s)', 'mean')
    ).reset_index()

    # Format for printing
    summary_df['Success Rate'] = (summary_df['Successes'] / summary_df['Trials'])
    summary_df['Successes'] = summary_df.apply(lambda row: f"{row['Successes']}/{row['Trials']}", axis=1)
    summary_df = summary_df[['spawn_type', 'Successes', 'Success Rate', 'Avg_Steps', 'Avg_Wall_Time']]
    summary_df.rename(columns={'Avg_Steps': 'Avg Steps', 'Avg_Wall_Time': 'Avg Time (s)'}, inplace=True)

    print("\n" + "="*85)
    print(" " * 32 + "EVALUATION SUMMARY")
    print("="*85)
    print(summary_df.to_string(index=False, float_format="%.2f"))
    print("="*85)

