# The-Drone-Rangers

## Backend

To run it execute `python ./server/main.py`.

## Frontend

There are two frontend applications, the Live Farm App and the Simulation App. Both depend on the same backend server and will not run correctly if it has not already been started.

### Live Farm App
To run the live farm management app, execute:

```
cd ./frontend/livefarm-app
npm install
npm run dev
```

The app will be available at `http://localhost:5174/` when running.

### Simulation App
To run the simulation app, execute:

```
cd ./frontend/simulation-app
npm install
npm run dev
```

The app will be available at `http://localhost:5173/` when running.

## Testing
There is a suite of tests written in pytest to evaluate the end-to-end behavior of the backend. 