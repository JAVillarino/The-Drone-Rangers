import { useState, useRef, useEffect } from 'react';
import { Job, Target } from '../types';
import JobStatus from './JobStatus';
import { setJobActiveState, setJobDroneCount, deleteFarmJob } from '../api/state';

interface JobStatusContainerProps {
  jobs: Job[];
  filterValue: number | null;
  filterUnit: 'hours' | 'days' | 'weeks' | 'months';
  onFilterChange: (value: number | null, unit: 'hours' | 'days' | 'weeks' | 'months') => void;
  onSetTarget: (jobId: string, target: Target) => void;
  onSelectOnMap: (jobId: string) => void;
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
  onSelectOnMap
}: JobStatusContainerProps) {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterInputValue, setFilterInputValue] = useState<string>(filterValue?.toString() || '');
  const filterPopupRef = useRef<HTMLDivElement>(null);

  // Sync filter input when filterValue changes externally
  useEffect(() => {
    setFilterInputValue(filterValue?.toString() || '');
  }, [filterValue]);

  // Close filter popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
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
    setOpenJobId(openJobId === jobId ? null : jobId);
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }
    
    try {
      await deleteFarmJob(jobId);
      // If the cancelled job was open, close it
      if (openJobId === jobId) {
        setOpenJobId(null);
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  return (
    <div className="job-status-container">
      <div className="job-status-header">
        <h2>Job Queue</h2>
        <div className="filter-container" ref={filterPopupRef}>
          <button
            className="filter-button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-label="Filter jobs"
          >
            <img src="../../../../img/filter_icon.png" alt="Filter" id="filter-icon"/>
          </button>
          {isFilterOpen && (
            <div className="filter-popup">
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
        </div>
      </div>
      <div className="job-status-list">
        {jobs.map((job, index) => (
          <JobStatus
            key={`job-${job.id || index}`}
            jobName={`${index + 1}`}
            status={jobStatus(job)}
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
        ))}
      </div>
    </div>
  );
}

