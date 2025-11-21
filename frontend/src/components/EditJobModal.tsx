import React, { useState, useEffect } from 'react';
import { FarmJob } from '../types';
import TargetMapSelector from './TargetMapSelector';
import { updateFarmJob } from '../api/state';

interface EditJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: FarmJob | null;
  worldMin: number;
  worldMax: number;
  backgroundImage: string;
  onJobUpdated?: () => void;
}

export default function EditJobModal({
  isOpen,
  onClose,
  job,
  worldMin,
  worldMax,
  backgroundImage,
  onJobUpdated
}: EditJobModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - initialized from job
  // Note: job_type, is_recurring, and target_radius are read-only
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [targetPosition, setTargetPosition] = useState<[number, number] | null>(null);
  const [droneCount, setDroneCount] = useState<number>(1);
  const [shouldCancel, setShouldCancel] = useState(false);
  const [originalTargetRadius, setOriginalTargetRadius] = useState<number | null>(null);

  // Original values to track changes (only for editable fields)
  const [originalValues, setOriginalValues] = useState<{
    scheduledDateTime: string;
    targetPosition: [number, number] | null;
    droneCount: number;
  } | null>(null);

  // Initialize form when job changes
  useEffect(() => {
    if (job) {
      const scheduledTime = job.scheduled_time || '';
      // Extract target coordinates - handle both CircleTarget and simple [number, number]
      let targetPos: [number, number] | null = null;
      let targetRadius: number | null = 10.0; // Default radius
      if (job.target) {
        if (typeof job.target === 'object' && 'center' in job.target && !('points' in job.target)) {
          // It's a CircleTarget
          targetPos = job.target.center;
          targetRadius = job.target.radius ?? 10.0;
        } else if (Array.isArray(job.target) && job.target.length === 2 && typeof job.target[0] === 'number') {
          // It's already [number, number] - use default radius
          targetPos = [job.target[0], job.target[1]];
          targetRadius = 10.0; // Default radius
        }
      }
      const drones = job.drone_count;

      setScheduledDateTime(scheduledTime);
      setTargetPosition(targetPos);
      setDroneCount(drones);
      setOriginalTargetRadius(targetRadius);
      setShouldCancel(false);

      // Store original values (only editable fields)
      setOriginalValues({
        scheduledDateTime: scheduledTime,
        targetPosition: targetPos,
        droneCount: drones
      });

      // Reset edit mode when job changes
      setIsEditMode(false);
      setError(null);
    }
  }, [job]);

  if (!isOpen || !job) return null;

  // Check if any values have changed (only editable fields)
  const hasChanges = originalValues && (
    (job.job_type === 'scheduled' && scheduledDateTime !== originalValues.scheduledDateTime) ||
    (targetPosition && originalValues.targetPosition ? (
      Math.abs(targetPosition[0] - originalValues.targetPosition[0]) > 0.01 ||
      Math.abs(targetPosition[1] - originalValues.targetPosition[1]) > 0.01
    ) : targetPosition !== originalValues.targetPosition) ||
    droneCount !== originalValues.droneCount ||
    shouldCancel
  );

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!originalValues) return;

    // Validation
    if (isEditMode && !targetPosition) {
      setError('Please select a target location on the map');
      return;
    }

    if (isEditMode && job.job_type === 'scheduled' && !scheduledDateTime) {
      setError('Please select a scheduled date and time');
      return;
    }

    if (isEditMode && droneCount < 1) {
      setError('At least 1 drone is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build update object with only allowed fields:
      // - id (already in URL)
      // - scheduled_time (only if job is scheduled)
      // - target
      // - drone_count
      // - status (only if canceling)
      const updates: {
        scheduled_time?: string;
        target?: { type: "circle"; center: [number, number]; radius: number | null };
        drone_count?: number;
        status?: 'cancelled';
      } = {};

      // Only include scheduled_time if job is scheduled
      if (job.job_type === 'scheduled') {
        if (scheduledDateTime !== originalValues?.scheduledDateTime) {
          updates.scheduled_time = scheduledDateTime;
        }
      }

      // Include target if changed - convert to CircleTarget format
      if (targetPosition && originalValues?.targetPosition && (
        Math.abs(targetPosition[0] - originalValues.targetPosition[0]) > 0.01 ||
        Math.abs(targetPosition[1] - originalValues.targetPosition[1]) > 0.01
      )) {
        // Convert [number, number] to CircleTarget format expected by backend
        updates.target = {
          type: "circle",
          center: targetPosition,
          radius: originalTargetRadius ?? 10.0
        };
      }

      // Include drone_count if changed
      if (droneCount !== originalValues?.droneCount) {
        updates.drone_count = droneCount;
      }

      // Include status if canceling
      if (shouldCancel) {
        updates.status = 'cancelled';
      }

      // Only send PATCH if there are actual changes
      if (Object.keys(updates).length > 0) {
        await updateFarmJob(job.id, updates);
        
        if (onJobUpdated) {
          onJobUpdated();
        }
      }

      setIsEditMode(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setIsEditMode(false);
    setShouldCancel(false);
    // Reset to original values
    if (originalValues) {
      setScheduledDateTime(originalValues.scheduledDateTime);
      setTargetPosition(originalValues.targetPosition);
      setDroneCount(originalValues.droneCount);
    }
    onClose();
  };

  // Format datetime-local input value
  const getDateTimeLocalValue = () => {
    if (!scheduledDateTime) return '';
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
          <h2>Job Details</h2>
          <button className="modal-close-button" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="add-job-form">
          {error && (
            <div className="error-message">{error}</div>
          )}

          {/* Job Type (read-only) */}
          <div className="form-section">
            <label className="form-label">Job Type</label>
            <div className="read-only-value">
              {job.job_type === 'immediate' ? 'Immediate Job' : 'Scheduled Job'}
            </div>
          </div>

          {/* Schedule Section (only for scheduled jobs) */}
          {job.job_type === 'scheduled' && (
            <div className="form-section">
              <label htmlFor="scheduled-datetime" className="form-label">
                Schedule Date & Time
              </label>
              {isEditMode ? (
                <input
                  id="scheduled-datetime"
                  type="datetime-local"
                  value={getDateTimeLocalValue()}
                  onChange={handleDateTimeChange}
                  className="form-input"
                  required={job.job_type === 'scheduled'}
                />
              ) : (
                <div className="read-only-value">
                  {scheduledDateTime
                    ? new Date(scheduledDateTime).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Not set'}
                </div>
              )}
            </div>
          )}

          {/* Recurring (read-only) */}
          {job.is_recurring && (
            <div className="form-section">
              <label className="form-label">Recurring</label>
              <div className="read-only-value">Yes</div>
            </div>
          )}

          {/* Target Definition Section */}
          <div className="form-section">
            <label className="form-label">Task Definition (Target)</label>
            {isEditMode ? (
              <TargetMapSelector
                backgroundImage={backgroundImage}
                worldMin={worldMin}
                worldMax={worldMax}
                onTargetSelect={setTargetPosition}
                initialTarget={targetPosition || undefined}
              />
            ) : (
              <div className="read-only-value">
                Position: [{targetPosition ? targetPosition[0].toFixed(2) : 'N/A'}, {targetPosition ? targetPosition[1].toFixed(2) : 'N/A'}]
              </div>
            )}
          </div>

          {/* Target Radius (read-only) */}
          {job.target && typeof job.target === 'object' && 'radius' in job.target && (
            <div className="form-section">
              <label className="form-label">Target Radius</label>
              <div className="read-only-value">
                {job.target.radius?.toFixed(1) || 'N/A'}
              </div>
            </div>
          )}

          {/* Resource Allocation */}
          <div className="form-section">
            <label htmlFor="drone-count" className="form-label">
              # of Drones to Allocate
            </label>
            {isEditMode ? (
              <input
                id="drone-count"
                type="number"
                min="1"
                value={droneCount}
                onChange={(e) => setDroneCount(parseInt(e.target.value, 10) || 1)}
                className="form-input"
                required
              />
            ) : (
              <div className="read-only-value">
                {droneCount} drone{droneCount !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Drones Currently in Use (read-only, from backend) */}
          {job.drones !== undefined && (
            <div className="form-section">
              <label className="form-label">Drones Currently in Use</label>
              <div className="read-only-value">
                {job.drones} drone{job.drones !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Status (read-only) */}
          <div className="form-section">
            <label className="form-label">Status</label>
            <div className="read-only-value">
              {job.status}
            </div>
          </div>

          {/* Cancel Job Option (only in edit mode) */}
          {isEditMode && job.status !== 'cancelled' && job.status !== 'completed' && (
            <div className="form-section">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={shouldCancel}
                  onChange={(e) => setShouldCancel(e.target.checked)}
                />
                <span>Cancel this job</span>
              </label>
            </div>
          )}

          {/* Form Footer */}
          <div className="modal-footer">
            <button type="button" className="modal-btn cancel-btn" onClick={handleClose} disabled={isSubmitting}>
              {isEditMode ? 'Cancel' : 'Close'}
            </button>
            {!isEditMode ? (
              <button
                type="button"
                className="modal-btn submit-btn"
                onClick={handleEditClick}
                disabled={isSubmitting}
              >
                Edit
              </button>
            ) : (
              <button
                type="submit"
                className="modal-btn submit-btn"
                disabled={isSubmitting || !hasChanges}
                style={{
                  opacity: hasChanges ? 1 : 0.5,
                  cursor: hasChanges ? 'pointer' : 'not-allowed'
                }}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

