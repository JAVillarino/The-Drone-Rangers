interface ObjectMarkerProps {
    type: string,
    x: number,
    y: number,
    fillColor?: string,
    strokeColor?: string,
    /** Icon set: "herding" (sheep/drones), "evacuation" (people/guides), or "oil" (oil/boats) */
    iconSet?: "herding" | "evacuation" | "oil"
};

export default function ObjectMarker({ type, x, y, iconSet = "herding" }: ObjectMarkerProps) {
    // Get the appropriate icon based on type and icon set
    const getIcon = () => {
        switch (type) {
            case "barn":
                return "../../img/barn.svg";
            case "windmill":
                return "../../img/windmill.svg";
            case "tractor":
                return "../../img/tractor.svg";
            case "animal":
                // Switch between sheep (herding), person (evacuation), and oil (cleanup)
                if (iconSet === "evacuation") return "../../img/person-icon.svg";
                if (iconSet === "oil") return "../../img/oil-icon.svg";
                return "../../img/sheep-icon.svg";
            case "drone":
                // Use robot icon for both (guides in evacuation are also robots/drones)
                // For oil spill, use boat icon if available, otherwise robot
                return "../../img/robot-icon.svg";
            case "target":
                // Use map pin for both (exit point in evacuation is still a target)
                return "../../img/map_pin_icon.png";
            default:
                return null;
        }
    };

    const icon = getIcon();
    if (!icon) return null;

    return <image x={x} y={y} href={icon} className={type} />;
}
