import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { State } from "../../types";
import ObjectMarker from "./ObjectMarker.tsx";
import TargetMarker from "./TargetMarker.tsx";
import { ScenarioTheme, getScenarioTheme } from "../../theme";

interface UsePanArgs {
  data: State;
  zoomMin: number;
  zoomMax: number;
  scale: number;
  canvasSize: number;
  worldBounds?: { minX: number, maxX: number, minY: number, maxY: number };
}

export function usePan({ data, zoomMin, zoomMax, scale, canvasSize, worldBounds }: UsePanArgs) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bounds = useMemo(() => {
    let minX = worldBounds ? worldBounds.minX : zoomMin;
    let maxX = worldBounds ? worldBounds.maxX : zoomMax;
    let minY = worldBounds ? worldBounds.minY : zoomMin;
    let maxY = worldBounds ? worldBounds.maxY : zoomMax;

    const updateBounds = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    data.flock.forEach(p => updateBounds(p[0], p[1]));
    data.drones.forEach(p => updateBounds(p[0], p[1]));
    data.jobs.forEach(j => {
      if (j.target && j.target.type === "circle") {
        updateBounds(j.target.center[0], j.target.center[1]);
      }
    });

    return { minX, maxX, minY, maxY };
  }, [data, zoomMin, zoomMax, worldBounds]);

  const windowSize = zoomMax - zoomMin;

  const clampPan = useCallback((x: number, y: number) => {
    const minPanX = bounds.minX - zoomMin;
    const maxPanX = bounds.maxX - zoomMin - windowSize;
    const minPanY = bounds.minY - zoomMin;
    const maxPanY = bounds.maxY - zoomMin - windowSize;

    // Handle case where window > bounds (center or align min)
    const effectiveMaxPanX = Math.max(minPanX, maxPanX);
    const effectiveMaxPanY = Math.max(minPanY, maxPanY);

    x = Math.max(minPanX, Math.min(effectiveMaxPanX, x));
    y = Math.max(minPanY, Math.min(effectiveMaxPanY, y));

    return { x, y };
  }, [bounds, zoomMin, windowSize]);

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
      const scaled = ((val - effectiveMin) / windowSize) * canvasSize * scale;
      // Invert Y axis for SVG (0 is top, but simulation 0 is bottom)
      return axis === "y" ? canvasSize - scaled : scaled;
    },
    [pan, zoomMin, windowSize, canvasSize, scale]
  );

  const inverseScaleCoord = (val: number, axis: "x" | "y") => {
    const offset = axis === "x" ? pan.x : pan.y;
    const effectiveMin = zoomMin + offset;
    // Invert Y axis back from SVG to World
    const scaled = axis === "y" ? canvasSize - val : val;
    return ((scaled / (canvasSize * scale)) * windowSize + effectiveMin);
  }

  return { pan, setPan, svgRef, scaleCoord, inverseScaleCoord };
}

interface RenderArgs {
  data: State;
  obstacles: number[][][];
  backgroundImage: string;
  scaleCoord: (val: number, axis: "x" | "y") => number;
  /** Optional theme for styling entities. Falls back to default-herd if not provided. */
  theme?: ScenarioTheme;
}

export function Map(props: RenderArgs) {
  // Safety check: return null if props or data is not available
  if (!props || !props.data || !props.data.flock || !props.data.drones || !props.data.jobs) {
    return null;
  }

  const { data, obstacles, backgroundImage, scaleCoord, theme: themeProp } = props;

  // Use provided theme or fall back to default
  const theme = themeProp ?? getScenarioTheme("default-herd");
  const { colors, iconSet } = theme;

  // Combine backend obstacles (data.polygons) with locally drawn obstacles
  const allObstacles = [...(data.polygons || []), ...obstacles];

  return (
    <>
      <image
        x={scaleCoord(-500, "x")}
        y={scaleCoord(750, "y")}
        width={scaleCoord(750, "x") - scaleCoord(-500, "x")}
        height={scaleCoord(-500, "y") - scaleCoord(750, "y")}
        href={backgroundImage}
        preserveAspectRatio="xMidYMid slice"
      />

      {
        allObstacles.map((obstacle, i) => (
          <polygon
            key={`obstacle-${i}`}
            points={obstacle.map(([x, y]) => `${scaleCoord(x, "x")},${scaleCoord(y, "y")}`).join(" ")}
            fill={colors.obstacleFillColor}
            stroke={colors.obstacleColor}
            strokeWidth="2"
          />
        ))
      }

      {
        data.flock.map((a, i) => (
          <ObjectMarker
            key={`animal-${i}`}
            type="animal"
            x={scaleCoord(a[0], "x")}
            y={scaleCoord(a[1], "y")}
            fillColor={colors.agentFill}
            strokeColor={colors.agentStroke}
            iconSet={iconSet}
          />
        ))
      }
      {
        data.drones.map((d, i) => (
          <ObjectMarker
            key={`drone-${i}`}
            type="drone"
            x={scaleCoord(d[0], "x")}
            y={scaleCoord(d[1], "y")}
            fillColor={colors.controllerFill}
            strokeColor={colors.controllerStroke}
            iconSet={iconSet}
          />
        ))
      }
      {
        (() => {
          // Determine which job is active (only one can be active at a time)
          const activeJob = data.jobs.find(j => j.is_active && j.target);

          // Calculate queue order for immediate jobs (sorted by created_at)
          const immediateJobs = data.jobs
            .filter(j => !j.start_at && j.target) // Immediate jobs (no start_at)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          // Use a plain object instead of Map to avoid naming conflict with Map component
          const immediateJobIndices: Record<string, number> = {};
          immediateJobs.forEach((job, index) => {
            immediateJobIndices[job.id] = index;
          });

          return data.jobs.map((job, i) => {
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
                      fill={colors.targetFillColor}
                      stroke={colors.targetColor}
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
                    fill={isActive ? colors.polygonTargetFillColor : "rgba(128, 128, 128, 0.1)"}
                    stroke={isActive ? colors.polygonTargetColor : "rgba(128, 128, 128, 0.4)"}
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
        })()
      }
    </>
  );
}
