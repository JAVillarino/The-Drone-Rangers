import {useState} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart, startPresetSimulation, startCustomSimulation } from './api/state'
import {MapPlot, ObjectData} from './components/MapPlot'
import './App.css'
import LandingPage from "./components/LandingPage";


type LocData = [number, number];

/*interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
}*/

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 600;

  const worldMin = -60;
  const worldMax = 60;

  const [activeScenario, setActiveScenario] = useState<string | null>(null);



  const { data, isLoading, error } = useQuery<ObjectData>({
    queryKey: ["objects"],
    queryFn: fetchState,
    refetchInterval: 25
  });

  const mutation = useMutation({
    mutationFn: setTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"]});
    }
  });

  function handleSetTarget(coords: {x: number; y: number}) {
    mutation.mutate(coords);
  }

    // This function will be passed to the LandingPage to start the simulation
    const handleSimulationStart = (scenario: string) => {
      // Here you would also likely trigger your `useQuery` to fetch initial data for the chosen scenario
      // For now.. just set sim to pause maybe? can connect once endpoint.
      console.log(`App is now starting the simulation for: ${scenario}`);
      setActiveScenario(scenario);
    };

  
  if (isLoading) return <p>Loading...</p>;
  if (error instanceof Error) return <p>Error: {error.message}</p>;
  if (!data) return <p>No data</p>;

  return (
    <>
      {!activeScenario ? (
        <LandingPage onSimulationStart={handleSimulationStart} worldMax={worldMax} worldMin={worldMin} startCustomSim={startCustomSimulation} startPresetSim={startPresetSimulation}/>
      ) : (
        <MapPlot data={data} onSetTarget={handleSetTarget} CANVAS_SIZE={CANVAS_SIZE} zoomMin={worldMin} zoomMax={worldMax} onPlayPause={setPlayPause} onRestart={requestRestart}/>

      )}
    </>
  );

}

export default App;
