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

# TODO: N varies for different configs.
config = {
    ## Evaluation Parameters
    "trials": 5,
    "max_steps": 6000,
    "success_radius": 10.0,

    ## Simulation Parameters
    "N": 40,
    "clusters": 3,

    ## World/Behavior Tweaks
    "rs": 14.0,
    "wa": 0.7,
    "ws": 1.0,
    "w_align": 0.5,
    "boundary": "reflect",

    ## Far-Field Knobs (usually off to prevent self-gathering)
    "wa_far": 0.0,
    "g_tug_far": 0.0,
    "wr_far": 0.25,
    "pre_gather": False,

    ## Shepherd Policy Parameters
    "umax": 2.2,
    "too_close_factor": 3.0,
    "collect_standoff_factor": 1.2,
    "drive_standoff_factor": 0.8,
}


def run_one_trial(config, spawn_type, seed, current_trial, total_trials):
    """
    Initializes and runs a single simulation trial for one scenario and seed.
    Returns a tuple: (was_successful, steps_taken).
    """
    # Define world geometry
    bounds = (-25.0, 65.0, -40.0, 35.0)
    xmin, xmax, ymin, ymax = bounds

    # Spawn sheep based on the specified scenario
    if spawn_type == "circle":
        sheep_xy = spawn_circle(config.N, center=(0, 0), radius=5.0, seed=seed)
    elif spawn_type == "uniform":
        sheep_xy = spawn_uniform(config.N, bounds, seed=seed)
    elif spawn_type == "clusters":
        sheep_xy = spawn_clusters(config.N, config.clusters, bounds, spread=4.0, seed=seed)
    elif spawn_type == "corners":
        sheep_xy = spawn_corners(config.N, bounds, jitter=2.0, seed=seed)
    else:  # line
        sheep_xy = spawn_line(config.N, bounds, seed=seed)

    dog_xy = np.array([xmin + 5.0, 0.0])
    target_xy = np.array([xmax - 5.0, ymax - 5.0])

    # Build world with simulation parameters
    world_kwargs = {
        "rs": config.rs, "wa": config.wa, "ws": config.ws, "w_align": config.w_align,
        "wa_far": config.wa_far, "g_tug_far": config.g_tug_far, "wr_far": config.wr_far,
        "pre_gather": config.pre_gather, "boundary": config.boundary, "bounds": bounds,
        "seed": seed,
    }
    W = world.World(sheep_xy, dog_xy, target_xy, **world_kwargs)

    # Initialize the herding policy
    shepherd_policy = policy.ShepherdPolicy(
        fN=W.ra * W.N ** (2.0 / 3.0),
        umax=config.umax,
        too_close=config.too_close_factor * W.ra,
        collect_standoff=config.collect_standoff_factor * W.ra,
        drive_standoff=config.drive_standoff_factor * W.ra * np.sqrt(sheep_xy.shape[0])
    )

    # Main simulation loop for this trial
    for t in range(config.max_steps):
        # Print the progress on a single line
        progress_str = (
            f"  Trial {current_trial + 1:>2}/{total_trials} | "
            f"Step: {t + 1:<5}/{config.max_steps}"
        )
        print(progress_str, end='\r', flush=True)

        plan = shepherd_policy.plan(W.get_state(), W.dt)
        W.step(plan)

        # Check for success condition
        state = W.get_state()
        flock_com = np.mean(state.flock, axis=0)
        dist_to_target = np.linalg.norm(flock_com - state.target)

        if dist_to_target < config.success_radius:
            return True, t  # Success!

    return False, config.max_steps  # Failure due to timeout

# ---------- Main Execution Block ----------

if __name__ == "__main__":
    trials = 5
    out_dir = "./planning/results"
    os.makedirs(out_dir, exist_ok=True)

    date = datetime.now().strftime("%Y-%m-%d--%H-%M-%S")
    params_log_file = f"{out_dir}/{date}--evaluation_params.log"
    with open(params_log_file, "w+") as f:
        f.write("--- Evaluation Parameters ---\n")
        config_vars = {k: v for k, v in vars(config).items() if not k.startswith('__')}
        for key, value in config_vars.items():
            f.write(f"{key:<25}: {value}\n")
    print(f"Parameters for this run have been saved to '{params_log_file}'")

    # Run the evaluation and collect trial-by-trial data
    scenarios_to_run = [
        "uniform",
        "clusters",
        # "corners",
        # "line",
        # "circle"
    ]
    trial_results_list = []
    total_trials_to_run = len(scenarios_to_run) * trials

    print(f"\nRunning evaluation: {len(scenarios_to_run)} scenarios, {trials} trials each ({total_trials_to_run} total).")
    print("-" * 65)

    for s_idx, spawn_type in enumerate(scenarios_to_run):
        print(f"Running Scenario: {spawn_type.upper()}...")
        for i in range(trials):
            # Time the execution of a single trial
            start_time = time.perf_counter()
            success, completion_steps = run_one_trial(config, spawn_type, seed=i, current_trial=i, total_trials=trials)
            end_time = time.perf_counter()
            trial_duration = end_time - start_time

            trial_results_list.append({
                "Scenario": spawn_type,
                "Seed": i,
                "Success": success,
                "Completion Steps": completion_steps if success else np.nan,
                "Wall Time (s)": trial_duration,
            })

            # After the very first trial, compute and print the ETA
            if i == 0 and s_idx == 0:
                estimated_total_seconds = trial_duration * total_trials_to_run
                mins, secs = divmod(estimated_total_seconds, 60)
                print(f"  First trial took {trial_duration:.2f}s. Estimated total runtime: ~{int(mins)}m {int(secs)}s")

        print(f"  Finished all {trials} trials for {spawn_type}.{' '*20}")


    # Create and save the detailed, trial-by-trial DataFrame
    trials_df = pd.DataFrame(trial_results_list)
    output_csv_file = f"{out_dir}/{date}--evaluation_trials.csv"
    trials_df.to_csv(output_csv_file, index=False)
    print(f"\nTrial-by-trial results saved to '{output_csv_file}'")

    # Generate and print the aggregate summary from the detailed DataFrame
    summary_df = trials_df.groupby('Scenario').agg(
        Trials=('Seed', 'count'),
        Successes=('Success', 'sum'),
        Avg_Steps=('Completion Steps', 'mean'),
        Avg_Wall_Time=('Wall Time (s)', 'mean')
    ).reset_index()

    # Format for printing
    summary_df['Success Rate'] = (summary_df['Successes'] / summary_df['Trials'])
    summary_df['Successes'] = summary_df.apply(lambda row: f"{row['Successes']}/{row['Trials']}", axis=1)
    summary_df = summary_df[['Scenario', 'Successes', 'Success Rate', 'Avg_Steps', 'Avg_Wall_Time']]
    summary_df.rename(columns={'Avg_Steps': 'Avg Steps', 'Avg_Wall_Time': 'Avg Time (s)'}, inplace=True)

    print("\n" + "="*85)
    print(" " * 32 + "EVALUATION SUMMARY")
    print("="*85)
    print(summary_df.to_string(index=False, float_format="%.2f"))
    print("="*85)

