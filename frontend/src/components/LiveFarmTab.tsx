import { useState } from 'react';
import { Job, State } from '../types';
import JobStatus from './JobStatus.tsx';
import { Map, usePan } from './UsePan.tsx';
import { setJobActiveState, setJobDroneCount, deleteFarmJob } from '../api/state.ts';

interface LiveFarmTabProps {
  data: State;
  onSetTarget: (coords: {x: number, y: number}) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onBack?: () => void;
  selectedImage?: string;
}

const CANVAS_SIZE = 600;

const zoomMin = 0;
const zoomMax = 250;

const jobStatus = (j: Job) => {
  if (j.remaining_time == 0) {
      return "Completed";
  }
  if (!j.target) {
      return "No target set";
  }
  if (!j.is_active) {
      return "Stopped";
  }
  
  return "In progress"
}

export default function LiveFarmTab({
  data,
  onSetTarget,
  selectedImage
}: LiveFarmTabProps) {
  const handleCancel = async (jobId: number) => {
    if (!confirm('Are you sure you want to delete this job?')) {
      return;
    }
    
    try {
      await deleteFarmJob(jobId);
      // Job will be removed from the list automatically via SSE stream update
    } catch (error) {
      console.error('Failed to delete job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  
    // Map selected image IDs to actual image paths
    const imageMap: { [key: string]: string } = {
      "option1": "../../img/King_Ranch_better.jpg",
      "option2": "../../img/HighResRanch.png"
  };

  // Get the background image path, default to HighResRanch if no selection
  const backgroundImage = selectedImage && imageMap[selectedImage] ? imageMap[selectedImage] : "../../img/HighResRanch.png";

  const { svgRef, scaleCoord, inverseScaleCoord } = usePan({ data, zoomMin, zoomMax, scale: 0.7, canvasSize: CANVAS_SIZE });

  const [choosingTarget, setChoosingTarget] = useState(false);


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
        onSetTarget({x: inverseScaleCoord(cursorpt.x, "x"), y: inverseScaleCoord(cursorpt.y, "y")});
        setChoosingTarget(false);
        return;
    }
  }

  return (
    <div className="live-farm-tab">
      <div className="map-container">
            {data.jobs.map((job, index) => 
                <JobStatus 
                    key={`job-${job.id || index}`}
                    jobName="123"
                    status={jobStatus(job)}
                    target={job.target}
                    initialRadius={job.target_radius}
                    initialDrones={1}
                    isActive={job.is_active}
                    onSelectOnMap={() => setChoosingTarget(true)}
                    onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                    onCancel={() => handleCancel(job.id)}
                    onDronesChange={(newCount: number) => setJobDroneCount(job.id, newCount)}
                />
            )}

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
              <Map data={data} obstacles={[]} backgroundImage={backgroundImage} scaleCoord={scaleCoord} />
            </svg>
        </div>
    </div>
  );
}
