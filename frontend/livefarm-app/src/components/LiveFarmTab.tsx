import { useState, useMemo } from 'react';
import { State, Target, Job } from '../types';
import JobStatusContainer from './JobStatusContainer.tsx';
import { Map, usePan } from './MapPlot/UsePan.tsx';

interface LiveFarmTabProps {
  data: State;
  onSetTarget: (newTarget: SetTargetVars) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onBack?: () => void;
  selectedImage?: string;
  filterValue: number | null;
  filterUnit: 'hours' | 'days' | 'weeks' | 'months';
  onFilterChange: (value: number | null, unit: 'hours' | 'days' | 'weeks' | 'months') => void;
}

const CANVAS_SIZE = 600;

const zoomMin = 0;
const zoomMax = 250;

export type SetTargetVars = { jobId: string, target: Target };

export function LiveFarmTab({
  data,
  onSetTarget,
  selectedImage,
  filterValue,
  filterUnit,
  onFilterChange
}: LiveFarmTabProps) {

  
    // Map selected image IDs to actual image paths
    const imageMap: { [key: string]: string } = {
      "option1": "../../img/King_Ranch_better.jpg",
      "option2": "../../img/HighResRanch.png"
  };

  // Get the background image path, default to HighResRanch if no selection
  const backgroundImage = selectedImage && imageMap[selectedImage] ? imageMap[selectedImage] : "../../img/HighResRanch.png";

  const { svgRef, scaleCoord, inverseScaleCoord } = usePan({ data, zoomMin, zoomMax, scale: 0.7, canvasSize: CANVAS_SIZE });

  // Stores the job ID that the user is currently choosing a target for.
  const [choosingTarget, setChoosingTarget] = useState<string | null>(null);
  
  // Stores the ID of the job whose card is currently open (for highlighting on map)
  const [openJobId, setOpenJobId] = useState<string | null>(null);


  // Filter jobs based on time frame and exclude cancelled jobs
  const filteredJobs = useMemo(() => {
    // First, filter out cancelled jobs
    const activeJobs = data.jobs.filter((job: Job) => job.status !== 'cancelled');
    
    if (filterValue === null || filterValue <= 0) {
      return activeJobs;
    }

    const now = Date.now();
    let timeFrameMs: number;
    
    switch (filterUnit) {
      case 'hours':
        timeFrameMs = filterValue * 60 * 60 * 1000;
        break;
      case 'days':
        timeFrameMs = filterValue * 24 * 60 * 60 * 1000;
        break;
      case 'weeks':
        timeFrameMs = filterValue * 7 * 24 * 60 * 60 * 1000;
        break;
      case 'months':
        timeFrameMs = filterValue * 30 * 24 * 60 * 60 * 1000; // Approximate
        break;
    }

    const cutoffTime = now + timeFrameMs;

    return activeJobs.filter((job: Job) => {
      // Always show immediate jobs (jobs without start_at)
      if (job.start_at === null) {
        return true;
      }
      // Always show active jobs
      if (job.is_active) {
        return true;
      }
      // For scheduled jobs that are not active, convert start_at to milliseconds
      // start_at comes from backend as ISO string (from to_dict()), but type says number
      let jobTime: number;
      if (typeof job.start_at === 'string') {
        // ISO string - convert to timestamp
        jobTime = new Date(job.start_at).getTime();
      } else if (typeof job.start_at === 'number') {
        // Number (timestamp in seconds) - convert to milliseconds
        jobTime = job.start_at * 1000;
      } else {
        // Should not happen, but handle gracefully
        return false;
      }
      // Show scheduled jobs that will occur within the time frame
      // Include jobs that are in the future (or very recent past) and within the cutoff time
      // Use >= now to include jobs scheduled for exactly now, and <= cutoffTime for the upper bound
      const isWithinTimeFrame = jobTime >= now && jobTime <= cutoffTime;
      return isWithinTimeFrame;
    });
  }, [data.jobs, filterValue, filterUnit]);

  // Create filtered data for map
  const filteredData = useMemo(() => ({
    ...data,
    jobs: filteredJobs
  }), [data, filteredJobs]);


  function handleClick(e: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursorpt = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    if (choosingTarget) {
        if (!e.target) {
            throw new Error("No target found for click.");
        }

        const job = data.jobs.find((j) => j.id === choosingTarget);
        const oldRadius = job?.target?.type === "circle" ? job?.target.radius : undefined;
      
        onSetTarget({jobId: choosingTarget, target: {
          type:"circle",
          center: [inverseScaleCoord(cursorpt.x, "x"), inverseScaleCoord(cursorpt.y, "y")],
          radius: oldRadius
        }});
        setChoosingTarget(null);
        return;
    }
  }

  return (
    <div className="live-farm-tab">
      <div className="map-container">
            <JobStatusContainer
              jobs={filteredJobs}
              filterValue={filterValue}
              filterUnit={filterUnit}
              onFilterChange={onFilterChange}
              onSetTarget={(jobId, target) => onSetTarget({ jobId, target })}
              onSelectOnMap={(jobId) => setChoosingTarget(jobId)}
              onOpenJobChange={setOpenJobId}
            />

            {choosingTarget && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#48bb78',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 2000,
                    fontWeight: 600
                }}>
                    Click on map to set target location
                </div>
            )}
            

            {/* <SimulationStatus data={data} /> */}
            
            <svg 
                ref={svgRef} 
                className="map"  
                onClick={handleClick}
                style={{ cursor: choosingTarget ? 'crosshair' : 'default' }}
            >
              {/* TODO: Actually take in the obstacles. */}
              <Map data={filteredData} obstacles={[]} backgroundImage={backgroundImage} scaleCoord={scaleCoord} openJobId={openJobId} />
            </svg>
        </div>
    </div>
  );
}
