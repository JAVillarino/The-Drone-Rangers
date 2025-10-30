import { SimulationMapPlot } from './SimulationMapPlot.tsx';
import { State } from '../types';

interface LiveFarmTabProps {
  data: State;
  onSetTarget: (coords: {x: number, y: number}) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onBack?: () => void;
  selectedImage?: string;
}

export default function LiveFarmTab({
  data,
  onSetTarget,
  onPlayPause,
  onRestart,
  onBack,
  selectedImage
}: LiveFarmTabProps) {
  return (
    <div className="live-farm-tab">
      <SimulationMapPlot
        data={data}
        onSetTarget={onSetTarget}
        onPlayPause={onPlayPause}
        onRestart={onRestart}
        onBack={onBack}
        selectedImage={selectedImage}
      />
    </div>
  );
}
