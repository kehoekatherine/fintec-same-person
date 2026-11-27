#!/usr/bin/env python3
"""Cluster the 819 recorded customer–hit pairs without using the rules decision.

Features come only from comparison: one-hot field status, plus name, date, and
country similarities computed from the stored strings. decision, reason_code,
reason, evidence, and closeness are not features. Closeness is omitted because
it is absent on every DIFFERENT_ENTITY row, so including it would leak the outcome.

Writes web/public/demo/clusters.json.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering, HDBSCAN, KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

SEED = 7
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "dev.jsonl"
DEST = ROOT / "web" / "public" / "demo" / "clusters.json"

STATUS = ("match", "different", "undefined")
FIELDS = ("name", "date_of_birth", "country")
FEATURE_NAMES = [
    *(f"{field}_{status}" for field in ("name", "dob", "country") for status in STATUS),
    "name_jaccard",
    "name_similarity",
    "dob_year_known",
    "dob_year_gap",
    "country_jaccard",
]
EXCLUDED = [
    "decision",
    "reason",
    "reason_code",
    "closeness",
    "evidence",
    "customer_record_id",
    "alert_id",
    "hit_id",
]


def fold(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens(value: str) -> set[str]:
    return {part for part in fold(value).split() if part and part != "not" and part != "given"}


def jaccard(left: str, right: str) -> float:
    a, b = tokens(left), tokens(right)
    if not a and not b:
        return 0.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def levenshtein(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)
    prev = list(range(len(right) + 1))
    for i, ca in enumerate(left, 1):
        cur = [i]
        for j, cb in enumerate(right, 1):
            cur.append(min(cur[-1] + 1, prev[j] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def similarity(left: str, right: str) -> float:
    a, b = fold(left), fold(right)
    if not a and not b:
        return 0.0
    if not a or not b:
        return 0.0
    return 1.0 - levenshtein(a, b) / max(len(a), len(b))


def year_of(value: str) -> int | None:
    match = re.search(r"\b(18|19|20)\d{2}\b", value or "")
    return int(match.group(0)) if match else None


def status_one_hot(status: str) -> list[float]:
    return [1.0 if status == item else 0.0 for item in STATUS]


def features_of(comparison: dict) -> np.ndarray:
    name = comparison["name"]
    dob = comparison["date_of_birth"]
    country = comparison["country"]
    customer_year = year_of(name_text(dob["customer"]))
    hit_year = year_of(name_text(dob["hit"]))
    both_years = customer_year is not None and hit_year is not None
    gap = abs(customer_year - hit_year) / 100.0 if both_years else 0.0
    row = [
        *status_one_hot(name["status"]),
        *status_one_hot(dob["status"]),
        *status_one_hot(country["status"]),
        jaccard(name_text(name["customer"]), name_text(name["hit"])),
        similarity(name_text(name["customer"]), name_text(name["hit"])),
        1.0 if both_years else 0.0,
        gap,
        jaccard(name_text(country["customer"]), name_text(country["hit"])),
    ]
    return np.asarray(row, dtype=float)


def name_text(value: object) -> str:
    return value if isinstance(value, str) else ""


def load_rows() -> list[dict]:
    rows = []
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def label_center(center: np.ndarray) -> str:
    names = FEATURE_NAMES

    def at(name: str) -> float:
        return float(center[names.index(name)])

    agree = (at("name_match") + at("dob_match") + at("country_match")) / 3.0
    conflict = (at("name_different") + at("dob_different") + at("country_different")) / 3.0
    if conflict >= 0.30:
        return "conflicting"
    if agree >= 0.55:
        return "high agreement"
    if agree < 0.25 and conflict < 0.25:
        return "thin comparison"
    return "mixed"


def disagree(rules: str, label: str) -> str | None:
    if rules == "DIFFERENT_ENTITY" and label == "high agreement":
        return "The rules cleared this hit, and the cluster centre is high agreement."
    if rules == "SAME_ENTITY" and label == "conflicting":
        return "The rules confirmed this hit, and the cluster centre is conflicting."
    return None


def tidy(value: float, digits: int = 4) -> float:
    number = round(float(value), digits)
    if abs(number) < 5 * 10 ** (-digits):
        return 0.0
    return number


def round_list(values: np.ndarray, digits: int = 4) -> list[float]:
    return [tidy(value, digits) for value in values]


def main() -> None:
    rows = load_rows()
    matrix = np.vstack([features_of(row["comparison"]) for row in rows])
    if matrix.shape != (len(rows), len(FEATURE_NAMES)):
        raise SystemExit(f"unexpected feature shape {matrix.shape}")
    scaler = StandardScaler()
    scaled = scaler.fit_transform(matrix)

    silhouette_by_k = []
    best_k = None
    best_score = -1.0
    best_model = None
    for k in range(2, 9):
        model = KMeans(n_clusters=k, n_init=10, random_state=SEED)
        labels = model.fit_predict(scaled)
        score = float(silhouette_score(scaled, labels))
        silhouette_by_k.append({"k": k, "silhouette": round(score, 4)})
        if score > best_score:
            best_score = score
            best_k = k
            best_model = model
    if best_model is None or best_k is None:
        raise SystemExit("k-means did not fit")
    labels = best_model.labels_.astype(int)
    centers_scaled = best_model.cluster_centers_
    centers = scaler.inverse_transform(centers_scaled)

    agg = AgglomerativeClustering(n_clusters=best_k, linkage="ward")
    agg_labels = agg.fit_predict(scaled)
    agg_score = float(silhouette_score(scaled, agg_labels))

    hdb = HDBSCAN(min_cluster_size=25, min_samples=5, copy=True)
    hdb_labels = hdb.fit_predict(scaled)
    hdb_ids = sorted({int(item) for item in hdb_labels if int(item) >= 0})
    noise = int(np.sum(hdb_labels < 0))
    hdb_score = None
    if len(hdb_ids) >= 2:
        kept = hdb_labels >= 0
        hdb_score = round(float(silhouette_score(scaled[kept], hdb_labels[kept])), 4)

    pca = PCA(n_components=2, random_state=SEED)
    projected = pca.fit_transform(scaled)

    cluster_rows = []
    for cluster_id in range(best_k):
        member = labels == cluster_id
        center = centers[cluster_id]
        profile = {name: tidy(center[index]) for index, name in enumerate(FEATURE_NAMES)}
        cluster_rows.append(
            {
                "id": cluster_id,
                "size": int(member.sum()),
                "label": label_center(center),
                "mean": {
                    "nameMatch": profile["name_match"],
                    "dobMatch": profile["dob_match"],
                    "countryMatch": profile["country_match"],
                    "nameDifferent": profile["name_different"],
                    "dobDifferent": profile["dob_different"],
                    "countryDifferent": profile["country_different"],
                    "nameJaccard": profile["name_jaccard"],
                    "countryJaccard": profile["country_jaccard"],
                },
                "centroid": round_list(centers_scaled[cluster_id]),
            }
        )
    label_of = {row["id"]: row["label"] for row in cluster_rows}

    distances = np.linalg.norm(scaled - centers_scaled[labels], axis=1)
    hits = []
    crosstab = []
    for cluster_id in range(best_k):
        counts = {"DIFFERENT_ENTITY": 0, "SAME_ENTITY": 0, "REVIEW": 0}
        members = np.flatnonzero(labels == cluster_id)
        for index in members:
            counts[rows[index]["decision"]] += 1
        crosstab.append({"cluster": cluster_id, "label": label_of[cluster_id], **{
            "cleared": counts["DIFFERENT_ENTITY"],
            "confirmed": counts["SAME_ENTITY"],
            "review": counts["REVIEW"],
        }})
        order = members[np.argsort(distances[members])]
        for index in members:
            others = [int(item) for item in order if int(item) != int(index)]
            nearest = []
            for other in others:
                dist = float(np.linalg.norm(scaled[index] - scaled[other]))
                nearest.append((dist, other))
                if len(nearest) == 3:
                    break
            rules = rows[index]["decision"]
            note = disagree(rules, label_of[cluster_id])
            comparison = rows[index]["comparison"]
            hits.append(
                {
                    "hitId": rows[index]["hit_id"],
                    "name": name_text(comparison["name"]["customer"]),
                    "cluster": cluster_id,
                    "label": label_of[cluster_id],
                    "distance": round(float(distances[index]), 4),
                    "rules": rules,
                    "disagree": note,
                    "neighbors": [
                        {
                            "hitId": rows[other]["hit_id"],
                            "distance": round(dist, 4),
                            "name": name_text(rows[other]["comparison"]["name"]["customer"]),
                        }
                        for dist, other in nearest
                    ],
                }
            )

    payload = {
        "model": "sklearn.cluster.KMeans",
        "parameters": {"n_clusters": best_k, "n_init": 10, "random_state": SEED},
        "scaler": "sklearn.preprocessing.StandardScaler",
        "seed": SEED,
        "n": len(rows),
        "features": FEATURE_NAMES,
        "excluded": EXCLUDED,
        "exclusionNote": (
            "The rules decision, reason, reason code, evidence ids, and closeness are not features. "
            "Closeness is missing on every cleared hit, so using it would leak the outcome."
        ),
        "labelRule": (
            "Labels are read only from the inverse-scaled k-means centre. Conflicting: mean of the three Different "
            "indicators is at least 0.30. High agreement: that conflict test fails and mean Match is at least 0.55. "
            "Thin comparison: mean Match and mean Different are both under 0.25. Otherwise mixed."
        ),
        "k": best_k,
        "silhouette": round(best_score, 4),
        "silhouetteByK": silhouette_by_k,
        "agglomerative": {"linkage": "ward", "k": best_k, "silhouette": round(agg_score, 4)},
        "hdbscan": {
            "minClusterSize": 25,
            "minSamples": 5,
            "clusters": len(hdb_ids),
            "noise": noise,
            "silhouette": hdb_score,
            "silhouetteNote": (
                "Silhouette uses only non-noise points, and only when HDBSCAN found at least two clusters."
                if hdb_score is not None
                else "Silhouette is not reported because HDBSCAN did not find two clusters besides noise."
            ),
        },
        "pcaVariance": round_list(pca.explained_variance_ratio_),
        "clusters": cluster_rows,
        "crosstab": crosstab,
        "hits": hits,
        "pca": [
            {
                "hitId": rows[index]["hit_id"],
                "x": round(float(projected[index, 0]), 4),
                "y": round(float(projected[index, 1]), 4),
                "cluster": int(labels[index]),
            }
            for index in range(len(rows))
        ],
    }
    if sum(row["size"] for row in cluster_rows) != len(rows):
        raise SystemExit("cluster sizes do not add up")
    if sum(row["cleared"] + row["confirmed"] + row["review"] for row in crosstab) != len(rows):
        raise SystemExit("cross-tab does not add up")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"k={best_k} silhouette={payload['silhouette']} "
        f"agglomerative={payload['agglomerative']['silhouette']} "
        f"hdbscan_clusters={payload['hdbscan']['clusters']} -> {DEST.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
