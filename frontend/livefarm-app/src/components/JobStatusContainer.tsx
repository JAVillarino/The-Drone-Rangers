import { useState, useRef, useEffect } from 'react';
import { Job, Target } from '../types';
import JobStatus from './JobStatus';
import { setJobActiveState, setJobDroneCount, deleteFarmJob } from '../api/state';
import { useQueryClient } from '@tanstack/react-query';

interface JobStatusContainerProps {
  jobs: Job[];
  filterValue: number | null;
  filterUnit: 'hours' | 'days' | 'weeks' | 'months';
  onFilterChange: (value: number | null, unit: 'hours' | 'days' | 'weeks' | 'months') => void;
  onSetTarget: (jobId: string, target: Target) => void;
  onSelectOnMap: (jobId: string) => void;
  onOpenJobChange?: (jobId: string | null) => void; // Callback when open job changes
}

const jobStatus = (j: Job) => {
  if (j.remaining_time == 0) {
    return "Completed";
  }
  if (!j.target) {
    return "No target set";
  }
  if (!j.is_active) {
    return "Stopped";
  }
  return "In progress";
};

export default function JobStatusContainer({
  jobs,
  filterValue,
  filterUnit,
  onFilterChange,
  onSetTarget,
  onSelectOnMap,
  onOpenJobChange
}: JobStatusContainerProps) {
  const queryClient = useQueryClient();
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterInputValue, setFilterInputValue] = useState<string>(filterValue?.toString() || '');
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPopupRef = useRef<HTMLDivElement>(null);

  // Sync filter input when filterValue changes externally
  useEffect(() => {
    setFilterInputValue(filterValue?.toString() || '');
  }, [filterValue]);

  // Close filter popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isFilterOpen &&
        filterPopupRef.current &&
        !filterPopupRef.current.contains(event.target as Node) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  const handleFilterApply = () => {
    const value = filterInputValue.trim() === '' ? null : parseInt(filterInputValue, 10);
    if (value === null || (value !== null && value > 0)) {
      onFilterChange(value, filterUnit);
      setIsFilterOpen(false);
    }
  };

  const handleFilterClear = () => {
    setFilterInputValue('');
    onFilterChange(null, filterUnit);
    setIsFilterOpen(false);
  };

  const handleToggle = (jobId: string) => {
    const newOpenJobId = openJobId === jobId ? null : jobId;
    setOpenJobId(newOpenJobId);
    onOpenJobChange?.(newOpenJobId);
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }

    // If the cancelled job was open, close it
    if (openJobId === jobId) {
      setOpenJobId(null);
      onOpenJobChange?.(null);
    }

    try {
      await deleteFarmJob(jobId);
      queryClient.invalidateQueries({ queryKey: ['objects', 'real-farm'] });
      queryClient.invalidateQueries({ queryKey: ['farm-jobs'] });
    } catch (error) {
      console.error('Failed to delete job:', error);
      queryClient.invalidateQueries({ queryKey: ['objects', 'real-farm'] });
      alert('Failed to delete job. Please try again.');
    }
  };

  // Format the filter time frame for display
  const getFilterDisplayText = () => {
    if (filterValue === null || filterValue <= 0) {
      return 'Job Queue';
    }
    const unitText = filterValue === 1
      ? filterUnit.slice(0, -1) // Remove 's' for singular (e.g., "hour" instead of "hours")
      : filterUnit; // Keep plural for multiple (e.g., "hours", "weeks")
    return `Job Queue: ${filterValue} ${unitText}`;
  };

  return (
    <div className="job-status-container">
      <div className="job-status-header">
        <h2>{getFilterDisplayText()}</h2>
        <div className="filter-container">
          <button
            className="filter-button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-label="Filter jobs"
            ref={filterButtonRef}
          >
            <img src="../../../../img/filter_icon.png" alt="Filter" id="filter-icon" />
          </button>
        </div>
      </div>

      {isFilterOpen && (
        <div className="filter-inline-panel" ref={filterPopupRef}>
          <div className="filter-popup-header">Filter by Time</div>
          <div className="filter-popup-body">
            <input
              type="number"
              className="filter-input"
              value={filterInputValue}
              onChange={(e) => setFilterInputValue(e.target.value)}
              placeholder="Enter number"
              min="1"
            />
            <select
              className="filter-select"
              value={filterUnit}
              onChange={(e) => onFilterChange(filterValue, e.target.value as typeof filterUnit)}
            >
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
          <div className="filter-popup-footer">
            <button className="filter-apply-btn" onClick={handleFilterApply}>
              Apply
            </button>
            <button className="filter-clear-btn" onClick={handleFilterClear}>
              Clear Filter
            </button>
          </div>
        </div>
      )}
      <div className="job-status-list">
        {jobs.map((job, index) => {
            // If job is active, show as "running" regardless of status field (matching calendar behavior)
            let calendarStatus: 'pending' | 'scheduled' | 'running' | 'completed' | 'cancelled';
            if (job.is_active) {
              calendarStatus = 'running';
            } else if (job.status === 'running') { // If the job boolean says that it isn't active, but for some reason the job status is running.
              calendarStatus = 'pending';
            } else {
              calendarStatus = job.status;
            }

            return (
              <JobStatus
                key={`job-${job.id || index}`}
                jobName={`${index + 1}`}
                status={jobStatus(job)}
                calendarStatus={calendarStatus}
                target={job.target}
                droneCount={job.drones}
                isActive={job.is_active}
                isOpen={openJobId === job.id}
                onToggle={() => handleToggle(job.id)}
                onSelectOnMap={() => onSelectOnMap(job.id)}
                onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                onCancel={() => handleCancel(job.id)}
                onDronesChange={(newCount: number) => setJobDroneCount(job.id, newCount)}
                onTargetChange={(newTarget: Target) => onSetTarget(job.id, newTarget)}
              />
            );
          })}
      </div>
    </div>
  );
}

