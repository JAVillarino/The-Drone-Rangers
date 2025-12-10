import { useMemo, useState } from 'react';
import { FarmJob } from '../../types';

interface DailyScheduleViewProps {
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function DailyScheduleView({ jobs, onJobClick }: DailyScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Filter jobs for selected date and group by hour
  const jobsByHour = useMemo(() => {
    const targetDate = new Date(selectedDate);
    targetDate.setHours(0, 0, 0, 0);
    
    const hourlyJobs: { [hour: number]: FarmJob[] } = {};
    
    // Initialize hours 0-23
    for (let i = 0; i < 24; i++) {
      hourlyJobs[i] = [];
    }

    jobs.forEach(job => {
      // Filter out cancelled jobs
      if (job.status === 'cancelled') {
        return;
      }

      // Determine the job's scheduled date/time
      // Use start_at if available (scheduled jobs), otherwise use created_at (immediate jobs)
      const jobDate = job.start_at ? new Date(job.start_at) : new Date(job.created_at);
      
      // Check if job is for selected date (compare dates only, ignoring time)
      const jobDay = new Date(jobDate);
      jobDay.setHours(0, 0, 0, 0);
      
      // Only show jobs scheduled for selected date
      if (jobDay.getTime() === targetDate.getTime()) {
        // Use the hour from the job's scheduled/created time
        const hour = jobDate.getHours();
        if (hour >= 0 && hour < 24 && hourlyJobs[hour]) {
          hourlyJobs[hour].push(job);
        }
      }
      // Don't show jobs from previous days, even if they're immediate jobs
    });

    return hourlyJobs;
  }, [jobs, selectedDate]);

  const handlePreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const handleNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  return (
    <div className="daily-schedule-view">
      <div className="schedule-view-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <button
          onClick={handlePreviousDay}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
          aria-label="Previous day"
        >
          ←
        </button>
        <h3 className="schedule-view-title" style={{ margin: 0 }}>
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isToday && (
            <button
              onClick={handleToday}
              style={{
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Today
            </button>
          )}
          <button
            onClick={handleNextDay}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            aria-label="Next day"
          >
            →
          </button>
        </div>
      </div>
      <div className="hourly-grid">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} className="hour-slot">
            <div className="hour-label">
              {i.toString().padStart(2, '0')}:00
            </div>
            <div className="hour-jobs">
              {jobsByHour[i].map(job => (
                <div
                  key={job.id}
                  className="job-item"
                  onClick={() => onJobClick?.(job)}
                  style={{ cursor: onJobClick ? 'pointer' : 'default' }}
                >
                  <span className={`job-status job-status-${job.status}`}>{job.status}</span>
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
