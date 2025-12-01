import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { State } from "../../types";
import ObjectMarker from "./ObjectMarker.tsx";
import TargetMarker from "./TargetMarker.tsx";

interface UsePanArgs {
  data: State;
  zoomMin: number;
  zoomMax: number;
  scale: number;
  canvasSize: number;
}

export function usePan({ data, zoomMin, zoomMax, scale, canvasSize }: UsePanArgs) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bounds = useMemo(() => {
    const xs = [...data.flock.map(f => f[0]), ...data.drones.map(f => f[0])];
    const ys = [...data.flock.map(f => f[1]), ...data.drones.map(f => f[1])];
    xs.push(...data.jobs
      .filter(j => j.status !== 'cancelled')
      .flatMap(j => j.target && j.target.type === "circle" ? [j.target.center[0]] : []));
    ys.push(...data.jobs
      .filter(j => j.status !== 'cancelled')
      .flatMap(j => j.target && j.target.type === "circle" ? [j.target.center[1]] : []));

    return {
      minX: xs.length ? Math.min(...xs) : zoomMin,
      maxX: xs.length ? Math.max(...xs) : zoomMax,
      minY: ys.length ? Math.min(...ys) : zoomMin,
      maxY: ys.length ? Math.max(...ys) : zoomMax,
    };
  }, [data, zoomMin, zoomMax]);

  const windowSize = zoomMax - zoomMin;

  const clampPan = useCallback((x: number, y: number) => {
    if (!svgRef.current) return { x, y };
    const rect = svgRef.current.getBoundingClientRect();
    const xPad = rect.width / 2 + 50;
    const yPad = rect.height / 2 + 50;

    y = Math.max(y, bounds.minY - (rect.top + yPad) / canvasSize / scale * windowSize);
    y = Math.min(y, bounds.maxY - (rect.bottom - yPad) / canvasSize / scale * windowSize);
    x = Math.max(x, bounds.minX - (rect.left + xPad) / canvasSize / scale * windowSize);
    x = Math.min(x, bounds.maxX - (rect.right - xPad) / canvasSize / scale * windowSize);
    return { x, y };
  }, [bounds, canvasSize, scale, windowSize]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sensitivity = 0.2;
      setPan(prev => clampPan(prev.x + e.deltaX * sensitivity, prev.y + e.deltaY * sensitivity));
    };

    svgEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => svgEl.removeEventListener("wheel", handleWheel);
  }, [clampPan]);

  useEffect(() => {
    setPan((prev) => clampPan(prev.x, prev.y));
  }, []);

  const scaleCoord = useCallback(
    (val: number, axis: "x" | "y") => {
      const offset = axis === "x" ? pan.x : pan.y;
      const effectiveMin = zoomMin + offset;
      return ((val - effectiveMin) / windowSize) * canvasSize * scale;
    },
    [pan, zoomMin, windowSize, canvasSize, scale]
  );

  const inverseScaleCoord = (val: number, axis: "x" | "y") => {
    const offset = axis === "x" ? pan.x : pan.y;
    const effectiveMin = zoomMin + offset;
    return ((val / (canvasSize * scale)) * windowSize + effectiveMin);
  }

  return { pan, setPan, svgRef, scaleCoord, inverseScaleCoord };
}

// Fixed colors for the live farm view (no theming)
const COLORS = {
  agentFill: "#ffffff",
  agentStroke: "#333333",
  controllerFill: "#4299e1",
  controllerStroke: "#2b6cb0",
  targetColor: "rgba(0, 142, 255, 0.8)",
  targetFillColor: "rgba(0, 142, 255, 0.2)",
  polygonTargetColor: "rgba(255, 165, 0, 0.9)",
  polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
  obstacleColor: "#8B4513",
  obstacleFillColor: "rgba(139, 69, 19, 0.6)",
};

interface RenderArgs {
  data: State;
  obstacles: number[][][];
  backgroundImage: string;
  scaleCoord: (val: number, axis: "x" | "y") => number;
}

export function Map(props: RenderArgs) {
  // Safety check: return null if props or data is not available
  if (!props || !props.data || !props.data.flock || !props.data.drones || !props.data.jobs) {
    return null;
  }

  const { data, obstacles, backgroundImage, scaleCoord } = props;
  
  // Combine backend obstacles (data.polygons) with locally drawn obstacles
  const allObstacles = [...(data.polygons || []), ...obstacles];

  return (
    <>
      <image x={scaleCoord(-500, "x")} y={scaleCoord(-350, "y")} href={backgroundImage} className="background" />

      {allObstacles.map((obstacle, i) => (
        <polygon
          key={`obstacle-${i}`}
          points={obstacle.map(([x, y]) => `${scaleCoord(x, "x")},${scaleCoord(y, "y")}`).join(" ")}
          fill={COLORS.obstacleFillColor}
          stroke={COLORS.obstacleColor}
          strokeWidth="2"
        />
      ))}

      {data.flock.map((a, i) => (
        <ObjectMarker 
          key={`animal-${i}`} 
          type="animal" 
          x={scaleCoord(a[0], "x")} 
          y={scaleCoord(a[1], "y")}
        />
      ))}
      {data.drones.map((d, i) => (
        <ObjectMarker 
          key={`drone-${i}`} 
          type="drone" 
          x={scaleCoord(d[0], "x")} 
          y={scaleCoord(d[1], "y")}
        />
      ))}
      {(() => {
        // Filter out cancelled jobs
        const activeJobs = data.jobs.filter(j => j.status !== 'cancelled');
        
        // Determine which job is active (only one can be active at a time)
        const activeJob = activeJobs.find(j => j.is_active && j.target);
        
        // Calculate queue order for immediate jobs (sorted by created_at)
        const immediateJobs = activeJobs
          .filter(j => !j.start_at && j.target) // Immediate jobs (no start_at)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        // Use a plain object instead of Map to avoid naming conflict with Map component
        const immediateJobIndices: Record<string, number> = {};
        immediateJobs.forEach((job, index) => {
          immediateJobIndices[job.id] = index;
        });

        return activeJobs.map((job, i) => {
            if (!job.target) {
              return null;
            }

          const isActive = activeJob?.id === job.id;
          const immediateJobIndex = immediateJobIndices[job.id];

          if (job.target.type === "circle") {
            const centerX = scaleCoord(job.target.center[0], "x");
            const centerY = scaleCoord(job.target.center[1], "y");
            const hasRadius = typeof job.target.radius === "number" && job.target.radius > 0;
            const radiusPx = hasRadius
              ? Math.abs(scaleCoord(job.target.center[0] + (job.target.radius ?? 0), "x") - centerX)
              : 0;

            return (
              <g key={`target-${i}`}>
                {/* Render circle first so it appears behind the icon */}
                {hasRadius && isActive && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={radiusPx}
                    fill={COLORS.targetFillColor}
                    stroke={COLORS.targetColor}
                    strokeWidth="2"
                  />
                )}
                {hasRadius && !isActive && (
                  <circle
                    cx={centerX}
                    cy={centerY}
                    r={radiusPx}
                    fill="rgba(128, 128, 128, 0.1)"
                    stroke="rgba(128, 128, 128, 0.4)"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                )}
                {/* Render icon on top, centered at the same coordinates */}
                <TargetMarker
                  x={centerX}
                  y={centerY}
                  isActive={isActive}
                  job={job}
                  immediateJobIndex={immediateJobIndex}
                />
              </g>
            );
          }

          if (job.target.type === "polygon") {
            const points = job.target.points
              .map(([x, y]) => `${scaleCoord(x, "x")},${scaleCoord(y, "y")}`)
              .join(" ");

            if (!points) {
              return null;
            }

            const [firstX, firstY] = job.target.points[0];

            return (
              <g key={`target-${i}`}>
                {/* Render polygon first so it appears behind the icon */}
                <polygon
                  points={points}
                  fill={isActive ? COLORS.polygonTargetFillColor : "rgba(128, 128, 128, 0.1)"}
                  stroke={isActive ? COLORS.polygonTargetColor : "rgba(128, 128, 128, 0.4)"}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeDasharray={isActive ? "none" : "4,4"}
                />
                {/* Render icon on top, centered at the first point of the polygon */}
                <TargetMarker
                  x={scaleCoord(firstX, "x")}
                  y={scaleCoord(firstY, "y")}
                  isActive={isActive}
                  job={job}
                  immediateJobIndex={immediateJobIndex}
                />
              </g>
            );
          }

          return null;
        });
      })()}
    </>
  );
}

