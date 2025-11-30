import {useState, useCallback} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart } from './api/state'
import { State, Target } from "./types.ts"
import './App.css'
import WelcomePage from "./components/WelcomePage";
import RealFarmView from "./components/RealFarmView.tsx";
import DroneManagementPage from "./components/DroneManagementPage.tsx";
import { useSSE } from './hooks/useSSE';

interface SetTargetVars {
  jobId: string;
  target: Target;
}

// Check URL params to determine initial view
function getInitialView(): 'welcome' | 'live-system' | 'drone-management' {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  if (view === 'live-system') return 'live-system';
  if (view === 'drone-management') return 'drone-management';
  return 'welcome';
}

function App() {
  const queryClient = useQueryClient();

  const [currentView, setCurrentView] = useState<'welcome' | 'live-system' | 'drone-management'>(getInitialView);

  // Determine if we should use SSE (when live-system view is active)
  const shouldUseSSE = currentView === 'live-system';
  
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

  // Traditional polling (use when SSE is not actually working)
  const { data: pollingData, isLoading, error } = useQuery<State>({
    queryKey: ["objects"],
    queryFn: fetchState,
    refetchInterval: !actuallyUsingSSE ? 1000 : false,
    enabled: !actuallyUsingSSE
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
    mutation.mutate(targetVars);
  }

  // Play/pause mutation
  const playPauseMutation = useMutation({
    mutationFn: setPlayPause,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    }
  });

  const handleNavigateToLiveSystem = async () => {
    // Reset the backend to farm mode (clears any simulation state, loads farm jobs)
    await requestRestart();
    setCurrentView('live-system');
  };

  const handleBackToWelcome = () => {
    setCurrentView('welcome');
  };

  const handleNavigateToDroneManagement = () => {
    setCurrentView('drone-management');
  };

  const handleBackFromDroneManagement = () => {
    setCurrentView('live-system');
  };

  return (
    <>
      {currentView === 'welcome' && (
        <WelcomePage 
          onNavigateToSimulator={() => {
            // Redirect to simulation app, skip its welcome page
            window.location.href = 'http://localhost:5173?view=simulator';
          }}
          onNavigateToLiveSystem={handleNavigateToLiveSystem}
        />
      )}
      {currentView === 'live-system' && (
        <RealFarmView
          data={data!}
          onSetTarget={handleSetTarget}
          onPlayPause={playPauseMutation.mutate}
          onRestart={requestRestart}
          onBack={handleBackToWelcome}
          onNavigateToDroneManagement={handleNavigateToDroneManagement}
        />
      )}
      {currentView === 'drone-management' && (
        <DroneManagementPage
          data={data!}
          onBack={handleBackFromDroneManagement}
        />
      )}
    </>
  )
}

export default App

