# Same person or not

Watchlist entity resolution for the financial-crime screening track. Given an alert, the customer records it points at, and a watchlist hit, the program decides whether the customer and the listed party are the same entity.

It follows the screening policy exactly: clear a hit only when a fact contradicts it, confirm a hit only when the name and the other required facts agree and nothing contradicts them, and leave everything else for a person to review. The costly mistake is clearing a hit that is the customer or that a reviewer should see.

## Run

Python 3.10 or newer. The standard library only. No API key.

```sh
system/run <data folder> <output file>
```

`<data folder>` is the folder that contains `hits.jsonl`, `alerts.jsonl`, `customers.jsonl`, and the other files described in the track README. The program writes one JSON object per hit to `<output file>`. On the development set of 819 hits it finishes in about ten seconds and makes no network calls.

Score the development predictions with the checker shipped in the data pack:

```sh
python3 validate.py --data <data folder> --output output/dev.jsonl --score <data folder>/practice_labels.jsonl
```

`output/dev.jsonl` is the development run. The development customer and watchlist files are not in this repository. A small fictional fixture, built only from the four examples in the public brief, lives in `web/fixtures/brief`.

How a customer is resolved, how a hit is read, and how evidence is chosen is described in [system/README.md](system/README.md).

## Try it

The screening desk is a Next.js app in `web/`. It shows those four fictional cases — not a live watchlist — and the decision `system/run` wrote for each one.

```sh
cd web
npm install
npm run dev
```

The dev server listens on port 4317. Open http://127.0.0.1:4317

`system/run` is unchanged. It still uses only the Python standard library, reads a data folder, and writes one JSON line per hit:

```sh
system/run "$(pwd)/web/fixtures/brief" "$(pwd)/output/brief.jsonl"
```

Pass absolute paths. The `system/run` script changes into `system/` before it reads the folder, so a path relative to the repository root would miss the fixture. The desk can re-run that same command on the fictional fixture from the page.
