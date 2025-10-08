from __future__ import annotations
import numpy as np
from .utils import norm
from planning.plan_type import DoNothing, Plan, DronePositions
from planning import state

# The modified policy class
class ShepherdPolicy:
    """
    Collect/drive policy modified for multiple drones.
    
    Strategy: 
    - Drive: All drones drive to sector-assigned drive points behind the G-to-Target line.
    - Collect: Each drone collects an assigned outermost sheep.
    """
    
    def __init__(self, *, fN: float, umax: float, too_close: float, collect_standoff: float, drive_standoff: float, flyover_on_collect: bool = True):
        self.fN = fN
        self.umax = umax
        self.too_close = too_close
        self.collect_standoff = collect_standoff
        self.drive_standoff = drive_standoff
        self.flyover_on_collect = flyover_on_collect

    # ------------------ Unchanged/Minor Utility ------------------

    def _gcm(self, world: state.State) -> np.ndarray:
        """Global Center of Mass."""
        return np.mean(world.flock, axis=0)

    def _cohesive(self, world: state.State, G: np.ndarray) -> bool:
        """Check for flock cohesiveness."""
        if world.flock.shape[0] == 0: return True
        r = np.max(np.linalg.norm(world.flock - G, axis=1))
        return r <= self.fN

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
        intrinsic_score = dG + 0.2 * dGoal

        # Some sheep are intrinsically good to herd, but different drones might be suitable for targeting different sheep. We'll adjust each sheep's score for each drone to figure out which is most suitable for each drone.
        target_sheep_indices = []
        for i in range(N_drones):
            score = intrinsic_score - 0.1 * dD_all[:, i]
            # Compute how close the other drones are to this sheep.
            d_other_drones = np.hstack((dD_all[:, :i], dD_all[:, i+1:]))
            
            if N_drones > 1:
                min_distance_other = np.min(d_other_drones, axis=1)
                # Give a bonus if this drone is the closest.
                score += 50 * (dD_all[:, i] < min_distance_other)
            
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

    def _should_apply_repulsion(self, world: state.State, drone_idx: int, target: np.ndarray, corridor: float) -> bool:
        """Check if a specific drone needs a flyover on its current path."""
        P = world.flock
        A = world.drones[drone_idx]
        B = target
        
        AB = B - A
        ab2 = float(np.dot(AB, AB)) + 1e-12 

        # Projection of each sheep onto the segment A→B
        # t is an (N,) array
        t = np.clip(((P - A) @ AB) / ab2, 0.0, 1.0)
        closest = A + t[:, None] * AB # closest point on the line segment
        d = np.linalg.norm(P - closest, axis=1)

        return 0 if np.any(d <= corridor * self.too_close) else 1


    # ------------------ Main Planning Method ------------------

    def plan(self, world: state.State, dt: float) -> Plan:
        """Return the movement plan for all drones."""
        
        N_drones = world.drones.shape[0]
        G = self._gcm(world)
        is_cohesive = self._cohesive(world, G)
        
        # TODO: Fix this - this is stupid rn.
        # Safety Check: If ANY drone is too close to ANY sheep, stop ALL drones
        # This is a very conservative stop, but mirrors the single-dog behavior.
        min_dist_sq = np.inf
        for d in world.drones:
            dist_sq = np.min(np.sum((world.flock - d)**2, axis=1))
            min_dist_sq = min(min_dist_sq, dist_sq)
        
        if min_dist_sq < self.too_close**2:
            return DoNothing()

        # Initialize arrays for the plan
        target_positions = np.zeros((N_drones, 2))
        apply_repulsion = np.full(N_drones, False)
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
            if self.flyover_on_collect:
                for i in range(N_drones):
                    # Check if the path from current drone position to its assigned collect point needs a flyover
                    target = target_positions[i]
                    apply_repulsion[i] = self._should_apply_repulsion(world, i, target, corridor=0.40)

        # Calculate the next step for all drones (vectorized)
        
        # Vector from drone to target position
        dir_to_target = target_positions - world.drones 
        
        # Calculate unit direction vector for all drones
        dist = np.linalg.norm(dir_to_target, axis=1)
        dir_unit = dir_to_target / (dist[:, None] + 1e-9)
        
        # Calculate next position
        # Step: Current Pos + Vmax * dt * Unit Dir
        step_positions = world.drones + self.umax * dt * dir_unit

        return DronePositions(
            positions=step_positions, 
            apply_repulsion=apply_repulsion,
            target_sheep_indices=target_indices
        )