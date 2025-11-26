from __future__ import annotations
import numpy as np
from planning.plan_type import DoNothing, Plan, DronePositions
from planning import state


def lerp_clamped(a: float, b: float, t1: float, t2: float, t: float) -> float:
            """Linearly interpolate between a and b by t, but clamp t to [0,1]."""
            t = (t - t1) / (t2 - t1)
            t = max(0.0, min(1.0, t))
            return a + (b - a) * t

def points_inside_polygon(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    """
    Check which points are inside a polygon using the ray casting algorithm (vectorized).
    
    Args:
        points: 2D points as np.ndarray of shape (n, 2)
        polygon: Polygon vertices as np.ndarray of shape (m, 2)
    
    Returns:
        Boolean array of shape (n,) indicating which points are inside the polygon
    """
    if polygon.shape[0] < 3:
        # Need at least 3 vertices for a valid polygon
        return np.zeros(points.shape[0], dtype=bool)
    
    n_points = points.shape[0]
    n_vertices = polygon.shape[0]
    inside = np.zeros(n_points, dtype=bool)
    
    # For each point, cast a ray to the right and count intersections
    for i in range(n_points):
        px, py = points[i]
        intersections = 0
        
        for j in range(n_vertices):
            v1 = polygon[j]
            v2 = polygon[(j + 1) % n_vertices]
            
            x1, y1 = v1
            x2, y2 = v2
            
            # Check if ray crosses this edge
            if ((y1 > py) != (y2 > py)):  # Edge crosses horizontal line through point
                # Compute x-coordinate of intersection
                if y2 != y1:  # Avoid division by zero
                    x_intersect = (py - y1) * (x2 - x1) / (y2 - y1) + x1
                    if px < x_intersect:
                        intersections += 1
        
        # Odd number of intersections means point is inside
        inside[i] = (intersections % 2) == 1
    
    return inside

def closest_point_on_polygon(points: np.ndarray, polygon: np.ndarray) -> np.ndarray:
    """
    Find the closest point on a polygon for each point in the input array (vectorized).
    
    Args:
        points: 2D points as np.ndarray of shape (n, 2)
        polygon: Polygon vertices as np.ndarray of shape (m, 2)
    
    Returns:
        The closest points on the polygon for each input point as np.ndarray of shape (n, 2)
    """
    if polygon.shape[0] < 2:
        # Degenerate polygon - return first vertex for all points
        if polygon.shape[0] > 0:
            return np.tile(polygon[0], (points.shape[0], 1))
        else:
            return points.copy()
    
    n_points = points.shape[0]
    n_vertices = polygon.shape[0]
    
    # Initialize with large distances
    min_dist_sq = np.full(n_points, np.inf)
    closest_points = np.zeros((n_points, 2))
    
    # Check each edge of the polygon
    for i in range(n_vertices):
        v1 = polygon[i]
        v2 = polygon[(i + 1) % n_vertices]  # Wrap around to close the polygon
        
        # Vector along the edge
        edge_vec = v2 - v1
        edge_len_sq = np.dot(edge_vec, edge_vec)
        
        if edge_len_sq < 1e-9:
            # Degenerate edge (zero length) - check distance to vertex for all points
            to_vertex = points - v1  # (n_points, 2)
            dist_sq = np.sum(to_vertex ** 2, axis=1)  # (n_points,)
            
            # Update where this vertex is closer
            mask = dist_sq < min_dist_sq
            closest_points[mask] = v1
            min_dist_sq = np.minimum(min_dist_sq, dist_sq)
            continue
        
        # Vector from v1 to each point: (n_points, 2)
        to_points = points - v1
        
        # Project each point onto the edge line
        # t = dot(to_points, edge_vec) / dot(edge_vec, edge_vec)
        # to_points @ edge_vec gives (n_points,) result
        t = np.dot(to_points, edge_vec) / edge_len_sq  # (n_points,)
        
        # Clamp t to [0, 1] to stay on the segment
        t = np.clip(t, 0.0, 1.0)
        
        # Closest points on the edge segment: (n_points, 2)
        # v1 is (2,), t is (n_points,), edge_vec is (2,)
        # We need to broadcast: v1 + t[:, None] * edge_vec
        closest_on_edge = v1 + t[:, np.newaxis] * edge_vec
        
        # Distance squared from each point to closest point on edge: (n_points,)
        dist_sq = np.sum((points - closest_on_edge) ** 2, axis=1)
        
        # Update where this edge gives a closer point
        mask = dist_sq < min_dist_sq
        closest_points[mask] = closest_on_edge[mask]
        min_dist_sq = np.minimum(min_dist_sq, dist_sq)
    
    return closest_points

def is_goal_satisfied(w: state.State, target: state.Target) -> bool:
    """
    Return True if every sheep in the world's flock is within the goal tolerance
    of the world's target.
    """
    if w.flock.size == 0:
        return True

    if isinstance(target, state.Circle):
        # squared comparison for speed / numerical stability
        tol_sq = target.radius * target.radius

        # distances squared from each sheep to the target
        diffs = w.flock - target.center.reshape(1, 2)
        d2 = np.sum(diffs * diffs, axis=1)

        return np.all(d2 <= tol_sq)
    elif isinstance(target, state.Polygon):
        return np.all(points_inside_polygon(w.flock, target.points))

    return False

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
    def _collect_points(self, world: state.State, G: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, list[int]]:
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
        elif isinstance(target, state.Circle):
            dGoal = np.linalg.norm(P - target.center, axis=1) # distance to goal
            # If the sheep is inside the goal, set the distance to -inf so it won't be targeted.
            dGoal = np.where(dGoal < target.radius, -np.inf, dGoal)
        elif isinstance(target, state.Polygon):
            # Compute the distance to the closest point on the polygon (vectorized)
            closest_points = closest_point_on_polygon(P, target.points)
            dGoal = np.linalg.norm(P - closest_points, axis=1)
            # If the sheep is inside the goal, set the distance to -inf so it won't be targeted.
            polygon_inside = points_inside_polygon(P, target.points)
            dGoal = np.where(polygon_inside, -np.inf, dGoal)
        
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
        goal_distance_ratio = np.max(dGoal) / self.fN
        # The more cohesive it is, the less we care about the gcm.
        gcm_weight = lerp_clamped(0.8, 0.6, 0.3, 1.5, cohesiveness)
        # The closer we are to the goal, the less it matters how far from the GCM the sheep is.
        gcm_weight *= lerp_clamped(0.5, 1, 1, 3, goal_distance_ratio)
        # The more cohesive it is, the more we care about how far it is from the goal.
        goal_weight = lerp_clamped(0.2, 0.4, 0.3, 1.5, cohesiveness)
        # The more cohesive the herd is, the less it matters how far the drone is from the sheep. 
        closeness_weight = lerp_clamped(1, 0.2, 0.3, 1.5, cohesiveness)
        # The closer the sheep are to the goal, the less it matters how far the drone is from the sheep.
        closeness_weight *= lerp_clamped(0.2, 1, 2, 4, goal_distance_ratio)
        
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
        collect_points = np.full((N_drones, 2), np.nan)
        for i, target_index in enumerate(target_sheep_indices):
            Pj = P[target_index]
            
            # Point behind that sheep, pointing toward G
            dir_to_G = G - Pj
            c = dir_to_G / (np.linalg.norm(dir_to_G) + 1e-9)
            collect_points[i] = Pj - c * self.collect_standoff

        return collect_points, target_sheep_indices

    # ------------------ Flyover Logic (Per-Drone) ------------------
    def _should_apply_repulsion(self, world: state.State, drone_idx: int, gcm: np.ndarray, target: np.ndarray, target_positions: np.ndarray) -> bool:
        """Check if a specific drone should apply repulsion. Returns true if the drone is close to its collect point."""
        # If the drone is close to its collect point, then it should always apply repulsion
        if np.linalg.norm(target_positions[drone_idx] - world.drones[drone_idx]) < 2:
            return True

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
                if not is_goal_satisfied(world, job.target):
                    all_jobs_satisfied = False
                
                # TODO: We should be able to do better than this. We should instead assign drones to different jobs here and don't mess with the world.
                target = job.target
                break
                
        # Why isn't the job satisfied
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
                # Check if the path from current drone position to its assigned collect point needs a flyover
                apply_repulsion[i] = self._should_apply_repulsion(world, i, G, target, target_positions)
        
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
