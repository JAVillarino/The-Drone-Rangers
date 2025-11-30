import React, { useState, useEffect, useRef } from 'react';
import { Target } from '../types.ts';

interface JobStatusProps {
  jobName: string;
  status: string;
  target: Target | null;
  droneCount: number;
  isActive: boolean;
  onSelectOnMap: () => void;
  onPauseToggle: () => void;
  onCancel: () => void;
  onDronesChange: (newCount: number) => void;
  onTargetChange: (newTarget: Target) => void;
}

const JobStatus: React.FC<JobStatusProps> = ({
  jobName,
  status,
  target,
  droneCount,
  isActive,
  onSelectOnMap,
  onPauseToggle,
  onCancel,
  onDronesChange,
  onTargetChange,
}) => {
  // State for managing the card's UI
  const [isFolded, setIsFolded] = useState<boolean>(false);
  const [isKebabMenuOpen, setIsKebabMenuOpen] = useState<boolean>(false);
  // Local state for drone count input (synced with prop)
  const [localDroneCount, setLocalDroneCount] = useState<number>(droneCount);
  const [radiusInput, setRadiusInput] = useState<string>(() =>
    target?.type === 'circle' && typeof target.radius === 'number'
      ? target.radius.toString()
      : ''
  );
  const kebabRef = useRef<HTMLDivElement>(null);

  // Sync local drone count when prop changes (from SSE updates)
  useEffect(() => {
    setLocalDroneCount(droneCount);
  }, [droneCount]);

  // Sync radiusInput when target changes from outside
  // Use a ref to track the previous radius to avoid unnecessary updates
  const prevRadiusRef = useRef<number | null>(null);
  useEffect(() => {
    if (target?.type === 'circle') {
      const newRadius = target.radius;
      // Only update if the radius actually changed
      if (newRadius !== prevRadiusRef.current) {
        prevRadiusRef.current = newRadius;
        if (typeof newRadius === 'number') {
          setRadiusInput(newRadius.toString());
        } else {
          setRadiusInput('');
        }
      }
    } else {
      prevRadiusRef.current = null;
      setRadiusInput('');
    }
  }, [target?.type === 'circle' ? target?.radius : undefined]);

  // Effect to close the kebab menu when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target as Node)) {
        setIsKebabMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handler for pausing/unpausing the job
  const handlePauseToggle = () => {
    onPauseToggle();
    setIsKebabMenuOpen(false); // Close menu after action
  };

  // Handler for canceling the job
  const handleCancel = () => {
    onCancel();
    setIsKebabMenuOpen(false); // Close menu
  };

  // Handler for updating the drone count
  const handleDroneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(e.target.value, 10);
    // Ensure the new value is at least 1 (minimum 1 drone required)
    if (!isNaN(count) && count >= 1) {
      setLocalDroneCount(count);
      onDronesChange(count);
    }
  };

  return (
    <div className={`card-container ${isFolded ? 'folded' : ''}`}>
      <div className="card-header">
        <button className="fold-button" onClick={() => setIsFolded(!isFolded)}>
          {isFolded ? '▶' : '▼'}
        </button>
        <h3>Herding {jobName}</h3>
        <div className="kebab-menu-container" ref={kebabRef}>
          <button
            className="kebab-button"
            onClick={() => setIsKebabMenuOpen(!isKebabMenuOpen)}
            aria-label="Job options"
          >
            ⋮
          </button>
          {isKebabMenuOpen && (
            <div className="kebab-menu">
              <div className="kebab-section">
                <div className="kebab-section-header">Drone Health</div>
                <div className="drone-health-item">
                  <span className="drone-name">Drone-01</span>
                  <span className="health-status healthy">●</span>
                </div>
                <div className="drone-health-item">
                  <span className="drone-name">Drone-02</span>
                  <span className="health-status healthy">●</span>
                </div>
                <div className="drone-health-item">
                  <span className="drone-name">Drone-03</span>
                  <span className="health-status warning">●</span>
                </div>
                <div className="drone-health-item">
                  <span className="drone-name">Drone-04</span>
                  <span className="health-status healthy">●</span>
                </div>
              </div>
              <div className="kebab-divider"></div>
              <button onClick={handleCancel}>Cancel Job</button>
            </div>
          )}
        </div>
      </div>
      {!isFolded && (
        <div className="card-body">
          <div className="card-field">
            <strong>Status:</strong>
            <span>{status}</span>
          </div>
          <div className="card-field">
            <strong>Target:</strong>
            <span>
              {/* {target[0].toFixed(4)}, {target[1].toFixed(4)} */}
            </span>
            <button
              className="map-button"
              onClick={() => onSelectOnMap()}
            >
              Select on map
            </button>
          </div>
      <div className="card-field">
        <strong>Target Radius (m):</strong>
        <input
          type="number"
          value={radiusInput}
          onChange={(e) => {
            console.log("Setting values to", e.target.value)
            setRadiusInput(e.target.value)}}
          onBlur={() => {
            if (!target || target.type !== 'circle') return;
            const value = parseFloat(radiusInput);
            if (Number.isFinite(value) && value > 0 && value !== target.radius) {
              onTargetChange({
                ...target, radius: value
              })
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          step="1"
          min="1"
          placeholder={target && target.type === 'circle' ? 'Enter radius' : 'Circle target only'}
          disabled={!target || target.type !== 'circle'}
        />
          </div>
          <div className="card-field">
            <strong>Drones Assigned:</strong>
            <input
              type="number"
              value={localDroneCount}
              onChange={handleDroneCountChange}
              min="1"
              aria-label="Number of drones assigned"
            />
          </div>
          <button 
            onClick={handlePauseToggle}
            disabled={!target}
            style={{
              opacity: target ? 1 : 0.5,
              cursor: target ? 'pointer' : 'not-allowed'
            }}
          >
            {target ? (isActive ? 'Stop Job' : 'Start Job') : 'Start Job'}
          </button>
        </div>
      )}
    </div>
  );
};

export default JobStatus;