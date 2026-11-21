# Same person or not

A bank screening system has already matched customers to watchlist profiles. Most of those matches share a name and little else. This program is deterministic watchlist entity resolution: for each match it decides whether the customer and the listed person are the same entity, a different entity, or a case a person should review.

It follows the screening policy exactly: clear a hit only when a fact contradicts it, confirm a hit only when the name and the other required facts agree and nothing contradicts them, and leave everything else for a person to review. The costly mistake is clearing a hit that is the customer or that a reviewer should see. Without an API key it does not call a language model, so that run has no model fee and the same inputs always produce the same file.

## What it does

For every hit it:

1. Finds the customer. It follows the alert's account, login, or email, and otherwise searches the screened name, date of birth, country, and city. Records that are the same person are grouped first.
2. Reads who the customer is. An approved identity check or a note of a successful document check outranks the name and date the customer typed.
3. Reads who the listed person is. Dates and countries come from the hit's own fields, from an age stated in the first paragraph of the profile, or from a web-search snippet that is actually about that hit.
4. Compares them. A contradiction clears the hit. Agreement on the required facts confirms it. Anything else stays a review. Clearing a true match is the expensive mistake, so doubt stays with a reviewer.

The scored entrypoint is `system/run`. The screening desk in `web/` opens the development run. From the repository root:

```sh
cd web && npm install && npm run dev
```

The dev server listens on port 4317. See [Try it](#try-it) for the desk.

## AI tools

No `OPENROUTER_API_KEY` means the rules alone decide, and the program makes no network call. With a key, OpenRouter is asked only after the rules have cleared a hit. The model can block that clearance and send the hit to review. It cannot create a clearance, and it cannot change a confirmation or a review.

The program was written in Cursor with an AI coding agent (Grok). The agent turned the written policy into Python. The decisions in `output/dev.jsonl` come from that Python, not from a model at runtime.

## Glossary

**What.** Entity resolution for name screening. The question is "is this the same person or company?", not "should the bank keep them as a customer?"

**Why.** Loose name matching creates false positives. An analyst still has to clear the ones that are clearly different people and keep genuine or uncertain matches. This program does that comparison the same way every time.

**Where.** The customer side is the bank's own records: customers, accounts, onboarding, identity checks, and notes. The watchlist side is the hit profile that already matched, plus search snippets shipped in the data folder. The program reads only the folder it is given. It does not download sanctions lists, PEP databases, or live news.

**How.** Normalize names, dates, and countries. Join records that are one person. Apply the policy in a fixed order: wrong entity type, deceased, impossible timeline, date of birth, verified name, then country. Cite only the records that decided the hit.

**When.** Run it when a screening alert exists and the data folder for that alert is available. A development run of about 800 hits takes about ten seconds. The same command is what a later unseen set is scored with.

**Output.** One JSON line per hit in the output file. Each line has the hit and alert ids, a decision (`DIFFERENT_ENTITY`, `SAME_ENTITY`, or `REVIEW`), a reason code, the customer record id (or `AMBIGUOUS`, or null), two to four sentences naming this hit's facts, the evidence record ids, and a `comparison` of the name, date of birth, and country already compared. A review or a confirmation also has a `closeness` score out of 100. A cleared hit has no closeness score.

## Files

The screening folder holds these files. The files in `dev/` are the participant data pack and are not committed in this repository. `POLICY.md`, `validate.py`, and `output.schema.json` travel with that pack and are not committed here either.

**`POLICY.md`.** The bank's identity rules: the decisions, the principles, and the reason codes. The program implements these rules. It does not read this file at runtime. The copy inside `dev/` is the same document beside the data.

**`dev/hits.jsonl`.** One watchlist profile per line. Names, aliases, dates, countries, addresses, categories, and profile notes.

**`dev/practice_labels.jsonl`.** 50 hits with the expected decision, acceptable reason codes, customer ids, and evidence, for local scoring.

**`dev/search_results.jsonl`.** Web search snippets for names. Most are namesakes. A snippet counts only when it is about that hit.

**`dev/customers.jsonl`.** The bank's customer records. One person can have more than one record.

**`dev/accounts.jsonl`.** Accounts and logins, and which customer they belong to. Joint accounts list more than one holder.

**`dev/onboarding.jsonl`.** The link from an account to the identity-check applicant id.

**`dev/alerts.jsonl`.** One alert per line. The customer as screened, the link (account, login, or email) when there is one, and the hit ids.

**`dev/name_variants.json`.** Name forms that count as the same (Mohammed and Muhammad) and company legal forms that are not name parts.

**`dev/notes.jsonl`.** Support and onboarding notes, filed by email.

**`dev/kyc_checks.jsonl`.** Identity checks. The verified name, date of birth, document, document number, and whether the check was approved, rejected, or expired.

**`validate.py`.** Checks that an output file is well formed and, with the practice labels, scores those 50 hits.

**`system/`.** The resolver. `system/run` is the command. It is Python standard library only.

**`README.md`.** This explanation.

**`output.schema.json`.** The required fields on each output line.

**`output/dev.jsonl`.** The resolver's decision for every development hit.

**`output/confirmed-matches.csv`.** The rows whose decision is `SAME_ENTITY`.

**`web/`.** The desk for reading those results. Not used by the scorer.

## Run

Python 3.10 or newer. The standard library only. No API key.

```sh
system/run <data folder> <output file>
```

`<data folder>` is the folder that contains `hits.jsonl`, `alerts.jsonl`, `customers.jsonl`, and the other files described in the track README. The program writes one JSON object per hit to `<output file>`. On the development set of 819 hits it finishes in about ten seconds. With no API key it makes no network calls.

Score the development predictions with the checker shipped in the data pack:

```sh
python3 validate.py --data <data folder> --output output/dev.jsonl --score <data folder>/practice_labels.jsonl
```

`output/dev.jsonl` is the development run. The development customer and watchlist files are not in this repository. The desk reads them at runtime from `SCREENING_DEV_DIR`, or from `/tmp/hackathon-data/unpacked/screening/dev` when that folder is on the machine.

How a customer is resolved, how a hit is read, and how evidence is chosen is described in [system/README.md](system/README.md).

## Questions a reviewer asks

These are the answers the program can stand behind. `python3 system/stress.py` checks the readers, a later married name, and that two full runs are byte-identical. On this machine the development run of 819 hits takes about 8 seconds and makes no network call.

**Why not let the model decide?** A wrongful clearance costs 60 points, and in a bank it lets a sanctioned person through. The decision is a fixed rule. With no `OPENROUTER_API_KEY`, nothing is sent. With a key, the model is asked only about a clearance, at temperature 0, and the answer is cached by the text. It can turn that clearance into a review. It cannot create a clearance, and it does not change a confirmation or a review.

**How do the runs stay identical?** Inputs are sorted, the rule order is fixed, and each JSON line is written with sorted keys. Two runs with different `PYTHONHASHSEED` values write the same bytes. The model, when it is used, is a cached fallback and cannot clear a hit.

**What if a customer changed their name, for example after marriage?** The most recent approved identity check is the legal name. A hit that matches only the older name on the customer file is a different person (`NAME_MISMATCH_VERIFIED`). A hit that matches the later approved name can be confirmed. A real bank would also record a documented name change as an alias. This data does not.

**How do you handle bias?** Every run prints the review rate by customer country. On this development set, United States customers are reviewed 39 of 243 times (16.0%) and Nigerian customers 60 of 115 times (52.2%). 57 of those 60 Nigerian reviews are watchlist entries with no date of birth. The gap is in the data. A missing date stays a review. The rate is not a score of the country, and the bar is not lowered to close the gap.

**What if the data is missing or messy?** A missing field is not a mismatch. A hedged date, such as "circa 1974" or "about 40 years old", is not a fact. Those hits stay in review, and the reason says what could not be compared.

**How was the unseen set tested?** Beyond the 50 practice answers, `system/stress.py` rewords identity notes and profile dates. That is what caught a US-format date in a profile (`6/20/1955`). The practice set is still 50 right decisions and 0 unsafe clearances.

## Try it

The screening desk is a Next.js app in `web/`. It shows the development run. It is not a live watchlist.

The desk has light and dark mode. The list reads the unpacked development folder when it is on this machine (`SCREENING_DEV_DIR`, or `/tmp/hackathon-data/unpacked/screening/dev`). That folder is not in this repository. The page re-runs `system/run` on the folder and opens customer, account, hit, and alert fields from its `customers.jsonl`, `accounts.jsonl`, `hits.jsonl`, and `alerts.jsonl`. Each row shows closeness (the match percentage from name, date of birth, and country), bias risk, and a confidence score. Column headings sort the list ascending and descending. Click a row to open the customer and watchlist comparison under that record. Click the row again, or Close, to put it away. Cleared hits have no closeness or bias score. If the folder is absent, the desk says the data folder is not on this machine. It does not substitute invented records. A CSV or JSON file of hits can be added from the page: if every row already has a decision, the desk shows those rows, and otherwise it scores the file with `system/run`. A hits-only file is joined to the development `customers.jsonl` and the desk does not invent customer ids. The upload stays in the browser session and is not written into the repository.

```sh
cd web
npm install
npm run dev
```

The dev server listens on port 4317. Open http://127.0.0.1:4317

`system/run` still uses only the Python standard library for the decision. Pass absolute paths. The script changes into `system/` before it reads the folder. Every run prints the review rate by customer country.
