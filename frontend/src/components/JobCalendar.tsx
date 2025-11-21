import React from 'react';
import { FarmJob } from '../types';
import DailyScheduleView from './DailyScheduleView';
import WeeklyScheduleView from './WeeklyScheduleView';
import MonthlyScheduleView from './MonthlyScheduleView';

interface JobCalendarProps {
  view: 'daily' | 'weekly' | 'monthly';
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function JobCalendar({ view, jobs, onJobClick }: JobCalendarProps) {
  switch (view) {
    case 'daily':
      return <DailyScheduleView jobs={jobs} onJobClick={onJobClick} />;
    case 'weekly':
      return <WeeklyScheduleView jobs={jobs} onJobClick={onJobClick} />;
    case 'monthly':
      return <MonthlyScheduleView jobs={jobs} onJobClick={onJobClick} />;
    default:
      return <DailyScheduleView jobs={jobs} onJobClick={onJobClick} />;
  }
}
