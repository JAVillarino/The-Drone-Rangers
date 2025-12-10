import { useMemo, useState } from 'react';
import { FarmJob } from '../../types';

interface MonthlyScheduleViewProps {
  jobs: FarmJob[];
  onJobClick?: (job: FarmJob) => void;
}

export default function MonthlyScheduleView({ jobs, onJobClick }: MonthlyScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  // Note: lastDay calculated but not currently used - kept for reference
  // const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday of week containing first day

  // Filter jobs for this month
  const jobsByDate = useMemo(() => {
    const dateJobs: { [dateKey: string]: FarmJob[] } = {};

    jobs.forEach(job => {
      // Filter out cancelled jobs
      if (job.status === 'cancelled') {
        return;
      }

      const jobDate = job.start_at ? new Date(job.start_at) : new Date(job.created_at);
      
      // Check if job is within this month
      if (jobDate.getMonth() === month && jobDate.getFullYear() === year) {
        const dateKey = `${jobDate.getFullYear()}-${jobDate.getMonth()}-${jobDate.getDate()}`;
        if (!dateJobs[dateKey]) {
          dateJobs[dateKey] = [];
        }
        dateJobs[dateKey].push(job);
      } else if (job.start_at === undefined && jobDate.getMonth() === month && jobDate.getFullYear() === year) {
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

  const handlePreviousMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  const handleThisMonth = () => {
    setSelectedDate(new Date());
  };

  const now = new Date();
  const isCurrentMonth = selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear();

  const monthName = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="monthly-schedule-view">
      <div className="schedule-view-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <button
          onClick={handlePreviousMonth}
          style={{
            background: 'none',
            border: '1px solid #ccc',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
          aria-label="Previous month"
        >
          ←
        </button>
        <h3 className="schedule-view-title" style={{ margin: 0 }}>{monthName}</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isCurrentMonth && (
            <button
              onClick={handleThisMonth}
              style={{
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              This Month
            </button>
          )}
          <button
            onClick={handleNextMonth}
            style={{
              background: 'none',
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>
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
                    <div
                      key={job.id}
                      className={`calendar-job-item job-status-${job.status}`}
                      onClick={() => onJobClick?.(job)}
                      style={{ cursor: onJobClick ? 'pointer' : 'default' }}
                    >
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
