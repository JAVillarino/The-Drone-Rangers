
export type LocData = [number, number]; // [latitude, longitude]

export interface Job {
  id: number;
  target: LocData | null;
  target_radius: number;
  remaining_time: number | null; // In seconds
  is_active: boolean;
}

export interface State {
  flock: LocData[];
  drones: LocData[];
  polygons: LocData[][];
  jobs: Job[];
}
