import { useMemo } from 'react';
import { FarmJob } from '../../types';

interface DailyScheduleViewProps {
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function DailyScheduleView({ jobs, onJobClick }: DailyScheduleViewProps) {
  // Filter jobs for today and group by hour
  const jobsByHour = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
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
      
      // Check if job is for today (compare dates only, ignoring time)
      const jobDay = new Date(jobDate);
      jobDay.setHours(0, 0, 0, 0);
      
      // Only show jobs scheduled for today
      if (jobDay.getTime() === today.getTime()) {
        // Use the hour from the job's scheduled/created time
        const hour = jobDate.getHours();
        if (hour >= 0 && hour < 24 && hourlyJobs[hour]) {
          hourlyJobs[hour].push(job);
        }
      }
      // Don't show jobs from previous days, even if they're immediate jobs
    });

    return hourlyJobs;
  }, [jobs]);

  const today = new Date();

  return (
    <div className="daily-schedule-view">
      <h3 className="schedule-view-title">
        {today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </h3>
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
