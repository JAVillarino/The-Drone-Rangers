import {useState, useCallback, useEffect} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart, createCustomScenario } from './api/state'
import { SimulationMapPlot } from './components/SimulationMapPlot.tsx'
import { State } from "./types.ts"
import './App.css'
import WelcomePage from "./components/WelcomePage";
import LandingPage from "./components/LandingPage";
import RealFarmView from "./components/RealFarmView";
import DroneManagementPage from "./components/DroneManagementPage";
import { useSSE } from './hooks/useSSE';
import { SetTargetVars } from "./components/LiveFarmTab.tsx";

function App() {
  const queryClient = useQueryClient();

  const [currentView, setCurrentView] = useState<'welcome' | 'simulator' | 'simulation' | 'live-system' | 'drone-management'>('welcome');
  const [selectedImage, setSelectedImage] = useState<string>("");

  // Determine if we should use SSE (when simulation or live-system view is active)
  const shouldUseSSE = currentView === 'simulation' || currentView === 'live-system';
  
  // Memoize the error handler to prevent SSE connection from being recreated on every render
  const handleSSEError = useCallback((error: Event) => {
    console.error('SSE error, falling back to polling:', error);
  }, []);

  // SSE connection for real-time updates
  const { data: sseData, isConnected, hasError } = useSSE({
    url: 'http://127.0.0.1:5000/stream/state',
    enabled: shouldUseSSE,
    onError: handleSSEError
  });

  // Determine if we should actually use SSE data (only if connected and have data)
  const actuallyUsingSSE = shouldUseSSE && isConnected;

  // Check if we need state data (only for simulation view, live-system handles its own)
  const needsStateData = currentView === 'simulation';

  // Traditional polling (use when SSE is not actually working, only for simulation view)
  const { data: pollingData, isLoading, error } = useQuery<State>({
    queryKey: ["objects"],
    queryFn: fetchState,
    refetchInterval: needsStateData && !actuallyUsingSSE ? 1000 : false, // Poll every 1 second only as fallback if SSE fails
    enabled: needsStateData && !actuallyUsingSSE // Query only for simulation view when SSE is not active
  });

  // Use SSE data when actually connected, otherwise use polling data
  const data = actuallyUsingSSE && sseData ? sseData : pollingData;

  const mutation = useMutation({
    mutationFn: ({ jobId, target }: SetTargetVars) => setTarget(jobId, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    }
  });

  // handleSetTarget now needs the jobId as well
  function handleSetTarget(targetVars: SetTargetVars) {
    mutation.mutate(targetVars);
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
      setCurrentView('simulator');
    };

    const handleNavigateToRealSystem = () => {
      setCurrentView('live-system');
    };

    const handleBackToWelcome = () => {
      setCurrentView('welcome');
      setSelectedImage("");
    };

    const handleBackFromLiveSystem = () => {
      setCurrentView('welcome');
    };

    const handleNavigateToDroneManagement = () => {
      setCurrentView('drone-management');
    };

    const handleBackFromDroneManagement = () => {
      setCurrentView('live-system');
    };

    const handleBackToSimulator = () => {
      setCurrentView('simulator');
      setSelectedImage("");
    };

    // This function will be passed to the LandingPage to start the simulation
    const handleSimulationStart = (scenario: string, selectedImage?: string) => {
      if (selectedImage) {
        setSelectedImage(selectedImage);
      }
      setCurrentView('simulation');
    };

    // Dummy function for starting preset simulations
    const startPresetSim = async (scenario: string): Promise<unknown> => {
      // TODO: Replace with actual API call to start preset scenario
      // For now, just simulate a delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { success: true, scenario };
    };
  
    // Show loading/error states when on simulation view that needs data
    if (needsStateData) {
      if (isLoading) return <p>Loading...</p>;
      if (error instanceof Error) return <p>Error: {error.message}</p>;
      if (!data) return <p>No data</p>;
    }

  return (
    <>
      {currentView === 'welcome' ? (
        <WelcomePage 
          onNavigateToSimulator={handleNavigateToSimulator} 
          onNavigateToRealSystem={handleNavigateToRealSystem} 
        />
      ) : currentView === 'drone-management' ? (
        data ? (
        <DroneManagementPage 
          data={data}
          onBack={handleBackFromDroneManagement} 
        />) : (
          <p>Loading farm data...</p>
        )) : currentView === 'simulator' ? (
        <LandingPage 
          onSimulationStart={handleSimulationStart} 
          startPresetSim={startPresetSim} 
          startCustomSim={createCustomScenario}
          onBack={handleBackToWelcome}
        />
      ) : currentView === 'live-system' ? (
        <RealFarmView
          // TODO: Pass in the data from SSE. We have a lot of duplicated code because we have setup for SSE at the top level and here.
          onBack={handleBackFromLiveSystem}
          onSetTarget={handleSetTarget}
          onPlayPause={handlePlayPause}
          onRestart={requestRestart}
          selectedImage={selectedImage}
        />
      ) : (
        data && <SimulationMapPlot 
          data={data} 
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
