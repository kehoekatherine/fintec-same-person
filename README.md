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

`output/dev.jsonl` is the development run. The customer and watchlist files are not in this repository.

How a customer is resolved, how a hit is read, and how evidence is chosen is described in [system/README.md](system/README.md).
