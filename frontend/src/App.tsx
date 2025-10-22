import {useState} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart, createCustomScenario } from './api/state'
import { MapPlot } from './components/MapPlot'
import { State } from "./types.ts"
import './App.css'
import WelcomePage from "./components/WelcomePage";
import LandingPage from "./components/LandingPage";
import LiveSystemPage from "./components/LiveSystemPage";

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 600;

  const worldMin = 0;
  const worldMax = 250;

  const [currentView, setCurrentView] = useState<'welcome' | 'simulator' | 'simulation' | 'live-system'>('welcome');
  const [selectedImage, setSelectedImage] = useState<string>("");



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

    // Navigation handlers
    const handleNavigateToSimulator = () => {
      console.log('Navigating to simulator');
      setCurrentView('simulator');
    };

    const handleNavigateToRealSystem = () => {
      console.log('Navigating to live system');
      setCurrentView('live-system');
    };

    const handleBackToWelcome = () => {
      console.log('Going back to welcome page');
      setCurrentView('welcome');
      setSelectedImage("");
    };

    const handleBackFromLiveSystem = () => {
      console.log('Going back to welcome page from live system');
      setCurrentView('welcome');
    };

    const handleBackToSimulator = () => {
      console.log('Going back to simulator');
      setCurrentView('simulator');
      setSelectedImage("");
    };

    // This function will be passed to the LandingPage to start the simulation
    const handleSimulationStart = (scenario: string, selectedImage?: string) => {
      // Here you would also likely trigger your `useQuery` to fetch initial data for the chosen scenario
      // For now.. just set sim to pause maybe? can connect once endpoint.
      console.log(`App is now starting the simulation for: ${scenario}`);
      console.log(`Selected image: ${selectedImage}`);
      if (selectedImage) {
        setSelectedImage(selectedImage);
      }
      setCurrentView('simulation');
    };

    // Dummy function for starting preset simulations
    const startPresetSim = async (scenario: string): Promise<unknown> => {
      console.log(`Starting preset simulation: ${scenario}`);
      // TODO: Replace with actual API call to start preset scenario
      // For now, just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, scenario };
    };
  
  if (isLoading) return <p>Loading...</p>;
  if (error instanceof Error) return <p>Error: {error.message}</p>;
  if (!data) return <p>No data</p>;

  return (
    <>
      {currentView === 'welcome' ? (
        <WelcomePage 
          onNavigateToSimulator={handleNavigateToSimulator} 
          onNavigateToRealSystem={handleNavigateToRealSystem} 
        />
      ) : currentView === 'simulator' ? (
        <LandingPage 
          onSimulationStart={handleSimulationStart} 
          worldMax={worldMax} 
          worldMin={worldMin} 
          startPresetSim={startPresetSim} 
          startCustomSim={createCustomScenario}
          onBack={handleBackToWelcome}
        />
      ) : currentView === 'live-system' ? (
        <LiveSystemPage 
          onBack={handleBackFromLiveSystem}
        />
      ) : (
        <MapPlot 
          data={data} 
          onSetTarget={handleSetTarget} 
          CANVAS_SIZE={CANVAS_SIZE} 
          zoomMin={worldMin} 
          zoomMax={worldMax} 
          onPlayPause={handlePlayPause} 
          onRestart={requestRestart} 
          onBack={handleBackToSimulator} 
          selectedImage={selectedImage}
        />
      )}
    </>
  );

}

export default App;
