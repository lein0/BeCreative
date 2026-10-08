"use client";

import { useExperiment } from "@/components/use-experiment";

export function ExperimentLabel({ experiment, fallback }: { experiment: string; fallback: string }) {
  const assigned = useExperiment(experiment);
  return <>{assigned.payload.label || fallback}</>;
}
