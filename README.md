# Same person or not

A bank screening system has already matched customers to watchlist profiles. Most of those matches share a name and little else. This program decides, for each match, whether the customer and the listed person are the same entity, a different entity, or a case a person should review.

It is a deterministic rules engine. It follows the bank's identity policy. It does not call a language model, so a run has no model fee and the same inputs always produce the same file.

## What it does

For every hit it:

1. Finds the customer. It follows the alert's account, login, or email, and otherwise searches the screened name, date of birth, country, and city. Records that are the same person are grouped first.
2. Reads who the customer is. An approved identity check or a note of a successful document check outranks the name and date the customer typed.
3. Reads who the listed person is. Dates and countries come from the hit's own fields, from an age stated in the first paragraph of the profile, or from a web-search snippet that is actually about that hit.
4. Compares them. A contradiction clears the hit. Agreement on the required facts confirms it. Anything else stays a review. Clearing a true match is the expensive mistake, so doubt stays with a reviewer.

The scored entrypoint is `system/run`. A separate desk in `web/` on the branch `cursor/screening-explorer-f793` shows four fictional examples. That desk is not on `main`.

## AI tools

The program that runs does not use an AI model. There is no OpenRouter call and no API key.

The program was written in Cursor with an AI coding agent (Grok). The agent turned the written policy into Python. The decisions in `output/dev.jsonl` come from that Python, not from a model at runtime.

## Glossary

**What.** Entity resolution for name screening. The question is "is this the same person or company?", not "should the bank keep them as a customer?"

**Why.** Loose name matching creates false positives. An analyst still has to clear the ones that are clearly different people and keep genuine or uncertain matches. This program does that comparison the same way every time.

**Where.** The customer side is the bank's own records: customers, accounts, onboarding, identity checks, and notes. The watchlist side is the hit profile that already matched, plus search snippets shipped in the data folder. The program reads only the folder it is given. It does not download sanctions lists, PEP databases, or live news.

**How.** Normalize names, dates, and countries. Join records that are one person. Apply the policy in a fixed order: wrong entity type, deceased, impossible timeline, date of birth, verified name, then country. Cite only the records that decided the hit.

**When.** Run it when a screening alert exists and the data folder for that alert is available. A development run of about 800 hits takes about ten seconds. The same command is what a later unseen set is scored with.

**Output.** One JSON line per hit in the output file. Each line has the hit and alert ids, a decision (`DIFFERENT_ENTITY`, `SAME_ENTITY`, or `REVIEW`), a reason code, the customer record id (or `AMBIGUOUS`, or null), two to four sentences naming this hit's facts, and the evidence record ids.

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
