import React, { useState, useEffect, useRef } from 'react';
// import './JobStatus.css';

// Define the component's props with TypeScript for type safety
interface JobStatusProps {
  jobId: string;
  initialStatus: string; // e.g., "ETA: 5m 30s" or "Completed"
  target: { lat: number; lng: number };
  initialRadius: number;
  initialDrones: number;
  onSelectOnMap: (target: { lat: number; lng: number }) => void;
  onPauseToggle: (isPaused: boolean) => void;
  onCancel: () => void;
  onDronesChange: (newCount: number) => void;
}

const JobStatus: React.FC<JobStatusProps> = ({
  jobId,
  initialStatus,
  target,
  initialRadius,
  initialDrones,
  onSelectOnMap,
  onPauseToggle,
  onCancel,
  onDronesChange,
}) => {
  // State for managing the card's UI
  const [isFolded, setIsFolded] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isKebabMenuOpen, setIsKebabMenuOpen] = useState<boolean>(false);
  const [droneCount, setDroneCount] = useState<number>(initialDrones);
  const kebabRef = useRef<HTMLDivElement>(null);

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
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    onPauseToggle(newPausedState);
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
    // Ensure the new value is a non-negative number
    if (!isNaN(count) && count >= 0) {
      setDroneCount(count);
      onDronesChange(count);
    }
  };

  return (
    <div className={`card-container ${isFolded ? 'folded' : ''}`}>
      <div className="card-header">
        <button className="fold-button" onClick={() => setIsFolded(!isFolded)}>
          {isFolded ? '▶' : '▼'}
        </button>
        <h3>Herding job {jobId}</h3>
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
            <span>{isPaused ? 'Paused' : initialStatus}</span>
          </div>
          <div className="card-field">
            <strong>Target:</strong>
            <span>
              {target.lat.toFixed(4)}, {target.lng.toFixed(4)}
            </span>
            <button
              className="map-button"
              onClick={() => onSelectOnMap(target)}
            >
              Select on map
            </button>
          </div>
          <div className="card-field">
            <strong>Target Radius (m):</strong>
            <span>{initialRadius}</span>
          </div>
          <div className="card-field">
            <strong>Drones Assigned:</strong>
            <input
              type="number"
              value={droneCount}
              onChange={handleDroneCountChange}
              min="0"
              aria-label="Number of drones assigned"
            />
          </div>
          <button onClick={handlePauseToggle}>
            {isPaused ? 'Start Job' : 'Stop Job'}
          </button>
        </div>
      )}
    </div>
  );
};

export default JobStatus;