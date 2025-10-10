import { useState } from "react";
import { CustomScenarioModal } from "./CustomScenarioModal";


interface CustomScenario {
    name: string,
    seed: number,
    flockSize: number,
    sheep: [number, number][],
    shepherd: [number, number],
    target: [number, number],
    bounds: {
        xmin: number,
        xmax: number,
        ymin: number,
        ymax: number
    },
    start: boolean
    // missing: polygons (i.e. obstacles), params, 
}

interface LandingPageProps {
    onSimulationStart: (scenario: string) => void,
    worldMin: number,
    worldMax: number, 
    startPresetSim: (scenario: string) => Promise<unknown>,
    startCustomSim: (scenario: CustomScenario) => Promise<unknown>
}

export default function LandingPage({onSimulationStart, worldMin, worldMax, startPresetSim, startCustomSim}: LandingPageProps) {
    const [selectedScenario, setSelectedScenario] = useState<string>("");
    const [isCustomizing, setIsCustomizing] = useState(false);
    const scenarios = ["Uniform", "Clustered", "Random", "Custom"];

    const handleScenarioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedScenario(event.target.value);
    };

    const handleStartSimulation = async () => {
        if (!selectedScenario || selectedScenario === "Custom") return;

        try {
            await startPresetSim(selectedScenario);
            onSimulationStart(selectedScenario);
        } catch (error) {
            console.error("Error starting simulation:", error);
            alert("Could not start the simulation. Please try again.");
        }
    };

    const handleCustomSubmit = async (config: CustomScenario) => {
        try {
            await startCustomSim(config);
            setIsCustomizing(false);
            onSimulationStart("Custom"); // Notify App to switch views
        } catch (error) {
            console.error("Error submitting custom scenario:", error);
            alert("Could not submit the custom scenario.");
        }
    };

    // Determine if the start button should be disabled
    //const isStartButtonDisabled = !selectedScenario || selectedScenario === "Custom";

    return (
        <div id="landing-container">
            <h1 id="landing-title">Simulation Setup</h1>
            <p id="landing-subtitle">Select a scenario to begin</p>

            <select 
                value={selectedScenario} 
                onChange={handleScenarioChange} 
                id="landing-dropdown"
            >
                <option value="" disabled>-- Choose a scenario --</option>
                {scenarios.map(scenario => (
                    <option key={scenario} value={scenario}>{scenario}</option>
                ))}
            </select>

            {/* --- Conditional UI based on selection --- */}

            {/* 1. Show Start Button for standard scenarios */}
            {selectedScenario && selectedScenario !== "Custom" && (
                <button 
                    onClick={handleStartSimulation} 
                    id="landing-start-btn"
                    className="action-btn"
                >
                    Start Simulation
                </button>
            )}

            {/* 2. Show a different UI for the "Custom" scenario */}
            {selectedScenario === "Custom" && (
                <button onClick={() => setIsCustomizing(true)} id="custom-scen-btn" className="action-btn">
                    Customize Scenario
                </button>
            )}

            {isCustomizing && (
                <CustomScenarioModal 
                    onClose={() => setIsCustomizing(false)} 
                    onSubmit={handleCustomSubmit} 
                    worldMax={worldMax}
                    worldMin={worldMin}
                />
            )}
        </div>
    );
}

/**
 * Ideas:
 * Header with App Name
 * Maybe:
 * - choose background / ranch pic
 * 
 * Definitely:
 * - choose scenario
 *      - either automatically displayed for the user to choose from (maybe with example pictures?)
 *      - or a drop down with names (Probably the best option for now, can change easily later)
 *          - the names should be retrieved from a call to the backend - backend presets
 *          - + "Custom" which would allow the user to fully customize their own scenario
 */