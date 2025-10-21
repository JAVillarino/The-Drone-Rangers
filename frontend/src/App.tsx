import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause, requestRestart } from './api/state'
import { MapPlot } from './components/MapPlot'
import { State } from "./types.ts"
import './App.css'

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 600;

  const worldMin = -60;
  const worldMax = 60;

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

  
  if (isLoading) return <p>Loading...</p>;
  if (error instanceof Error) return <p>Error: {error.message}</p>;
  if (!data) return <p>No data</p>;

  return (
    <>
      <MapPlot data={data} onSetTarget={handleSetTarget} CANVAS_SIZE={CANVAS_SIZE} zoomMin={worldMin} zoomMax={worldMax} onPlayPause={setPlayPause} onRestart={requestRestart}/>
    </>
  )

}

export default App
