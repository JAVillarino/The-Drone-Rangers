from __future__ import annotations
import numpy as np
from planning.plan_type import DoNothing, Plan, DronePositions
from planning import state



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
    
    def __init__(self, *, fN: float, umax: float, too_close: float, collect_standoff: float, drive_standoff: float, conditionally_apply_repulsion: bool = True):
        self.fN = fN
        self.umax = umax
        self.too_close = too_close
        self.collect_standoff = collect_standoff
        self.drive_standoff = drive_standoff
        self.conditionally_apply_repulsion = conditionally_apply_repulsion

    def _gcm(self, world: state.State) -> np.ndarray:
        """Global Center of Mass."""
        return np.mean(world.flock, axis=0)

    def _cohesive(self, world: state.State, G: np.ndarray) -> bool:
        """Check for flock cohesiveness."""
        return self._cohesiveness(world, G) > 1
    
    def _cohesiveness(self, world: state.State, G: np.ndarray) -> bool:
        """Check for flock cohesiveness."""
        if world.flock.shape[0] == 0: return True
        r = np.max(np.linalg.norm(world.flock - G, axis=1))
        return self.fN / r

    # ------------------ Multi-Drone Drive Logic ------------------
    def _drive_points(self, world: state.State, G: np.ndarray) -> np.ndarray:
        """
        Calculates drive points for all drones.
        Points are spread in a circular arc behind the G-to-Target line.
        """
        num_drones = world.drones.shape[0]
        
        # Vector from G to Target
        dir_GT = world.target - G
        L_GT = np.linalg.norm(dir_GT)
        ghat = dir_GT / (L_GT + 1e-9)
                
        # Angle spread for points (e.g., 90 degrees total spread)
        max_angle = np.pi / 2 # 90 degrees total spread
        
        # Generate N evenly spaced angles, from -max_angle/2 to +max_angle/2
        if num_drones > 1:
            angles = np.linspace(-max_angle / 2, max_angle / 2, num_drones)
        else:
            angles = np.array([0.0])
        
        drive_points = np.zeros((num_drones, 2))
        
        for i in range(num_drones):
            # Rotate the base standoff vector by the calculated angle
            # Rotation matrix: [[cos(a), -sin(a)], [sin(a), cos(a)]]
            ca, sa = np.cos(angles[i]), np.sin(angles[i])
            rot_matrix = np.array([[ca, -sa], [sa, ca]])
            
            # The vector from G to the drone's drive point
            standoff_vec = -ghat * self.drive_standoff
            rotated_vec = np.dot(rot_matrix, standoff_vec)
            
            drive_points[i] = G + rotated_vec
            
        return drive_points


    # ------------------ Multi-Drone Collect Logic ------------------
    def _collect_points(self, world: state.State, G: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Assigns each drone to collect an individual outermost sheep.
        Returns target points for all drones and the indices of the assigned sheep.
        """
        P = world.flock                       # (N,2)
        D = world.drones                      # (N_drones, 2)
        N_drones = D.shape[0]
        
        dG = np.linalg.norm(P - G, axis=1)    # distance to global COM
        dGoal = np.linalg.norm(P - world.target, axis=1) # distance to goal
        
        # Calculate dD for each sheep to ALL drones
        dD_all = np.zeros((P.shape[0], N_drones))
        for i in range(N_drones):
            dD_all[:, i] = np.linalg.norm(P - D[i], axis=1)        
        
        # Final Score: Far from G, Far from Target, 
        intrinsic_score = 0.7 * dG + 0.3 * dGoal

        # Some sheep are intrinsically good to herd, but different drones might be suitable for targeting different sheep. We'll adjust each sheep's score for each drone to figure out which is most suitable for each drone.
        target_sheep_indices = []
        for i in range(N_drones):
            # Make the score worse the farther away that sheep is.
            score = intrinsic_score - 0.01 * dD_all[:, i]
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
    def _should_apply_repulsion(self, world: state.State, drone_idx: int, gcm: np.ndarray) -> bool:
        """Check if a specific drone should apply repulsion. Returns true if the drone's repulsive force points either towards the GCM or towards the overall target. """
        # Compute squared distances from this drone to all sheep
        dist_sq = np.sum((world.flock - world.drones[drone_idx])**2, axis=1)

        close_mask = dist_sq < 25**2 
        relevant_flock = world.flock[close_mask]
        relevant_count = relevant_flock.shape[0]
        if relevant_count == 0:
            return 1
        
        drone_to_sheep = relevant_flock - world.drones[drone_idx]
        
        # Compute the dot product of (drone to sheep) with (sheep to GCM). If it's negative, that's bad.
        sheep_to_gcm = gcm - relevant_flock
        sheep_to_gcm_norm = np.linalg.norm(sheep_to_gcm, axis=1, keepdims=True)
        sheep_to_gcm /= sheep_to_gcm_norm
        # This is sort of like the element-wise dot product.
        towards_gcm = np.sum(drone_to_sheep * sheep_to_gcm, axis=1)
        towards_gcm_fraction = np.sum(towards_gcm > 0) / relevant_count
        
        sheep_to_target = world.target - relevant_flock
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
        return 1 if (value > 0.75) else 0
        

    # ------------------ Main Planning Method ------------------
    def plan(self, world: state.State, jobs: list[state.Job], dt: float) -> Plan:
        """Return the movement plan for all drones."""
        world.target = None
        all_jobs_satisfied = True
        for job in jobs:
            if job.is_active and job.target is not None:
                if not is_goal_satisfied(world, job.target, job.target_radius):
                    all_jobs_satisfied = False
                
                # TODO: We should be able to do better than this. We should instead assign drones to different jobs here and don't mess with the world.
                world.target = job.target
                break
            
        if all_jobs_satisfied:
            return DoNothing()
        
        N_drones = world.drones.shape[0]
        G = self._gcm(world)
        is_cohesive = self._cohesive(world, G)
        # Initialize arrays for the plan
        target_positions = np.zeros((N_drones, 2))
        apply_repulsion = np.full(N_drones, 1)
        target_indices = np.full(N_drones, -1, dtype=int)

        if is_cohesive:
            # DRIVE PHASE: All drones drive to their assigned drive point
            target_positions = self._drive_points(world, G)
            # Repulsion is ON (False) by default and remains so in drive phase
        else:
            # COLLECT PHASE: Each drone targets an outermost sheep's standoff point
            collect_points, target_indices = self._collect_points(world, G)
            target_positions = collect_points
            
            # Check flyover status for each drone individually
            if self.conditionally_apply_repulsion:
                for i in range(N_drones):
                    # Check if the path from current drone position to its assigned collect point needs a flyover
                    apply_repulsion[i] = self._should_apply_repulsion(world, i, G)
        
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
            target_sheep_indices=target_indices
        )
