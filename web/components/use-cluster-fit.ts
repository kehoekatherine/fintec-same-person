"use client";

import { useEffect, useState } from "react";

import { isClusterFit, type ClusterFit } from "@/lib/cluster-fit";
import { publicUrl } from "@/lib/public-base";

export type ClusterFitState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; fit: ClusterFit };

export function useClusterFit(): ClusterFitState {
  const [state, setState] = useState<ClusterFitState>({
    status: "loading",
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(publicUrl("/demo/clusters.json"), { cache: "no-store" });
        const body = (await response.json()) as unknown;
        if (cancelled) return;
        if (!response.ok || !isClusterFit(body)) {
          setState({ status: "error" });
          return;
        }
        setState({ status: "ready", fit: body });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
