import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { State } from '../types';
import { fetchFarmJobs, createFarmJob } from '../api/state';
import TabNavigation from './TabNavigation';
import ScheduleTab from './ScheduleTab';
import LiveFarmTab from './LiveFarmTab';
import AddJobModal from './AddJobModal';
import DroneManagementPage from './DroneManagementPage.tsx';

interface RealFarmViewProps {
  onBack: () => void;
  // Props for MapPlot
  data: State;
  onSetTarget: (coords: {x: number, y: number}) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  selectedImage?: string;
}

const zoomMin = 0;
const zoomMax = 250;

export default function RealFarmView({
  onBack,
  data,
  onSetTarget,
  onPlayPause,
  onRestart,
  selectedImage
}: RealFarmViewProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'live-farm' | 'drone-management'>('schedule');
  const [scheduleView, setScheduleView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  const queryClient = useQueryClient();

  // Fetch farm jobs
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['farm-jobs'],
    queryFn: ({ queryKey }) => {
      const [_key, _params] = queryKey;
      return fetchFarmJobs();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
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
            { key: 'schedule', label: 'Schedule View' },
            { key: 'live-farm', label: 'Live Farm View' },
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
          <LiveFarmTab
            data={data}
            onSetTarget={onSetTarget}
            onPlayPause={onPlayPause}
            onRestart={onRestart}
            onBack={onBack}
            selectedImage={selectedImage}
          />
        ) : (
          data ? (
            <DroneManagementPage 
              data={data}
            />) : (
              <p>Loading farm data...</p>
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
