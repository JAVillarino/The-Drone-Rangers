
interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number
};

export default function ObjectMarker({type, x, y}: ObjectMarkerProps) {
    switch (type) {
        case "animal":
            return <image x={x} y={y} href="../../img/sheep-icon.svg" className="animal"/>;
        case "drone":
            return <image x={x} y={y} href="../../img/robot-icon.svg" className="drone"/>;
        case "target":
            return (<image href={"../../img/map_pin_icon.png"} x={x} y={y} className="target"/>);
        default:
            return null;
    }
    
}