import SimulationStatus from "./SimulationStatus.tsx";
import { useState } from "react";
import { Job, State } from "../types.ts"
import { Map, usePan } from "./UsePan.tsx";
import JobStatus from './JobStatus.tsx';
import { setJobActiveState, setJobDroneCount } from '../api/state.ts';

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
    onSetTarget?: (coords: {x: number, y: number}) => void,
    onPlayPause: () => void,
    onRestart: () => void,
    onBack?: () => void,
    selectedImage?: string
}

const CANVAS_SIZE = 600;

const zoomMin = 0;
const zoomMax = 250;


export function SimulationMapPlot({ data, onPlayPause, onRestart, onBack, selectedImage }: MapPlotProps) {
    if (!data) return <p>No data yet</p>;
    const paused = data.paused ?? false;

    // Map selected image IDs to actual image paths
    const imageMap: { [key: string]: string } = {
        "option1": "../../img/King_Ranch_better.jpg",
        "option2": "../../img/HighResRanch.png"
    };

    // Get the background image path, default to HighResRanch if no selection
    const backgroundImage = selectedImage && imageMap[selectedImage] ? imageMap[selectedImage] : "../../img/HighResRanch.png";

    const { svgRef, scaleCoord, inverseScaleCoord } = usePan({ data, zoomMin, zoomMax, scale: 0.7, canvasSize: CANVAS_SIZE });

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
    const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
    const [obstaclePoints, setObstaclePoints] = useState<[number, number][]>([]);
    const [obstacles, setObstacles] = useState<[number, number][][]>([]);

    async function handlePause() {
        try {
            onPlayPause();
        } catch (error) {
            console.error("Error toggling pause state:", error);
        }
    }

    const handleEditClick = () => {
        setIsEditMenuOpen(!isEditMenuOpen);
    };

    const handleAddObstacle = () => {
        console.log('Add obstacle clicked');
        setIsDrawingObstacle(true);
        setChoosingTarget(false);
        setObstaclePoints([]);
        setIsEditMenuOpen(false);
    };

    const handleFinishObstacle = () => {
        if (obstaclePoints.length >= 3) {
            // Convert screen coordinates to world coordinates
            const worldPoints: [number, number][] = obstaclePoints.map(([x, y]) => [
                inverseScaleCoord(x, "x"),
                inverseScaleCoord(y, "y")
            ]);
            setObstacles([...obstacles, worldPoints]);
            console.log('Obstacle created with points:', worldPoints);
        }
        setIsDrawingObstacle(false);
        setObstaclePoints([]);
    };
    const handleCancelJob = () => {
        // TODO: Send cancel request to backend
        console.log('Job canceled.');
        alert('Job 123 has been canceled.');
      };

    const handleCancelObstacle = () => {
        setIsDrawingObstacle(false);
        setObstaclePoints([]);
    };

    function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());

        if (isDrawingObstacle) {
            // Add point to obstacle polygon
            setObstaclePoints([...obstaclePoints, [cursorpt.x, cursorpt.y]]);
            return;
        }
    }

    return (
        <div className="map-container">  
            {data.jobs.map((job, index) => 
                <JobStatus 
                    key={`job-${job.id || index}`}
                    jobName="123"
                    status={jobStatus(job)}
                    target={job.target}
                    initialDrones={1}
                    isActive={job.is_active}
                    onSelectOnMap={() => setChoosingTarget(true)}
                    onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                    onCancel={handleCancelJob}
                    onDronesChange={(newCount: number) => setJobDroneCount(job.id, newCount)}
                />
            )}         
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

            {choosingTarget && (
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
                <button className="sim-ctrl-btn" onClick={handlePause} title={paused ? "Play" : "Pause"}>
                    <span className="control-icon">{paused ? "▶" : "⏸"}</span>
                </button>
                <button className="sim-ctrl-btn" onClick={() => onRestart()} title="Restart">
                    <span className="control-icon">↻</span>
                </button>
                <div className="edit-button-container">
                    <button id="edit-btn" onClick={handleEditClick} title="Edit">
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
                style={{ cursor: isDrawingObstacle ? 'crosshair' : choosingTarget ? 'crosshair' : 'default' }}
            >
                <Map data={data} obstacles={obstacles} backgroundImage={backgroundImage} scaleCoord={scaleCoord} />

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
                            <circle
                                key={`point-${i}`}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="#4299e1"
                            />
                        ))}
                    </>
                )}

            </svg>
        </div>
    );
}