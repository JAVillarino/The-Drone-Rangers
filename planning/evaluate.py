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

class Config:
    """Holds all parameters for the evaluation run for easy modification."""
    ## Evaluation Parameters
    trials = 20
    max_steps = 6000
    success_radius = 10.0

    ## Simulation Parameters
    N = 40
    clusters = 3

    ## World/Behavior Tweaks
    rs = 14.0
    wa = 0.7
    ws = 1.0
    w_align = 0.5
    boundary = "reflect"

    ## Far-Field Knobs (usually off to prevent self-gathering)
    wa_far = 0.0
    g_tug_far = 0.0
    wr_far = 0.25
    pre_gather = False

    ## Shepherd Policy Parameters
    umax = 2.2
    too_close_factor = 3.0          # Multiplier for W.ra
    collect_standoff_factor = 1.2   # Multiplier for W.ra
    drive_standoff_factor = 0.8     # Multiplier for W.ra * sqrt(N)


def run_one_trial(config, spawn_type, seed):
    """
    Initializes and runs a single simulation trial for one scenario and seed.
    Returns a tuple: (was_successful, steps_taken).
    """
    # Define world geometry
    bounds = (-25.0, 65.0, -40.0, 35.0)
    xmin, xmax, ymin, ymax = bounds

    # Spawn sheep based on the specified scenario
    if spawn_type == "circle":
        sheep_xy = spawn_circle(Config.N, center=(0, 0), radius=5.0, seed=seed)
    elif spawn_type == "uniform":
        sheep_xy = spawn_uniform(Config.N, bounds, seed=seed)
    elif spawn_type == "clusters":
        sheep_xy = spawn_clusters(Config.N, Config.clusters, bounds, spread=4.0, seed=seed)
    elif spawn_type == "corners":
        sheep_xy = spawn_corners(Config.N, bounds, jitter=2.0, seed=seed)
    else:  # line
        sheep_xy = spawn_line(Config.N, bounds, seed=seed)

    dog_xy = np.array([xmin + 5.0, 0.0])
    target_xy = np.array([xmax - 5.0, ymax - 5.0])

    # Build world with simulation parameters
    world_kwargs = {
        "rs": Config.rs, "wa": Config.wa, "ws": Config.ws, "w_align": Config.w_align,
        "wa_far": Config.wa_far, "g_tug_far": Config.g_tug_far, "wr_far": Config.wr_far,
        "pre_gather": Config.pre_gather, "boundary": Config.boundary, "bounds": bounds,
        "seed": seed,
    }
    W = world.World(sheep_xy, dog_xy, target_xy, **world_kwargs)

    # TODO: Actually fix these; the numerical value should be in the Config.
    shepherd_policy = policy.ShepherdPolicy(
        fN=W.ra * W.N ** (2.0 / 3.0),
        umax=Config.umax,
        too_close=Config.too_close_factor * W.ra,
        collect_standoff=Config.collect_standoff_factor * W.ra,
        drive_standoff=Config.drive_standoff_factor * W.ra * np.sqrt(sheep_xy.shape[0])
    )

    # Main simulation loop for this trial
    for t in range(Config.max_steps):
        plan = shepherd_policy.plan(W.get_state(), W.dt)
        W.step(plan)

        # Check for success condition
        state = W.get_state()
        flock_com = np.mean(state.flock, axis=0)
        dist_to_target = np.linalg.norm(flock_com - state.target)

        if dist_to_target < Config.success_radius:
            return True, t  # Success!

    return False, Config.max_steps  # Failure due to timeout

# ---------- Main Execution Block ----------

if __name__ == "__main__":
    out_dir = "./planning/results"
    date = datetime.now().strftime("%d-%m-%Y--%H-%M-%S")
    params_log_file = f"{out_dir}/{date}--evaluation_params.log"
    with open(params_log_file, "w+") as f:
        f.write("--- Evaluation Parameters ---\n")
        for key, value in vars(Config).items():
            f.write(f"{key:<25}: {value}\n")
    print(f"Parameters for this run have been saved to '{params_log_file}'")

    # 3. Run the evaluation and collect trial-by-trial data
    scenarios_to_run = ["uniform", "clusters", "corners", "line", "circle"]
    trial_results_list = []

    print(f"\nRunning evaluation: {len(scenarios_to_run)} scenarios, {Config.trials} trials each.")
    print("-" * 65)

    for spawn_type in scenarios_to_run:
        print(f"Running Scenario: {spawn_type.upper()}...")
        for i in range(Config.trials):
            success, time = run_one_trial(Config, spawn_type, seed=i)
            trial_results_list.append({
                "Scenario": spawn_type,
                "Seed": i,
                "Success": success,
                "Completion Time (steps)": time if success else np.nan,
            })

    # 4. Create and save the detailed, trial-by-trial DataFrame
    trials_df = pd.DataFrame(trial_results_list)
    output_csv_file = f"{out_dir}/{date}--evaluation_trials.csv"
    trials_df.to_csv(output_csv_file, index=False)
    print(f"\nTrial-by-trial results saved to '{output_csv_file}'")

    # 5. Generate and print the aggregate summary from the detailed DataFrame
    summary_df = trials_df.groupby('Scenario').agg(
        Trials=('Seed', 'count'),
        Successes=('Success', 'sum'),
        Avg_Time=('Completion Time (steps)', 'mean'),
        Std_Dev_Time=('Completion Time (steps)', 'std')
    ).reset_index()

    # Format for printing
    summary_df['Success Proportion'] = (summary_df['Successes'] / summary_df['Trials'])
    summary_df['Successes'] = summary_df.apply(lambda row: f"{row['Successes']}/{row['Trials']}", axis=1)
    summary_df = summary_df[['Scenario', 'Successes', 'Success Proportion', 'Avg_Time', 'Std_Dev_Time']]
    summary_df.rename(columns={'Avg_Time': 'Avg Time (steps)', 'Std_Dev_Time': 'Std Dev (steps)'}, inplace=True)

    print("\n" + "="*85)
    print(" " * 32 + "EVALUATION SUMMARY")
    print("="*85)
    print(summary_df.to_string(index=False, float_format="%.1f"))
    print("="*85)