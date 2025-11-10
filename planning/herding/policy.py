from __future__ import annotations
import numpy as np
from planning.plan_type import DoNothing, Plan, DronePositions
from planning import state


def lerp_clamped(a: float, b: float, t1: float, t2: float, t: float) -> float:
            """Linearly interpolate between a and b by t, but clamp t to [0,1]."""
            t = (t - t1) / (t2 - t1)
            t = max(0.0, min(1.0, t))
            return a + (b - a) * t

def is_goal_satisfied(w: state.State, target: np.ndarray, goal_tolerance: float) -> bool:
    """
    Return True if every sheep in the world's flock is within the goal tolerance
    of the world's target.
    """
    
    if w.flock.size == 0:
        return True

    # squared comparison for speed / numerical stability
    tol_sq = goal_tolerance * goal_tolerance

    # distances squared from each sheep to the target
    diffs = w.flock - target.reshape(1, 2)
    d2 = np.sum(diffs * diffs, axis=1)

    return np.all(d2 <= tol_sq)

class ShepherdPolicy:
    """
    Collect/drive policy modified for multiple drones.
    
    Strategy: 
    - Drive: All drones drive to sector-assigned drive points behind the G-to-Target line.
    - Collect: Each drone collects an assigned outermost sheep.
    """
    
    def __init__(self, *, fN: float, umax: float, too_close: float, collect_standoff: float, conditionally_apply_repulsion: bool = True):
        self.fN = fN
        self.umax = umax
        self.too_close = too_close
        self.collect_standoff = collect_standoff
        self.conditionally_apply_repulsion = conditionally_apply_repulsion

    def _gcm(self, world: state.State) -> np.ndarray:
        """Global Center of Mass."""
        return np.mean(world.flock, axis=0)

    def _cohesive(self, world: state.State, G: np.ndarray) -> bool:
        """Check for flock cohesiveness."""
        return self._cohesiveness(world, G) > 1
    
    def _cohesiveness(self, world: state.State, G: np.ndarray) -> float:
        """Check for flock cohesiveness. Always greater than 0, this is more than 1 when the flock is contained within self.fN of the GCM"""
        if world.flock.shape[0] == 0: return True
        r = np.max(np.linalg.norm(world.flock - G, axis=1))
        return self.fN / r
    
    def _mean_cohesiveness(self, world: state.State, G: np.ndarray) -> float:
        """Check for flock cohesiveness. Always greater than 0, this is more than 1 when the flock is contained within self.fN of the GCM"""
        if world.flock.shape[0] == 0: return True
        r = np.mean(np.linalg.norm(world.flock - G, axis=1))
        return self.fN / r

    # ------------------ Multi-Drone Collect Logic ------------------
    def _collect_points(self, world: state.State, G: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Assigns each drone to collect an individual outermost sheep.
        Returns target points for all drones and the indices of the assigned sheep.
        """
        P = world.flock                       # (N,2)
        D = world.drones                      # (N_drones, 2)
        N_drones = D.shape[0]
                
        if target is None:
            # If no target is set, use a default position or skip goal-based calculations
            dGoal = np.zeros(P.shape[0])  # No goal distance when no target
        else:
            dGoal = np.linalg.norm(P - target, axis=1) # distance to goal
        
        dG = np.linalg.norm(P - G, axis=1)    # distance to global COM
        
        # Calculate dD for each sheep to ALL drones
        dD_all = np.zeros((P.shape[0], N_drones))
        for i in range(N_drones):
            dD_all[:, i] = np.linalg.norm(P - D[i], axis=1)        
        
        # works well for 3-4 sheep in each corner. Also worked fairly well for there being a big uniform one.
        # gcm_weight = 0.7
        # goal_weight = 0.3
        # closeness_weight = 1
                
        # I'm thinking maybe the problem is that herding towards the GCM doesn't work very well if it's already cohesive, because it should be herding towards the goal.
        cohesiveness = self._mean_cohesiveness(world, G)
        goal_distance = np.max(dGoal) / self.fN
        # The more cohesive it is, the less we care about the gcm.
        gcm_weight = lerp_clamped(0.8, 0.6, 0.3, 1.5, cohesiveness)
        # The closer we are to the goal, the less it matters how far from the GCM the sheep is.
        gcm_weight *= lerp_clamped(0.5, 1, 1, 3, goal_distance)
        # The more cohesive it is, the more we care about how far it is from the goal.
        goal_weight = lerp_clamped(0.2, 0.4, 0.3, 1.5, cohesiveness)
        # The more cohesive the herd is, the less it matters how far the drone is from the sheep.
        closeness_weight = lerp_clamped(1, 0.2, 0.3, 1.5, cohesiveness)
        # The closer the sheep are to the goal, the less it matters how far the drone is from the sheep.
        closeness_weight *= lerp_clamped(0.2, 1, 2, 4, goal_distance)
        print(f"{goal_distance:.2f}; {gcm_weight:.2f}, {goal_weight:.2f}, {closeness_weight:.2f}")

        
        # Final Score: Far from G, Far from Target, 
        intrinsic_score = gcm_weight * dG + goal_weight * dGoal

        # Some sheep are intrinsically good to herd, but different drones might be suitable for targeting different sheep. We'll adjust each sheep's score for each drone to figure out which is most suitable for each drone.
        target_sheep_indices = []
        for i in range(N_drones):
            # If there are more drones, the closeness will get accounted for by the min_distance_other stuff.
            closeness_weight = closeness_weight * (1 / N_drones)
            # Make the score worse the farther away that sheep is.
            score = intrinsic_score - closeness_weight * dD_all[:, i]
            # Compute how close the other drones are to this sheep.
            d_other_drones = np.hstack((dD_all[:, :i], dD_all[:, i+1:]))
            
            if N_drones > 1:
                min_distance_other = np.min(d_other_drones, axis=1)
                # Give a bonus if this drone is the closest.
                score += 30 * (dD_all[:, i] < min_distance_other)
            
            # Favor being close to this drone, Far from other drones
            target_sheep_indices.append(int(np.argmax(score)))
        
        # Calculate the standoff point for each assigned sheep
        collect_points = np.zeros((N_drones, 2))
        for i, target_index in enumerate(target_sheep_indices):
            Pj = P[target_index]
            
            # Point behind that sheep, pointing toward G
            dir_to_G = G - Pj
            c = dir_to_G / (np.linalg.norm(dir_to_G) + 1e-9)
            collect_points[i] = Pj - c * self.collect_standoff

        return collect_points, target_sheep_indices

    # ------------------ Flyover Logic (Per-Drone) ------------------
    def _should_apply_repulsion(self, world: state.State, drone_idx: int, gcm: np.ndarray, target: np.ndarray) -> bool:
        """Check if a specific drone should apply repulsion. Returns true if the drone's repulsive force points either towards the GCM or towards the overall target. """
        # TODO: Bring this back. Not sure if it'll be easier to tune with or without this.
        return False
        # Compute squared distances from this drone to all sheep
        dist_sq = np.sum((world.flock - world.drones[drone_idx])**2, axis=1)

        close_mask = dist_sq < 25**2 
        relevant_flock = world.flock[close_mask]
        relevant_count = relevant_flock.shape[0]
        if relevant_count == 0:
            return 0
        
        drone_to_sheep = relevant_flock - world.drones[drone_idx]
        
        # Compute the dot product of (drone to sheep) with (sheep to GCM). If it's negative, that's bad.
        sheep_to_gcm = gcm - relevant_flock
        sheep_to_gcm_norm = np.linalg.norm(sheep_to_gcm, axis=1, keepdims=True)
        sheep_to_gcm /= sheep_to_gcm_norm
        # This is sort of like the element-wise dot product.
        towards_gcm = np.sum(drone_to_sheep * sheep_to_gcm, axis=1)
        towards_gcm_fraction = np.sum(towards_gcm > 0) / relevant_count
                
        if target is None:
            # If no target is set, only use GCM-based calculation
            towards_target_fraction = 0
        else:
            sheep_to_target = target - relevant_flock
            sheep_to_target_norm = np.linalg.norm(sheep_to_target, axis=1, keepdims=True)
            sheep_to_target /= sheep_to_target_norm
            # This is sort of like the element-wise dot product.
            towards_target = np.sum(drone_to_sheep * sheep_to_target, axis=1)
            towards_target_fraction = np.sum(towards_target > 0) / relevant_count
        
        cohesiveness = self._cohesiveness(world, gcm)
        value = towards_gcm_fraction * max(0, 1 - cohesiveness) + towards_target_fraction
                
        if cohesiveness < 0.8 and towards_gcm_fraction > 0.6:
            return True

        # If the cohesiveness is high, then we don't care about going towards the GCM.
        # Selecting this value is still very much in progress.
        return 1 if (value > 0.7) else 0
        

    # ------------------ Main Planning Method ------------------
    def plan(self, world: state.State, jobs: list[state.Job], dt: float) -> Plan:
        """Return the movement plan for all drones."""
        target = None
        all_jobs_satisfied = True
        for job in jobs:
            if job.is_active and job.target is not None:
                if not is_goal_satisfied(world, job.target, job.target_radius):
                    all_jobs_satisfied = False
                
                # TODO: We should be able to do better than this. We should instead assign drones to different jobs here and don't mess with the world.
                target = job.target
                break
            
        if all_jobs_satisfied:
            return DoNothing()
        
        N_drones = world.drones.shape[0]
        G = self._gcm(world)
        # Initialize arrays for the plan
        target_positions = np.zeros((N_drones, 2))
        apply_repulsion = np.full(N_drones, 1)
        target_indices = np.full(N_drones, -1, dtype=int)

        # COLLECT PHASE: Each drone targets an outermost sheep's standoff point
        target_positions, target_indices = self._collect_points(world, G, target)
        
        # Check flyover status for each drone individually
        if self.conditionally_apply_repulsion:
            for i in range(N_drones):
                # If the drone has reached it's target position, then it should always apply repulsion, otherwise it will just get stuck.
                if np.linalg.norm(target_positions[i] - world.drones[i]) < 1:
                    # print("Overriding")
                    apply_repulsion[i] = True
                    continue
                
                # Check if the path from current drone position to its assigned collect point needs a flyover
                apply_repulsion[i] = self._should_apply_repulsion(world, i, G, target)
        
        # Vector from drone to target position
        dir_to_target = target_positions - world.drones 
        
        # Calculate unit direction vector for all drones
        dist = np.linalg.norm(dir_to_target, axis=1)
        dir_unit = dir_to_target / (dist[:, None] + 1e-9)
        
        # If a drone is too close to a sheep, then stop that drone.
        too_close_sq = self.too_close ** 2
        new_positions = np.copy(world.drones)

        for i, d in enumerate(world.drones):
            dist_sq = np.min(np.sum((world.flock - d)**2, axis=1))
            if dist_sq >= too_close_sq or not apply_repulsion[i]:
                # Only move drones that are not too close
                new_positions[i] = d + self.umax * dt * dir_unit[i]
            # else: drone is too close, so it stays put

        return DronePositions(
            positions=new_positions,
            apply_repulsion=apply_repulsion,
            target_sheep_indices=target_indices,
            gcm=G,
            radius=self.fN,
        )
