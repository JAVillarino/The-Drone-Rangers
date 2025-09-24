
interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number
};

export default function ObjectMarker({type, x, y}: ObjectMarkerProps) {

    switch (type) {
        case "animal":
            return <circle cx= {x} cy={y} r={5} className="animal"/>;
        case "drone":
            const size = 6;
            return (<polygon points={`${x},${y - size}, ${x - size},${y + size} ${x + size},${y + size}`} className="drone"/>);
        case "target":
            return (<image href={"../../img/map_pin_icon.png"} x={x} y={y} className="target"/>);
        default:
            return null;
    }
    
}