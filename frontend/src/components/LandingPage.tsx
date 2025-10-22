import { useState, useEffect } from "react";
import { CustomScenarioModal } from "./CustomScenarioModal";
import { getPresetScenarios, loadScenario } from "../api/state";
import { Scenario } from "../types";
import ranch1 from "../../img/King_Ranch_better.jpg";
import ranch2 from "../../img/HighResRanch.png";


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
    onSimulationStart: (scenario: string, selectedImage?: string) => void,
    worldMin: number, 
    worldMax: number, 
    startPresetSim: (scenario: string) => Promise<unknown>,
    startCustomSim: (scenario: CustomScenario) => Promise<unknown>
}

export default function LandingPage({onSimulationStart, worldMin, worldMax, startPresetSim, startCustomSim}: LandingPageProps) {
    const [selectedScenario, setSelectedScenario] = useState<string>("");
    const [selectedImage, setSelectedImage] = useState<string>("");
    const [isCustomizing, setIsCustomizing] = useState(false);
    const [presetScenarios, setPresetScenarios] = useState<Scenario[]>([]);
    const [loading, setLoading] = useState(true);


    // Fetch preset scenarios on component mount
    useEffect(() => {
        const fetchScenarios = async () => {
            try {
                const scenarios = await getPresetScenarios();
                setPresetScenarios(scenarios);
            } catch (error) {
                console.error("Error fetching scenarios:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchScenarios();
    }, []);


    const handleImageSelect = (imageId: string) => {
        setSelectedImage(imageId);
    };

    const handleScenarioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedScenario(event.target.value);
    };

    const handleStartSimulation = async () => {
        if (!selectedScenario || selectedScenario === "Custom") return;

        try {
            // Find the selected scenario
            const scenario = presetScenarios.find(s => s.id === selectedScenario);
            if (!scenario) {
                throw new Error("Selected scenario not found");
            }

            // Load the scenario on the backend
            console.log(`Loading scenario: ${scenario.name} (ID: ${scenario.id})`);
            const result = await loadScenario(scenario.id);
            if (!result.success) {
                throw new Error("Failed to load scenario");
            }
            
            console.log("Scenario loaded successfully:", result.data);

            // Start the simulation
            await startPresetSim(scenario.name);
            onSimulationStart(scenario.name, selectedImage);
        } catch (error) {
            console.error("Error starting simulation:", error);
            alert("Could not start the simulation. Please try again.");
        }
    };

    const handleCustomSubmit = async (config: CustomScenario) => {
        try {
            await startCustomSim(config);
            setIsCustomizing(false);
            onSimulationStart("Custom", selectedImage); // Notify App to switch views
        } catch (error) {
            console.error("Error submitting custom scenario:", error);
            alert("Could not submit the custom scenario.");
        }
    };


    return (
        <div id="landing-container">
            <h1 id="landing-title">Simulation Setup</h1>
            <p id="landing-subtitle">Select a scenario to begin</p>

            {/* Multiple Choice Options */}
            <div className="multiple-choice-container">
                <div className="choice-options-row">
                    <div 
                        className={`choice-option ${selectedImage === "option1" ? "selected" : ""}`}
                        onClick={() => handleImageSelect("option1")}
                    >
                        <div className="choice-radio-container">
                            <input 
                                type="radio" 
                                id="option1" 
                                name="choice" 
                                value="option1"
                                checked={selectedImage === "option1"}
                                onChange={() => handleImageSelect("option1")}
                                className="choice-radio"
                            />
                            <label htmlFor="option1" className="choice-label">
                                King Ranch
                            </label>
                        </div>
                        <div className="choice-content">
                            <img src={ranch1} alt="Ranch 1" />
                        </div>
                    </div>
                    
                    <div 
                        className={`choice-option ${selectedImage === "option2" ? "selected" : ""}`}
                        onClick={() => handleImageSelect("option2")}
                    >
                        <div className="choice-radio-container">
                            <input 
                                type="radio" 
                                id="option2" 
                                name="choice" 
                                value="option2"
                                checked={selectedImage === "option2"}
                                onChange={() => handleImageSelect("option2")}
                                className="choice-radio"
                            />
                            <label htmlFor="option2" className="choice-label">
                                Southfork Ranch
                            </label>
                        </div>
                        <div className="choice-content">
                            <img src={ranch2} alt="Ranch 2" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="scenario-selector-container">
                <select 
                    value={selectedScenario} 
                    onChange={handleScenarioChange} 
                    id="landing-dropdown"
                    disabled={loading}
                >
                    <option value="" disabled>
                        {loading ? "Loading scenarios..." : "Preset Scenarios"}
                    </option>
                    {presetScenarios.map(scenario => (
                        <option key={scenario.id} value={scenario.id}>
                            {scenario.name}
                        </option>
                    ))}
                </select>
                <p>or</p>
                <button 
                    id="create-custom-scenario-btn" 
                    className="action-btn"
                    onClick={() => setIsCustomizing(true)}
                >
                    Create Custom Scenario
                </button>
            </div>

            {/* --- Conditional UI based on selection --- */}

            {/* Show scenario description if a preset is selected */}
            {selectedScenario && (
                <div id="scenario-description">
                    {(() => {
                        const scenario = presetScenarios.find(s => s.id === selectedScenario);
                        return scenario ? (
                            <div>
                                <h3>{scenario.name}</h3>
                                {scenario.description && <p>{scenario.description}</p>}
                                <p><strong>Sheep:</strong> {scenario.sheep.length} | <strong>Drones:</strong> {scenario.drones.length}</p>
                                {scenario.tags.length > 0 && (
                                    <p><strong>Tags:</strong> {scenario.tags.join(", ")}</p>
                                )}
                            </div>
                        ) : null;
                    })()}
                </div>
            )}

            {/* 1. Show Start Button for standard scenarios */}
            {selectedScenario && (
                <button 
                    onClick={handleStartSimulation} 
                    id="landing-start-btn"
                    className="action-btn"
                >
                    Start Simulation
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
}/**
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

