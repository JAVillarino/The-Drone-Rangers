import ObjectMarker from "./ObjectMarker";
import JobStatus from "./JobStatus";
import pause_btn from "../../img/pause_button.jpg"
import play_btn from "../../img/play_button.jpg"
import restart_btn from "../../img/restart_icon.png"
import { useState, useMemo, useRef, useEffect } from "react";


type LocData = [number, number];

export interface ObjectData {
    flock: LocData[],
    drones: LocData[],
    target: LocData
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

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panMode, setPanMode] = useState<"scroll" | "drag">("scroll");

    const svgRef = useRef<SVGSVGElement | null>(null);
    const dragStart = useRef<{ x: number, y: number } | null>(null);

    // Compute bounding box of all objects (to limit panning)
    const bounds = useMemo(() => {
        const xs = [...data.flock.map(f => f[0]), ...data.drones.map(f => f[0]), data.target[0]];
        const ys = [...data.flock.map(f => f[1]), ...data.drones.map(f => f[1]), data.target[1]];
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
        const padding = 50; // in px

        // convert padding from pixels → world units
        const worldPadding = (padding / CANVAS_SIZE) * windowSize;

        // expand bounds by padding
        const paddedMinX = bounds.minX - worldPadding;
        const paddedMaxX = bounds.maxX + worldPadding;
        const paddedMinY = bounds.minY - worldPadding;
        const paddedMaxY = bounds.maxY + worldPadding;

        // clamp pan so all objects remain reachable
        //const rangeX = paddedMaxX - paddedMinX;
        //const rangeY = paddedMaxY - paddedMinY;

        //const maxPanX = Math.max(0, rangeX - (zoomMax - zoomMin));
        //const maxPanY = Math.max(0, rangeY - (zoomMax - zoomMin));

        // compute allowable pan ranges per axis
        let minPanX = paddedMinX - zoomMin; // how far left we can go
        let maxPanX = paddedMaxX - zoomMax; // how far right we can go
        let minPanY = paddedMinY - zoomMin;
        let maxPanY = paddedMaxY - zoomMax;

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
        if (panMode != "scroll") return;
        const svgEl = svgRef.current;
        if(!svgEl) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const dx = e.deltaX / 20; // tweak sensitivity
            const dy = e.deltaY / 20;

            setPan((prev) => clampPan(prev.x + dx, prev.y + dy));
        };

        svgEl.addEventListener("wheel", handleWheel, { passive: false });
        return () => svgEl.removeEventListener("wheel", handleWheel);
    }, [panMode, data]);

    useEffect(() => {
        setPan((prev) => clampPan(prev.x, prev.y));
    }, []);


    useEffect(() => {
        if (panMode != "drag") return;

        const svgEl = svgRef.current;
        if (!svgEl) return;

        const handleMouseDown = (e: MouseEvent) => {
            dragStart.current = { x: e.clientX, y: e.clientY };
          };
          const handleMouseMove = (e: MouseEvent) => {
            if (!dragStart.current) return;
            const dx = -(e.clientX - dragStart.current.x) / 2;
            const dy = -(e.clientY - dragStart.current.y) / 2;
            dragStart.current = { x: e.clientX, y: e.clientY };
      
            setPan(prev => clampPan(prev.x + dx, prev.y + dy));
          };
          const handleMouseUp = () => {
            dragStart.current = null;
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

    const handleSelectOnMap = (target: { lat: number; lng: number }) => {
        console.log('Selecting on map:', target);
        alert(`Show on map: Lat ${target.lat}, Lng ${target.lng}`);
    };

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

    return (
        <div className="map-container">
            <JobStatus 
                jobId="123"
                initialStatus="ETA: 15m 42s"
                target={{ lat: 34.0522, lng: -118.2437 }}
                initialRadius={250}
                initialDrones={5}
                onSelectOnMap={() => setChoosingTarget(true)}
                onPauseToggle={handlePauseToggle}
                onCancel={handleCancel}
                onDronesChange={handleDronesChange}
            />

            <div className="plaback-controls">
                <button id="play-pause-btn" onClick={handlePause}>
                    {paused ? (<img src={play_btn}/>): (<img src={pause_btn}/>)}
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
                <ObjectMarker key={`target`} type="target" x={scaleCoord(data.target[0], "x")} y={scaleCoord(data.target[1], "y")} />

            </svg>
        </div>
    );
}