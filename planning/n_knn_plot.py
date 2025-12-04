import glob
import numpy as np
import pandas as pd
import matplotlib
# matplotlib.use("Agg")  # uncomment if your GUI freezes
import matplotlib.pyplot as plt

# === CONFIG ===
# EITHER: list csvs manually
csv_paths = [
    # "./planning/results/2025-10-20--23-30-56--evaluation_trials.csv",
    # "./planning/results/2025-10-21--12-49-50--evaluation_trials.csv",
    # "./planning/results/2025-10-21--14-41-09--evaluation_trials.csv",
    # "./planning/results/2025-10-21--14-55-11--evaluation_trials.csv",
    "./planning/results/paper_result.csv"
]

# === LOAD & UNION ===
dfs = []
for p in csv_paths:
    df = pd.read_csv(p)
    # Normalize Success to 0/1
    if df["Success"].dtype != np.number:
        df["Success"] = df["Success"].astype(str).str.lower().map({"true": 1, "false": 0})
    # Apply optional filters if the columns exist
    for col, val in ({}).items():
        if col in df.columns:
            df = df[df[col] == val]
    # Make sure N and k_nn are ints for grouping stability
    df["N"] = df["N"].astype(int)
    df["k_nn"] = df["k_nn"].astype(int)
    # If seed missing in some files, synthesize a seed hash from row index to avoid accidental drop
    if "seed" not in df.columns:
        df["seed"] = np.arange(len(df))
    dfs.append(df)

if not dfs:
    raise SystemExit("No CSVs matched. Update csv_paths or the glob pattern.")

all_df = pd.concat(dfs, ignore_index=True)

# If you re-ran the same (N,k,seed) across files, keep the first occurrence
all_df = all_df.drop_duplicates(subset=["N", "k_nn", "seed"])

# === AGGREGATE SUCCESS RATE ===
agg = (all_df.groupby(["N", "k_nn"], as_index=False)
             .agg(success_rate=("Success", "mean"),
                  trials=("Success", "size")))

# === PIVOT TO GRID ===
Ns = np.sort(agg["N"].unique())
ks = np.sort(agg["k_nn"].unique())
grid = (agg.pivot(index="k_nn", columns="N", values="success_rate")
           .reindex(index=ks, columns=Ns))

G = grid.values.copy()
upper_mask = (ks[:, None] >= Ns[None, :])   # rows are k, cols are N
G[upper_mask] = 1.0 

# === PLOT ===
fig, ax = plt.subplots(figsize=(10, 5.5))
im = ax.imshow(
    np.ma.masked_invalid(G),
    origin="lower",
    aspect="auto",
    extent=[Ns.min(), Ns.max(), ks.min(), ks.max()],
    vmin=0.0, vmax=1.0,
    cmap="Blues_r"
)

# Guide curves
N_line = np.linspace(0, 150, 500)
ax.plot(N_line, 0.53 * N_line, "k-",  lw=2, zorder=3, label="n = 0.53N")
ax.plot(N_line, 3.0 * np.log(N_line), "k--", lw=2, zorder=3, label="n = 3log(N)")

# Axes & colorbar
ax.set_xlabel("no. agents (N)")
ax.set_ylabel("no. neighbours (n)")
ax.set_xlim(0, 150)
ax.set_ylim(0, 150)
cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
cbar.set_label("Proportion of successes")
ax.legend(loc="upper left")
plt.title("Proportion of Successful Shepherding Events")

plt.tight_layout()
plt.show()

mean_time = all_df.loc[all_df["Success"] == 1, "Wall Time (s)"].mean()
print(f"Average time (successful runs only): {mean_time:.3f} s")