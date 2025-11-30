import React, { useMemo } from 'react';
import { FarmJob } from '../types';

interface WeeklyScheduleViewProps {
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function WeeklyScheduleView({ jobs, onJobClick }: WeeklyScheduleViewProps) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  // Filter jobs for this week and group by day
  const jobsByDay = useMemo(() => {
    const dailyJobs: { [dayIndex: number]: FarmJob[] } = {};
    
    // Initialize days 0-6 (Sunday to Saturday)
    for (let i = 0; i < 7; i++) {
      dailyJobs[i] = [];
    }

    jobs.forEach(job => {
      // Filter out cancelled jobs
      if (job.status === 'cancelled') {
        return;
      }

      const jobDate = job.job_type === 'scheduled' && job.scheduled_time
        ? new Date(job.scheduled_time)
        : new Date(job.created_at);
      
      // Check if job is within this week
      if (jobDate >= startOfWeek && jobDate <= endOfWeek) {
        const dayIndex = jobDate.getDay();
        if (dailyJobs[dayIndex]) {
          dailyJobs[dayIndex].push(job);
        }
      } else if (job.job_type === 'immediate') {
        // Immediate jobs go to today
        const todayIndex = now.getDay();
        if (dailyJobs[todayIndex]) {
          dailyJobs[todayIndex].push(job);
        }
      }
    });

    return dailyJobs;
  }, [jobs, startOfWeek, endOfWeek, now]);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date;
  });

  return (
    <div className="weekly-schedule-view">
      <h3 className="schedule-view-title">
        Week of {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </h3>
      <div className="weekly-grid">
        {dayDates.map((date, index) => (
          <div key={index} className="day-slot">
            <div className="day-header">
              <div className="day-name">{dayNames[index]}</div>
              <div className="day-date">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
            <div className="day-jobs">
              {jobsByDay[index].map(job => (
                <div
                  key={job.id}
                  className="job-item"
                  onClick={() => onJobClick?.(job)}
                  style={{ cursor: onJobClick ? 'pointer' : 'default' }}
                >
                  <span className={`job-status job-status-${job.status}`}>{job.status}</span>
                  <span className="job-time">
                    {job.scheduled_time
                      ? new Date(job.scheduled_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      : 'Immediate'}
                  </span>
                  <span className="job-details">
                    {job.drone_count} drone{job.drone_count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
