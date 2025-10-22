import { useState, useEffect } from "react";
import { CustomScenarioModal } from "./CustomScenarioModal";
import { getAllScenarios, loadScenario } from "../api/state";
import { Scenario } from "../types";
import ranch1 from "../../img/King_Ranch_better.jpg";
import ranch2 from "../../img/HighResRanch.png";
import "./LandingPage.css";


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

    // Function to fetch/refresh scenarios
    const fetchScenarios = async () => {
        setLoading(true);
        try {
            const scenarios = await getAllScenarios();
            setPresetScenarios(scenarios);
            console.log(`Loaded ${scenarios.length} scenarios (${scenarios.filter(s => s.visibility === 'preset').length} presets, ${scenarios.filter(s => s.visibility !== 'preset').length} custom)`);
        } catch (error) {
            console.error("Error fetching scenarios:", error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch all scenarios (preset + custom) on component mount
    useEffect(() => {
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

    const handleCustomSubmit = async (config: any) => {
        try {
            console.log("Custom scenario submission received:", config);
            
            // Check if the scenario was already created by the modal (it has scenarioId)
            if (config.scenarioId) {
                console.log("Scenario already created with ID:", config.scenarioId);
                setIsCustomizing(false);
                
                // Refresh the scenario list to show the newly created custom scenario
                console.log("Refreshing scenario list...");
                await fetchScenarios();
                
                // Select the newly created scenario
                setSelectedScenario(config.scenarioId);
                console.log(`Custom scenario selected with ID: ${config.scenarioId}`);
            } else {
                // Fallback: if for some reason the modal didn't create it, create it now
                console.log("Creating custom scenario...");
                const result = await startCustomSim(config);
                console.log("Custom scenario result:", result);
                setIsCustomizing(false);
                
                // Refresh the scenario list to show the newly created custom scenario
                console.log("Refreshing scenario list...");
                await fetchScenarios();
                
                // If creation was successful and we have the scenario ID, select it
                if (result && typeof result === 'object' && 'scenarioId' in result) {
                    setSelectedScenario(result.scenarioId as string);
                    console.log(`Custom scenario created with ID: ${result.scenarioId}`);
                }
            }
        } catch (error) {
            console.error("Error submitting custom scenario:", error);
            alert("Could not submit the custom scenario.");
        }
    };


    return (
        <div id="landing-container" className="lp">
            <h1 id="landing-title">Simulation Setup</h1>
            <p id="landing-subtitle">Select a scenario to begin</p>

            <div className="lp-grid">
                {/* Left: image cards */}
                <div className="lp-cards">
                    <div 
                        className={`choice-option lp-card ${selectedImage === "option1" ? "selected" : ""}`}
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
                                Option 1
                            </label>
                        </div>
                        <div className="choice-content">
                            <img src={ranch1} alt="Ranch 1" className="lp-card__img" />
                        </div>
                    </div>
                    
                    <div 
                        className={`choice-option lp-card ${selectedImage === "option2" ? "selected" : ""}`}
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
                                Option 2
                            </label>
                        </div>
                        <div className="choice-content">
                            <img src={ranch2} alt="Ranch 2" className="lp-card__img" />
                        </div>
                    </div>
                </div>

                {/* Right: scenario panel */}
                <div className="lp-panel">
                    <select 
                        value={selectedScenario} 
                        onChange={handleScenarioChange} 
                        id="landing-dropdown"
                        className="lp-select"
                        disabled={loading}
                    >
                        <option value="" disabled>
                            {loading ? "Loading scenarios..." : "Select a Scenario"}
                        </option>
                        
                        {/* Preset Scenarios */}
                        {presetScenarios.filter(s => s.visibility === 'preset').length > 0 && (
                            <optgroup label="Preset Scenarios">
                                {presetScenarios
                                    .filter(s => s.visibility === 'preset')
                                    .map(scenario => (
                                        <option key={scenario.id} value={scenario.id}>
                                            {scenario.name}
                                        </option>
                                    ))
                                }
                            </optgroup>
                        )}
                        
                        {/* Custom Scenarios */}
                        {presetScenarios.filter(s => s.visibility !== 'preset').length > 0 && (
                            <optgroup label="Custom Scenarios">
                                {presetScenarios
                                    .filter(s => s.visibility !== 'preset')
                                    .map(scenario => (
                                        <option key={scenario.id} value={scenario.id}>
                                            {scenario.name}
                                        </option>
                                    ))
                                }
                            </optgroup>
                        )}
                    </select>
                    <div className="lp-or">or</div>
                    <button 
                        id="create-custom-scenario-btn" 
                        className="lp-btn lp-btn--ghost"
                        onClick={() => setIsCustomizing(true)}
                    >
                        Create Custom Scenario
                    </button>

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
                </div>
            </div>

            {/* Start button */}
            {selectedScenario && (
                <div className="lp-actions">
                    <button 
                        onClick={handleStartSimulation} 
                        id="landing-start-btn"
                        className="lp-btn lp-btn--primary"
                    >
                        Start Simulation
                    </button>
                </div>
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

