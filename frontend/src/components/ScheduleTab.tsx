import React from 'react';
import { FarmJob } from '../types';
import ScheduleViewControls from './ScheduleViewControls';
import JobCalendar from './JobCalendar';

interface ScheduleTabProps {
  scheduleView: 'daily' | 'weekly' | 'monthly';
  onViewChange: (view: 'daily' | 'weekly' | 'monthly') => void;
  onAddJob: () => void;
  jobs: FarmJob[];
  isLoading?: boolean;
}

export default function ScheduleTab({
  scheduleView,
  onViewChange,
  onAddJob,
  jobs,
  isLoading
}: ScheduleTabProps) {
  if (isLoading) {
    return (
      <div className="schedule-tab">
        <div className="loading-message">Loading jobs...</div>
      </div>
    );
  }

  return (
    <div className="schedule-tab">
      <ScheduleViewControls
        scheduleView={scheduleView}
        onViewChange={onViewChange}
        onAddJob={onAddJob}
      />
      <JobCalendar view={scheduleView} jobs={jobs} />
    </div>
  );
}
