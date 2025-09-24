import ObjectMarker from "./ObjectMarker";
import map_bg from "../../img/King_Ranch_Zoom.png"
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
}


export default function MapPlot({ data, onSetTarget }: MapPlotProps) {
    //const width = 1000;
    //const height = 1000;



    if (!data) return <p>No data yet</p>;


    
    function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
        if (!e.target) {
            throw new Error("No target found for click.");        }
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;

        const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        onSetTarget({x: cursorpt.x, y: cursorpt.y});
    }
    return (
        <svg className="map"  onClick={handleClick}>
            <image href={map_bg} x={0} y={0} width="100vw" height="100vh" preserveAspectRatio="xMidYMid slice" />
            {data.flock.map((a, i) => (
                <ObjectMarker key={`animal-${i}`} type="animal" x={a[0]} y={a[1]} />
            ))}
            <ObjectMarker key={`drone-${1}`} type="drone" x={data.drone[0]} y={data.drone[1]}/>
            <ObjectMarker key={`target`} type="target" x={data.target[0]} y={data.target[1]} />

        </svg>
    );
}