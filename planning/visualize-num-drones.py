import pandas as pd
import matplotlib.pyplot as plt

if __name__ == "__main__":
    df = pd.read_csv("./planning/results/2025-10-08--21-05-00--evaluation_trials.csv")
    
    df = df[df["conditionally_apply_repulsion"]]
    
    for key, value in df.groupby(["spawn_type"]):
        fig, ax = plt.subplots()

        for (drone_count, data), color in zip(value.groupby("Drone Count"), ("red", "green", "blue")):
            data.plot.scatter(
                x="N", y="Completion Steps", label=drone_count, color=color, ax=ax
            )
            means = data.groupby("N")["Completion Steps"].mean()
            ax.plot(means.index, means.values, color=color, linestyle="--", label="Flyover mean")

        ax.set_title(f"Spawn type: {key}")
        ax.legend()
    
        success_rate = value.groupby("Drone Count")["Success"].mean().reset_index()
        success_rate.set_index("Drone Count").plot.bar(
            y="Success",
            ylabel="Success Rate (Mean of Success)",
            xlabel="Number of Drones",
            title="Success Rate by Number of Drones",
            rot=0 # Keep x-labels horizontal
        )

    plt.show()
