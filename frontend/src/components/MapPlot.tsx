import ObjectMarker from "./ObjectMarker";
import map_bg from "../../img/King_Ranch_Zoom.png"
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
    CANVAS_SIZE: number
}


export default function MapPlot({ data, onSetTarget, zoomMin, zoomMax, CANVAS_SIZE }: MapPlotProps) {
    //const width = 1000;
    //const height = 1000;
    if (!data) return <p>No data yet</p>;

    const [choosingTarget, setChoosingTarget] = useState(false);

    function scaleCoord(val: number) {
        return ((val - zoomMin) / (zoomMax - zoomMin)) * CANVAS_SIZE;
    }

    const inverseScaleCoord = (val: number) =>
        (val / CANVAS_SIZE) * (zoomMax - zoomMin) + zoomMin;
    
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
            <svg className="map"  onClick={handleClick}>
                <image href={map_bg} x={0} y={0} width="100vw" height="100vh" preserveAspectRatio="xMidYMid slice" />
                {data.flock.map((a, i) => (
                    <ObjectMarker key={`animal-${i}`} type="animal" x={scaleCoord(a[0])} y={scaleCoord(a[1])} />
                ))}
                <ObjectMarker key={`drone-${1}`} type="drone" x={scaleCoord(data.drone[0])} y={scaleCoord(data.drone[1])}/>
                <ObjectMarker key={`target`} type="target" x={scaleCoord(data.target[0])} y={scaleCoord(data.target[1])} />

            </svg>
        </div>
    );
}