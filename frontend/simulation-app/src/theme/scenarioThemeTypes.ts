/**
 * Scenario Theme Types
 * 
 * Generic theming system for the simulation platform.
 * Uses neutral terminology (agent/controller) to support future
 * reuse for human evacuation scenarios.
 */

export type ScenarioThemeKey =
  | "default-herd"
  | "dense-herd"
  | "scattered-herd"
  | "stress-near-obstacles"
  | "evacuation-prototype"
  | "oil-spill"
  | "real-farm";

export interface EntityIconSet {
  /** Icon key for agents (sheep now, humans later) */
  agentIcon: string;
  /** Icon key for controllers (drones now, guiding agents later) */
  controllerIcon: string;
  /** Optional icon key for targets */
  targetIcon?: string;
  /** Optional icon key for obstacles */
  obstacleIcon?: string;
}

export interface EntityColors {
  /** Fill color for agents */
  agentFill: string;
  /** Stroke color for agents */
  agentStroke: string;
  /** Fill color for controllers */
  controllerFill: string;
  /** Stroke color for controllers */
  controllerStroke: string;
  /** Color for circle target stroke (default: blue) */
  targetColor: string;
  /** Color for circle target fill */
  targetFillColor: string;
  /** Color for polygon target stroke (default: orange) */
  polygonTargetColor: string;
  /** Color for polygon target fill */
  polygonTargetFillColor: string;
  /** Color for obstacles */
  obstacleColor: string;
  /** Fill color for obstacles */
  obstacleFillColor: string;
}

export interface ScenarioTheme {
  key: ScenarioThemeKey;
  displayName: string;
  description?: string;

  /** Background styling */
  backgroundType: "solid" | "gradient" | "image";
  /** CSS color, gradient, or image URL */
  backgroundValue: string;
  /** Whether to show grid overlay */
  showGrid?: boolean;

  /** Entity icon configuration */
  icons: EntityIconSet;
  
  /** Icon set to use: "herding" (sheep/drones) or "evacuation" (people/guides) */
  iconSet: "herding" | "evacuation" | "oil";

  /** Entity color configuration */
  colors: EntityColors;

  /** HUD / overlay styling */
  hudAccentColor: string;
  hudSecondaryColor: string;
  agentTrailColor?: string;
  controllerTrailColor?: string;

  /** Map container background color (CSS) */
  mapContainerBackground: string;
}

export interface ScenarioAppearanceConfig {
  themeKey: ScenarioThemeKey;
}

/** Extended scenario type with appearance config */
export interface ScenarioWithAppearance {
  appearance?: ScenarioAppearanceConfig;
}

