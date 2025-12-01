import React from 'react';
import { useQuery } from '@tanstack/react-query';

interface StepMetrics {
    t: number;
    fraction_in_goal: number;
    spread_radius: number;
    min_obstacle_distance: number;
    cohesiveness: number;
    gcm_to_goal_distance: number;
}

interface RunMetrics {
    active: boolean;
    run_id: string | null;
    num_steps: number;
    started_at: number;
    latest_step: StepMetrics | null;
}

const fetchCurrentMetrics = async (): Promise<RunMetrics> => {
    const response = await fetch('/metrics/current');
    if (!response.ok) {
        throw new Error('Failed to fetch metrics');
    }
    return response.json();
};

export const MetricsDisplay: React.FC = () => {
    const { data: metrics, error, isError } = useQuery({
        queryKey: ['metrics'],
        queryFn: fetchCurrentMetrics,
        refetchInterval: 1000, // Poll every second
        retry: 1, // Retry once before showing error
    });

    if (isError) {
        // Don't show error immediately if we have stale data? 
        // Actually, if it fails, just show a subtle indicator or keep previous data if possible.
        // For now, let's make the error message less alarming if it's transient.
        return <div style={{ color: '#d32f2f', padding: '10px', fontSize: '0.9em' }}>
            Unable to sync metrics (retrying...)
        </div>;
    }

    if (!metrics || !metrics.active) {
        return (
            <div style={{ padding: '10px', marginTop: '10px', opacity: 0.7, fontSize: '0.9em', color: '#666' }}>
                Metrics not active (start a job to see metrics)
            </div>
        );
    }

    if (metrics.active && !metrics.latest_step) {
        return (
            <div style={{ padding: '10px', marginTop: '10px', opacity: 0.7, fontSize: '0.9em', color: '#666' }}>
                Starting metrics collection...
            </div>
        );
    }

    const step = metrics.latest_step;

    if (!step) {
        return null;
    }

    return (
        <div style={{ padding: '15px', marginTop: '10px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1em', color: '#333' }}>Live Metrics</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* Goal Progress */}
                <div style={{ gridColumn: '1 / -1', marginBottom: '5px' }}>
                    <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '2px' }}>Goal Progress</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ flexGrow: 1, height: '8px', backgroundColor: '#e0e0e0', borderRadius: '4px', marginRight: '10px', overflow: 'hidden' }}>
                            <div style={{
                                width: `${Math.min(100, Math.max(0, step.fraction_in_goal * 100))}%`,
                                height: '100%',
                                backgroundColor: step.fraction_in_goal > 0.9 ? '#4caf50' : '#2196f3',
                                transition: 'width 0.5s ease-in-out'
                            }} />
                        </div>
                        <div style={{ fontSize: '0.9em', fontWeight: 'bold', minWidth: '35px' }}>
                            {Math.round(step.fraction_in_goal * 100)}%
                        </div>
                    </div>
                </div>

                <MetricItem
                    label="Flock Spread"
                    value={(step.spread_radius * 0.2).toFixed(1)}
                    unit="m"
                />
                <MetricItem
                    label="Cohesiveness"
                    value={step.cohesiveness.toFixed(2)}
                />
                <MetricItem
                    label="Dist. to Goal"
                    value={(step.gcm_to_goal_distance * 0.2).toFixed(1)}
                    unit="m"
                />
                <MetricItem
                    label="Time Elapsed"
                    value={(() => {
                        const mins = Math.floor(step.t / 60);
                        const secs = Math.floor(step.t % 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                    })()}
                    unit=""
                />
            </div>
        </div>
    );
};

const MetricItem: React.FC<{ label: string; value: string; unit?: string }> = ({ label, value, unit }) => (
    <div style={{ backgroundColor: 'white', padding: '8px', borderRadius: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <div style={{ fontSize: '0.75em', color: '#666' }}>{label}</div>
        <div style={{ fontSize: '1em', fontWeight: 'bold', color: '#333' }}>
            {value} {unit && <span style={{ fontSize: '0.8em', color: '#888', fontWeight: 'normal' }}>{unit}</span>}
        </div>
    </div>
);
