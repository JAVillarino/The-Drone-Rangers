"""
N vs. k-NN Plotting Script

Analyzes simulation results to visualize the relationship between the number of agents (N)
and the number of nearest neighbors (k-NN) on the success rate of shepherding.
Generates a heatmap and overlays theoretical guide curves.
"""
import glob
import os
import sys
from typing import List

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

<<<<<<< Updated upstream
# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# List of CSV files to process.
# Can be populated manually or via glob patterns.
CSV_PATHS = [
    "./planning/results/paper_result.csv"
=======
# === CONFIG ===
# EITHER: list csvs manually
csv_paths = [
    # "./planning/results/2025-10-20--23-30-56--evaluation_trials.csv",
    # "./planning/results/2025-10-21--12-49-50--evaluation_trials.csv",
    # "./planning/results/2025-10-21--14-41-09--evaluation_trials.csv",
    # "./planning/results/2025-10-21--14-55-11--evaluation_trials.csv",
    # "./planning/results/paper_result.csv",
    # "./planning/results/2025-12-01--02-24-59--evaluation_trials.csv",
    "./planning/results/2025-12-04--18-30-33--evaluation_trials.csv"
>>>>>>> Stashed changes
]

# Plot settings
FIG_SIZE = (10, 5.5)
CMAP = "Blues_r"
X_LIMIT = (0, 150)
Y_LIMIT = (0, 150)


# -----------------------------------------------------------------------------
# Data Loading & Processing
# -----------------------------------------------------------------------------

def load_and_process_data(paths: List[str]) -> pd.DataFrame:
    """Load CSVs, normalize data, and aggregate into a single DataFrame."""
    dfs = []
    for p in paths:
        if not os.path.exists(p):
            print(f"Warning: File not found: {p}")
            continue
            
        try:
            df = pd.read_csv(p)
        except Exception as e:
            print(f"Error reading {p}: {e}")
            continue

        # Normalize Success to 0/1
        if df["Success"].dtype != np.number:
            df["Success"] = df["Success"].astype(str).str.lower().map({"true": 1, "false": 0})
        
        # Ensure N and k_nn are ints for grouping stability
        if "N" in df.columns:
            df["N"] = df["N"].astype(int)
        if "k_nn" in df.columns:
            df["k_nn"] = df["k_nn"].astype(int)
        
        # Synthesize seed if missing
        if "seed" not in df.columns:
            df["seed"] = np.arange(len(df))
            
        dfs.append(df)

    if not dfs:
        return pd.DataFrame()

    all_df = pd.concat(dfs, ignore_index=True)
    
    # Deduplicate: keep first occurrence of (N, k_nn, seed)
    if {"N", "k_nn", "seed"}.issubset(all_df.columns):
        all_df = all_df.drop_duplicates(subset=["N", "k_nn", "seed"])
        
    return all_df


# -----------------------------------------------------------------------------
# Plotting
# -----------------------------------------------------------------------------

def plot_results(df: pd.DataFrame):
    """Generate and display the success rate heatmap."""
    if df.empty:
        print("No data to plot.")
        return

    # Aggregate success rate
    agg = (df.groupby(["N", "k_nn"], as_index=False)
             .agg(success_rate=("Success", "mean"),
                  trials=("Success", "size")))

    # Pivot to grid format
    Ns = np.sort(agg["N"].unique())
    ks = np.sort(agg["k_nn"].unique())
    
    if len(Ns) == 0 or len(ks) == 0:
        print("Insufficient data dimensions for plotting.")
        return

    grid = (agg.pivot(index="k_nn", columns="N", values="success_rate")
               .reindex(index=ks, columns=Ns))

<<<<<<< Updated upstream
    # Fill upper triangle (where k > N, which is impossible/trivial) with 1.0 (or NaN)
    # Here we set to 1.0 to match original logic, though technically k < N is required.
    G = grid.values.copy()
    upper_mask = (ks[:, None] >= Ns[None, :])   # rows are k, cols are N
    G[upper_mask] = 1.0 
=======
# === PLOT ===
fig, ax = plt.subplots(figsize=(10, 5.5))
im = ax.imshow(
    np.ma.masked_invalid(G),
    origin="lower",
    aspect="auto",
    extent=[Ns.min(), Ns.max(), ks.min(), ks.max()],
    vmin=0.0, vmax=1.0,
    cmap="Greens"
)
>>>>>>> Stashed changes

    # Create Plot
    fig, ax = plt.subplots(figsize=FIG_SIZE)
    im = ax.imshow(
        np.ma.masked_invalid(G),
        origin="lower",
        aspect="auto",
        extent=[Ns.min(), Ns.max(), ks.min(), ks.max()],
        vmin=0.0, vmax=1.0,
        cmap=CMAP
    )

    # Guide curves
    N_line = np.linspace(1, 150, 500)
    
    # Curve 1: n = 0.53 * N
    ax.plot(N_line, 0.53 * N_line, "k-",  lw=2, zorder=3, label="n = 0.53N")
    
    # Curve 2: n = 3 * log(N)
    # Avoid log(0) issue by starting linspace at 1
    ax.plot(N_line, 3.0 * np.log(N_line), "k--", lw=2, zorder=3, label="n = 3log(N)")

    # Axes & Labels
    ax.set_xlabel("No. Agents (N)")
    ax.set_ylabel("No. Neighbors (n)")
    ax.set_xlim(X_LIMIT)
    ax.set_ylim(Y_LIMIT)
    
    # Colorbar
    cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    cbar.set_label("Proportion of Successes")
    
    ax.legend(loc="upper left")
    plt.title("Proportion of Successful Shepherding Events")
    
    plt.tight_layout()
    plt.show()

    # Print stats
    if "Wall Time (s)" in df.columns:
        mean_time = df.loc[df["Success"] == 1, "Wall Time (s)"].mean()
        print(f"Average time (successful runs only): {mean_time:.3f} s")


# -----------------------------------------------------------------------------
# Main Execution
# -----------------------------------------------------------------------------

if __name__ == "__main__":
    print("Loading data...")
    data = load_and_process_data(CSV_PATHS)
    
    if data.empty:
        print("No valid data found in the specified CSV files.")
        sys.exit(1)
        
    print(f"Loaded {len(data)} records.")
    plot_results(data)