"use client";

import dynamic from "next/dynamic";

export const StudioMap = dynamic(() => import("@/components/studio-map").then((mod) => mod.StudioMap), { ssr: false });
