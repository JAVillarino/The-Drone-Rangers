import SimulationStatus from "../SimulationStatus.tsx";
import { useState } from "react";
import { Job, State, Target } from "../../types.ts"
import { Map, usePan } from "./UsePan.tsx";
import JobStatus from '../JobStatus.tsx';
import { setJobActiveState, setJobDroneCount, setTarget } from '../../api/state.ts';
import { ScenarioThemeKey, getScenarioTheme } from "../../theme";

const jobStatus = (j: Job) => {
    if (j.remaining_time == 0) {
        return "Completed";
    }
    if (!j.target) {
        return "No target set";
    }
    if (!j.is_active) {
        return "Stopped";
    }
    return "Running";
}

interface MapPlotProps {
    data: State,
    onPlayPause: () => void,
    onRestart: () => void,
    onBack?: () => void,
    selectedImage?: string,
    themeKey?: ScenarioThemeKey
}

const getCanvasSize = (themeKey?: ScenarioThemeKey) => {
    if (themeKey === "evacuation-prototype") {
        return { width: 742, height: 523 }; // matches evacuation-map.jpg dimensions
    }
    // Use square canvas for square images
    return { width: 600, height: 600 };
};

const zoomMax = 250;

export function SimulationMapPlot({ data, onPlayPause, onRestart, onBack, selectedImage, themeKey }: MapPlotProps) {
    if (!data) return <p>No data yet</p>;

    const paused = data.paused ?? false;
    const theme = getScenarioTheme(themeKey ?? "default-herd");

    const imageMap: { [key: string]: string } = {
        "option1": "../../img/King_Ranch_better.jpg",
        "option2": "../../img/HighResRanch.png",
        "evacuation": "../../img/evacuation-map.jpg",
    };

    const getBackgroundImage = () => {
        // First check if theme specifies an image background
        if (theme.backgroundType === "image" && theme.backgroundValue) {
            return theme.backgroundValue;
        }
        // Check if selectedImage is provided directly
        if (selectedImage && imageMap[selectedImage]) {
            return imageMap[selectedImage];
        }
        // Theme-specific defaults
        if (themeKey === "evacuation-prototype") {
            return imageMap["evacuation"];
        }
        return "../../img/HighResRanch.png";
    };

    const backgroundImage = getBackgroundImage();

    // Fixed zoom window - this is what's VISIBLE at one time
    const getZoomWindow = () => {
        if (themeKey === "evacuation-prototype") {
            // City: show 500 width (zoomed out from 400)
            return { min: 0, max: 500 };
        }
        if (themeKey === "oil-spill") {
            // Oil spill: show 300x300 at a time (zoomed out from 250)
            return { min: 0, max: 300 };
        }
        // Farm: show 300x300 at a time (zoomed out from 250)
        return { min: 0, max: 300 };
    };
    const zoomWindow = getZoomWindow();
    const currentZoomMin = zoomWindow.min;
    const currentZoomMax = zoomWindow.max;

    // World bounds - this is the TOTAL PANNABLE AREA (must be larger than zoom window for panning)
    const getWorldBounds = () => {
        if (themeKey === "evacuation-prototype") {
            // City: total area larger than visible window
            return { minX: -100, maxX: 600, minY: -50, maxY: 500 };
        }
        if (themeKey === "oil-spill") {
            // Oil spill: 0-300 simulation with padding for panning
            return { minX: -50, maxX: 400, minY: -50, maxY: 400 };
        }
        // Farm: 0-250 simulation with padding for panning
        return { minX: -50, maxX: 350, minY: -50, maxY: 350 };
    };
    const currentWorldBounds = getWorldBounds();

    // Get canvas size based on scenario to match image aspect ratios
    const canvasSize = getCanvasSize(themeKey);

    // Debug logging to diagnose coordinate system
    const windowSize = currentZoomMax - currentZoomMin;
    console.log("SimulationMapPlot - Zoom config:", {
        currentZoomMin,
        currentZoomMax,
        windowSize,
        worldBounds: currentWorldBounds,
        canvasSize
    });

    const { svgRef, scaleCoord, inverseScaleCoord } = usePan({
        data,
        zoomMin: currentZoomMin,
        zoomMax: currentZoomMax,
        scale: 1.0,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
        worldBounds: currentWorldBounds
    });

    const [choosingTargetJobId, setChoosingTargetJobId] = useState<string | null>(null);
    const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
    const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
    const [obstaclePoints, setObstaclePoints] = useState<[number, number][]>([]);
    const [obstacles, setObstacles] = useState<[number, number][][]>([]);

    // Handle target change (radius updates from JobStatus card)
    async function handleTargetChange(jobId: string, newTarget: Target) {
        try {
            await setTarget(jobId, newTarget);
            console.log('Target updated for job:', jobId, newTarget);
        } catch (error) {
            console.error('Failed to update target:', error);
            alert("Failed to update target. The job might have expired or changed.");
        }
    }

    // Map click handler
    function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());

        if (isDrawingObstacle) {
            setObstaclePoints([...obstaclePoints, [cursorpt.x, cursorpt.y]]);
            return;
        }

        if (choosingTargetJobId) {
            let worldX = inverseScaleCoord(cursorpt.x, "x");
            let worldY = inverseScaleCoord(cursorpt.y, "y");

            // Clamp to worldBounds to prevent targets outside visible area
            if (currentWorldBounds) {
                worldX = Math.max(currentWorldBounds.minX, Math.min(currentWorldBounds.maxX, worldX));
                worldY = Math.max(currentWorldBounds.minY, Math.min(currentWorldBounds.maxY, worldY));
            }

            const job = data.jobs.find(j => j.id === choosingTargetJobId);
            const currentRadius = job?.target?.type === 'circle' ? job.target.radius : 25;

            const newTarget: Target = {
                type: 'circle',
                center: [worldX, worldY],
                radius: currentRadius ?? 25
            };

            setTarget(choosingTargetJobId, newTarget)
                .then(() => console.log('Target set for job:', choosingTargetJobId))
                .catch(err => {
                    console.error('Failed to set target:', err);
                    alert("Failed to set target. The job might have expired or changed. Try restarting the scenario.");
                });

            setChoosingTargetJobId(null);
        }
    }

    // Obstacle drawing handlers
    const handleAddObstacle = () => {
        setIsDrawingObstacle(true);
        setChoosingTargetJobId(null);
        setObstaclePoints([]);
        setIsEditMenuOpen(false);
    };

    const handleFinishObstacle = () => {
        if (obstaclePoints.length >= 3) {
            const worldPoints: [number, number][] = obstaclePoints.map(([x, y]) => [
                inverseScaleCoord(x, "x"),
                inverseScaleCoord(y, "y")
            ]);
            setObstacles([...obstacles, worldPoints]);
        }
        setIsDrawingObstacle(false);
        setObstaclePoints([]);
    };

    const handleCancelObstacle = () => {
        setIsDrawingObstacle(false);
        setObstaclePoints([]);
    };

    return (
        <div className="map-container">
            {/* Job status cards - same as live farm view */}
            {data.jobs.map((job, index) =>
                <JobStatus
                    key={`job-${job.id || index}`}
                    jobName={`Job ${index + 1}`}
                    status={jobStatus(job)}
                    target={job.target}
                    droneCount={job.drones ?? 1}
                    isActive={job.is_active}
                    onSelectOnMap={() => setChoosingTargetJobId(job.id)}
                    onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                    onCancel={() => {
                        console.log('Cancel job:', job.id);
                    }}
                    onDronesChange={(newCount: number) => setJobDroneCount(job.id, newCount)}
                    onTargetChange={(newTarget: Target) => handleTargetChange(job.id, newTarget)}
                />
            )}

            {/* Drawing mode indicators */}
            {isDrawingObstacle && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #4299e1 0%, #667eea 100%)',
                    color: 'white',
                    padding: '16px 24px',
                    borderRadius: '12px',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
                    zIndex: 2000,
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center'
                }}>
                    <span style={{ fontWeight: 600 }}>
                        Click to place points ({obstaclePoints.length} placed)
                    </span>
                    {obstaclePoints.length >= 3 && (
                        <button
                            onClick={handleFinishObstacle}
                            style={{
                                background: '#48bb78',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Finish
                        </button>
                    )}
                    <button
                        onClick={handleCancelObstacle}
                        style={{
                            background: '#e53e3e',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Cancel
                    </button>
                </div>
            )}

            {choosingTargetJobId && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#48bb78',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 2000,
                    fontWeight: 600
                }}>
                    Click on map to set target location
                </div>
            )}

            <SimulationStatus data={data} />

            {onBack && (
                <button
                    className="back-btn"
                    onClick={onBack}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        left: '80px',
                        zIndex: 2000
                    }}
                >
                    ← Back
                </button>
            )}

            <div className="playback-controls">
                <button className="sim-ctrl-btn" onClick={() => onRestart()} title="Restart">
                    <span className="control-icon">↻</span>
                </button>
                <div className="edit-button-container">
                    <button id="edit-btn" onClick={() => setIsEditMenuOpen(!isEditMenuOpen)} title="Edit">
                        ✏️
                    </button>
                    {isEditMenuOpen && (
                        <div className="edit-menu">
                            <button className="edit-menu-item" onClick={handleAddObstacle}>
                                🚧 Add Obstacle
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <svg
                ref={svgRef}
                className="map"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                preserveAspectRatio="xMidYMid slice"
                onClick={handleClick}
                style={{ cursor: isDrawingObstacle ? 'crosshair' : choosingTargetJobId ? 'crosshair' : 'default' }}
            >
                <Map
                    data={data}
                    obstacles={obstacles}
                    backgroundImage={backgroundImage}
                    scaleCoord={scaleCoord}
                    theme={theme}
                    canvasWidth={canvasSize.width}
                    canvasHeight={canvasSize.height}
                    worldBounds={currentWorldBounds}
                />

                {/* Render obstacle being drawn */}
                {isDrawingObstacle && obstaclePoints.length > 0 && (
                    <>
                        <polyline
                            points={obstaclePoints.map(([x, y]) => `${x},${y}`).join(' ')}
                            fill="none"
                            stroke="#4299e1"
                            strokeWidth="2"
                            strokeDasharray="5,5"
                        />
                        {obstaclePoints.map(([x, y], i) => (
                            <circle key={`point-${i}`} cx={x} cy={y} r="4" fill="#4299e1" />
                        ))}
                    </>
                )}
            </svg>
        </div>
    );
}
