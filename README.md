# Watchlist Screening Desk

A bank screening system has already matched customers to watchlist profiles. Most of those matches share a name and little else. This program answers one question for each match: is the customer the same entity as the listed person, a different entity, or a case a person should review?

A contradiction clears the hit. Agreement on the required facts confirms it. Everything else stays for review. The rules make that decision. A model does not.

## Public desk

The desk is published with GitHub Pages:

- About, the page the desk opens on: <https://kehoekatherine.github.io/fintec-same-person/>
- The same page by name: <https://kehoekatherine.github.io/fintec-same-person/?view=about>
- Case analysis: <https://kehoekatherine.github.io/fintec-same-person/?view=analysis&hit=H-E319FE>
- Model cost: <https://kehoekatherine.github.io/fintec-same-person/?view=cost>
- Model cost, unsupervised: <https://kehoekatherine.github.io/fintec-same-person/?view=cost&section=unsupervised>
- Model cost, risk: <https://kehoekatherine.github.io/fintec-same-person/?view=cost&section=risk>

`?view=about` is the guide: how many hits, what the desk is, how to use it, how to read a case, the rules in brief, and model cost in brief. `?view=analysis` is where a hit is opened. `?view=cost` is language-model prices. `?section=unsupervised` is a k-means fit on the 819 stored comparisons. The rules decision is not a feature. The page shows the chosen k, the silhouette, cluster profiles, a PCA scatter, and a cross-tab against the rules. That cross-tab is not accuracy. `?section=risk` is the matrix and the workload. `?section=classical` has no page and opens the language-model section. A link that is only `?hit=` opens that hit in case analysis. `?view=queue` does the same when it names a hit, and opens About otherwise. The site does not use path routes.

Case analysis shows the recorded decision, the rule reason, the name, date of birth, and country already compared, closeness, bias, confidence, and the evidence ids. It does not show a transaction statement or the customer file. Model cost prices the recorded lines against the public list prices used on the alert-triage desk. Input tokens are characters in `output/dev.jsonl` divided by 4. Fitness, accuracy, unsafe clearance, and overfitting are unavailable: this repository has no label file. No classical model was trained. No model was called. The recorded file has no clock.

The public desk shows the recorded decisions in `output/dev.jsonl`. It does not include the customer source files, it does not re-run the resolver, and it does not call a model. Name, date of birth, and country on an opened hit are the values the resolver already compared. A `.csv`, `.json`, or `.jsonl` file that already has a decision on every row can be added in the browser. A zip of source files, and a file with no decisions, need the local desk.

`.github/workflows/pages.yml` builds that site on a push to `main` and deploys it with GitHub Actions (`actions/deploy-pages`). The base path is the repository name, so the same build works at `/fintec-same-person/` or `/same-person/`. Pages has to use **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow also asks `actions/configure-pages` to turn that source on. If the URL 404s, that switch has not been turned on, or the workflow has not run on `main` yet.

## Architecture

```text
data folder
    |
    v
system/run
    |
    v
resolve.py
    |
    v
output JSONL
    |
    v
Watchlist Screening Desk (web/, port 4317)
```

`system/run <data folder> <output file>` is the scored command. It is Python 3, standard library only. The script changes into `system/` and runs `resolve.py`. The resolver groups records that are the same person, compares the watchlist hit with the customer, and applies the policy in a fixed order. A contradiction clears. Agreement on the required facts confirms. Doubt stays `REVIEW`.

The output is one JSON line per hit: the hit and alert ids, a decision (`DIFFERENT_ENTITY`, `SAME_ENTITY`, or `REVIEW`), a reason code, the customer record id when one was resolved, the reason, the evidence ids, and the name, date of birth, and country already compared.

The desk in `web/` is a view over one run. It does not contain the customer data. Case analysis opens one hit from the rows `system/run` wrote. The customer file stays in the data folder the run was given.

How a customer is resolved, how a hit is read, and how evidence is chosen is described in [system/README.md](system/README.md).

## A different dataset

The desk is not tied to one folder. A run is the folder you give it.

A data folder needs the files `system/run` already reads:

- `customers.jsonl`
- `hits.jsonl`
- `alerts.jsonl`
- `accounts.jsonl`
- `onboarding.jsonl`
- `kyc_checks.jsonl`
- `notes.jsonl`
- `search_results.jsonl`
- `name_variants.json`

`name_variants.json` has `groups` and `company_legal_forms`. The other files are JSON lines. An empty file is allowed when that system has no rows. A missing file is named. A hits-only file is not joined to any other customer index.

Labels are optional, and they travel with the folder:

- `practice_labels.jsonl` is the development or practice file. `validate.py` scores that file with `--score`.
- A second file, `heldout_labels.jsonl` (also `holdout_labels.jsonl`, `held_out_labels.jsonl`, or `unseen_labels.jsonl`), is the held-out file. One other `*labels.jsonl` beside `practice_labels.jsonl` is treated the same way. The desk does not split one label file itself.

Each label line needs `hit_id` and `decision`. The decision is `SAME_ENTITY`, `DIFFERENT_ENTITY`, or `REVIEW`, the same strings `validate.py` scores.

On the desk, add the folder as a `.zip`, or as one JSON bundle whose keys are those files (`hits`, `customers`, `alerts`, and the rest, plus `practice_labels` and `heldout_labels` when you have them). A file that already has a decision on every row is shown as recorded and is not run through the resolver. Metrics for a scored upload use only the labels in that upload.

If a dataset is already on the machine, the desk can open it. It is named as the dataset that was found locally. It is not built into the desk. If no dataset is there, the page asks you to add one. It does not fail with a server error.

The published desk does not open a development folder that was left on a build machine. It shows the recorded run bundled from `output/dev.jsonl`. Scoring a new folder still needs the local desk.

## Metrics

Every run is scored from its own rows and its own labels. The cost matrix is the one in `validate.py`. The first key is the true label. The second is the predicted decision. A labeled hit with no prediction is scored as `REVIEW`.

| True label | Predicted `DIFFERENT_ENTITY` | Predicted `SAME_ENTITY` | Predicted `REVIEW` |
| --- | --- | --- | --- |
| `DIFFERENT_ENTITY` | 0 | 3 | 3 |
| `SAME_ENTITY` | 60 | 0 | 2 |
| `REVIEW` | 60 | 2 | 0 |

**Baseline.** The cost of sending every labeled hit to `REVIEW`.

**Fitness.** `100 * max(0, 1 - cost / baseline)`. This is unavailable when the run has no labels, or when the baseline is 0.

**Accuracy.** Labeled hits whose decision is exactly the label, shown as correct/labeled and a percent. Unavailable when there are no labels. A missing prediction is not an exact match.

**Unsafe clearance.** A true `SAME_ENTITY` or true `REVIEW` predicted `DIFFERENT_ENTITY`. The count is shown with the cost. Each one costs 60 in the matrix.

**Overfitting.** Measured only when the folder has two distinct label files, a practice file and a held-out file. Fitness is computed on each. Overfitting exists when the held-out fitness is lower than the development fitness. The desk shows both numbers and the gap (development fitness minus held-out fitness). One label file, or none, means overfitting is not measured. There is no invented gap, and one file is not split in two.

**Cost.** On the labeled hits: the matrix cost, the baseline, and the savings. Savings are `baseline - cost`.

**Workload.** Always, including a run with no labels: how many decisions are `REVIEW` (cases a person must open), how many are `DIFFERENT_ENTITY`, and how many are `SAME_ENTITY`. These counts are workload, not the judging score.

**Customer value.** The savings, in the same cost units as the matrix. There is no currency. The savings are the value versus sending every labeled hit to a reviewer. Net value versus review-everything is that savings figure. An unsafe clearance costs 60, which can wipe out a save of 3 (a correct clearance) or 2 (a correct confirmation), but that 60 is already inside the matrix cost. It is not subtracted a second time. `net = savings`. If there are no labels, customer value is unavailable and the workload count is what the desk shows.

## An opened case

Click a row and the case opens under that row. The comparison is the name, date of birth, and country the rules already compared.

When `XAI_API_KEY` or `GROK_API_KEY` is set, Grok writes a short explanation from those facts. It does not change the decision. When neither key is set, the desk shows the rule reason. No key is committed. The published desk does not call a model.

## Run the desk

```sh
cd web
npm install
npm run dev
```

The dev server listens on port 4317. Open http://127.0.0.1:4317

Build the static site the Pages workflow publishes. The default base path is `/fintec-same-person/`. Set `PAGES_BASE_PATH` to the repository name when that name is different.

```sh
cd web
PAGES_BASE_PATH=/fintec-same-person npm run build:pages
mkdir -p /tmp/pages-root
rm -rf /tmp/pages-root/fintec-same-person
cp -a out /tmp/pages-root/fintec-same-person
python3 -m http.server 4318 --directory /tmp/pages-root
```

Open http://127.0.0.1:4318/fintec-same-person/ . `build:pages` writes `web/out`. `npm run dev` is unchanged and still serves the local API on port 4317.

Score a folder from the command line:

```sh
system/run <data folder> <output file>
```

Pass absolute paths. With a practice label file in that folder:

```sh
python3 validate.py --data <data folder> --output <output file> --score <data folder>/practice_labels.jsonl
```

`validate.py` ships with the data folder, not in this repository.
