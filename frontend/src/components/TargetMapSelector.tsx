import React, { useState, useRef } from 'react';
import ObjectMarker from './ObjectMarker';

interface TargetMapSelectorProps {
  backgroundImage: string;
  worldMin: number;
  worldMax: number;
  onTargetSelect: (coords: [number, number]) => void;
  initialTarget?: [number, number];
}

export default function TargetMapSelector({
  backgroundImage,
  worldMin,
  worldMax,
  onTargetSelect,
  initialTarget
}: TargetMapSelectorProps) {
  const [targetPos, setTargetPos] = useState<[number, number] | null>(initialTarget || null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    // Get SVG dimensions
    const svgRect = svg.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    
    // Transform SVG coordinates to world coordinates
    // Similar to CustomScenarioModal transformation
    const worldX = (cursorpt.x / svgWidth) * (worldMax - worldMin) + worldMin;
    // Invert Y axis (SVG Y is top-to-bottom, world Y is bottom-to-top)
    const worldY = ((svgHeight - cursorpt.y) / svgHeight) * (worldMax - worldMin) + worldMin;
    
    const worldCoords: [number, number] = [
      parseFloat(worldX.toFixed(2)),
      parseFloat(worldY.toFixed(2))
    ];
    
    setTargetPos([cursorpt.x, cursorpt.y]); // Store SVG coordinates for display
    onTargetSelect(worldCoords);
  };

  return (
    <div className="target-map-selector">
      <p className="target-map-instructions">Click on the map to set target location</p>
      <svg
        ref={svgRef}
        onClick={handleMapClick}
        style={{ cursor: 'crosshair', width: '100%', height: '400px', border: '1px solid #ccc', borderRadius: '8px' }}
      >
        <image href={backgroundImage} x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" />
        {targetPos && (
          <ObjectMarker
            type="target"
            x={targetPos[0]}
            y={targetPos[1]}
          />
        )}
      </svg>
    </div>
  );
}
