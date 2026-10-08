"use client";

import { useEffect, useState } from "react";

export function useExperiment(experiment: string) {
  const [state, setState] = useState<{ variant: string | null; payload: Record<string, string>; ready: boolean }>({
    variant: null,
    payload: {},
    ready: false,
  });
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/experiments/${encodeURIComponent(experiment)}`, { credentials: "same-origin" })
      .then((response) => response.json())
      .then((body: { variant?: string; payload?: Record<string, string> }) => {
        if (cancelled) return;
        setState({ variant: body.variant ?? null, payload: body.payload ?? {}, ready: true });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, ready: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [experiment]);
  return state;
}
