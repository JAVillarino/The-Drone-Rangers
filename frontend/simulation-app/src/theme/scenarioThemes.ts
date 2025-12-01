/**
 * Scenario Theme Registry
 * 
 * Predefined themes for different herding dynamics and the real farm view.
 * All themes maintain a realistic, professional look while providing
 * visual differentiation for different scenario types.
 */

import { ScenarioTheme, ScenarioThemeKey } from "./scenarioThemeTypes";

export const SCENARIO_THEMES: Record<ScenarioThemeKey, ScenarioTheme> = {
  "default-herd": {
    key: "default-herd",
    displayName: "Default Herd Simulation",
    description: "Baseline herding visualization matching current simulator.",
    backgroundType: "solid",
    backgroundValue: "#496246",
    showGrid: false,
    icons: {
      agentIcon: "agent.herd.default",
      controllerIcon: "controller.default",
      targetIcon: "target.default",
    },
    iconSet: "herding",
    colors: {
      agentFill: "#ffffff",
      agentStroke: "#333333",
      controllerFill: "#4299e1",
      controllerStroke: "#2b6cb0",
      targetColor: "rgba(0, 142, 255, 0.8)",
      targetFillColor: "rgba(0, 142, 255, 0.2)",
      polygonTargetColor: "rgba(255, 165, 0, 0.9)",
      polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
      obstacleColor: "#8B4513",
      obstacleFillColor: "rgba(139, 69, 19, 0.6)",
    },
    hudAccentColor: "#38bdf8",
    hudSecondaryColor: "#64748b",
    agentTrailColor: "#22c55e",
    controllerTrailColor: "#f97316",
    mapContainerBackground: "#496246",
  },

  "dense-herd": {
    key: "dense-herd",
    displayName: "Dense Herd",
    description: "Visual emphasis for tightly grouped, controlled herds.",
    backgroundType: "solid",
    backgroundValue: "#3d5a3d",
    showGrid: false,
    icons: {
      agentIcon: "agent.herd.dense",
      controllerIcon: "controller.default",
      targetIcon: "target.default",
    },
    iconSet: "herding",
    colors: {
      agentFill: "#e8f5e9",
      agentStroke: "#2e7d32",
      controllerFill: "#43a047",
      controllerStroke: "#2e7d32",
      targetColor: "rgba(46, 125, 50, 0.9)",
      targetFillColor: "rgba(46, 125, 50, 0.25)",
      polygonTargetColor: "rgba(255, 165, 0, 0.9)",
      polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
      obstacleColor: "#5d4037",
      obstacleFillColor: "rgba(93, 64, 55, 0.5)",
    },
    hudAccentColor: "#16a34a",
    hudSecondaryColor: "#64748b",
    agentTrailColor: "#22c55e",
    controllerTrailColor: "#22c55e",
    mapContainerBackground: "#3d5a3d",
  },

  "scattered-herd": {
    key: "scattered-herd",
    displayName: "Scattered Herd",
    description: "Visual emphasis for widely scattered, hard-to-control herds.",
    backgroundType: "solid",
    backgroundValue: "#4a5942",
    showGrid: false,
    icons: {
      agentIcon: "agent.herd.scattered",
      controllerIcon: "controller.default",
      targetIcon: "target.default",
    },
    iconSet: "herding",
    colors: {
      agentFill: "#fff8e1",
      agentStroke: "#f9a825",
      controllerFill: "#ff9800",
      controllerStroke: "#e65100",
      targetColor: "rgba(249, 168, 37, 0.9)",
      targetFillColor: "rgba(249, 168, 37, 0.25)",
      polygonTargetColor: "rgba(255, 165, 0, 0.9)",
      polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
      obstacleColor: "#6d4c41",
      obstacleFillColor: "rgba(109, 76, 65, 0.5)",
    },
    hudAccentColor: "#ca8a04",
    hudSecondaryColor: "#64748b",
    agentTrailColor: "#facc15",
    controllerTrailColor: "#f97316",
    mapContainerBackground: "#4a5942",
  },

  "stress-near-obstacles": {
    key: "stress-near-obstacles",
    displayName: "Obstacle-Stress Scenario",
    description: "Highlight obstacle-heavy herding with slightly higher visual contrast.",
    backgroundType: "solid",
    backgroundValue: "#3b4a3b",
    showGrid: false,
    icons: {
      agentIcon: "agent.herd.stress",
      controllerIcon: "controller.emphasis",
      targetIcon: "target.emphasis",
    },
    iconSet: "herding",
    colors: {
      agentFill: "#ffebee",
      agentStroke: "#c62828",
      controllerFill: "#ef5350",
      controllerStroke: "#c62828",
      targetColor: "rgba(198, 40, 40, 0.9)",
      targetFillColor: "rgba(198, 40, 40, 0.25)",
      polygonTargetColor: "rgba(255, 165, 0, 0.9)",
      polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
      obstacleColor: "#b71c1c",
      obstacleFillColor: "rgba(183, 28, 28, 0.4)",
    },
    hudAccentColor: "#ef4444",
    hudSecondaryColor: "#6b7280",
    agentTrailColor: "#f97316",
    controllerTrailColor: "#ef4444",
    mapContainerBackground: "#3b4a3b",
  },

  "evacuation-prototype": {
    key: "evacuation-prototype",
    displayName: "City Evacuation",
    description: "Urban evacuation scenario at a city intersection - agents are people, controllers are guide robots.",
    backgroundType: "image",
    backgroundValue: "../../img/evacuation-map.jpg",
    showGrid: false,
    icons: {
      agentIcon: "agent.evacuation.prototype",
      controllerIcon: "controller.evacuation",
      targetIcon: "target.evacuation",
    },
    iconSet: "evacuation",
    colors: {
      agentFill: "#fef3c7",
      agentStroke: "#d97706",
      controllerFill: "#10b981",
      controllerStroke: "#047857",
      targetColor: "rgba(34, 197, 94, 0.95)",
      targetFillColor: "rgba(34, 197, 94, 0.3)",
      polygonTargetColor: "rgba(34, 197, 94, 0.95)",
      polygonTargetFillColor: "rgba(34, 197, 94, 0.3)",
      obstacleColor: "#dc2626",
      obstacleFillColor: "rgba(220, 38, 38, 0.4)",
    },
    hudAccentColor: "#10b981",
    hudSecondaryColor: "#6b7280",
    agentTrailColor: "#f59e0b",
    controllerTrailColor: "#10b981",
    mapContainerBackground: "#1f2937",
  },

  "oil-spill": {
    key: "oil-spill",
    displayName: "Oil Spill Cleanup",
    description: "Ocean cleanup operation - agents are oil droplets, controllers are cleanup boats.",
    backgroundType: "image",
    backgroundValue: "../../img/ocean-map.jpg",
    showGrid: false,
    icons: {
      agentIcon: "agent.oil.spill",
      controllerIcon: "controller.oil",
      targetIcon: "target.oil",
    },
    iconSet: "oil",
    colors: {
      agentFill: "#1f2937",
      agentStroke: "#000000",
      controllerFill: "#f59e0b",
      controllerStroke: "#b45309",
      targetColor: "rgba(245, 158, 11, 0.9)",
      targetFillColor: "rgba(245, 158, 11, 0.2)",
      polygonTargetColor: "rgba(245, 158, 11, 0.9)",
      polygonTargetFillColor: "rgba(245, 158, 11, 0.2)",
      obstacleColor: "#ef4444",
      obstacleFillColor: "rgba(239, 68, 68, 0.4)",
    },
    hudAccentColor: "#f59e0b",
    hudSecondaryColor: "#6b7280",
    agentTrailColor: "#4b5563",
    controllerTrailColor: "#f59e0b",
    mapContainerBackground: "#0ea5e9",
  },

  "real-farm": {
    key: "real-farm",
    displayName: "Real Farm View",
    description: "Fixed theme that must match the current real farm UI.",
    backgroundType: "solid",
    backgroundValue: "#496246",
    showGrid: false,
    icons: {
      agentIcon: "agent.real-farm",
      controllerIcon: "controller.real-farm",
      targetIcon: "target.real-farm",
    },
    iconSet: "herding",
    colors: {
      agentFill: "#ffffff",
      agentStroke: "#333333",
      controllerFill: "#4299e1",
      controllerStroke: "#2b6cb0",
      targetColor: "rgba(0, 142, 255, 0.8)",
      targetFillColor: "rgba(0, 142, 255, 0.2)",
      polygonTargetColor: "rgba(255, 165, 0, 0.9)",
      polygonTargetFillColor: "rgba(255, 165, 0, 0.25)",
      obstacleColor: "#8B4513",
      obstacleFillColor: "rgba(139, 69, 19, 0.6)",
    },
    hudAccentColor: "#2b6cb0",
    hudSecondaryColor: "#9ca3af",
    agentTrailColor: "#ffffff",
    controllerTrailColor: "#ffffff",
    mapContainerBackground: "#496246",
  },
};

/**
 * Get a scenario theme by key, falling back to default-herd if not found.
 */
export function getScenarioTheme(key?: ScenarioThemeKey | null): ScenarioTheme {
  if (!key) return SCENARIO_THEMES["default-herd"];
  return SCENARIO_THEMES[key] ?? SCENARIO_THEMES["default-herd"];
}

/**
 * Get all available theme keys for simulator scenarios.
 * Excludes "real-farm" which is only for the live farm view.
 */
export function getSimulatorThemeKeys(): ScenarioThemeKey[] {
  return [
    "default-herd",
    "dense-herd",
    "scattered-herd",
    "stress-near-obstacles",
    "evacuation-prototype",
    "oil-spill",
  ];
}

/**
 * Get theme options for dropdowns (excludes real-farm).
 */
export function getThemeOptions(): Array<{ key: ScenarioThemeKey; displayName: string; description?: string }> {
  return getSimulatorThemeKeys().map((key) => ({
    key,
    displayName: SCENARIO_THEMES[key].displayName,
    description: SCENARIO_THEMES[key].description,
  }));
}

