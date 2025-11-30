import {useState, useCallback, useEffect} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart, createCustomScenario } from './api/state'
import { SimulationMapPlot } from './components/MapPlot/SimulationMapPlot.tsx'
import { State, Target } from "./types.ts"
import './App.css'
import WelcomePage from "./components/WelcomePage";
import LandingPage from "./components/LandingPage";
import { useSSE } from './hooks/useSSE';
import { ScenarioThemeKey } from "./theme";

interface SetTargetVars {
  jobId: string;
  target: Target;
}

// Check URL params to determine initial view
function getInitialView(): 'welcome' | 'simulator' | 'simulation' {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'simulator') return 'simulator';
  if (view === 'simulation') return 'simulation';
  return 'welcome';
}

function App() {
  const queryClient = useQueryClient();

  const [currentView, setCurrentView] = useState<'welcome' | 'simulator' | 'simulation'>(getInitialView);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [simulationThemeKey, setSimulationThemeKey] = useState<ScenarioThemeKey>("default-herd");

  // Determine if we should use SSE (when simulation view is active)
  const shouldUseSSE = currentView === 'simulation';
  
  // Memoize the error handler to prevent SSE connection from being recreated on every render
  const handleSSEError = useCallback((error: Event) => {
    console.error('SSE error, falling back to polling:', error);
  }, []);

  // SSE connection for real-time updates
  const { data: sseData, isConnected } = useSSE({
    url: '/stream/state',
    enabled: shouldUseSSE,
    onError: handleSSEError
  });

  // Determine if we should actually use SSE data (only if connected and have data)
  const actuallyUsingSSE = shouldUseSSE && isConnected;

  // Check if we need state data (only for simulation view)
  const needsStateData = currentView === 'simulation';

  // Traditional polling (use when SSE is not actually working)
  const { data: pollingData, isLoading, error } = useQuery<State>({
    queryKey: ["objects"],
    queryFn: fetchState,
    refetchInterval: needsStateData && !actuallyUsingSSE ? 1000 : false,
    enabled: needsStateData && !actuallyUsingSSE
  });

  // Use SSE data when actually connected, otherwise use polling data
  const data = actuallyUsingSSE && sseData ? sseData : pollingData;

  const mutation = useMutation({
    mutationFn: ({ jobId, target }: SetTargetVars) => setTarget(jobId, target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    }
  });

  function handleSetTarget(targetVars: SetTargetVars) {
    console.log("handleSetTarget called with:", targetVars);
    mutation.mutate(targetVars);
  }

  // Play/pause mutation
  const playPauseMutation = useMutation({
    mutationFn: setPlayPause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    }
  });

  // Custom scenario mutation
  const customScenarioMutation = useMutation({
    mutationFn: createCustomScenario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    }
  });

  const handleNavigateToSimulator = () => {
    setCurrentView('simulator');
  };

  const handleBackToWelcome = () => {
    setCurrentView('welcome');
  };

  const handleBackToSimulator = () => {
    setCurrentView('simulator');
  };

  const handleNoOpRestart = () => {
    // No-op placeholder for LandingPage compatibility
    console.log("No-op restart called from LandingPage");
  };

  // This function will be passed to the LandingPage to start the simulation
  const handleSimulationStart = (_scenario: string, selectedImage?: string, themeKey?: ScenarioThemeKey) => {
    if (selectedImage) {
      setSelectedImage(selectedImage);
    }
    if (themeKey) {
      setSimulationThemeKey(themeKey);
    } else {
      setSimulationThemeKey("default-herd");
    }
    setCurrentView('simulation');
  };

  return (
    <>
      {currentView === 'welcome' && (
        <WelcomePage 
          onNavigateToSimulator={handleNavigateToSimulator} 
          onNavigateToLiveSystem={() => {
            // Redirect to live farm app, skip its welcome page
            window.location.href = 'http://localhost:5174?view=live-system';
          }}
        />
      )}
      {currentView === 'simulator' && (
        <LandingPage 
          onSimulationStart={handleSimulationStart}
          startPresetSim={async (scenario: string) => {
            console.log(`Starting preset simulation: ${scenario}`);
          }}
          startCustomSim={async (config) => {
            return customScenarioMutation.mutateAsync(config);
          }}
          onBack={handleBackToWelcome}
        />
      )}
      {currentView === 'simulation' && (
        <SimulationMapPlot 
          data={data!} 
          onPlayPause={playPauseMutation.mutate}
          onRestart={requestRestart} 
          onBack={handleBackToSimulator} 
          selectedImage={selectedImage}
          themeKey={simulationThemeKey}
        />
      )}
    </>
  )
}

export default App

