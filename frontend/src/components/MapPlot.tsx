import ObjectMarker from "./ObjectMarker";
import JobStatus from "./JobStatus";
import SimulationStatus from "./SimulationStatus";
import { useState, useMemo, useRef, useEffect } from "react";
import { Job, State } from "../types.ts"
import { setJobActiveState, setJobDroneCount } from "../api/state.ts";

interface MapPlotProps {
    data: State,
    onSetTarget: (coords: {x: number, y: number}) => void
    zoomMin: number,
    zoomMax: number,
    CANVAS_SIZE: number,
    onPlayPause: () => void,
    onRestart: () => void,
    onBack?: () => void,
    selectedImage?: string
}


export function MapPlot({ data, onSetTarget, zoomMin, zoomMax, CANVAS_SIZE, onPlayPause, onRestart, onBack, selectedImage }: MapPlotProps) {
    if (!data) return <p>No data yet</p>;
    const paused = data.paused ?? false;

    // Map selected image IDs to actual image paths
    const imageMap: { [key: string]: string } = {
        "option1": "../../img/King_Ranch_better.jpg",
        "option2": "../../img/HighResRanch.png"
    };

    // Get the background image path, default to HighResRanch if no selection
    const backgroundImage = selectedImage && imageMap[selectedImage] ? imageMap[selectedImage] : "../../img/HighResRanch.png";

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
    const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
    const [obstaclePoints, setObstaclePoints] = useState<[number, number][]>([]);
    const [obstacles, setObstacles] = useState<[number, number][][]>([]);

    const svgRef = useRef<SVGSVGElement | null>(null);

    // Compute bounding box of all objects (to limit panning)
    const bounds = useMemo(() => {
        const xs = [...data.flock.map(f => f[0]), ...data.drones.map(f => f[0])];
        const ys = [...data.flock.map(f => f[1]), ...data.drones.map(f => f[1])];

        xs.push(...data.jobs.flatMap(({ target }) => target == null ? [] : [target[0]]))
        ys.push(...data.jobs.flatMap(({ target }) => target == null ? [] : [target[1]]))

        // If no entities, use default bounds
        if (xs.length === 0 || ys.length === 0) {
            return {
                minX: zoomMin,
                maxX: zoomMax,
                minY: zoomMin,
                maxY: zoomMax,
            };
        }

        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        };
    }, [data, zoomMin, zoomMax]);

    const windowSize = zoomMax - zoomMin;
    const scale = 0.7;

    // Converts into canvas units.
    function scaleCoord(val: number, axis: "x" | "y") {
        const offset = axis === "x" ? pan.x : pan.y;
        const effectiveMin = zoomMin + offset;
        return ((val - effectiveMin) / windowSize) * CANVAS_SIZE * scale;
    }

    const inverseScaleCoord = (val: number, axis: "x" | "y") => {
        const offset = axis === "x" ? pan.x : pan.y;
        const effectiveMin = zoomMin + offset;
        return ((val / (CANVAS_SIZE * scale)) * windowSize + effectiveMin);
    }

    function clampPan(x: number, y: number) {
        if (!svgRef.current) {
            return { x, y }
        }

        const xPadding = (svgRef.current.getBoundingClientRect().right - svgRef.current.getBoundingClientRect().left) / 2 + 50;
        const yPadding = (svgRef.current.getBoundingClientRect().bottom - svgRef.current.getBoundingClientRect().top) / 2 + 50;

        y = Math.max(y, bounds.minY - (svgRef.current.getBoundingClientRect().top + yPadding) / CANVAS_SIZE / scale * windowSize);
        y = Math.min(y, bounds.maxY - (svgRef.current.getBoundingClientRect().bottom - yPadding) / CANVAS_SIZE / scale * windowSize);

        x = Math.max(x, bounds.minX - (svgRef.current.getBoundingClientRect().left + xPadding) / CANVAS_SIZE / scale * windowSize);
        x = Math.min(x, bounds.maxX - (svgRef.current.getBoundingClientRect().right - xPadding) / CANVAS_SIZE / scale * windowSize);
        
        return { x, y };
    }

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

        if (choosingTarget) {
            if (!e.target) {
                throw new Error("No target found for click.");
            }
            onSetTarget({x: inverseScaleCoord(cursorpt.x, "x"), y: inverseScaleCoord(cursorpt.y, "y")});
            setChoosingTarget(false);
            return;
        }
    }

    useEffect(() => {
        const svgEl = svgRef.current;
        if(!svgEl) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            // Slower, smoother scrolling
            const sensitivity = 0.2; // Reduced from 0.5 to 0.2
            const dx = e.deltaX * sensitivity;
            const dy = e.deltaY * sensitivity;

            setPan((prev) => clampPan(prev.x + dx, prev.y + dy));
        };

        svgEl.addEventListener("wheel", handleWheel, { passive: false });
        return () => svgEl.removeEventListener("wheel", handleWheel);
    }, [data]);

    useEffect(() => {
        setPan((prev) => clampPan(prev.x, prev.y));
    }, []);

    const handleCancel = () => {
        console.log('Job canceled.');
        alert('Job 123 has been canceled.');
    };

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
        
        return "In progress"
    }

    return (
        <div className="map-container">
            {data.jobs.map((job, index) => 
                <JobStatus 
                    key={`job-${job.id || index}`}
                    jobName="123"
                    status={jobStatus(job)}
                    target={job.target}
                    initialRadius={job.target_radius}
                    initialDrones={1}
                    isActive={job.is_active}
                    onSelectOnMap={() => setChoosingTarget(true)}
                    onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                    onCancel={handleCancel}
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
                <image x={scaleCoord(-500, "x")} y={scaleCoord(-350, "y")} href={backgroundImage} className="background"/>
                
                {/* Render completed obstacles */}
                {obstacles.map((obstacle, i) => (
                    <polygon
                        key={`obstacle-${i}`}
                        points={obstacle.map(([x, y]) => `${scaleCoord(x, "x")},${scaleCoord(y, "y")}`).join(' ')}
                        fill="rgba(139, 69, 19, 0.6)"
                        stroke="#8B4513"
                        strokeWidth="2"
                    />
                ))}

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

                {data.flock.map((a, i) => (
                    <ObjectMarker key={`animal-${i}`} type="animal" x={scaleCoord(a[0], "x")} y={scaleCoord(a[1], "y")} />
                ))}
                {data.drones.map((d, i) => (
                    <ObjectMarker key={`drone-${i}`} type="drone" x={scaleCoord(d[0], "x")} y={scaleCoord(d[1], "y")}/>
                ))}

                {data.jobs.map((job, i) => job.target == null ? null :
                    <ObjectMarker key={`target-${i}`} type="target" x={scaleCoord(job.target[0], "x")} y={scaleCoord(job.target[1], "y")} />
                )}

            </svg>
        </div>
    );
}