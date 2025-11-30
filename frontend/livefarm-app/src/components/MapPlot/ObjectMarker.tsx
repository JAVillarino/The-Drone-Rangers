interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number,
};

export default function ObjectMarker({type, x, y}: ObjectMarkerProps) {
    // Get the appropriate icon based on type
    const getIcon = () => {
        switch (type) {
            case "barn":
                return "../../img/barn.svg";
            case "windmill":
                return "../../img/windmill.svg";
            case "tractor":
                return "../../img/tractor.svg";
            case "animal":
                return "../../img/sheep-icon.svg";
            case "drone":
                return "../../img/robot-icon.svg";
            case "target":
                return "../../img/map_pin_icon.png";
            default:
                return null;
        }
    };

    const icon = getIcon();
    if (!icon) return null;
    
    return <image x={x} y={y} href={icon} className={type}/>;
}
