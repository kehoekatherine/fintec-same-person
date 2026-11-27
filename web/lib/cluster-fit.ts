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

export type ClusterHit = {
  hitId: string;
  name: string;
  cluster: number;
  label: string;
  distance: number;
  rules: string;
  disagree: string | null;
  neighbors: ClusterNeighbor[];
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
    Array.isArray(record.clusters) &&
    Array.isArray(record.hits) &&
    Array.isArray(record.pca) &&
    Array.isArray(record.crosstab) &&
    Array.isArray(record.features) &&
    !record.features.includes("decision") &&
    !record.features.includes("closeness")
  );
}
