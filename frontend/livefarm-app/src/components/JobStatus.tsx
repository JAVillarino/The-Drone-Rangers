import React, { useState, useEffect, useRef } from 'react';
import { Target } from '../types.ts';

interface JobStatusProps {
  jobName: string;
  status: string;
  calendarStatus?: 'pending' | 'scheduled' | 'running' | 'completed' | 'cancelled';
  target: Target | null;
  droneCount: number;
  isActive: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onSelectOnMap: () => void;
  onPauseToggle: () => void;
  onCancel: () => void;
  onDronesChange: (newCount: number) => void;
  onTargetChange: (newTarget: Target) => void;
  maxDrones: number;
}

const JobStatus: React.FC<JobStatusProps> = ({
  jobName,
  status,
  calendarStatus,
  target,
  droneCount,
  isActive,
  isOpen = false,
  onToggle,
  onSelectOnMap,
  onPauseToggle,
  onCancel,
  onDronesChange,
  onTargetChange,
  maxDrones,
}) => {
  // Use controlled isOpen prop if provided, otherwise fall back to local state
  const [localIsFolded, setLocalIsFolded] = useState<boolean>(false);
  const isFolded = onToggle !== undefined ? !isOpen : localIsFolded;
  const handleToggle = onToggle || (() => setLocalIsFolded(!localIsFolded));
  const [isKebabMenuOpen, setIsKebabMenuOpen] = useState<boolean>(false);
  // Local state for drone count input (synced with prop)
  const [localDroneCount, setLocalDroneCount] = useState<number>(droneCount);
  const [droneCountError, setDroneCountError] = useState<string | null>(null);
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
        prevRadiusRef.current = newRadius ?? null;
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
    if (isNaN(count) || count < 1) {
      setDroneCountError('At least 1 drone is required');
      return;
    }
    if (count > maxDrones) {
      setDroneCountError(`Cannot exceed ${maxDrones} drone${maxDrones !== 1 ? 's' : ''} in fleet`);
      return;
    }
    setDroneCountError(null);
    setLocalDroneCount(count);
    onDronesChange(count);
  };

  return (
    <div className={`card-container ${isFolded ? 'folded' : ''}`}>
      <div className="card-header">
        <button 
          className="fold-button" 
          onClick={handleToggle}
        >
          {isFolded ? '▶' : '▼'}
        </button>
        <h3>
          Herding {jobName}
          {calendarStatus && (
            <>
              {' '}
              <span className={`job-status job-status-${calendarStatus}`}>
                {calendarStatus}
              </span>
            </>
          )}
        </h3>
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
              max={maxDrones}
              aria-label="Number of drones assigned"
            />
            {droneCountError && (
              <div style={{ color: '#e53935', fontSize: '0.875rem', marginTop: '4px' }}>
                {droneCountError}
              </div>
            )}
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