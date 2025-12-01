import { useState, useEffect } from 'react';
import './MetricsDashboard.css';

interface StepMetrics {
    t: number;
    fraction_in_goal: number;
    spread_radius: number;
    min_obstacle_distance: number;
    cohesiveness: number;
    gcm_to_goal_distance: number;
}

interface RunSummary {
    time_to_reach_fraction_50?: number | null;
    time_to_reach_fraction_90?: number | null;
    final_fraction_in_goal: number;
    max_spread_radius: number;
    avg_spread_radius: number;
    avg_cohesiveness: number;
    initial_gcm_to_goal: number;
    final_gcm_to_goal: number;
    num_steps: number;
    total_simulation_time: number;
    wall_clock_duration?: number | null;
}

interface RunMetrics {
    run_id: string;
    started_at: number;
    ended_at?: number | null;
    summary: RunSummary;
    steps?: StepMetrics[];
}

interface MetricsDashboardProps {
    onBack: () => void;
}

export default function MetricsDashboard({ onBack }: MetricsDashboardProps) {
    const [runs, setRuns] = useState<RunMetrics[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedRunDetails, setSelectedRunDetails] = useState<RunMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch list of runs on mount
    useEffect(() => {
        fetchRuns();
    }, []);

    // Fetch details when a run is selected
    useEffect(() => {
        if (selectedRunId) {
            fetchRunDetails(selectedRunId);
        } else {
            setSelectedRunDetails(null);
        }
    }, [selectedRunId]);

    const fetchRuns = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('http://127.0.0.1:5001/metrics/runs');
            if (!response.ok) throw new Error('Failed to fetch runs');
            const data = await response.json();
            // Sort by started_at descending
            const sortedRuns = (data.runs || []).sort((a: RunMetrics, b: RunMetrics) => b.started_at - a.started_at);
            setRuns(sortedRuns);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchRunDetails = async (runId: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`http://127.0.0.1:5001/metrics/runs/${runId}`);
            if (!response.ok) throw new Error('Failed to fetch run details');
            const data = await response.json();
            setSelectedRunDetails(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    const formatDuration = (seconds: number) => {
        return `${seconds.toFixed(1)}s`;
    };

    return (
        <div className="metrics-dashboard">
            <div className="metrics-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h2>Simulation Metrics</h2>
                <button className="refresh-button" onClick={fetchRuns} disabled={isLoading}>
                    {isLoading ? 'Loading...' : '↻ Refresh'}
                </button>
            </div>

            {error && <div className="metrics-error">{error}</div>}

            <div className="metrics-content">
                <div className="runs-list">
                    <h3>History</h3>
                    {runs.length === 0 ? (
                        <p className="no-data">No recorded runs yet.</p>
                    ) : (
                        <ul>
                            {runs.map(run => (
                                <li
                                    key={run.run_id}
                                    className={selectedRunId === run.run_id ? 'active' : ''}
                                    onClick={() => setSelectedRunId(run.run_id)}
                                >
                                    <div className="run-date">{formatDate(run.started_at)}</div>
                                    <div className="run-id">ID: {run.run_id.substring(0, 8)}</div>
                                    <div className="run-status">
                                        {run.summary.final_fraction_in_goal > 0.9 ? '✅ Success' : '⚠️ Partial'}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="run-details">
                    {selectedRunDetails ? (
                        <div className="details-container">
                            <div className="details-header">
                                <h3>Run Analysis: {selectedRunDetails.run_id.substring(0, 8)}</h3>
                                <span className="timestamp">{formatDate(selectedRunDetails.started_at)}</span>
                            </div>

                            <div className="stats-grid">
                                <div className="stat-card">
                                    <h4>Success Rate</h4>
                                    <div className="stat-value">
                                        {(selectedRunDetails.summary.final_fraction_in_goal * 100).toFixed(1)}%
                                    </div>
                                    <div className="stat-label">Agents in Goal</div>
                                </div>

                                <div className="stat-card">
                                    <h4>Time to Goal</h4>
                                    <div className="stat-value">
                                        {selectedRunDetails.summary.time_to_reach_fraction_90
                                            ? formatDuration(selectedRunDetails.summary.time_to_reach_fraction_90)
                                            : 'N/A'}
                                    </div>
                                    <div className="stat-label">To 90% Collected</div>
                                </div>

                                <div className="stat-card">
                                    <h4>Cohesiveness</h4>
                                    <div className="stat-value">
                                        {selectedRunDetails.summary.avg_cohesiveness.toFixed(2)}
                                    </div>
                                    <div className="stat-label">Average Score</div>
                                </div>

                                <div className="stat-card">
                                    <h4>Efficiency</h4>
                                    <div className="stat-value">
                                        {formatDuration(selectedRunDetails.summary.total_simulation_time)}
                                    </div>
                                    <div className="stat-label">Simulated Time</div>
                                </div>
                            </div>

                            <div className="detailed-stats">
                                <h4>Detailed Statistics</h4>
                                <table>
                                    <tbody>
                                        <tr>
                                            <td>Total Steps</td>
                                            <td>{selectedRunDetails.summary.num_steps}</td>
                                        </tr>
                                        <tr>
                                            <td>Wall Clock Duration</td>
                                            <td>{selectedRunDetails.summary.wall_clock_duration ? formatDuration(selectedRunDetails.summary.wall_clock_duration) : '-'}</td>
                                        </tr>
                                        <tr>
                                            <td>Initial Distance to Goal</td>
                                            <td>{selectedRunDetails.summary.initial_gcm_to_goal.toFixed(1)}m</td>
                                        </tr>
                                        <tr>
                                            <td>Final Distance to Goal</td>
                                            <td>{selectedRunDetails.summary.final_gcm_to_goal.toFixed(1)}m</td>
                                        </tr>
                                        <tr>
                                            <td>Max Spread Radius</td>
                                            <td>{selectedRunDetails.summary.max_spread_radius.toFixed(1)}m</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>Select a run from the history to view details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
