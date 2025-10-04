import pandas as pd
import matplotlib.pyplot as plt

if __name__ == "__main__":
    df = pd.read_csv("./planning/results/2025-10-03--18-26-41--evaluation_trials.csv")
    
    for key, value in df.groupby(["spawn_type"]):
        fly_overs = value[value["flyover_on_collect"]]
        nonfly_overs = value[~value["flyover_on_collect"]]

        fig, ax = plt.subplots()

        # Flyovers in red
        fly_overs.plot.scatter(
            x="N", y="Completion Steps", 
            color="red", label="Flyover", ax=ax
        )

        # Non-flyovers in blue
        nonfly_overs.plot.scatter(
            x="N", y="Completion Steps", 
            color="blue", label="Non-Flyover", ax=ax
        )

        # ---- Compute means ----
        fly_means = fly_overs.groupby("N")["Completion Steps"].mean()
        nonfly_means = nonfly_overs.groupby("N")["Completion Steps"].mean()

        # Plot mean lines
        ax.plot(fly_means.index, fly_means.values, color="red", linestyle="--", label="Flyover mean")
        ax.plot(nonfly_means.index, nonfly_means.values, color="blue", linestyle="--", label="Non-Flyover mean")

        ax.set_title(f"Spawn type: {key}")
        ax.legend()

    plt.show()
