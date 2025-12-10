import { useMemo, useState } from 'react';
import { FarmJob } from '../../types';

interface WeeklyScheduleViewProps {
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function WeeklyScheduleView({ jobs, onJobClick }: WeeklyScheduleViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<Date>(new Date());

  const startOfWeek = useMemo(() => {
    const week = new Date(selectedWeek);
    week.setDate(week.getDate() - week.getDay()); // Sunday
    week.setHours(0, 0, 0, 0);
    return week;
  }, [selectedWeek]);
  
  const endOfWeek = useMemo(() => {
    const end = new Date(startOfWeek);
    end.setDate(startOfWeek.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [startOfWeek]);

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

      // Determine the job's scheduled date/time
      // Use start_at if available (scheduled jobs), otherwise use created_at (immediate jobs)
      const jobDate = job.start_at
        ? new Date(job.start_at)
        : new Date(job.created_at);
      
      // Check if job is within this week (compare full dates, not just day of week)
      if (jobDate >= startOfWeek && jobDate <= endOfWeek) {
        // Calculate which day of the week this job belongs to (0 = Sunday, 6 = Saturday)
        const dayIndex = jobDate.getDay();
        if (dayIndex >= 0 && dayIndex < 7 && dailyJobs[dayIndex]) {
          dailyJobs[dayIndex].push(job);
        }
      }
      // Don't show jobs from outside this week, even if they're immediate jobs
    });

    return dailyJobs;
  }, [jobs, startOfWeek, endOfWeek]);

  const handlePreviousWeek = () => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(newWeek.getDate() - 7);
    setSelectedWeek(newWeek);
  };

  const handleNextWeek = () => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(newWeek.getDate() + 7);
    setSelectedWeek(newWeek);
  };

  const handleThisWeek = () => {
    setSelectedWeek(new Date());
  };

  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay());
  currentWeekStart.setHours(0, 0, 0, 0);
  const isCurrentWeek = startOfWeek.getTime() === currentWeekStart.getTime();

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date;
  });

  return (
    <div className="weekly-schedule-view">
      <div className="schedule-view-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <button
          onClick={handlePreviousWeek}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
          aria-label="Previous week"
        >
          ←
        </button>
        <h3 className="schedule-view-title" style={{ margin: 0 }}>
          Week of {startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isCurrentWeek && (
            <button
              onClick={handleThisWeek}
              style={{
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              This Week
            </button>
          )}
          <button
            onClick={handleNextWeek}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>
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
                    {job.start_at
                      ? new Date(job.start_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
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
