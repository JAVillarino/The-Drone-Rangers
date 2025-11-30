import React from 'react';

interface ScheduleViewControlsProps {
  scheduleView: 'daily' | 'weekly' | 'monthly';
  onViewChange: (view: 'daily' | 'weekly' | 'monthly') => void;
  onAddJob: () => void;
}

export default function ScheduleViewControls({ 
  scheduleView, 
  onViewChange, 
  onAddJob 
}: ScheduleViewControlsProps) {
  return (
    <div className="schedule-view-controls">
      <div className="view-toggle-group">
        <button
          className={`view-toggle-button ${scheduleView === 'daily' ? 'active' : ''}`}
          onClick={() => onViewChange('daily')}
        >
          Daily
        </button>
        <button
          className={`view-toggle-button ${scheduleView === 'weekly' ? 'active' : ''}`}
          onClick={() => onViewChange('weekly')}
        >
          Weekly
        </button>
        <button
          className={`view-toggle-button ${scheduleView === 'monthly' ? 'active' : ''}`}
          onClick={() => onViewChange('monthly')}
        >
          Monthly
        </button>
      </div>
      <button className="add-job-button" onClick={onAddJob}>
        Add a Job
      </button>
    </div>
  );
}
