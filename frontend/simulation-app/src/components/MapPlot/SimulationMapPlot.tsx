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

const CANVAS_SIZE = 600;
const zoomMin = 0;
const zoomMax = 250;

export function SimulationMapPlot({ data, onPlayPause, onRestart, onBack, selectedImage, themeKey }: MapPlotProps) {
    if (!data) return <p>No data yet</p>;
    
    const paused = data.paused ?? false;
    const theme = getScenarioTheme(themeKey ?? "default-herd");

    const imageMap: { [key: string]: string } = {
        "option1": "../../img/King_Ranch_better.jpg",
        "option2": "../../img/HighResRanch.png",
        "evacuation": "../../img/HighResRanch.png",
    };

    const getBackgroundImage = () => {
        if (theme.backgroundType === "image" && theme.backgroundValue) {
            return theme.backgroundValue;
        }
        if (selectedImage && imageMap[selectedImage]) {
            return imageMap[selectedImage];
        }
        if (themeKey === "evacuation-prototype") {
            return imageMap["evacuation"] || "../../img/HighResRanch.png";
        }
        return "../../img/HighResRanch.png";
    };
    
    const backgroundImage = getBackgroundImage();

    const { svgRef, scaleCoord, inverseScaleCoord } = usePan({ data, zoomMin, zoomMax, scale: 0.7, canvasSize: CANVAS_SIZE });

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
            const worldX = inverseScaleCoord(cursorpt.x, "x");
            const worldY = inverseScaleCoord(cursorpt.y, "y");
            
            const job = data.jobs.find(j => j.id === choosingTargetJobId);
            const currentRadius = job?.target?.type === 'circle' ? job.target.radius : 25;
            
            const newTarget: Target = {
                type: 'circle',
                center: [worldX, worldY],
                radius: currentRadius ?? 25
            };
            
            setTarget(choosingTargetJobId, newTarget)
                .then(() => console.log('Target set for job:', choosingTargetJobId))
                .catch(err => console.error('Failed to set target:', err));
            
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
                <button className="sim-ctrl-btn" onClick={onPlayPause} title={paused ? "Play" : "Pause"}>
                    <span className="control-icon">{paused ? "▶" : "⏸"}</span>
                </button>
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
                onClick={handleClick}
                style={{ cursor: isDrawingObstacle ? 'crosshair' : choosingTargetJobId ? 'crosshair' : 'default' }}
            >
                <Map data={data} obstacles={obstacles} backgroundImage={backgroundImage} scaleCoord={scaleCoord} theme={theme} />

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
