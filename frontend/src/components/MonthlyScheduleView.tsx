import React, { useMemo } from 'react';
import { FarmJob } from '../types';

interface MonthlyScheduleViewProps {
  jobs: FarmJob[];
}

export default function MonthlyScheduleView({ jobs }: MonthlyScheduleViewProps) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday of week containing first day

  // Filter jobs for this month
  const jobsByDate = useMemo(() => {
    const dateJobs: { [dateKey: string]: FarmJob[] } = {};

    jobs.forEach(job => {
      const jobDate = job.job_type === 'scheduled' && job.scheduled_time
        ? new Date(job.scheduled_time)
        : new Date(job.created_at);
      
      // Check if job is within this month
      if (jobDate.getMonth() === month && jobDate.getFullYear() === year) {
        const dateKey = `${jobDate.getFullYear()}-${jobDate.getMonth()}-${jobDate.getDate()}`;
        if (!dateJobs[dateKey]) {
          dateJobs[dateKey] = [];
        }
        dateJobs[dateKey].push(job);
      } else if (job.job_type === 'immediate' && jobDate.getMonth() === month && jobDate.getFullYear() === year) {
        // Immediate jobs in current month
        const dateKey = `${jobDate.getFullYear()}-${jobDate.getMonth()}-${jobDate.getDate()}`;
        if (!dateJobs[dateKey]) {
          dateJobs[dateKey] = [];
        }
        dateJobs[dateKey].push(job);
      }
    });

    return dateJobs;
  }, [jobs, month, year]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];
    const currentDate = new Date(startDate);

    // Generate 6 weeks of days (42 days)
    for (let i = 0; i < 42; i++) {
      const isCurrentMonth = currentDate.getMonth() === month;
      days.push({
        date: new Date(currentDate),
        isCurrentMonth
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }, [startDate, month]);

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="monthly-schedule-view">
      <h3 className="schedule-view-title">{monthName}</h3>
      <div className="calendar-grid">
        <div className="calendar-header">
          {dayNames.map(day => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}
        </div>
        <div className="calendar-body">
          {calendarDays.map((dayData, index) => {
            const dateKey = `${dayData.date.getFullYear()}-${dayData.date.getMonth()}-${dayData.date.getDate()}`;
            const dayJobs = jobsByDate[dateKey] || [];
            const isToday = dayData.date.toDateString() === now.toDateString();

            return (
              <div
                key={index}
                className={`calendar-day ${!dayData.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
              >
                <div className="calendar-day-number">{dayData.date.getDate()}</div>
                <div className="calendar-day-jobs">
                  {dayJobs.slice(0, 3).map(job => (
                    <div key={job.id} className={`calendar-job-item job-status-${job.status}`}>
                      {job.drone_count} drone{job.drone_count !== 1 ? 's' : ''}
                    </div>
                  ))}
                  {dayJobs.length > 3 && (
                    <div className="calendar-job-more">+{dayJobs.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
