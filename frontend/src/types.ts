
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
  paused?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  visibility: "private" | "public" | "preset";
  seed?: number;
  sheep: LocData[];
  drones: LocData[];
  targets: LocData[];
  obstacles: any[];
  goals: any[];
  boundary: "none" | "wrap" | "reflect";
  bounds: [number, number, number, number];
  version: number;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface ScenariosResponse {
  items: Scenario[];
  total: number;
  limit: number;
  offset: number;
}