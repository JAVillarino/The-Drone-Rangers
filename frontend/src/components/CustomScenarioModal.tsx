import { useState, useRef, useEffect } from "react";
import ObjectMarker from "./ObjectMarker";
import map_bg from "../../img/King_Ranch_Zoom.png";

type DragItem = {
    type: 'animal' | 'drone' | 'target';
    index: number | null;
    offsetX: number;
    offsetY: number;
};


interface CustomScenario {
    name: string,
    seed: number,
    flockSize: number,
    sheep: [number, number][],
    shepherd: [number, number],
    target: [number, number],
    bounds: {
        xmin: number,
        xmax: number,
        ymin: number,
        ymax: number
    },
    start: boolean
    // missing: polygons (i.e. obstacles), params, 
}

type CustomScenarioModalProps = {
    onClose: () => void;
    onSubmit: (config: CustomScenario) => void;
    worldMin: number,
    worldMax: number
  };

export function CustomScenarioModal({ onClose, onSubmit, worldMax, worldMin }: CustomScenarioModalProps) {
    const [numAnimals, setNumAnimals] = useState(5);
    const [animalPositions, setAnimalPositions] = useState<[number, number][]>([]);
    const [dronePosition, setDronePosition] = useState<[number, number]>([100, 300]);
    const [targetPosition, setTargetPosition] = useState<[number, number]>([700, 300]);
    
    const dragItem = useRef<DragItem | null>(null); // { type: 'animal' | 'drone' | 'target', id: number | null, offsetX: number, offsetY: number }
    const mapRef = useRef<SVGSVGElement | null>(null);

    // Initialize animal positions when component mounts or numAnimals changes
    useEffect(() => {
        setAnimalPositions((prev) => {
            const newAnimals = Array.from({ length: numAnimals }, (_, i) => {
                // Keep existing animal if available, otherwise create a new one
                return prev[i] || [50 + (i * 30) % 200, 50 + (i * 50) % 200];
            });
            return newAnimals;
        });
    }, [numAnimals]);

    const handleMouseDown = (e: React.MouseEvent, type: "animal" | "drone" | "target", index: number | null = null) => {
        e.preventDefault();
        if (!(e.target instanceof Element)) return;

        const rect = e.target.getBoundingClientRect();
        dragItem.current = {
            type,
            index,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragItem.current || !mapRef.current) return;
        const mapRect = mapRef.current.getBoundingClientRect();
        let newX = e.clientX - mapRect.left - dragItem.current.offsetX;
        let newY = e.clientY - mapRect.top - dragItem.current.offsetY;

        // Clamp positions within the map boundaries
        newX = Math.max(0, Math.min(newX, mapRect.width - 20)); // 20 is item width
        newY = Math.max(0, Math.min(newY, mapRect.height - 20)); // 20 is item height

        const { type, index } = dragItem.current;
        if (type === 'drone') {
            setDronePosition([newX, newY]);
        } else if (type === 'target') {
            setTargetPosition([newX, newY]);
        } else if (type === 'animal') {
            setAnimalPositions((prev) => prev.map((pos, i) => (i === index ? [newX, newY] : pos)));
        }
    };

    const handleMouseUp = () => {
        dragItem.current = null;
    };
    
    const handleSubmit = () => {
        if (!mapRef.current) return;

        const mapRect = mapRef.current.getBoundingClientRect();
        
        // --- Coordinate Transformation ---
        // These values should match your MapPlot component for consistency
        
        const canvasWidth = mapRect.width;
        const canvasHeight = mapRect.height;

        const transform = (pos: [number, number]): [number, number] => {
            const worldX = (pos[0] / canvasWidth) * (worldMax - worldMin) + worldMin;
            // Note: SVG/HTML Y is top-to-bottom, simulation Y might be bottom-to-top.
            // Inverting Y axis for a more standard cartesian coordinate system.
            const worldY = ((canvasHeight - pos[1]) / canvasHeight) * (worldMax - worldMin) + worldMin;
            return [parseFloat(worldX.toFixed(2)), parseFloat(worldY.toFixed(2))];
        };
        
        const config: CustomScenario = {
            name: "Custom Scenario", // eventually change so the user can input this
            seed: 123, // eventually change?
            flockSize: numAnimals,
            sheep: animalPositions.map(transform),
            shepherd: transform(dronePosition),
            target: transform(targetPosition), 
            bounds: {
                xmin: worldMin,
                xmax: worldMax,
                ymax: worldMax,
                ymin: worldMin
            },
            start: true
        };
        
        onSubmit(config);
    };

    return (
        <div id="modal-overlay" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div id="modal-content" onClick={(e) => e.stopPropagation()}>
                <div id="modal-header">
                    <h2>Customize Scenario</h2>
                    <div id="input-group">
                        <label htmlFor="num-animals">Number of Animals: </label>
                        <input
                            id="num-animals"
                            type="number"
                            value={numAnimals}
                            onChange={(e) => setNumAnimals(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="number-input"
                            min="0"
                        />
                    </div>
                </div>
                
                <svg ref={mapRef} id="custom-map" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                    <image href={map_bg} x="0" y="0" width="100%" height="100%" />
                    {/* Render Animals */}
                    {animalPositions.map((pos, index) => (
                        <g key={`animal-${index}`} onMouseDown={(e) => handleMouseDown(e, 'animal', index)}>
                            <ObjectMarker type="animal" x={pos[0]} y={pos[1]} />
                     </g>
                    ))}
                    {/* Render Drone */}
                    <g onMouseDown={(e) => handleMouseDown(e, 'drone')}>
                        <ObjectMarker type="drone" x={dronePosition[0]} y={dronePosition[1]} />
                    </g>
                    {/* Render Target */}
                    <g onMouseDown={(e) => handleMouseDown(e, 'target')}>
                        <ObjectMarker type="target" x={targetPosition[0]} y={targetPosition[1]} />
                    </g>
                </svg>

                <div id="modal-footer">
                    <button className="modal-btn cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="modal-btn submit-btn" onClick={handleSubmit}>Submit Scenario</button>
                </div>
            </div>
        </div>
    );
}