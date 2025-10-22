import React, { useState, useEffect, useRef } from 'react';
import { LocData } from '../types.ts';

interface JobStatusProps {
  jobName: string;
  status: string;
  target: LocData | null;
  initialRadius: number;
  initialDrones: number;
  isActive: boolean;
  onSelectOnMap: (target: LocData | null) => void;
  onPauseToggle: () => void;
  onCancel: () => void;
  onDronesChange: (newCount: number) => void;
}

const JobStatus: React.FC<JobStatusProps> = ({
  jobName,
  status,
  target,
  initialRadius,
  initialDrones,
  isActive,
  onSelectOnMap,
  onPauseToggle,
  onCancel,
  onDronesChange,
}) => {
  // State for managing the card's UI
  const [isFolded, setIsFolded] = useState<boolean>(false);
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
        <h3>Herding job {jobName}</h3>
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
              onClick={() => onSelectOnMap(target)}
            >
              Select on map
            </button>
          </div>
          <div className="card-field">
            <strong>Target Radius (m):</strong>
            <span>{initialRadius.toFixed(0)}</span>
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