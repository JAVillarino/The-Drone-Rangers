/**
 * For HTTP requests to backend.
 */

const backendURL = "http://127.0.0.1:5000";

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