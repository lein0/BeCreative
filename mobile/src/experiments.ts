import type { ExperimentAssignment } from "./api/types";

export function variantOf(assignments: ExperimentAssignment[], key: string, fallback: string): string {
  return assignments.find((item) => item.key === key)?.variant ?? fallback;
}

export function cardDensity(assignments: ExperimentAssignment[]): "comfortable" | "compact" {
  return variantOf(assignments, "explore_density", "comfortable") === "compact" ? "compact" : "comfortable";
}
