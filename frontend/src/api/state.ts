/**
 * For HTTP requests to backend.
 */

const backendURL = "http://127.0.0.1:5000";

type LocData = [number, number];

interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
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

/**
 * Stub for a request to start a preset scenario.
 * @param scenario 
 * @returns 
 */
export async function startPresetSimulation(scenario: string) {
    console.log(`Sending scenario ${scenario} to the backend.`);

    return new Promise(resolve => setTimeout(() => {
        alert(`Simulation with scenario "${scenario}" has been started.`)
        resolve({success: true, scenario: scenario});
    }, 500));
}

export async function startCustomSimulation(customScenario: CustomScenario) {
    console.log("Sending custom scenario to the backend.");

    return new Promise(resolve => setTimeout(() => resolve({ success: true }), 500));

}