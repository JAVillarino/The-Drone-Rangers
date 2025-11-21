import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { State } from '../types';
import { fetchFarmJobs, createFarmJob, fetchState } from '../api/state';
import { useSSE } from '../hooks/useSSE';
import TabNavigation from './TabNavigation';
import ScheduleTab from './ScheduleTab';
import { LiveFarmTab, SetTargetVars } from './LiveFarmTab';
import AddJobModal from './AddJobModal';
import DroneManagementPage from './DroneManagementPage.tsx';

interface RealFarmViewProps {
  onBack: () => void;
  onSetTarget: (targetVars: SetTargetVars) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  selectedImage?: string;
}

const zoomMin = 0;
const zoomMax = 250;

export default function RealFarmView({
  onBack,
  onSetTarget,
  onPlayPause,
  onRestart,
  selectedImage
}: RealFarmViewProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'live-farm' | 'drone-management'>('live-farm');
  const [scheduleView, setScheduleView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  const queryClient = useQueryClient();

  // Determine if we need state data (for live-farm or drone-management tabs)
  const needsStateData = activeTab === 'live-farm' || activeTab === 'drone-management';
  const shouldUseSSE = activeTab === 'live-farm';

  // SSE connection for real-time updates (only for live-farm tab)
  // Retries every 60 seconds if connection fails
  const { data: sseData, isConnected, hasError } = useSSE({
    url: 'http://127.0.0.1:5000/stream/state',
    enabled: shouldUseSSE,
    retryInterval: 60000, // Retry every 60 seconds
    onError: (error) => {
      console.error('SSE error, falling back to polling:', error);
    }
  });

  // Determine if we should actually use SSE data
  const actuallyUsingSSE = shouldUseSSE && isConnected;

  // Fetch state data (only when needed)
  const { data: pollingData, isLoading: stateLoading, error: stateError } = useQuery<State>({
    queryKey: ["objects", "real-farm"],
    queryFn: fetchState,
    refetchInterval: needsStateData && !actuallyUsingSSE ? 25 : false,
    enabled: needsStateData && !actuallyUsingSSE
  });

  // Use SSE data when actually connected, otherwise use polling data
  const data = actuallyUsingSSE && sseData ? sseData : pollingData;

  useEffect(() => {
    console.log({actuallyUsingSSE, shouldUseSSE, isConnected})
    console.log("data from real farm view:", data);
    console.log("sseData from real farm view:", sseData);
  }, [data, sseData]);

  // Fetch farm jobs (only when schedule tab is active)
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['farm-jobs'],
    queryFn: ({ queryKey }) => {
      const [_key, _params] = queryKey;
      return fetchFarmJobs();
    },
    refetchInterval: activeTab === 'schedule' ? 30000 : false, // Refresh every 30 seconds only when schedule tab is active
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
            jobs={jobs}
            isLoading={jobsLoading}
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
      />
    </div>
  );
}
