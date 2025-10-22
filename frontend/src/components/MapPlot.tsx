import ObjectMarker from "./ObjectMarker";
import JobStatus from "./JobStatus";
import pause_btn from "../../img/pause_button.jpg";
import play_btn from "../../img/play_button.jpg";
import restart_btn from "../../img/restart_icon.png";
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
    onRestart: () => void
}


export function MapPlot({ data, onSetTarget, zoomMin, zoomMax, CANVAS_SIZE, onPlayPause, onRestart }: MapPlotProps) {
    if (!data) return <p>No data yet</p>;
    const paused = data.paused ?? false;

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });

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
            

            <div className="playback-controls">
                <button id="play-pause-btn" onClick={handlePause}>
                    {paused ? (<img src={play_btn}/>): (<img src={pause_btn}/>)}
                </button>
                <button id="restart-btn" onClick={() => onRestart()}>
                    <img src={restart_btn}/>
                </button>
            </div>

            <svg ref={svgRef} className="map"  onClick={handleClick}  >
                <image x={scaleCoord(-500, "x")} y={scaleCoord(-350, "y")} href="../../img/HighResRanch.png" className="background"/>
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