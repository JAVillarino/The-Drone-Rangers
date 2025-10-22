/**
 * For HTTP requests to backend.
 */

import { Scenario, ScenariosResponse } from "../types";

const backendURL = "http://127.0.0.1:5000";

type LocData = [number, number];

interface ObjectData {
    flock: LocData[],
    drones: LocData[],
    jobs: Array<{
        target: LocData | null,
        target_radius: number,
        remaining_time: number | null,
        is_active: boolean
    }>,
    polygons: LocData[][]
}

interface CustomScenario {
    name: string,
    seed: number,
    flockSize: number,
    sheep: [number, number][],
    shepherd: [number, number],
    target: [number, number],
    bounds: {
        xmin: number,
        xmax: number,
        ymin: number,
        ymax: number
    },
    start: boolean
    // missing: polygons (i.e. obstacles), params, 
}

export async function fetchState() {
    return fetch(`${backendURL}/state`)
    .then((response) => {
        const obj =  response.json();
        return obj;

    })    
    .catch((err) => 
        console.error("Error fetching state:", err)
    );
}

export async function setTarget(coords: {x: number, y: number}) {
    try {
        const response = await fetch(`${backendURL}/target`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    "position": [coords.x, coords.y]
                })
            }
        );
        
        return await response.json();
    } catch (err) {
        return console.error("Error sending target coords:", err);
    }
}

export async function setPlayPause() {
    try {
        const response = await fetch(`${backendURL}/pause`,
            {
                method: "POST",
                headers: {"Content-Length": "0"},
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
                headers: {"Content-Length": "0"}
            }
        );
        return await response.json();
    } catch (err) {
        return console.error("Error sending restart request:", err);
    }
}

export async function setJobActiveState(jobId: number, isActive: boolean) {
    try {
        const response = await fetch(`${backendURL}/jobs/${jobId}`, {
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

export async function setJobDroneCount(jobId: number, droneCount: number) {
    try {
        console.log(`Setting drone count for job ${jobId} to ${droneCount}`);
        const response = await fetch(`${backendURL}/jobs/${jobId}`, {
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