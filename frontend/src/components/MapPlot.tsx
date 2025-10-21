import ObjectMarker from "./ObjectMarker";
import JobStatus from "./JobStatus";
import pause_btn from "../../img/pause_button.jpg";
import play_btn from "../../img/play_button.jpg";
import restart_btn from "../../img/restart_icon.png";
import bg_img from "../../img/King_Ranch_better.jpg";
//import menu_icon from "../../img/Hamburger_icon.svg.png";
import { useState, useMemo, useRef, useEffect } from "react";
//import ScenarioMenu from "./ScenarioMenu";


type LocData = [number, number];

export interface ObjectData {
    flock: LocData[],
    drones: LocData[],
    jobs: Array<{
        target: LocData | null,
        target_radius: number,
        remaining_time: number | null,
        is_active: boolean
    }>,
    polygons: LocData[][]
}

interface MapPlotProps {
    data: ObjectData,
    onSetTarget: (coords: {x: number, y: number}) => void
    zoomMin: number,
    zoomMax: number,
    CANVAS_SIZE: number,
    onPlayPause: () => void,
    onRestart: () => void
}


export function MapPlot({ data, onSetTarget, zoomMin, zoomMax, CANVAS_SIZE, onPlayPause, onRestart }: MapPlotProps) {
    useEffect(() => {
        console.log(data);
    }, [data]);

    if (!data) return <p>No data yet</p>;

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [paused, setPaused] = useState(false);

    //const [isMenuOpen, setIsMenuOpen] = useState(false);


    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panMode, setPanMode] = useState<"scroll" | "drag">("scroll");
    const [isPanning, setIsPanning] = useState(false);

    const svgRef = useRef<SVGSVGElement | null>(null);
    const dragStart = useRef<{ x: number, y: number } | null>(null);

    // Compute bounding box of all objects (to limit panning)
    const bounds = useMemo(() => {
        const xs = [...data.flock.map(f => f[0]), ...data.drones.map(f => f[0])];
        const ys = [...data.flock.map(f => f[1]), ...data.drones.map(f => f[1])];
        
        // Add target coordinates if they exist
        const activeJob = data.jobs.find(job => job.target !== null);
        if (activeJob && activeJob.target) {
            xs.push(activeJob.target[0]);
            ys.push(activeJob.target[1]);
        }
        
        // Add polygon coordinates if they exist
        data.polygons.forEach(polygon => {
            polygon.forEach(point => {
                xs.push(point[0]);
                ys.push(point[1]);
            });
        });
        
        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        };
    }, [data]);

    const windowSize = zoomMax - zoomMin;


    function scaleCoord(val: number, axis: "x" | "y") {
        const offset = axis === "x" ? pan.x : pan.y;
        const effectiveMin = zoomMin + offset;
        return ((val - effectiveMin) / windowSize) * CANVAS_SIZE;
    }

    const inverseScaleCoord = (val: number, axis: "x" | "y") => {
        const offset = axis === "x" ? pan.x : pan.y;
        const effectiveMin = zoomMin + offset;
        return ((val / CANVAS_SIZE) * windowSize + effectiveMin);
    }

    function clampPan(x: number, y: number) {
        const padding = 100; // Increased padding for more reachable area

        // convert padding from pixels → world units
        const worldPadding = (padding / CANVAS_SIZE) * windowSize;

        // expand bounds by padding
        const paddedMinX = bounds.minX - worldPadding;
        const paddedMaxX = bounds.maxX + worldPadding;
        const paddedMinY = bounds.minY - worldPadding;
        const paddedMaxY = bounds.maxY + worldPadding;

        // compute allowable pan ranges per axis with more generous limits
        let minPanX = paddedMinX - zoomMin - windowSize * 0.5; // Allow more left movement
        let maxPanX = paddedMaxX - zoomMax + windowSize * 0.5; // Allow more right movement
        let minPanY = paddedMinY - zoomMin - windowSize * 0.5; // Allow more up movement
        let maxPanY = paddedMaxY - zoomMax + windowSize * 0.5; // Allow more down movement

        // if padded range is smaller than viewport, center the viewport over the padded box
        if (minPanX > maxPanX) {
            const centerPanX =
            (paddedMinX + paddedMaxX) / 2 - (zoomMin + zoomMax) / 2;
            minPanX = centerPanX;
            maxPanX = centerPanX;
        }
        if (minPanY > maxPanY) {
            const centerPanY =
            (paddedMinY + paddedMaxY) / 2 - (zoomMin + zoomMax) / 2;
            minPanY = centerPanY;
            maxPanY = centerPanY;
        }

        return {
            x: clamp(x, minPanX, maxPanX),
            y: clamp(y, minPanY, maxPanY),
        }

    }

    const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

    function handlePause() {
        setPaused(!paused);
        onPlayPause();
    }

    function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
        if (!choosingTarget) {
            return;
        }
        if (!e.target) {
            throw new Error("No target found for click.");        }
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;

        const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        onSetTarget({x: inverseScaleCoord(cursorpt.x, "x"), y: inverseScaleCoord(cursorpt.y, "y")});
        setChoosingTarget(false);
    }

    useEffect(() => {
        if (!choosingTarget) return;
        const svg = svgRef.current;
        if (!svg) return;
    
        const handleMouseMove = (e: MouseEvent) => {
          const pt = svg.createSVGPoint();
          pt.x = e.clientX;
          pt.y = e.clientY;
          const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
          const x = inverseScaleCoord(cursorpt.x, "x");
          const y = inverseScaleCoord(cursorpt.y, "y");
          //setPreviewTarget([x, y]);
        };
    
        svg.addEventListener("mousemove", handleMouseMove);
        return () => svg.removeEventListener("mousemove", handleMouseMove);
      }, [choosingTarget]);
    

    useEffect(() => {
        if (panMode != "scroll") return;
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
    }, [panMode, data]);

    useEffect(() => {
        setPan((prev) => clampPan(prev.x, prev.y));
    }, []);

    // Update background position when pan changes
    useEffect(() => {
        const mapContainer = svgRef.current?.parentElement;
        if (mapContainer) {
            // Use requestAnimationFrame to smooth the background updates
            const updateBackground = () => {
                // Convert pan offset to background position
                // The background should move in the same direction as the entities
                const windowSize = zoomMax - zoomMin;
                
                // Convert pan coordinates to percentage offsets
                // When pan.x is positive (panning right), background should move right too
                const percentageOffsetX = (pan.x / windowSize) * 30; // 30% range for 200% background
                const percentageOffsetY = (pan.y / windowSize) * 35; // 35% range for 250% background
                
                // Apply the percentage offset to background position
                // Positive pan should move background in same direction
                const backgroundX = 50 + percentageOffsetX;
                const backgroundY = 50 + percentageOffsetY;
                
                mapContainer.style.backgroundPosition = `${backgroundX}% ${backgroundY}%`;
            };
            
            requestAnimationFrame(updateBackground);
        }
    }, [pan, zoomMin, zoomMax]);


    useEffect(() => {
        if (panMode != "drag") return;

        const svgEl = svgRef.current;
        if (!svgEl) return;

        const handleMouseDown = (e: MouseEvent) => {
            dragStart.current = { x: e.clientX, y: e.clientY };
            setIsPanning(true);
            // Change cursor to indicate dragging
            if (svgEl) {
                svgEl.style.cursor = 'grabbing';
            }
          };
          const handleMouseMove = (e: MouseEvent) => {
            if (!dragStart.current) return;
            const dx = -(e.clientX - dragStart.current.x) / 3; // Slower dragging
            const dy = -(e.clientY - dragStart.current.y) / 3;
            dragStart.current = { x: e.clientX, y: e.clientY };
      
            setPan(prev => clampPan(prev.x + dx, prev.y + dy));
          };
          const handleMouseUp = () => {
            dragStart.current = null;
            setIsPanning(false);
            // Reset cursor
            if (svgEl) {
                svgEl.style.cursor = panMode === 'drag' ? 'grab' : 'default';
            }
          };
      
          svgEl.addEventListener("mousedown", handleMouseDown);
          window.addEventListener("mousemove", handleMouseMove);
          window.addEventListener("mouseup", handleMouseUp);
      
          return () => {
            svgEl.removeEventListener("mousedown", handleMouseDown);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
          }
    }, [panMode, data]);

    const handlePauseToggle = (isPaused: boolean) => {
        console.log(`Job is now ${isPaused ? 'paused' : 'unpaused'}.`);
    };

    const handleCancel = () => {
        console.log('Job canceled.');
        alert('Job 123 has been canceled.');
    };

    const handleDronesChange = (newCount: number) => {
        console.log(`Drones assigned changed to: ${newCount}`);
    };

    // Check if there's an active target
    const activeJob = data.jobs.find(job => job.target !== null);
    const hasTarget = activeJob && activeJob.target !== null;

    return (
        <div className="map-container">
            <JobStatus 
                jobId="123"
                initialStatus={hasTarget ? "ETA: 15m 42s" : "No target set - Click 'Select on Map' to set target"}
                target={hasTarget ? { lat: activeJob!.target![0], lng: activeJob!.target![1] } : { lat: 0, lng: 0 }}
                initialRadius={hasTarget ? activeJob!.target_radius : 0}
                initialDrones={data.drones.length}
                onSelectOnMap={() => setChoosingTarget(true)}
                onPauseToggle={handlePauseToggle}
                onCancel={handleCancel}
                onDronesChange={handleDronesChange}
            />

            <div className="plaback-controls">
                <button id="play-pause-btn" onClick={handlePause}>
                    {!paused ? (<img src={play_btn}/>): (<img src={pause_btn}/>)}
                </button>
                <button id="restart-btn" onClick={() => onRestart()}>
                    <img src={restart_btn}/>
                </button>
            </div>

            <svg ref={svgRef} className="map"  onClick={handleClick}  >
                {/* <ObjectMarker key={`barn`} type="barn" x={scaleCoord(50, "x")} y={scaleCoord(1, "y")} />
                <ObjectMarker key={`windmill`} type="windmill" x={scaleCoord(80, "x")} y={scaleCoord(10, "y")} />
                <ObjectMarker key={`tractor`} type="tractor" x={scaleCoord(75, "x")} y={scaleCoord(40, "y")} />                 */}
                {data.flock.map((a, i) => (
                    <ObjectMarker key={`animal-${i}`} type="animal" x={scaleCoord(a[0], "x")} y={scaleCoord(a[1], "y")} />
                ))}
                {data.drones.map((d, i) => (
                    <ObjectMarker key={`drone-${i}`} type="drone" x={scaleCoord(d[0], "x")} y={scaleCoord(d[1], "y")}/>
                ))}
                {/* Render target only if it exists */}
                {(() => {
                    const activeJob = data.jobs.find(job => job.target !== null);
                    if (activeJob && activeJob.target) {
                        return (
                            <ObjectMarker 
                                key={`target`} 
                                type="target" 
                                x={scaleCoord(activeJob.target[0], "x")} 
                                y={scaleCoord(activeJob.target[1], "y")} 
                            />
                        );
                    }
                    return null;
                })()}
                
                {/* Show message when no target is set */}
                {!hasTarget && (
                    <text 
                        x={CANVAS_SIZE / 2} 
                        y={CANVAS_SIZE / 2} 
                        textAnchor="middle" 
                        dominantBaseline="middle"
                        fill="#666"
                        fontSize="16"
                        fontFamily="Arial, sans-serif"
                    >
                        No target set - Click anywhere to set target
                    </text>
                )}

            </svg>
        </div>
    );
}