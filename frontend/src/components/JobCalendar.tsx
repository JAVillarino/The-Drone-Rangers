import React from 'react';
import { FarmJob } from '../types';
import DailyScheduleView from './DailyScheduleView';
import WeeklyScheduleView from './WeeklyScheduleView';
import MonthlyScheduleView from './MonthlyScheduleView';

interface JobCalendarProps {
  view: 'daily' | 'weekly' | 'monthly';
  jobs: FarmJob[];
}

export default function JobCalendar({ view, jobs }: JobCalendarProps) {
  switch (view) {
    case 'daily':
      return <DailyScheduleView jobs={jobs} />;
    case 'weekly':
      return <WeeklyScheduleView jobs={jobs} />;
    case 'monthly':
      return <MonthlyScheduleView jobs={jobs} />;
    default:
      return <DailyScheduleView jobs={jobs} />;
  }
}
