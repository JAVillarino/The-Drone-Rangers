
interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number
};

export default function ObjectMarker({type, x, y}: ObjectMarkerProps) {
    const CANVAS_SIZE = 500;

    const worldMin = -40;
    const worldMax = 40;

    function scaleCoord(val: number, worldMin: number, worldMax: number, screenSize: number) {
        return ((val - worldMin) / (worldMax - worldMin)) * screenSize;
    }

    const sx = scaleCoord(x, worldMin, worldMax, CANVAS_SIZE);
    const sy = scaleCoord(y, worldMin, worldMax, CANVAS_SIZE);

    switch (type) {
        case "animal":
            return <circle cx= {sx} cy={sy} r={5} className="animal"/>;
        case "drone":
            const size = 6;
            return (<polygon points={`${sx},${sy - size}, ${sx - size},${sy + size} ${sx + size},${sy + size}`} className="drone"/>);
        case "target":
            return (<image href={"../../img/map_pin_icon.png"} x={sx} y={sy} className="target"/>);
        default:
            return null;
    }
    
}