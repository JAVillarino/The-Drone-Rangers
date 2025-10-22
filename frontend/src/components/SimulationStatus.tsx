import React, { useState, useEffect, useRef } from 'react';
import { State } from '../types.ts';

interface SimulationStatusProps {
  data: State;
}

const SimulationStatus: React.FC<SimulationStatusProps> = ({ data }) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isDroneDetailsExpanded, setIsDroneDetailsExpanded] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Effect to close the menu when clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handler for toggling the menu
  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Handler for toggling drone details
  const handleDroneDetailsToggle = () => {
    setIsDroneDetailsExpanded(!isDroneDetailsExpanded);
  };

  // Calculate drone count
  const activeDrones = data.drones ? data.drones.length : 0;
  const totalDrones = 10; // Hardcoded as requested

  // Calculate realistic battery life (10 minutes = 600 seconds)
  const getBatteryLife = (droneIndex: number) => {
    // Use drone index as seed for consistent battery levels
    const seed = droneIndex * 12345;
    const now = Date.now();
    const timeElapsed = (now + seed) % 600000; // 10 minutes in milliseconds
    const batteryPercentage = Math.max(20, 100 - (timeElapsed / 600000) * 80); // 20-100% range
    return Math.round(batteryPercentage);
  };

  // Get battery level category for color coding
  const getBatteryLevel = (batteryPercentage: number) => {
    if (batteryPercentage >= 70) return 'high';
    if (batteryPercentage >= 40) return 'medium';
    return 'low';
  };

  return (
    <div className="simulation-status-container" ref={menuRef}>
      <button
        className="simulation-status-button"
        onClick={handleMenuToggle}
        aria-label="Simulation status"
      >
        ⋮
      </button>
      {isMenuOpen && (
        <div className="simulation-status-menu">
          <div className="simulation-status-item">
            <strong>Flock Size:</strong>
            <span>{data.flock ? data.flock.length : 0}</span>
          </div>
          <div className="simulation-status-item clickable" onClick={handleDroneDetailsToggle}>
            <strong>Drone(s):</strong>
            <span>{activeDrones}/{totalDrones}</span>
          </div>
          {isDroneDetailsExpanded && data.drones && data.drones.map((drone, index) => (
            <div key={`drone-${index}`} className="simulation-status-drone-detail">
              <div className="drone-detail-header">
                <strong>Drone {index + 1}</strong>
                <span className="drone-id">ID: DR{String(index + 1).padStart(3, '0')}</span>
              </div>
              <div className="drone-detail-info">
                <span className={`battery-level battery-${getBatteryLevel(getBatteryLife(index))}`}>
                  Battery: {getBatteryLife(index)}%
                </span>
              </div>
            </div>
          ))}
          <div className="simulation-status-item clickable" onClick={() => console.log('Obstacles clicked')}>
            <strong>Obstacles:</strong>
            <span>0</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationStatus;
