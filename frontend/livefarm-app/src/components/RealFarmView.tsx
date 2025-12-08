import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { State, FarmJob } from '../types.ts';
import { fetchFarmJobs, createFarmJob, fetchState } from '../api/state.ts';
import { useSSE } from '../hooks/useSSE.ts';
import TabNavigation from './TabNavigation.tsx';
import ScheduleTab from './Calendar/ScheduleTab.tsx';
import { LiveFarmTab, SetTargetVars } from './LiveFarmTab.tsx';
import AddJobModal from './Calendar/AddJobModal.tsx';
import EditJobModal from './Calendar/EditJobModal.tsx';
import DroneManagementPage from './DroneManagementPage.tsx';

interface RealFarmViewProps {
  onBack: () => void;
  onSetTarget: (targetVars: SetTargetVars) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  selectedImage?: string;
  initialTab?: 'schedule' | 'live-farm' | 'drone-management';
}

const zoomMin = 0;
const zoomMax = 250;

export default function RealFarmView({
  onBack,
  onSetTarget,
  onPlayPause,
  onRestart,
  selectedImage,
  initialTab = 'live-farm'
}: RealFarmViewProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'live-farm' | 'drone-management'>(initialTab);
  const [scheduleView, setScheduleView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<FarmJob | null>(null);
  const [numberDrones, setNumberDrones] = useState<number>(0);

  // Fetch initial drone count on mount
  useEffect(() => {
    const fetchDroneCount = async () => {
      try {
        const resp = await fetch('/drones');
        if (resp.ok) {
          const data = await resp.json();
          const items: Array<{ id: string; make: string; model: string }> = data.items || [];
          setNumberDrones(items.length);
        }
      } catch (e) {
        console.error('Failed to fetch initial drone count:', e);
      }
    };
    fetchDroneCount();
  }, []);

  // Filter state - persisted across tab switches
  const [filterValue, setFilterValue] = useState<number | null>(null);
  const [filterUnit, setFilterUnit] = useState<'hours' | 'days' | 'weeks' | 'months'>('hours');

  const queryClient = useQueryClient();

  // Determine if we need state data (for live-farm, drone-management, or schedule tabs to check active jobs)
  const needsStateData = activeTab === 'live-farm' || activeTab === 'drone-management' || activeTab === 'schedule';
  const shouldUseSSE = activeTab === 'live-farm';

  // SSE connection for real-time updates (only for live-farm tab)
  // Retries every 60 seconds if connection fails
  // SSE now updates React Query cache directly, so optimistic updates work
  const { isConnected, hasError: _hasError } = useSSE({
    url: '/stream/state',  // Vite proxy will route to backend
    enabled: shouldUseSSE,
    retryInterval: 60000, // Retry every 60 seconds
    queryKey: ['objects', 'real-farm'], // Update React Query cache so optimistic updates work
    onError: (error) => {
      console.error('SSE error, falling back to polling:', error);
    }
  });

  // Determine if we should actually use SSE data
  const actuallyUsingSSE = shouldUseSSE && isConnected;

  // Fetch state data (only when needed)
  // Always use useQuery to subscribe to cache updates (needed for optimistic updates to trigger re-renders)
  // When SSE is active, SSE updates the cache and useQuery will re-render with the new data
  // When SSE is not active, useQuery will poll for updates
  const { data, isLoading: stateLoading, error: stateError } = useQuery<State>({
    queryKey: ["objects", "real-farm"],
    queryFn: fetchState,
    refetchInterval: needsStateData && !actuallyUsingSSE ? 25 : false,
    enabled: needsStateData,
    // When SSE is active, we don't want to refetch on mount/window focus since SSE handles updates
    // But we still want to subscribe to cache updates for optimistic updates
    refetchOnMount: !actuallyUsingSSE,
    refetchOnWindowFocus: !actuallyUsingSSE,
  });

  // When state data updates (which includes job status), invalidate jobs query to refresh calendar
  useEffect(() => {
    if (data && activeTab === 'schedule') {
      queryClient.invalidateQueries({ queryKey: ['farm-jobs'] });
    }
  }, [data?.jobs, activeTab, queryClient]);

  // Fetch farm jobs (only when schedule tab is active)
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['farm-jobs'],
    queryFn: ({ queryKey }) => {
      const [_key, _params] = queryKey;
      return fetchFarmJobs();
    },
    refetchInterval: activeTab === 'schedule' ? 5000 : false, // Refresh every 5 seconds when schedule tab is active for dynamic updates
    enabled: activeTab === 'schedule', // Only fetch when schedule tab is active
  });

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: createFarmJob,
    onSuccess: () => {
      // Invalidate and refetch jobs
      queryClient.invalidateQueries({ queryKey: ['farm-jobs'] });
    },
  });

  const handleAddJob = async (jobData: Parameters<typeof createFarmJob>[0]) => {
    await createJobMutation.mutateAsync(jobData);
  };

  const handleJobClick = (job: FarmJob) => {
    setSelectedJob(job);
    setIsEditJobModalOpen(true);
  };

  const handleJobUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['farm-jobs'] });
    // Also invalidate state query so map view updates immediately
    queryClient.invalidateQueries({ queryKey: ['objects', 'real-farm'] });
  };

  // Map selected image IDs to actual image paths (same as MapPlot)
  const imageMap: { [key: string]: string } = {
    "option1": "../../img/King_Ranch_better.jpg",
    "option2": "../../img/HighResRanch.png"
  };

  const backgroundImage = selectedImage && imageMap[selectedImage]
    ? imageMap[selectedImage]
    : "../../img/HighResRanch.png";

  return (
    <div className="real-farm-view">
      <TabNavigation
        tabs={[
          { key: 'live-farm', label: 'Live Monitoring' },
          { key: 'schedule', label: 'Mission Planning' },
          { key: 'drone-management', label: 'Drone Management' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="tab-content">
        {activeTab === 'schedule' ? (
          <ScheduleTab
            scheduleView={scheduleView}
            onViewChange={setScheduleView}
            onAddJob={() => setIsAddJobModalOpen(true)}
            jobs={jobs.map(job => {
              if (data?.jobs) {
                const stateJob = data.jobs.find(j => j.id === job.id);
                if (stateJob && stateJob.is_active) {
                  // Job is active - show as "running" regardless of its status field
                  return { ...job, status: 'running' as const };
                }
              }
              return job;
            })}
            isLoading={jobsLoading}
            onJobClick={handleJobClick}
          />
        ) : activeTab == 'live-farm' ? (
          stateLoading || !data ? (
            <p>Loading farm data...</p>
          ) : stateError ? (
            <p>Error loading farm data: {stateError instanceof Error ? stateError.message : 'Unknown error'}</p>
          ) : (
            <LiveFarmTab
              data={data}
              onSetTarget={onSetTarget}
              onPlayPause={onPlayPause}
              onRestart={onRestart}
              onBack={onBack}
              selectedImage={selectedImage}
              filterValue={filterValue}
              filterUnit={filterUnit}
              onFilterChange={(value, unit) => {
                setFilterValue(value);
                setFilterUnit(unit);
              }}
              maxDrones={numberDrones}
            />
          )
        ) : (
          stateLoading || !data ? (
            <p>Loading farm data...</p>
          ) : stateError ? (
            <p>Error loading farm data: {stateError instanceof Error ? stateError.message : 'Unknown error'}</p>
          ) : (
            <DroneManagementPage
              data={data}
              setNumberDrones={setNumberDrones}
            />
          )
        )}
      </div>

      <AddJobModal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        onSubmit={handleAddJob}
        worldMin={zoomMin}
        worldMax={zoomMax}
        backgroundImage={backgroundImage}
        maxDrones={numberDrones}
      />

      <EditJobModal
        isOpen={isEditJobModalOpen}
        onClose={() => {
          setIsEditJobModalOpen(false);
          setSelectedJob(null);
        }}
        job={selectedJob}
        worldMin={zoomMin}
        worldMax={zoomMax}
        backgroundImage={backgroundImage}
        onJobUpdated={handleJobUpdated}
        maxDrones={numberDrones}
      />
    </div>
  );
}
