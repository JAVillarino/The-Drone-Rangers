import { useState } from 'react';
import { Job, State, Target } from '../../types';
import JobStatus from '../JobStatus.tsx';
import { Map, usePan } from '../MapPlot/UsePan.tsx';
import { setJobActiveState, setJobDroneCount, deleteFarmJob } from '../../api/state.ts';

interface LiveFarmTabProps {
  data: State;
  onSetTarget: (newTarget: SetTargetVars) => void;
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

export type SetTargetVars = { jobId: string, target: Target };

export function LiveFarmTab({
  data,
  onSetTarget,
  selectedImage
}: LiveFarmTabProps) {
  const handleCancel = async (jobId: string) => {
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

  // Stores the job ID that the user is currently choosing a target for.
  const [choosingTarget, setChoosingTarget] = useState<string | null>(null);


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
        const oldRadius = job?.target?.type === "circle" ? job?.target.radius : null;
      
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
            {data.jobs.map((job, index) => 
                <JobStatus 
                    key={`job-${job.id || index}`}
                    jobName="123"
                    status={jobStatus(job)}
                    target={job.target}
                    initialDrones={1}
                    isActive={job.is_active}
                    onSelectOnMap={() => setChoosingTarget(job.id)}
                    onPauseToggle={() => setJobActiveState(job.id, !job.is_active)}
                    onCancel={() => handleCancel(job.id)}
                    onDronesChange={(newCount: number) => setJobDroneCount(job.id, newCount)}
                    onTargetChange={(newTarget: Target) => onSetTarget({jobId: job.id, target: newTarget})}
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
