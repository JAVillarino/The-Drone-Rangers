import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchState, setTarget } from './api/state'
import MapPlot from './components/MapPlot'
import './App.css'

type LocData = [number, number];

interface ObjectData {
    flock: LocData[],
    drone: LocData,
    target: LocData
}

function App() {
  //const [count, setCount] = useState(0);
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

  /*useEffect(() => {
    const fetchState = () => {
      fetch("http://127.0.0.1:5000/state")
        .then((response) => response.json())
        .then((data) => {
          console.log(data);
          // setState(data)
        })
        .catch((err) => console.error("Error fetching state:", err));
    };
  
    fetchState();
    const intervalId = setInterval(fetchState, 500);
    return () => clearInterval(intervalId);
  }, []);*/

  return (
    <>
      <MapPlot data={data} onSetTarget={handleSetTarget} CANVAS_SIZE={CANVAS_SIZE} zoomMin={worldMin} zoomMax={worldMax}/>
    </>
  )
}

export default App
