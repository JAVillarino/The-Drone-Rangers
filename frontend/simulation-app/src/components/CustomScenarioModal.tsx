import { useState, useRef, useEffect } from "react";
import ObjectMarker from "./MapPlot/ObjectMarker";
import map_bg from "../../img/King_Ranch_better.jpg";
import cityMap from "../../img/evacuation-map.jpg";
import oceanMap from "../../img/ocean-map.jpg";
import { createCustomScenario, loadScenario, fetchPolicyPresets, fetchScenarioTypes, PolicyPreset, ScenarioType } from "../api/state";
import { ScenarioThemeKey } from "../theme";

type DragItem = {
    type: 'animal' | 'drone' | 'target';
    index: number | null;
    offsetX: number;
    offsetY: number;
    updateTimeout?: ReturnType<typeof setTimeout>;
};


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

type CustomScenarioModalProps = {
    onClose: () => void;
    onSubmit: (config: CustomScenario) => void;
    worldMin: number,
    worldMax: number
};

export function CustomScenarioModal({ onClose, onSubmit, worldMax, worldMin }: CustomScenarioModalProps) {
    const [numAnimals, setNumAnimals] = useState(10);
    const [animalPositions, setAnimalPositions] = useState<[number, number][]>([]);
    const [dronePosition, setDronePosition] = useState<[number, number]>([200, 200]);
    const [targetPosition, setTargetPosition] = useState<[number, number]>([400, 200]);
    const [scenarioName, setScenarioName] = useState("");
    const [scenarioDescription, setScenarioDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Policy configuration state
    const [policyPresets, setPolicyPresets] = useState<Record<string, PolicyPreset>>({});
    const [selectedPreset, setSelectedPreset] = useState<string>("default");
    const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
    const [customSpeedMultiplier, setCustomSpeedMultiplier] = useState(1.0);
    const [customDriveForce, setCustomDriveForce] = useState(1.0);

    // Advanced Physics Parameters
    const [customCohesion, setCustomCohesion] = useState(1.0);   // wa
    const [customSeparation, setCustomSeparation] = useState(1.0); // wr
    const [customAlignment, setCustomAlignment] = useState(1.0);   // k_nn / wd

    // Scenario types state
    const [scenarioTypes, setScenarioTypes] = useState<ScenarioType[]>([]);
    const [selectedScenarioType, setSelectedScenarioType] = useState<string>("");

    // Fetch policy presets and scenario types on mount
    useEffect(() => {
        fetchPolicyPresets().then(presets => {
            setPolicyPresets(presets);
        });
        fetchScenarioTypes().then(types => {
            setScenarioTypes(types);
        });
    }, []);

    // Update recommended agents when scenario type changes
    useEffect(() => {
        if (selectedScenarioType) {
            const scenarioType = scenarioTypes.find(t => t.key === selectedScenarioType);
            if (scenarioType?.recommended_agents) {
                setNumAnimals(scenarioType.recommended_agents);
            }
        }
    }, [selectedScenarioType, scenarioTypes]);

    // Derive theme key from selected scenario type
    const getThemeKey = (): ScenarioThemeKey => {
        if (selectedScenarioType) {
            const scenarioType = scenarioTypes.find(t => t.key === selectedScenarioType);
            if (scenarioType?.default_theme_key) {
                return scenarioType.default_theme_key as ScenarioThemeKey;
            }
        }
        return "default-herd";
    };

    // Derive icon set from selected scenario type
    const getIconSet = (): "herding" | "evacuation" => {
        if (selectedScenarioType) {
            const scenarioType = scenarioTypes.find(t => t.key === selectedScenarioType);
            if (scenarioType?.default_icon_set === "evacuation") {
                return "evacuation";
            }
        }
        return "herding";
    };

    // Determine background image based on selected scenario type/environment
    const getBackgroundImage = () => {
        if (selectedScenarioType) {
            const scenarioType = scenarioTypes.find(t => t.key === selectedScenarioType);
            if (scenarioType?.environment === "city") return cityMap;
            if (scenarioType?.environment === "ocean") return oceanMap;
        }
        return map_bg;
    };

    const dragItem = useRef<DragItem | null>(null); // { type: 'animal' | 'drone' | 'target', id: number | null, offsetX: number, offsetY: number }
    const mapRef = useRef<SVGSVGElement | null>(null);

    // Initialize animal positions when component mounts or numAnimals changes
    useEffect(() => {
        setAnimalPositions((prev) => {
            const newAnimals = Array.from({ length: numAnimals }, (_, i) => {
                // Keep existing animal if available, otherwise create a new one within background bounds
                if (prev[i] !== undefined) return prev[i];
                // Place animals in a grid pattern within the background image area
                const cols = Math.ceil(Math.sqrt(numAnimals));
                const spacing = 50; // Reduced spacing to fit more on screen
                const startX = 50;
                const startY = 50;
                const x = startX + (i % cols) * spacing;
                const y = startY + Math.floor(i / cols) * spacing;
                return [x, y] as [number, number];
            });
            return newAnimals;
        });
    }, [numAnimals]);

    // Cleanup global event listeners on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent, type: "animal" | "drone" | "target", index: number | null = null) => {
        e.preventDefault();
        e.stopPropagation();
        if (!mapRef.current) return;

        const mapRect = mapRef.current.getBoundingClientRect();
        const currentPos = type === 'drone' ? dronePosition :
            type === 'target' ? targetPosition :
                animalPositions[index!];

        dragItem.current = {
            type,
            index,
            offsetX: e.clientX - mapRect.left - currentPos[0],
            offsetY: e.clientY - mapRect.top - currentPos[1],
        };

        // Add global mouse event listeners for better performance
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
    };

    // Right-click to remove an animal
    const handleRightClick = (e: React.MouseEvent, type: "animal" | "drone" | "target", index: number | null = null) => {
        e.preventDefault();
        e.stopPropagation();

        if (type === "animal" && index !== null) {
            // Remove the animal at this index
            setAnimalPositions(prev => prev.filter((_, i) => i !== index));
            setNumAnimals(prev => Math.max(2, prev - 1)); // Keep at least 2 animals
        }
        // Don't allow removing drone or target - they are required
    };

    // Double-click on map to add a new animal
    const handleMapDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!mapRef.current) return;

        const mapRect = mapRef.current.getBoundingClientRect();
        const x = e.clientX - mapRect.left;
        const y = e.clientY - mapRect.top;

        // Add a new animal at the clicked position
        setAnimalPositions(prev => [...prev, [x, y]]);
        setNumAnimals(prev => prev + 1);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!dragItem.current || !mapRef.current) return;

        const mapRect = mapRef.current.getBoundingClientRect();
        let newX = e.clientX - mapRect.left - dragItem.current.offsetX;
        let newY = e.clientY - mapRect.top - dragItem.current.offsetY;

        // No bounds constraints - entities can be placed anywhere
        // newX and newY are used directly without clamping

        const { type } = dragItem.current;

        // Immediate visual update using direct DOM manipulation
        const entityElement = mapRef.current.querySelector(`[data-entity-type="${type}"][data-entity-index="null"]`);
        if (entityElement) {
            entityElement.setAttribute('transform', `translate(${newX}, ${newY})`);
        }

        // Throttled React state update for data consistency
        if (!dragItem.current.updateTimeout) {
            dragItem.current.updateTimeout = setTimeout(() => {
                if (dragItem.current) {
                    const { type, index } = dragItem.current;
                    if (type === 'drone') {
                        setDronePosition([newX, newY]);
                    } else if (type === 'target') {
                        setTargetPosition([newX, newY]);
                    } else if (type === 'animal') {
                        setAnimalPositions((prev) => prev.map((pos, i) => (i === index ? [newX, newY] : pos)));
                    }
                    dragItem.current.updateTimeout = undefined;
                }
            }, 16); // Update React state every 16ms (60fps)
        }
    };

    const handleGlobalMouseUp = () => {
        if (dragItem.current?.updateTimeout) {
            clearTimeout(dragItem.current.updateTimeout);
        }
        dragItem.current = null;
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    const handleMouseUp = () => {
        handleGlobalMouseUp();
    };

    const handleSubmit = async () => {
        if (!mapRef.current) return;

        // Validate required fields
        if (!scenarioName.trim()) {
            alert("Please enter a scenario name");
            return;
        }

        if (numAnimals < 2) {
            alert("Please add at least 2 animals for a meaningful simulation");
            return;
        }

        setIsSubmitting(true);

        try {
            const mapRect = mapRef.current.getBoundingClientRect();

            // --- Coordinate Transformation ---
            // These values should match your MapPlot component for consistency

            const canvasWidth = mapRect.width;
            const canvasHeight = mapRect.height;

            const transform = (pos: [number, number]): [number, number] => {
                const worldX = (pos[0] / canvasWidth) * (worldMax - worldMin) + worldMin;
                // Fix: Do NOT invert Y axis. The simulation and map both use top-left origin logic or consistent coordinates.
                // If the simulation expects bottom-left origin, the backend adapter usually handles it.
                // For the visual editor to match the result, we should map directly.
                const worldY = (pos[1] / canvasHeight) * (worldMax - worldMin) + worldMin;
                return [parseFloat(worldX.toFixed(2)), parseFloat(worldY.toFixed(2))];
            };

            // Build policy config from preset and custom overrides
            const basePreset = policyPresets[selectedPreset];
            const policyConfig = basePreset ? {
                ...basePreset,
                max_speed_multiplier: customSpeedMultiplier,
                drive_force_multiplier: customDriveForce,
            } : {
                key: selectedPreset,
                max_speed_multiplier: customSpeedMultiplier,
                drive_force_multiplier: customDriveForce,
            };

            // Derive theme from scenario type
            const themeKey = getThemeKey();

            // Create the scenario data for the API
            const scenarioData = {
                name: scenarioName.trim(),
                description: scenarioDescription.trim() || `Custom scenario with ${numAnimals} ${getIconSet() === "evacuation" ? "people" : "sheep"}`,
                sheep: animalPositions.map(transform),
                shepherd: transform(dronePosition),
                target: transform(targetPosition),
                bounds: {
                    xmin: worldMin,
                    xmax: worldMax,
                    ymin: worldMin,
                    ymax: worldMax
                },
                seed: Math.floor(Math.random() * 1000000),
                tags: ["custom"],
                flockSize: numAnimals,
                start: true,
                visibility: "public",
                // Include appearance config derived from scenario type
                appearance: {
                    themeKey: themeKey,
                    iconSet: getIconSet()
                },
                // Include policy configuration
                policy_config: policyConfig,
                // Include scenario type if selected

                // Include world config with advanced physics
                world_config: {
                    wa_multiplier: customCohesion,
                    wr_multiplier: customSeparation,
                    wd_multiplier: customAlignment,
                }
            };

            // Send to backend
            const result = await createCustomScenario(scenarioData);

            if (result.success && result.scenarioId) {
                // Load the created scenario into the running simulation
                const loadResult = await loadScenario(result.scenarioId);

                if (loadResult.success) {
                    console.log("Custom scenario created and loaded successfully!");
                    console.log("Scenario ID:", result.scenarioId);
                    // Close modal
                    onClose();
                    // Notify parent that scenario was created (don't pass config since it's already created)
                    // Pass a dummy config to satisfy the type, but the parent won't use it to create again
                    onSubmit({
                        name: scenarioName,
                        seed: scenarioData.seed,
                        flockSize: numAnimals,
                        sheep: scenarioData.sheep,
                        shepherd: scenarioData.shepherd,
                        target: scenarioData.target,
                        bounds: scenarioData.bounds,
                        start: true,
                        scenarioId: result.scenarioId, // Add the ID so parent knows not to recreate
                        themeKey: themeKey, // Include the derived theme
                        iconSet: getIconSet() // Include the icon set
                    } as any);
                } else {
                    alert(`Failed to load scenario: ${loadResult.error || 'Unknown error'}`);
                }
            } else {
                alert(`Failed to create scenario: ${result.error || 'Unknown error'}`);
            }


        } catch (error) {
            console.error("Error creating scenario:", error);
            alert("An error occurred while creating the scenario");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div id="modal-overlay" onMouseUp={handleMouseUp}>
            <div id="modal-content" onClick={(e) => e.stopPropagation()}>
                <div id="modal-header">
                    <h2>Customize Scenario</h2>
                    <div className="modal-inputs-container">
                        <div id="input-group">
                            <label htmlFor="scenario-name">Scenario Name</label>
                            <input
                                id="scenario-name"
                                type="text"
                                value={scenarioName}
                                onChange={(e) => setScenarioName(e.target.value)}
                                className="text-input"
                                placeholder="Enter name"
                                required
                            />
                        </div>
                        <div id="input-group">
                            <label htmlFor="scenario-description">Description</label>
                            <input
                                id="scenario-description"
                                type="text"
                                value={scenarioDescription}
                                onChange={(e) => setScenarioDescription(e.target.value)}
                                className="text-input"
                                placeholder="Optional"
                            />
                        </div>
                        <div id="input-group">
                            <label htmlFor="num-animals">{getIconSet() === "evacuation" ? "People" : "Animals"}</label>
                            <input
                                id="num-animals"
                                type="number"
                                value={numAnimals}
                                onChange={(e) => setNumAnimals(parseInt(e.target.value, 10) || 10)}
                                onBlur={(e) => {
                                    const val = parseInt(e.target.value, 10) || 10;
                                    if (val < 2) setNumAnimals(2);
                                }}
                                className="number-input"
                                min="2"
                            />
                        </div>
                    </div>

                    {/* Policy Configuration Section */}
                    <div className="modal-config-section">
                        <div className="config-row">
                            <div id="input-group">
                                <label htmlFor="scenario-type">Scenario Type</label>
                                <select
                                    id="scenario-type"
                                    value={selectedScenarioType}
                                    onChange={(e) => setSelectedScenarioType(e.target.value)}
                                    className="text-input"
                                    style={{ cursor: 'pointer' }}
                                >
                                    <option value="">Custom (Manual Setup)</option>
                                    {scenarioTypes.map((type) => (
                                        <option key={type.key} value={type.key}>
                                            {type.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div id="input-group">
                                <label htmlFor="policy-preset">Herding Strategy</label>
                                <select
                                    id="policy-preset"
                                    value={selectedPreset}
                                    onChange={(e) => setSelectedPreset(e.target.value)}
                                    className="text-input"
                                    style={{ cursor: 'pointer' }}
                                >
                                    {Object.entries(policyPresets).map(([key, preset]) => (
                                        <option key={key} value={key}>
                                            {preset.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Advanced config toggle */}
                        <button
                            type="button"
                            className="config-toggle-btn"
                            onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#2b6cb0',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '8px 0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            {showAdvancedConfig ? '▼' : '▶'} Advanced Parameters
                        </button>

                        {showAdvancedConfig && (
                            <div className="advanced-config" style={{
                                background: '#f7fafc',
                                padding: '12px',
                                borderRadius: '8px',
                                marginTop: '8px'
                            }}>
                                <div className="slider-group" style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '13px', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Drone Speed</span>
                                        <span style={{ fontWeight: 600 }}>{customSpeedMultiplier.toFixed(1)}x</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={customSpeedMultiplier}
                                        onChange={(e) => setCustomSpeedMultiplier(parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                                <div className="slider-group">
                                    <label style={{ fontSize: '13px', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Drive Force</span>
                                        <span style={{ fontWeight: 600 }}>{customDriveForce.toFixed(1)}x</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max="2.0"
                                        step="0.1"
                                        value={customDriveForce}
                                        onChange={(e) => setCustomDriveForce(parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                                <div className="slider-group" style={{ marginBottom: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                    <label style={{ fontSize: '13px', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Cohesion (Clumping)</span>
                                        <span style={{ fontWeight: 600 }}>{customCohesion.toFixed(1)}x</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0.0"
                                        max="3.0"
                                        step="0.1"
                                        value={customCohesion}
                                        onChange={(e) => setCustomCohesion(parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                                <div className="slider-group" style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '13px', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Separation (Spacing)</span>
                                        <span style={{ fontWeight: 600 }}>{customSeparation.toFixed(1)}x</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5.0"
                                        step="0.1"
                                        value={customSeparation}
                                        onChange={(e) => setCustomSeparation(parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                                <div className="slider-group">
                                    <label style={{ fontSize: '13px', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Alignment (Flocking)</span>
                                        <span style={{ fontWeight: 600 }}>{customAlignment.toFixed(1)}x</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0.0"
                                        max="2.0"
                                        step="0.1"
                                        value={customAlignment}
                                        onChange={(e) => setCustomAlignment(parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <svg
                    ref={mapRef}
                    id="custom-map"
                    onDoubleClick={handleMapDoubleClick}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <image href={getBackgroundImage()} x="0" y="0" width="100%" height="100%" />
                    {/* Render Animals/People - right-click to remove, drag to move */}
                    {animalPositions.map((pos, index) => (
                        <g
                            key={`animal-${index}`}
                            onMouseDown={(e) => handleMouseDown(e, 'animal', index)}
                            onContextMenu={(e) => handleRightClick(e, 'animal', index)}
                            className="entity-marker"
                            data-entity-type="animal"
                            data-entity-index={index}
                            style={{ cursor: 'grab' }}
                        >
                            <ObjectMarker type="animal" x={pos[0]} y={pos[1]} iconSet={getIconSet()} />
                        </g>
                    ))}
                    {/* Render Drone/Guide */}
                    <g
                        onMouseDown={(e) => handleMouseDown(e, 'drone')}
                        className="entity-marker"
                        data-entity-type="drone"
                        data-entity-index={null}
                        style={{ cursor: 'grab' }}
                    >
                        <ObjectMarker type="drone" x={dronePosition[0]} y={dronePosition[1]} iconSet={getIconSet()} />
                    </g>
                    {/* Render Target/Exit */}
                    <g
                        onMouseDown={(e) => handleMouseDown(e, 'target')}
                        className="entity-marker"
                        data-entity-type="target"
                        data-entity-index={null}
                        style={{ cursor: 'grab' }}
                    >
                        <ObjectMarker type="target" x={targetPosition[0]} y={targetPosition[1]} iconSet={getIconSet()} />
                    </g>
                </svg>

                {/* Help text for entity manipulation */}
                <div style={{
                    fontSize: '12px',
                    color: '#718096',
                    textAlign: 'center',
                    padding: '8px',
                    background: '#f7fafc',
                    borderRadius: '0 0 8px 8px'
                }}>
                    <strong>Drag</strong> entities to move • <strong>Double-click</strong> map to add {getIconSet() === "evacuation" ? "person" : "animal"} • <strong>Right-click</strong> {getIconSet() === "evacuation" ? "person" : "animal"} to remove
                </div>

                <div id="modal-footer">
                    <button className="modal-btn cancel-btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
                    <button
                        className="modal-btn submit-btn"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !scenarioName.trim()}
                    >
                        {isSubmitting ? "Creating..." : "Submit Scenario"}
                    </button>
                </div>
            </div>
        </div>
    );
}