// Target types - can be circle or polygon
export type Target = 
  | { type: "circle"; center: [number, number]; radius?: number }
  | { type: "polygon"; points: [number, number][] };

export type JobStatus = "pending" | "scheduled" | "running" | "completed" | "cancelled";

// Job type - represents a herding/mission job
export interface Job {
  id: string;
  target: Target | null;
  is_active: boolean;
  drone_count: number;
  remaining_time: number | null;
  status: JobStatus;
  start_at: number | null;
  created_at: string;
  updated_at: string;
}

// State from the simulation/backend
export interface State {
  flock: number[][];
  drones: number[][];
  jobs: Job[];
  polygons?: number[][][];
  paused?: boolean;
}

// Farm job for calendar/scheduling display
export interface FarmJob {
  id: string;
  job_type: 'immediate' | 'scheduled';
  scheduled_time?: string;
  is_recurring: boolean;
  target: Target;
  drone_count: number;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  duration?: number;
}

// Response types
export interface FarmJobsResponse {
  jobs: FarmJob[];
  total: number;
}

// Request types
export interface CreateFarmJobRequest {
  job_type: 'immediate' | 'scheduled';
  scheduled_time?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string;
  target: Target;
  drone_count: number;
}
