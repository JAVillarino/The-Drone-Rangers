
interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number
};

export default function ObjectMarker({type, x, y}: ObjectMarkerProps) {
    switch (type) {
        case "barn":
            return <image x={x} y={y} href="../../img/barn.svg" className="barn"/>;
        case "windmill":
            return <image x={x} y={y} href="../../img/windmill.svg" className="windmill"/>;
        case "tractor":
            return <image x={x} y={y} href="../../img/tractor.svg" className="tractor"/>;
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