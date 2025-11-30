import { useState } from 'react';
import { Job } from '../types';

interface TargetMarkerProps {
  x: number;
  y: number;
  isActive: boolean;
  job: Job;
  immediateJobIndex?: number; // Position in queue for immediate jobs
}

export default function TargetMarker({ x, y, isActive, job, immediateJobIndex }: TargetMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Determine scheduling status text
  const getSchedulingStatus = () => {
    if (job.start_at) {
      // Scheduled job
      const scheduledTime = new Date(job.start_at);
      return `Scheduled: ${scheduledTime.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`;
    } else {
      // Immediate job
      if (immediateJobIndex !== undefined) {
        return `Immediate: #${immediateJobIndex + 1} in queue`;
      }
      return 'Immediate';
    }
  };

  const iconPath = isActive 
    ? "../../img/map_pin_icon.png" 
    : "../../img/map_pin_icon_bw.png";

  return (
    <g>
      <image
        href={iconPath}
        x={x - 12}
        y={y - 12}
        width={24}
        height={24}
        className="target"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ cursor: 'pointer', transform: 'none' }}
      />
      {isHovered && (
        <foreignObject
          x={x + 15}
          y={y - 50}
          width="220"
          height="70"
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              padding: '10px 12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              fontSize: '12px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: '#333', fontSize: '13px' }}>
              Job ID: {job.id.substring(0, 8)}...
            </div>
            <div style={{ color: '#666', fontSize: '12px' }}>
              {getSchedulingStatus()}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

