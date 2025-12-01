/**
 * For HTTP requests to backend.
 */

import { Scenario, ScenariosResponse, FarmJob, CreateFarmJobRequest, FarmJobsResponse } from "../types";
import { Target } from "../types";

// Use relative URLs - Vite proxy will route to backend on port 5001
const backendURL = "";

// SSE endpoint constants
export const SSE_ENDPOINTS = {
    state: `${backendURL}/stream/state`, // PLACEHOLDER URL - update with actual SSE endpoint
} as const;

/**
 * Fetch available policy presets from the backend
 */
export async function fetchPolicyPresets(): Promise<Record<string, PolicyPreset>> {
    try {
        const response = await fetch(`${backendURL}/policy-presets`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error fetching policy presets:", err);
        return {};
    }
}

/**
 * Fetch available scenario types from the backend
 */
export async function fetchScenarioTypes(): Promise<ScenarioType[]> {
    try {
        const response = await fetch(`${backendURL}/scenario-types`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error fetching scenario types:", err);
        return [];
    }
}

// Types for policy presets and scenario types
export interface PolicyPreset {
    key: string;
    name: string;
    description: string;
    strategy_mode: string;
    fN_multiplier: number;
    too_close_multiplier: number;
    collect_standoff_multiplier: number;
    drive_force_multiplier: number;
    repulsion_weight_multiplier: number;
    goal_bias_multiplier: number;
    max_speed_multiplier: number;
}

export interface ScenarioType {
    key: string;
    name: string;
    description: string;
    default_theme_key?: string;
    default_icon_set?: "herding" | "evacuation";
    recommended_agents?: number;
    recommended_controllers?: number;
    environment?: "farm" | "city" | "ocean";
}

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
        throw err; // Re-throw so React Query can handle the error
    }
}

export async function setTarget(jobId: string, target: Target) {
    try {
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error("Error sending target:", err);
        throw err;
    }
}

export async function setPlayPause() {
    try {
        const response = await fetch(`${backendURL}/pause`,
            {
                method: "POST",
                headers: { "Content-Length": "0" },
            }
        );
        return await response.json();
    } catch (err) {
        return console.error("Error playing/pausing.", err);
    }
}

export async function requestRestart() {
    try {
        const response = await fetch(`${backendURL}/restart`,
            {
                method: "POST",
                headers: { "Content-Length": "0" }
            }
        );
        return await response.json();
    } catch (err) {
        return console.error("Error sending restart request:", err);
    }
}

export async function setJobActiveState(jobId: string, isActive: boolean) {
    try {
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ is_active: isActive }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error(`Error setting active state for job ${jobId}:`, err);
        return null;
    }
}

export async function setJobDroneCount(jobId: string, droneCount: number) {
    try {
        console.log(`Setting drone count for job ${jobId} to ${droneCount}`);
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ drone_count: droneCount }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error(`Error setting drone count for job ${jobId}:`, err);
        return null;
    }
}

export async function getPresetScenarios(): Promise<Scenario[]> {
    try {
        const response = await fetch(`${backendURL}/scenarios?visibility=preset&limit=100`, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ScenariosResponse = await response.json();
        return data.items;
    } catch (err) {
        console.error("Error getting preset scenarios:", err);
        return [];
    }
}

export async function getAllScenarios(): Promise<Scenario[]> {
    try {
        // Fetch all scenarios (preset + custom) by not filtering by visibility
        const response = await fetch(`${backendURL}/scenarios?limit=100&sort=-created_at`, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ScenariosResponse = await response.json();
        return data.items;
    } catch (err) {
        console.error("Error getting all scenarios:", err);
        return [];
    }
}

export async function createCustomScenario(scenarioData: {
    name: string;
    sheep: [number, number][];
    shepherd: [number, number];
    target: [number, number];
    bounds: {
        xmin: number;
        xmax: number;
        ymin: number;
        ymax: number;
    };
    seed?: number;
    description?: string;
    tags?: string[];
}): Promise<{ success: boolean; scenarioId?: string; error?: string }> {
    try {
        // Validate and convert coordinates to ensure they're finite numbers
        const validateCoordinate = (coord: number): number => {
            if (!isFinite(coord) || isNaN(coord)) {
                throw new Error(`Invalid coordinate: ${coord}`);
            }
            return Number(coord.toFixed(9)); // Match backend precision
        };

        const validatePosition = (pos: [number, number]): [number, number] => {
            return [validateCoordinate(pos[0]), validateCoordinate(pos[1])];
        };

        // Convert the custom scenario data to the format expected by the backend
        const requestBody = {
            name: scenarioData.name,
            description: scenarioData.description || `Custom scenario with ${scenarioData.sheep.length} sheep`,
            tags: scenarioData.tags || ["custom"],
            visibility: "public",
            world: {
                boundary: "none",
                bounds: [
                    validateCoordinate(scenarioData.bounds.xmin),
                    validateCoordinate(scenarioData.bounds.xmax),
                    validateCoordinate(scenarioData.bounds.ymin),
                    validateCoordinate(scenarioData.bounds.ymax)
                ],
                seed: scenarioData.seed || Math.floor(Math.random() * 1000000)
            },
            entities: {
                sheep: scenarioData.sheep.map(validatePosition),
                drones: [validatePosition(scenarioData.shepherd)],
                targets: [validatePosition(scenarioData.target)]
            }
        };

        console.log("Sending scenario data:", JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${backendURL}/scenarios`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Backend error:", errorData);
            console.error("Response status:", response.status);
            throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        const createdScenario = await response.json();
        console.log("Created scenario:", createdScenario);
        return {
            success: true,
            scenarioId: createdScenario.id
        };
    } catch (err) {
        console.error("Error creating custom scenario:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error occurred"
        };
    }
}

export async function loadScenario(scenarioId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
        console.log(`Loading scenario: ${scenarioId}`);
        const response = await fetch(`${backendURL}/load-scenario/${scenarioId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || `HTTP error! status: ${response.status}`;
            console.error("Load scenario error:", errorData);
            return { success: false, error: errorMsg };
        }

        const data = await response.json();
        console.log("Loaded scenario successfully:", data);
        return { success: true, data };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error occurred";
        console.error("Error loading scenario:", err);
        return { success: false, error: errorMsg };
    }
}

/**
 * Fetch farm jobs for calendar display
 */
export async function fetchFarmJobs(_params?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    limit?: number;
    offset?: number;
}): Promise<FarmJob[]> {
    try {
        const queryParams = new URLSearchParams();
        // if (params?.startDate) queryParams.append('start_date', params.startDate);
        // if (params?.endDate) queryParams.append('end_date', params.endDate);
        // if (params?.status) queryParams.append('status', params.status);
        // if (params?.limit) queryParams.append('limit', params.limit.toString());
        // if (params?.offset) queryParams.append('offset', params.offset.toString());

        const response = await fetch(`${backendURL}/api/jobs?${queryParams}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: FarmJobsResponse = await response.json();
        console.log("data from fetch farm jobs:", data);
        // Convert backend job format to frontend FarmJob format
        return data.jobs.map(job => {
            const backendJob = job as any;
            // Backend may return 'drones' field, map it to both 'drone_count' and 'drones'
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
                is_recurring: false, // Backend doesn't support recurring yet
                target: backendJob.target,
                drone_count: backendJob.drones ?? 1,
                drones: backendJob.drones ?? 1,
                status: frontendStatus,
                created_at: backendJob.created_at,
                updated_at: backendJob.updated_at,
            };
            return converted;
        });
    } catch (err) {
        console.error("Error fetching farm jobs:", err);
        throw err;
    }
}

/**
 * Create a new farm job
 */
export async function createFarmJob(jobData: CreateFarmJobRequest): Promise<FarmJob> {
    try {
        const response = await fetch(`${backendURL}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobData),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error creating farm job:", err);
        throw err;
    }
}

/**
 * Update a farm job
 */
export async function updateFarmJob(
    jobId: string | number,
    updates: {
        scheduled_time?: string;
        target?: [number, number] | { type: "circle"; center: [number, number]; radius: number | null } | { type: "polygon"; points: [number, number][] } | null;
        drone_count?: number;
        status?: 'cancelled';
    }
): Promise<FarmJob> {
    try {
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error updating farm job:", err);
        throw err;
    }
}

/**
 * Get a specific farm job
 */
export async function getFarmJob(jobId: string | number): Promise<FarmJob> {
    try {
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: 'GET',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error fetching farm job:", err);
        throw err;
    }
}

/**
 * Delete/cancel a farm job
 */
export async function deleteFarmJob(jobId: string | number): Promise<FarmJob> {
    try {
        const response = await fetch(`${backendURL}/api/jobs/${jobId}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error("Error deleting farm job:", err);
        throw err;
    }
}