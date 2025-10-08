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
        // same deal
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