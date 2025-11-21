
export type LocData = [number, number]; // [latitude, longitude]

export type CircleTarget = {
  type: "circle";
  center: LocData;
  radius: number | null;
};

export type PolygonTarget = {
  type: "polygon";
  points: LocData[];
};

export type Target = CircleTarget | PolygonTarget | null;

export interface Job {
  id: string;
  target: Target;
  remaining_time: number | null;
  is_active: boolean;
  drones: number;
  status: "pending" | "scheduled" | "running" | "completed" | "cancelled";
  start_at: string | null;
  completed_at: string | null;
  scenario_id: string | null;
  maintain_until: string; // ISO string or "target_is_reached"
  created_at: string;
  updated_at: string;
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

export interface FarmJob {
  id: string;
  job_type: 'immediate' | 'scheduled';
  scheduled_time?: string; // ISO 8601 datetime, only for scheduled jobs
  is_recurring: boolean;
  target: Target;
  drone_count: number;
  drones?: number; // Number of drones currently being used (from backend)
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  duration?: number; // Estimated duration in seconds
}

export interface CreateFarmJobRequest {
  job_type: 'immediate' | 'scheduled';
  scheduled_time?: string; // ISO 8601, required if job_type === 'scheduled'
  is_recurring: boolean;
  target: Target;
  drone_count: number;
}

export interface FarmJobsResponse {
  jobs: FarmJob[];
  total: number;
}