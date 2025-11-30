/**
 * For HTTP requests to backend.
 * Live Farm App - simplified API without simulation features.
 */

import { FarmJob, CreateFarmJobRequest, FarmJobsResponse } from "../types";
import { Target } from "../types";

// Use relative URLs - Vite proxy will route to backend on port 5001
const backendURL = "";

// SSE endpoint constants
export const SSE_ENDPOINTS = {
  state: `${backendURL}/stream/state`,
} as const;

export async function fetchState() {
    try {
        const response = await fetch(`${backendURL}/state`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const obj = await response.json();
        return obj;
    } catch (err) {
        console.error("Error fetching state:", err);
        return null;
    }
}

export async function setTarget(jobId: string, target: Target) {
    console.log("setTarget called with jobId:", jobId, "and target:", target);
    try {
        // Build the body with proper target structure
        const body: {
            target?: {
                type: "circle" | "polygon";
                center?: [number, number];
                radius?: number;
                points?: [number, number][];
            };
            is_active?: boolean;
        } = {};

        if (target && target.type === "circle") {
            body.target = {
                type: "circle",
                center: target.center,
                radius: target.radius ?? 20,
            };
        } else if (target && target.type === "polygon") {
            body.target = {
                type: "polygon",
                points: target.points,
            };
        }

        // Activate the job when setting a target
        body.is_active = true;

        console.log("Sending PATCH to /api/jobs/" + jobId + " with body:", JSON.stringify(body));

        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error response:", response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log("setTarget response:", result);
        return result;
    } catch (err) {
        console.error("Error setting target:", err);
        throw err;
    }
}

export async function setPlayPause(): Promise<void> {
    try {
        const response = await fetch(`${backendURL}/pause`, {
            method: "POST",
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (err) {
        console.error("Error toggling play/pause:", err);
        throw err;
    }
}

export async function requestRestart(): Promise<void> {
    try {
        const response = await fetch(`${backendURL}/restart`, {
            method: "POST",
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (err) {
        console.error("Error requesting restart:", err);
        throw err;
    }
}

/**
 * Fetch farm jobs for calendar display
 */
export async function fetchFarmJobs(_params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
}): Promise<FarmJob[]> {
    try {
        const response = await fetch(`${backendURL}/api/jobs`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: FarmJobsResponse = await response.json();
        // Convert backend response to FarmJob type
        const jobs: FarmJob[] = data.jobs.map(job => {
            const backendJob = job as any;
            const backendStatus = backendJob.status as string;
            // Map backend status 'running' to frontend 'active', keep 'scheduled' as-is
            let frontendStatus: 'pending' | 'scheduled' | 'active' | 'completed' | 'cancelled' = 'pending';
            if (backendStatus === 'running') {
                frontendStatus = 'active';
            } else if (backendStatus === 'scheduled') {
                frontendStatus = 'scheduled';
            } else if (backendStatus === 'completed') {
                frontendStatus = 'completed';
            } else if (backendStatus === 'cancelled') {
                frontendStatus = 'cancelled';
            } else if (backendStatus === 'pending') {
                frontendStatus = 'pending';
            }
            
            // Infer job_type based on start_at field
            const hasStartAt = backendJob.start_at !== null && backendJob.start_at !== undefined;
            const jobType: 'immediate' | 'scheduled' = hasStartAt ? 'scheduled' : 'immediate';
            
            const converted: FarmJob = {
                id: backendJob.id,
                job_type: jobType,
                scheduled_time: hasStartAt ? backendJob.start_at : undefined,
                is_recurring: false,
                target: backendJob.target,
                drone_count: backendJob.drones ?? 1,
                drones: backendJob.drones ?? 1,
                status: frontendStatus,
                created_at: backendJob.created_at,
                updated_at: backendJob.updated_at,
            };
            return converted;
        });

        return jobs;
    } catch (err) {
        console.error("Error fetching farm jobs:", err);
        return [];
    }
}

/**
 * Create a new farm job
 */
export async function createFarmJob(data: CreateFarmJobRequest): Promise<FarmJob> {
    const response = await fetch(`${backendURL}/api/jobs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            target: data.target,
            drones: data.drone_count,
            status: data.job_type === 'immediate' ? 'pending' : 'scheduled',
            start_at: data.scheduled_time,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

/**
 * Update a farm job
 */
export async function updateFarmJob(
    jobId: string,
    updates: Partial<{
        target: Target;
        drone_count: number;
        status: 'pending' | 'scheduled' | 'active' | 'completed' | 'cancelled';
        scheduled_time: string;
        is_active: boolean;
    }>
): Promise<FarmJob> {
    // Map frontend field names to backend field names
    const backendUpdates: any = {};
    if (updates.target !== undefined) backendUpdates.target = updates.target;
    if (updates.drone_count !== undefined) backendUpdates.drones = updates.drone_count;
    if (updates.status !== undefined) {
        // Map frontend 'active' to backend 'running'
        backendUpdates.status = updates.status === 'active' ? 'running' : updates.status;
    }
    if (updates.scheduled_time !== undefined) backendUpdates.start_at = updates.scheduled_time;
    if (updates.is_active !== undefined) backendUpdates.is_active = updates.is_active;

    const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(backendUpdates),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

/**
 * Delete a farm job
 */
export async function deleteFarmJob(jobId: string): Promise<void> {
    const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
}

/**
 * Set job active state
 */
export async function setJobActiveState(jobId: string, isActive: boolean): Promise<void> {
    const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: isActive }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
}

/**
 * Set job drone count
 */
export async function setJobDroneCount(jobId: string, droneCount: number): Promise<void> {
    const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ drones: droneCount }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
}
