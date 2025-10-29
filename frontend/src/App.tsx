import {useState} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart, createCustomScenario } from './api/state'
import { MapPlot } from './components/MapPlot'
import { State } from "./types.ts"
import './App.css'
import WelcomePage from "./components/WelcomePage";
import LandingPage from "./components/LandingPage";
import RealFarmView from "./components/RealFarmView";
import DroneManagementPage from "./components/DroneManagementPage";
import { useSSE } from './hooks/useSSE';

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 600;

  const worldMin = 0;
  const worldMax = 250;

  const [currentView, setCurrentView] = useState<'welcome' | 'simulator' | 'simulation' | 'live-system' | 'drone-management'>('welcome');
  const [selectedImage, setSelectedImage] = useState<string>("");

  // Determine if we should use SSE (when simulation view is active)
  const shouldUseSSE = currentView === 'simulation';
  
  // SSE connection for real-time updates
  const { data: sseData, isConnected, hasError } = useSSE({
    url: 'http://127.0.0.1:5000/stream/state', // PLACEHOLDER URL - update with actual SSE endpoint
    enabled: shouldUseSSE,
    onError: (error) => {
      console.error('SSE error, falling back to polling:', error);
    }
  });

  // Log connection status for debugging
  if (shouldUseSSE) {
    console.log('SSE connection status:', isConnected, 'hasError:', hasError);
  }

  // Determine if we should actually use SSE data (only if connected and have data)
  const actuallyUsingSSE = shouldUseSSE && isConnected;

  // Check if we need state data (simulation or live-system views)
  const needsStateData = currentView === 'simulation' || currentView === 'live-system';

  // Traditional polling (use when SSE is not actually working, or for live-system view)
  const { data: pollingData, isLoading, error } = useQuery<State>({
    queryKey: ["objects"],
    queryFn: fetchState,
    refetchInterval: needsStateData && !actuallyUsingSSE ? 25 : false, // Poll for both simulation and live-system if SSE not active
    enabled: needsStateData && !actuallyUsingSSE // Query for both simulation and live-system views when SSE is not active
  });

  // Use SSE data when actually connected, otherwise use polling data
  const data = actuallyUsingSSE && sseData ? sseData : pollingData;

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

    const handleNavigateToDroneManagement = () => {
      console.log('Navigating to drone management');
      setCurrentView('drone-management');
    };
    
    const handleBackFromDroneManagement = () => {
      console.log('Going back to live system from drone management');
      setCurrentView('live-system');
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
  
    // Show loading/error states when on simulation or live-system views that need data
    if (needsStateData) {
      if (isLoading) return <p>Loading...</p>;
      if (error instanceof Error) return <p>Error: {error.message}</p>;
      if (!data && currentView === 'simulation') return <p>No data</p>;
    }

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
        data ? (
          <RealFarmView 
            onBack={handleBackFromLiveSystem}
            data={data}
            onSetTarget={handleSetTarget}
            zoomMin={worldMin}
            zoomMax={worldMax}
            CANVAS_SIZE={CANVAS_SIZE}
            onPlayPause={handlePlayPause}
            onRestart={requestRestart}
            selectedImage={selectedImage}
          />
        ) : (
          <p>Loading farm data...</p>
        )
      ) : (
        data && <MapPlot 
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
