import ObjectMarker from "./ObjectMarker";
import map_bg from "../../img/King_Ranch_Zoom.png"
import pause_btn from "../../img/pause_button.jpg"
import play_btn from "../../img/play_button.jpg"
import { useState } from "react";
/*interface ObjectData {
    id: number,
    x: number,
    y: number
}

interface ObjectsData {
    animals: ObjectData[],
    drones: ObjectData[],
    target: ObjectData;
}*/

type LocData = [number, number];

interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
}

interface MapPlotProps {
    data: ObjectData,
    onSetTarget: (coords: {x: number, y: number}) => void
    zoomMin: number,
    zoomMax: number,
    CANVAS_SIZE: number,
    onPlayPause: () => void
}


export default function MapPlot({ data, onSetTarget, zoomMin, zoomMax, CANVAS_SIZE, onPlayPause }: MapPlotProps) {
    //const width = 1000;
    //const height = 1000;
    if (!data) return <p>No data yet</p>;

    const [choosingTarget, setChoosingTarget] = useState(false);
    const [paused, setPaused] = useState(false);

    function scaleCoord(val: number) {
        return ((val - zoomMin) / (zoomMax - zoomMin)) * CANVAS_SIZE;
    }

    const inverseScaleCoord = (val: number) =>
        (val / CANVAS_SIZE) * (zoomMax - zoomMin) + zoomMin;

    function handlePause() {
        setPaused(!paused);
        onPlayPause();
    }
    
    function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
        if (!e.target) {
            throw new Error("No target found for click.");        }
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;

        const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        onSetTarget({x: inverseScaleCoord(cursorpt.x), y: inverseScaleCoord(cursorpt.y)});
        setChoosingTarget(false);
    }
    return (
        <div className="map-container">
            <button id="choose-target-btn" onClick={() => setChoosingTarget(true)}>
                {choosingTarget ? "Click target location on map." : "Choose Target"}
            </button>
            <button id="play-pause-btn" onClick={handlePause}>
                {paused ? (<img src={play_btn}/>): (<img src={pause_btn}/>)}
            </button>
            <svg className="map"  onClick={handleClick}>
                {data.flock.map((a, i) => (
                    <ObjectMarker key={`animal-${i}`} type="animal" x={scaleCoord(a[0])} y={scaleCoord(a[1])} />
                ))}
                <ObjectMarker key={`drone-${1}`} type="drone" x={scaleCoord(data.drone[0])} y={scaleCoord(data.drone[1])}/>
                <ObjectMarker key={`target`} type="target" x={scaleCoord(data.target[0])} y={scaleCoord(data.target[1])} />

            </svg>
        </div>
    );
}