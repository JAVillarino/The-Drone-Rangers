"""
Scenario Types / Behavior Packs

This module provides reusable scenario type definitions that bundle:
- world_config defaults
- policy_config defaults  
- appearance/theme defaults
- recommended entity counts

Scenario types serve as templates for quickly creating scenarios with
appropriate settings for different use cases.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, List
import numpy as np


@dataclass
class ScenarioTypeDefinition:
    """
    Definition for a reusable scenario type/behavior pack.
    
    Provides defaults for world physics, policy behavior, and visual appearance
    that can be used as a starting point for new scenarios.
    """
    key: str
    name: str
    description: str
    
    # Configuration defaults
    default_world_config: Optional[Dict[str, Any]] = None
    default_policy_config: Optional[Dict[str, Any]] = None
    
    # Visual defaults
    default_theme_key: str = "default-herd"  # Theme key for frontend theming
    default_icon_set: str = "herding"  # "herding" (sheep/drones) or "evacuation" (people/guides)
    
    # Recommended entity counts
    recommended_agents: Optional[int] = None
    recommended_controllers: Optional[int] = None
    
    # Tags for categorization
    tags: List[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


# Registry of available scenario types
SCENARIO_TYPES: Dict[str, ScenarioTypeDefinition] = {
    "herd_dense_training": ScenarioTypeDefinition(
        key="herd_dense_training",
        name="Dense Herd Training",
        description="Tightly clustered herd to practice fine control and containment.",
        default_world_config={
            "boundary": "none",
        },
        default_policy_config={
            "key": "defensive",
        },
        default_theme_key="dense-herd",
        default_icon_set="herding",
        recommended_agents=50,
        recommended_controllers=3,
        tags=["training", "dense", "containment"],
    ),
    
    "herd_scattered_recovery": ScenarioTypeDefinition(
        key="herd_scattered_recovery",
        name="Scattered Herd Recovery",
        description="Agents scattered across the field for collection and recovery practice.",
        default_world_config={
            "boundary": "none",
        },
        default_policy_config={
            "key": "aggressive",
        },
        default_theme_key="scattered-herd",
        default_icon_set="herding",
        recommended_agents=50,
        recommended_controllers=4,
        tags=["training", "scattered", "collection"],
    ),
    
    "obstacle_corridor_push": ScenarioTypeDefinition(
        key="obstacle_corridor_push",
        name="Obstacle Corridor Push",
        description="Push the herd through a narrow corridor with obstacles on both sides.",
        default_world_config={
            "boundary": "reflect",
        },
        default_policy_config={
            "key": "defensive",
        },
        default_theme_key="stress-near-obstacles",
        default_icon_set="herding",
        recommended_agents=40,
        recommended_controllers=3,
        tags=["obstacle", "corridor", "challenge"],
    ),
    
    "patrol_perimeter": ScenarioTypeDefinition(
        key="patrol_perimeter",
        name="Patrol Perimeter",
        description="Maintain flock containment with drones orbiting the perimeter.",
        default_world_config={
            "boundary": "none",
        },
        default_policy_config={
            "key": "patrol",
        },
        default_theme_key="default-herd",
        default_icon_set="herding",
        recommended_agents=60,
        recommended_controllers=4,
        tags=["patrol", "containment", "monitoring"],
    ),
    
    "large_flock_challenge": ScenarioTypeDefinition(
        key="large_flock_challenge",
        name="Large Flock Challenge",
        description="200+ agents in multiple clusters - requires coordinated multi-drone strategy.",
        default_world_config={
            "boundary": "none",
        },
        default_policy_config={
            "key": "default",
        },
        default_theme_key="default-herd",
        default_icon_set="herding",
        recommended_agents=200,
        recommended_controllers=6,
        tags=["large", "clusters", "challenge", "multi-drone"],
    ),
    
    "evacuation_prototype": ScenarioTypeDefinition(
        key="evacuation_prototype",
        name="Evacuation Prototype",
        description="Experimental scenario for human evacuation research. Spread-aware, cautious approach.",
        default_world_config={
            "boundary": "reflect",
        },
        default_policy_config={
            "key": "evacuation-prototype",
        },
        default_theme_key="evacuation-prototype",
        default_icon_set="evacuation",  # Person icons instead of sheep
        recommended_agents=30,
        recommended_controllers=2,
        tags=["evacuation", "prototype", "research"],
    ),
}


def get_scenario_type(key: str) -> Optional[ScenarioTypeDefinition]:
    """Get a scenario type by key."""
    return SCENARIO_TYPES.get(key)


def list_scenario_types() -> List[ScenarioTypeDefinition]:
    """List all available scenario types."""
    return list(SCENARIO_TYPES.values())


def generate_initial_layout(
    scenario_type: ScenarioTypeDefinition,
    num_agents: Optional[int] = None,
    num_controllers: Optional[int] = None,
    bounds: tuple = (0.0, 250.0, 0.0, 250.0),
    seed: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generate an initial entity layout based on scenario type.
    
    Args:
        scenario_type: The scenario type definition
        num_agents: Override for number of agents (uses recommended if None)
        num_controllers: Override for number of controllers (uses recommended if None)
        bounds: World bounds (xmin, xmax, ymin, ymax)
        seed: Random seed for reproducibility
    
    Returns:
        Dictionary with 'sheep', 'drones', 'targets' keys containing position lists
    """
    rng = np.random.default_rng(seed)
    
    n_agents = num_agents or scenario_type.recommended_agents or 50
    n_controllers = num_controllers or scenario_type.recommended_controllers or 2
    
    xmin, xmax, ymin, ymax = bounds
    width = xmax - xmin
    height = ymax - ymin
    center_x = (xmin + xmax) / 2
    center_y = (ymin + ymax) / 2
    
    # Generate agent positions based on scenario type
    if "dense" in scenario_type.key or "containment" in scenario_type.tags:
        # Dense: agents clustered in center
        agents = rng.normal(
            loc=[center_x, center_y],
            scale=[width * 0.1, height * 0.1],
            size=(n_agents, 2)
        )
    elif "scattered" in scenario_type.key or "scattered" in scenario_type.tags:
        # Scattered: agents spread across the field
        agents = rng.uniform(
            low=[xmin + width * 0.1, ymin + height * 0.1],
            high=[xmax - width * 0.1, ymax - height * 0.1],
            size=(n_agents, 2)
        )
    elif "corridor" in scenario_type.key:
        # Corridor: agents in a line formation
        agents = np.column_stack([
            rng.uniform(xmin + width * 0.1, xmin + width * 0.3, n_agents),
            rng.uniform(center_y - height * 0.15, center_y + height * 0.15, n_agents),
        ])
    elif "clusters" in scenario_type.tags:
        # Clusters: agents in 2-4 clusters
        n_clusters = min(4, max(2, n_agents // 30))
        agents_per_cluster = n_agents // n_clusters
        agents = []
        for i in range(n_clusters):
            cx = rng.uniform(xmin + width * 0.2, xmax - width * 0.2)
            cy = rng.uniform(ymin + height * 0.2, ymax - height * 0.2)
            cluster = rng.normal(
                loc=[cx, cy],
                scale=[width * 0.08, height * 0.08],
                size=(agents_per_cluster, 2)
            )
            agents.append(cluster)
        agents = np.vstack(agents)[:n_agents]
    else:
        # Default: moderately clustered in center region
        agents = rng.uniform(
            low=[center_x - width * 0.25, center_y - height * 0.25],
            high=[center_x + width * 0.25, center_y + height * 0.25],
            size=(n_agents, 2)
        )
    
    # Clip to bounds
    agents[:, 0] = np.clip(agents[:, 0], xmin + 5, xmax - 5)
    agents[:, 1] = np.clip(agents[:, 1], ymin + 5, ymax - 5)
    
    # Generate controller positions: evenly spaced around agents
    agent_center = agents.mean(axis=0)
    agent_radius = np.max(np.linalg.norm(agents - agent_center, axis=1))
    controller_radius = agent_radius * 1.5 + 20
    
    controllers = np.zeros((n_controllers, 2))
    for i in range(n_controllers):
        angle = 2 * np.pi * i / n_controllers
        controllers[i] = agent_center + controller_radius * np.array([np.cos(angle), np.sin(angle)])
    
    # Clip controllers to bounds
    controllers[:, 0] = np.clip(controllers[:, 0], xmin + 5, xmax - 5)
    controllers[:, 1] = np.clip(controllers[:, 1], ymin + 5, ymax - 5)
    
    # Default target: center of bounds
    targets = [[center_x, center_y]]
    
    return {
        "sheep": [[float(x), float(y)] for x, y in agents],
        "drones": [[float(x), float(y)] for x, y in controllers],
        "targets": targets,
    }

