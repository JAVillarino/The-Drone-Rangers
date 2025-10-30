import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { State } from "../types";
import ObjectMarker from "./ObjectMarker.tsx";

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
    xs.push(...data.jobs.flatMap(j => j.target ? [j.target[0]] : []));
    ys.push(...data.jobs.flatMap(j => j.target ? [j.target[1]] : []));

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

  return { pan, svgRef, scaleCoord, inverseScaleCoord };
}


interface RenderArgs {
  data: State;
  obstacles: number[][][];
  backgroundImage: string;
  scaleCoord: (val: number, axis: "x" | "y") => number;
}

export function Map({ data, obstacles, backgroundImage, scaleCoord }: RenderArgs) {
  return (
    <>
      <image x={scaleCoord(-500, "x")} y={scaleCoord(-350, "y")} href={backgroundImage} className="background" />

      {obstacles.map((obstacle, i) => (
        <polygon
          key={`obstacle-${i}`}
          points={obstacle.map(([x, y]) => `${scaleCoord(x, "x")},${scaleCoord(y, "y")}`).join(" ")}
          fill="rgba(139, 69, 19, 0.6)"
          stroke="#8B4513"
          strokeWidth="2"
        />
      ))}

      {data.flock.map((a, i) => (
        <ObjectMarker key={`animal-${i}`} type="animal" x={scaleCoord(a[0], "x")} y={scaleCoord(a[1], "y")} />
      ))}
      {data.drones.map((d, i) => (
        <ObjectMarker key={`drone-${i}`} type="drone" x={scaleCoord(d[0], "x")} y={scaleCoord(d[1], "y")} />
      ))}
      {data.jobs.map((job, i) =>
        job.target ? (
          <ObjectMarker
            key={`target-${i}`}
            type="target"
            x={scaleCoord(job.target[0], "x")}
            y={scaleCoord(job.target[1], "y")}
          />
        ) : null
      )}
    </>
  );
}
