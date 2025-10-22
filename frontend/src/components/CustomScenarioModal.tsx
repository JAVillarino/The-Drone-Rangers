import { useState, useRef, useEffect } from "react";
import ObjectMarker from "./ObjectMarker";
import map_bg from "../../img/King_Ranch_better.jpg";

type DragItem = {
    type: 'animal' | 'drone' | 'target';
    index: number | null;
    offsetX: number;
    offsetY: number;
    updateTimeout?: number;
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
    const [dronePosition, setDronePosition] = useState<[number, number]>([200, 200]);
    const [targetPosition, setTargetPosition] = useState<[number, number]>([400, 200]);
    
    const dragItem = useRef<DragItem | null>(null); // { type: 'animal' | 'drone' | 'target', id: number | null, offsetX: number, offsetY: number }
    const mapRef = useRef<SVGSVGElement | null>(null);

    // Initialize animal positions when component mounts or numAnimals changes
    useEffect(() => {
        setAnimalPositions((prev) => {
            const newAnimals = Array.from({ length: numAnimals }, (_, i) => {
                // Keep existing animal if available, otherwise create a new one within background bounds
                if (prev[i] !== undefined) return prev[i];
                // Place animals in a grid pattern within the background image area
                const cols = Math.ceil(Math.sqrt(numAnimals));
                const spacing = 80;
                const startX = 100;
                const startY = 100;
                const x = startX + (i % cols) * spacing;
                const y = startY + Math.floor(i / cols) * spacing;
                return [x, y] as [number, number];
            });
            return newAnimals;
        });
    }, [numAnimals]);

    // Cleanup global event listeners on unmount
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent, type: "animal" | "drone" | "target", index: number | null = null) => {
        e.preventDefault();
        e.stopPropagation();
        if (!mapRef.current) return;

        const mapRect = mapRef.current.getBoundingClientRect();
        const currentPos = type === 'drone' ? dronePosition : 
                          type === 'target' ? targetPosition : 
                          animalPositions[index!];
        
        dragItem.current = {
            type,
            index,
            offsetX: e.clientX - mapRect.left - currentPos[0],
            offsetY: e.clientY - mapRect.top - currentPos[1],
        };

        // Add global mouse event listeners for better performance
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!dragItem.current || !mapRef.current) return;
        
        const mapRect = mapRef.current.getBoundingClientRect();
        let newX = e.clientX - mapRect.left - dragItem.current.offsetX;
        let newY = e.clientY - mapRect.top - dragItem.current.offsetY;

        // No bounds constraints - entities can be placed anywhere
        // newX and newY are used directly without clamping

        const { type } = dragItem.current;
        
        // Immediate visual update using direct DOM manipulation
        const entityElement = mapRef.current.querySelector(`[data-entity-type="${type}"][data-entity-index="null"]`);
        if (entityElement) {
            entityElement.setAttribute('transform', `translate(${newX}, ${newY})`);
        }
        
        // Throttled React state update for data consistency
        if (!dragItem.current.updateTimeout) {
            dragItem.current.updateTimeout = setTimeout(() => {
                if (dragItem.current) {
                    const { type, index } = dragItem.current;
                    if (type === 'drone') {
                        setDronePosition([newX, newY]);
                    } else if (type === 'target') {
                        setTargetPosition([newX, newY]);
                    } else if (type === 'animal') {
                        setAnimalPositions((prev) => prev.map((pos, i) => (i === index ? [newX, newY] : pos)));
                    }
                    dragItem.current.updateTimeout = undefined;
                }
            }, 16); // Update React state every 16ms (60fps)
        }
    };

    const handleGlobalMouseUp = () => {
        if (dragItem.current?.updateTimeout) {
            clearTimeout(dragItem.current.updateTimeout);
        }
        dragItem.current = null;
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    const handleMouseUp = () => {
        handleGlobalMouseUp();
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
        <div id="modal-overlay" onMouseUp={handleMouseUp}>
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
                
                <svg ref={mapRef} id="custom-map">
                    <image href={map_bg} x="0" y="0" width="100%" height="100%" />
                    {/* Render Animals */}
                    {animalPositions.map((pos, index) => (
                        <g key={`animal-${index}`} onMouseDown={(e) => handleMouseDown(e, 'animal', index)} className="entity-marker" data-entity-type="animal" data-entity-index={null}>
                            <ObjectMarker type="animal" x={pos[0]} y={pos[1]} />
                     </g>
                    ))}
                    {/* Render Drone */}
                    <g onMouseDown={(e) => handleMouseDown(e, 'drone')} className="entity-marker" data-entity-type="drone" data-entity-index={null}>
                        <ObjectMarker type="drone" x={dronePosition[0]} y={dronePosition[1]} />
                    </g>
                    {/* Render Target */}
                    <g onMouseDown={(e) => handleMouseDown(e, 'target')} className="entity-marker" data-entity-type="target" data-entity-index={null}>
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