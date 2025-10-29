import React, { useState } from 'react';
import { CreateFarmJobRequest } from '../types';
import TargetMapSelector from './TargetMapSelector';

interface AddJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (jobData: CreateFarmJobRequest) => Promise<void>;
  worldMin: number;
  worldMax: number;
  backgroundImage: string;
}

export default function AddJobModal({
  isOpen,
  onClose,
  onSubmit,
  worldMin,
  worldMax,
  backgroundImage
}: AddJobModalProps) {
  const [jobType, setJobType] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [targetPosition, setTargetPosition] = useState<[number, number] | null>(null);
  const [droneCount, setDroneCount] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setIsSubmitting(true);

    try {
      const jobData: CreateFarmJobRequest = {
        job_type: jobType,
        scheduled_time: jobType === 'scheduled' ? scheduledDateTime : undefined,
        is_recurring: isRecurring,
        target: targetPosition,
        target_radius: 10.0, // Default radius, could be made configurable
        drone_count: droneCount
      };

      await onSubmit(jobData);
      
      // Reset form
      setJobType('immediate');
      setScheduledDateTime('');
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
      setScheduledDateTime(localDate.toISOString());
    } else {
      setScheduledDateTime('');
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
              min="1"
              value={droneCount}
              onChange={(e) => setDroneCount(parseInt(e.target.value, 10) || 1)}
              className="form-input"
              required
            />
          </div>

          {/* Form Footer */}
          <div className="modal-footer">
            <button type="button" className="modal-btn cancel-btn" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="modal-btn submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
