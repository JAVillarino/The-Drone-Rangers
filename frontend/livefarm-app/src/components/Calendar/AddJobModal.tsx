import React, { useState } from 'react';
import { CreateFarmJobRequest } from '../../types';
import TargetMapSelector from '../MapPlot/TargetMapSelector';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: CreateFarmJobRequest) => Promise<void>;
  worldMin: number;
  worldMax: number;
  backgroundImage: string;
  maxDrones: number;
}

export default function AddJobModal({
  isOpen,
  onClose,
  onSubmit,
  worldMin,
  worldMax,
  backgroundImage,
  maxDrones
}: AddJobModalProps) {
  const [jobType, setJobType] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledDateTime, setScheduledDateTime] = useState<Date | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [targetPosition, setTargetPosition] = useState<[number, number] | null>(null);
  const [droneCount, setDroneCount] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [droneCountError, setDroneCountError] = useState<string | null>(null);
  const [previousDroneCount, setPreviousDroneCount] = useState<number>(1);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!targetPosition) {
      setError('Please select a target location on the map');
      return;
    }

    if (jobType === 'scheduled' && !scheduledDateTime) {
      setError('Please select a scheduled date and time');
      return;
    }

    if (droneCount < 1) {
      setError('At least 1 drone is required');
      return;
    }

    if (droneCount > maxDrones) {
      setError(`Cannot exceed ${maxDrones} drone${maxDrones !== 1 ? 's' : ''} in fleet`);
      return;
    }

    setIsSubmitting(true);


    try {
      const jobData: CreateFarmJobRequest = {
        scheduled_time: jobType === 'scheduled' && scheduledDateTime ? getDateTimeLocalValue() : undefined,
        is_recurring: isRecurring,
        target: {
          type: "circle",
          center: targetPosition,
          radius: 30.0,
        },
        drone_count: droneCount
      };


      await onSubmit(jobData);
      
      // Reset form
      setJobType('immediate');
      setScheduledDateTime(null);
      setIsRecurring(false);
      setTargetPosition(null);
      setDroneCount(1);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setTargetPosition(null);
    onClose();
  };

  // Format datetime-local input value
  const getDateTimeLocalValue = () => {
    if (!scheduledDateTime) return '';
    // Convert ISO string to local datetime-local format
    const date = new Date(scheduledDateTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleDateTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      // Convert datetime-local to ISO string
      const localDate = new Date(value);
      setScheduledDateTime(localDate);
    } else {
      setScheduledDateTime(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="add-job-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add a Job</h2>
          <button className="modal-close-button" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="add-job-form">
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Job Type Selector */}
          <div className="form-section">
            <label className="form-label">Job Type</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="jobType"
                  value="immediate"
                  checked={jobType === 'immediate'}
                  onChange={(e) => setJobType(e.target.value as 'immediate' | 'scheduled')}
                />
                <span>Immediate Job</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="jobType"
                  value="scheduled"
                  checked={jobType === 'scheduled'}
                  onChange={(e) => setJobType(e.target.value as 'immediate' | 'scheduled')}
                />
                <span>Scheduled Job</span>
              </label>
            </div>
          </div>

          {/* Schedule Section (only shown for scheduled jobs) */}
          {jobType === 'scheduled' && (
            <div className="form-section">
              <label htmlFor="scheduled-datetime" className="form-label">
                Schedule Date & Time
              </label>
              <input
                id="scheduled-datetime"
                type="datetime-local"
                value={getDateTimeLocalValue()}
                onChange={handleDateTimeChange}
                className="form-input"
                required={jobType === 'scheduled'}
              />
              
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                />
                <span>Recurring</span>
              </label>
            </div>
          )}

          {/* Target Definition Section */}
          <div className="form-section">
            <label className="form-label">Task Definition (Target)</label>
            <TargetMapSelector
              backgroundImage={backgroundImage}
              worldMin={worldMin}
              worldMax={worldMax}
              onTargetSelect={setTargetPosition}
              initialTarget={targetPosition || undefined}
            />
          </div>

          {/* Resource Allocation */}
          <div className="form-section">
            <label htmlFor="drone-count" className="form-label">
              # of Drones to Allocate
            </label>
            <input
              id="drone-count"
              type="number"
              value={droneCount}
              onChange={(e) => {
                const inputValue = e.target.value;
                const newCount = inputValue === '' ? 0 : parseInt(inputValue, 10);
                
                if (isNaN(newCount)) {
                  setDroneCountError(null);
                  setPreviousDroneCount(droneCount);
                  return;
                }
                
                // Check if user tried to increment beyond max
                if (newCount > maxDrones) {
                  setDroneCountError(`Cannot exceed ${maxDrones} drone${maxDrones !== 1 ? 's' : ''} in fleet`);
                  setDroneCount(maxDrones);
                  setPreviousDroneCount(maxDrones);
                } 
                // Check if user tried to decrement below 1
                else if (newCount < 1) {
                  setDroneCountError('At least 1 drone is required');
                  setDroneCount(1);
                  setPreviousDroneCount(1);
                } 
                // Check if value didn't change but user tried to increment (hit max limit)
                else if (newCount === droneCount && newCount === maxDrones && previousDroneCount === maxDrones) {
                  // User clicked up arrow at max - show error
                  setDroneCountError(`Cannot exceed ${maxDrones} drone${maxDrones !== 1 ? 's' : ''} in fleet`);
                }
                // Check if value didn't change but user tried to decrement (hit min limit)
                else if (newCount === droneCount && newCount === 1 && previousDroneCount === 1) {
                  // User clicked down arrow at min - show error
                  setDroneCountError('At least 1 drone is required');
                }
                else {
                  setDroneCountError(null);
                  setDroneCount(newCount);
                  setPreviousDroneCount(newCount);
                }
                
                // Clear form error if user fixes the value
                if (error && newCount <= maxDrones && newCount >= 1) {
                  setError(null);
                }
              }}
              onKeyDown={(e) => {
                // Detect arrow key presses to show errors at boundaries
                if (e.key === 'ArrowUp' && droneCount >= maxDrones) {
                  setDroneCountError(`Cannot exceed ${maxDrones} drone${maxDrones !== 1 ? 's' : ''} in fleet`);
                } else if (e.key === 'ArrowDown' && droneCount <= 1) {
                  setDroneCountError('At least 1 drone is required');
                }
              }}
              onBlur={() => {
                // Clear error on blur if value is valid
                if (droneCount >= 1 && droneCount <= maxDrones) {
                  setDroneCountError(null);
                }
                // Ensure value is within bounds
                if (droneCount < 1) {
                  setDroneCount(1);
                } else if (droneCount > maxDrones) {
                  setDroneCount(maxDrones);
                }
              }}
              className="form-input"
              required
            />
            {droneCountError && (
              <div style={{ 
                fontSize: '0.875rem', 
                color: '#e53935', 
                marginTop: '4px' 
              }}>
                {droneCountError}
              </div>
            )}
            {!droneCountError && maxDrones > 0 && (
              <div style={{ 
                fontSize: '0.875rem', 
                color: droneCount > maxDrones ? '#e53935' : '#666', 
                marginTop: '4px' 
              }}>
                Maximum: {maxDrones} drone{maxDrones !== 1 ? 's' : ''} available
              </div>
            )}
          </div>

          {/* Form Footer */}
          <div className="modal-footer">
            <button type="button" className="modal-btn cancel-btn" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="modal-btn submit-btn" 
              disabled={isSubmitting || droneCount > maxDrones || droneCount < 1}
            >
              {isSubmitting ? 'Creating...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
