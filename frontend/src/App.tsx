import {useState} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart } from './api/state'
import { MapPlot } from './components/MapPlot'
import { State } from "./types.ts"
import './App.css'
import LandingPage from "./components/LandingPage";


/*interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
}*/

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 600;

  const worldMin = 0;
  const worldMax = 250;

  const [activeScenario, setActiveScenario] = useState<string | null>(null);



  const { data, isLoading, error } = useQuery<State>({
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

  async function handlePlayPause() {
    try {
      await setPlayPause();
    } catch (error) {
      console.error("Error toggling pause state:", error);
    }
  }

    // This function will be passed to the LandingPage to start the simulation
    const handleSimulationStart = (scenario: string) => {
      // Here you would also likely trigger your `useQuery` to fetch initial data for the chosen scenario
      // For now.. just set sim to pause maybe? can connect once endpoint.
      console.log(`App is now starting the simulation for: ${scenario}`);
      setActiveScenario(scenario);
    };

    // Dummy function for starting preset simulations
    const startPresetSim = async (scenario: string): Promise<unknown> => {
      console.log(`Starting preset simulation: ${scenario}`);
      // TODO: Replace with actual API call to start preset scenario
      // For now, just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, scenario };
    };

    // Dummy function for starting custom simulations
    const startCustomSim = async (scenario: {
      name: string;
      seed: number;
      flockSize: number;
      sheep: [number, number][];
      shepherd: [number, number];
      target: [number, number];
      bounds: {
        xmin: number;
        xmax: number;
        ymin: number;
        ymax: number;
      };
      start: boolean;
    }): Promise<unknown> => {
      console.log(`Starting custom simulation:`, scenario);
      // TODO: Replace with actual API call to start custom scenario
      // For now, just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, scenario };
    };

  
  if (isLoading) return <p>Loading...</p>;
  if (error instanceof Error) return <p>Error: {error.message}</p>;
  if (!data) return <p>No data</p>;

  return (
    <>
      {!activeScenario ? (
        <LandingPage onSimulationStart={handleSimulationStart} worldMax={worldMax} worldMin={worldMin} startPresetSim={startPresetSim} startCustomSim={startCustomSim}/>
      ) : (
        <MapPlot data={data} onSetTarget={handleSetTarget} CANVAS_SIZE={CANVAS_SIZE} zoomMin={worldMin} zoomMax={worldMax} onPlayPause={handlePlayPause} onRestart={requestRestart}/>

      )}
    </>
  );

}

export default App;
