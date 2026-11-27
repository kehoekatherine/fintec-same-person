export type ClusterProfile = {
  id: number;
  size: number;
  label: string;
  mean: {
    nameMatch: number;
    dobMatch: number;
    countryMatch: number;
    nameDifferent: number;
    dobDifferent: number;
    countryDifferent: number;
    nameJaccard: number;
    countryJaccard: number;
  };
};

export type ClusterNeighbor = {
  hitId: string;
  distance: number;
  name: string;
};

export type ClusterEscalation = {
  sentToReview: boolean;
  priority: boolean;
  type: string | null;
  reason: string | null;
  clusterCalls: string | null;
  combined: string;
};

export type ClusterHit = {
  hitId: string;
  name: string;
  cluster: number;
  label: string;
  distance: number;
  rules: string;
  combined: string;
  disagree: string | null;
  escalation: ClusterEscalation;
  neighbors: ClusterNeighbor[];
};

export type ClusterTiming = {
  fitSeconds: number;
  predictSeconds: number;
  totalSeconds: number;
  perHitSeconds: number;
  scaled200Seconds: number;
  machine: string;
  processor: string;
  cpuCount: number | null;
  note: string;
};

export type ClusterAgreement = {
  agree: number;
  n: number;
  percent: number;
  mapping: string;
  note: string;
};

export type WorkloadCounts = {
  cleared: number;
  confirmed: number;
  review: number;
};

export type EscalationTypeCount = {
  type: string;
  priority: boolean;
  count: number;
  changed: number;
};

export type RulesPlusCluster = {
  before: WorkloadCounts;
  after: WorkloadCounts;
  byType: EscalationTypeCount[];
  flagged: number;
  changed: number;
  note: string;
};

export type ClusterPoint = {
  hitId: string;
  x: number;
  y: number;
  cluster: number;
};

export type ClusterCrosstab = {
  cluster: number;
  label: string;
  cleared: number;
  confirmed: number;
  review: number;
};

export type ClusterFit = {
  model: string;
  parameters: { n_clusters: number; n_init: number; random_state: number };
  scaler: string;
  seed: number;
  n: number;
  features: string[];
  excluded: string[];
  exclusionNote: string;
  labelRule: string;
  timing: ClusterTiming;
  agreement: ClusterAgreement;
  rulesPlusCluster: RulesPlusCluster;
  k: number;
  silhouette: number;
  silhouetteByK: { k: number; silhouette: number }[];
  agglomerative: { linkage: string; k: number; silhouette: number };
  hdbscan: {
    minClusterSize: number;
    minSamples: number;
    clusters: number;
    noise: number;
    silhouette: number | null;
    silhouetteNote: string;
  };
  clusters: ClusterProfile[];
  crosstab: ClusterCrosstab[];
  hits: ClusterHit[];
  pca: ClusterPoint[];
};

export function isClusterFit(value: unknown): value is ClusterFit {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.model === "sklearn.cluster.KMeans" &&
    typeof record.k === "number" &&
    typeof record.silhouette === "number" &&
    !!record.timing &&
    typeof (record.timing as { totalSeconds?: unknown }).totalSeconds === "number" &&
    !!record.agreement &&
    typeof (record.agreement as { agree?: unknown }).agree === "number" &&
    !!record.rulesPlusCluster &&
    Array.isArray(record.clusters) &&
    Array.isArray(record.hits) &&
    Array.isArray(record.pca) &&
    Array.isArray(record.crosstab) &&
    Array.isArray(record.features) &&
    !record.features.includes("decision") &&
    !record.features.includes("closeness")
  );
}
