import { useState, useEffect } from "react";
import { CustomScenarioModal } from "./CustomScenarioModal";
import { getAllScenarios, loadScenario } from "../api/state";
import { Scenario } from "../types";
import { ScenarioThemeKey } from "../theme";
import ranch1 from "../../img/King_Ranch_better.jpg";
import cityMap from "../../img/evacuation-map.jpg";
import oceanMap from "../../img/ocean-map.jpg";
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
    onSimulationStart: (scenario: string, selectedImage?: string, themeKey?: ScenarioThemeKey) => void,
    startPresetSim: (scenario: string) => Promise<unknown>,
    startCustomSim: (scenario: CustomScenario) => Promise<unknown>,
    onBack: () => void
}


const worldMin = 0;
const worldMax = 250;

export default function LandingPage({ onSimulationStart, startPresetSim, startCustomSim, onBack }: LandingPageProps) {
    const [selectedScenario, setSelectedScenario] = useState<string>("");
    const [selectedEnvironment, setSelectedEnvironment] = useState<"farm" | "city" | "ocean">("farm");
    const [isCustomizing, setIsCustomizing] = useState(false);
    const [presetScenarios, setPresetScenarios] = useState<Scenario[]>([]);
    const [loading, setLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    // Track theme key for newly created custom scenarios (may not be persisted to backend yet)
    const [customScenarioTheme, setCustomScenarioTheme] = useState<ScenarioThemeKey | null>(null);
    // Track icon set for loading animation
    const [loadingIconSet, setLoadingIconSet] = useState<"herding" | "evacuation">("herding");

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


    const handleEnvironmentSelect = (env: "farm" | "city" | "ocean") => {
        setSelectedEnvironment(env);
        setSelectedScenario(""); // Reset scenario when environment changes
    };

    const handleScenarioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedScenario(event.target.value);
    };

    const handleStartSimulation = async () => {
        if (!selectedScenario || selectedScenario === "Custom") return;

        // Find the selected scenario first to set the right loading animation
        const scenario = presetScenarios.find(s => s.id === selectedScenario);
        if (!scenario) {
            alert("Selected scenario not found");
            return;
        }

        // Determine icon set from scenario appearance or tags
        const iconSet = scenario.appearance?.iconSet === "evacuation" ||
            scenario.tags?.includes("evacuation") ||
            scenario.scenario_type === "evacuation_prototype"
            ? "evacuation" : "herding";
        setLoadingIconSet(iconSet);
        setIsStarting(true);

        try {
            // Load the scenario on the backend
            console.log(`Loading scenario: ${scenario.name} (ID: ${scenario.id})`);
            const result = await loadScenario(scenario.id);
            if (!result.success) {
                throw new Error("Failed to load scenario");
            }

            console.log("Scenario loaded successfully:", result.data);

            // Add a small delay for the animation
            await new Promise(resolve => setTimeout(resolve, 800));

            // Start the simulation
            await startPresetSim(scenario.name);
            // Derive theme key from scenario appearance or custom theme
            const themeKey = (customScenarioTheme && scenario.visibility !== 'preset')
                ? customScenarioTheme
                : (scenario.appearance?.themeKey as ScenarioThemeKey ?? "default-herd");
            // Clear the custom theme after using it
            setCustomScenarioTheme(null);
            // Determine background image based on environment
            let bgImage = ranch1;
            if (selectedEnvironment === "city") bgImage = cityMap;
            if (selectedEnvironment === "ocean") bgImage = oceanMap;

            onSimulationStart(scenario.name, bgImage, themeKey);
        } catch (error) {
            console.error("Error starting simulation:", error);
            alert("Could not start the simulation. Please try again.");
            setIsStarting(false);
        }
    };

    const handleCustomSubmit = async (config: any) => {
        try {
            console.log("Custom scenario submission received:", config);

            // Capture the theme key and icon set from the submitted config
            if (config.themeKey) {
                setCustomScenarioTheme(config.themeKey as ScenarioThemeKey);
            }
            if (config.iconSet) {
                setLoadingIconSet(config.iconSet);
            }

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
        <>
            {isStarting && (
                <div className="sheep-startup-overlay">
                    <div className="sheep-startup-content">
                        <h2>Starting Simulation...</h2>
                        <div className="sheep-loading-animation">
                            {loadingIconSet === "evacuation" ? (
                                <>
                                    <div className="sheep-icon">
                                        <img src="../../img/person-icon.svg" alt="Person" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/person-icon.svg" alt="Person" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/person-icon.svg" alt="Person" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/person-icon.svg" alt="Person" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/person-icon.svg" alt="Person" width="40" height="40" />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="sheep-icon">
                                        <img src="../../img/sheep-icon.svg" alt="Sheep" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/sheep-icon.svg" alt="Sheep" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/sheep-icon.svg" alt="Sheep" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/sheep-icon.svg" alt="Sheep" width="40" height="40" />
                                    </div>
                                    <div className="sheep-icon">
                                        <img src="../../img/sheep-icon.svg" alt="Sheep" width="40" height="40" />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <div id="landing-container" className={`lp ${isStarting ? 'transitioning' : ''}`}>
                <div className="lp-header">
                    <button
                        className="lp-back-btn"
                        onClick={() => {
                            console.log('Back button clicked');
                            onBack();
                        }}
                        onMouseEnter={() => console.log('Button hovered')}
                        onMouseLeave={() => console.log('Button unhovered')}
                    >
                        Back to Welcome
                    </button>
                    <h1 id="landing-title">Simulation Setup</h1>
                    <p id="landing-subtitle">Select an environment to begin</p>
                </div>

                <div className="lp-grid">
                    {/* Left: environment cards */}
                    <div className="lp-cards">
                        <div
                            className={`choice-option lp-card ${selectedEnvironment === "farm" ? "selected" : ""}`}
                            onClick={() => handleEnvironmentSelect("farm")}
                        >
                            <div className="choice-radio-container">
                                <input
                                    type="radio"
                                    id="env-farm"
                                    name="environment"
                                    value="farm"
                                    checked={selectedEnvironment === "farm"}
                                    onChange={() => handleEnvironmentSelect("farm")}
                                    className="choice-radio"
                                />
                                <label htmlFor="env-farm" className="choice-label">
                                    Farm
                                </label>
                            </div>
                            <div className="choice-content">
                                <img src={ranch1} alt="Farm Environment" className="lp-card__img" />
                            </div>
                        </div>

                        <div
                            className={`choice-option lp-card ${selectedEnvironment === "city" ? "selected" : ""}`}
                            onClick={() => handleEnvironmentSelect("city")}
                        >
                            <div className="choice-radio-container">
                                <input
                                    type="radio"
                                    id="env-city"
                                    name="environment"
                                    value="city"
                                    checked={selectedEnvironment === "city"}
                                    onChange={() => handleEnvironmentSelect("city")}
                                    className="choice-radio"
                                />
                                <label htmlFor="env-city" className="choice-label">
                                    City
                                </label>
                            </div>
                            <div className="choice-content">
                                <img src={cityMap} alt="City Environment" className="lp-card__img" />
                            </div>
                        </div>

                        <div
                            className={`choice-option lp-card ${selectedEnvironment === "ocean" ? "selected" : ""}`}
                            onClick={() => handleEnvironmentSelect("ocean")}
                        >
                            <div className="choice-radio-container">
                                <input
                                    type="radio"
                                    id="env-ocean"
                                    name="environment"
                                    value="ocean"
                                    checked={selectedEnvironment === "ocean"}
                                    onChange={() => handleEnvironmentSelect("ocean")}
                                    className="choice-radio"
                                />
                                <label htmlFor="env-ocean" className="choice-label">
                                    Ocean
                                </label>
                            </div>
                            <div className="choice-content">
                                <img src={oceanMap} alt="Ocean Environment" className="lp-card__img" />
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

                            {/* Preset Scenarios Filtered by Environment */}
                            {presetScenarios.filter(s => s.visibility === 'preset' && s.environment === selectedEnvironment).length > 0 ? (
                                <optgroup label={`${selectedEnvironment.charAt(0).toUpperCase() + selectedEnvironment.slice(1)} Scenarios`}>
                                    {presetScenarios
                                        .filter(s => s.visibility === 'preset' && s.environment === selectedEnvironment)
                                        .map(scenario => (
                                            <option key={scenario.id} value={scenario.id}>
                                                {scenario.name}
                                            </option>
                                        ))
                                    }
                                </optgroup>
                            ) : (
                                <option disabled>No scenarios available for this environment</option>
                            )}

                            {/* Custom Scenarios Filtered by Environment */}
                            {presetScenarios.filter(s => s.visibility !== 'preset' && s.environment === selectedEnvironment).length > 0 && (
                                <optgroup label="Custom Scenarios">
                                    {presetScenarios
                                        .filter(s => s.visibility !== 'preset' && s.environment === selectedEnvironment)
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
                            className={`lp-btn lp-btn--primary ${isStarting ? 'starting' : ''}`}
                            disabled={isStarting}
                        >
                            {isStarting ? (
                                'Starting Simulation...'
                            ) : (
                                'Start Simulation'
                            )}
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
        </>
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

