import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget, setPlayPause } from './api/state'
import MapPlot from './components/MapPlot'
import './App.css'

type LocData = [number, number];

interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
}

function App() {
  const queryClient = useQueryClient();

  const CANVAS_SIZE = 500;

  const worldMin = -40;
  const worldMax = 40;

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

  
  if (isLoading) return <p>Loading...</p>;
  if (error instanceof Error) return <p>Error: {error.message}</p>;
  if (!data) return <p>No data</p>;

  return (
    <>
      <MapPlot data={data} onSetTarget={handleSetTarget} CANVAS_SIZE={CANVAS_SIZE} zoomMin={worldMin} zoomMax={worldMax} onPlayPause={setPlayPause}/>
    </>
  )
}

export default App
