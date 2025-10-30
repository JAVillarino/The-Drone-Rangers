import React from 'react';
import { MapPlot } from './MapPlot';
import { State } from '../types';

interface LiveFarmTabProps {
  data: State;
  onSetTarget: (coords: {x: number, y: number}) => void;
  zoomMin: number;
  zoomMax: number;
  CANVAS_SIZE: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onBack?: () => void;
  selectedImage?: string;
}

export default function LiveFarmTab({
  data,
  onSetTarget,
  zoomMin,
  zoomMax,
  CANVAS_SIZE,
  onPlayPause,
  onRestart,
  onBack,
  selectedImage
}: LiveFarmTabProps) {
  return (
    <div className="live-farm-tab">
      <MapPlot
        data={data}
        onSetTarget={onSetTarget}
        zoomMin={zoomMin}
        zoomMax={zoomMax}
        CANVAS_SIZE={CANVAS_SIZE}
        onPlayPause={onPlayPause}
        onRestart={onRestart}
        onBack={onBack}
        selectedImage={selectedImage}
      />
    </div>
  );
}
