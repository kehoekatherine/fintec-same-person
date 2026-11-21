#!/usr/bin/env python3
"""Stress checks for the questions a reviewer asks.

The rules decide. This file does not call a model. It checks hedged dates,
US-format profile dates, reworded identity notes, a later married name, and,
when the development folder is present, that two runs write the same bytes.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from resolve import (  # noqa: E402
    Names,
    births_from_profile,
    event_in,
    find_dates,
    identity_from_note,
    parse_date,
    resolve,
)

DATA = Path(os.environ.get("SCREENING_DEV_DIR") or "/tmp/hackathon-data/unpacked/screening/dev")


def expect(label: str, condition: bool) -> None:
    if not condition:
        raise SystemExit(f"failed: {label}")
    print(f"ok  {label}")


def check_dates() -> None:
    circa = "She was born circa March 14, 1974."
    expect("circa is not a birth fact", births_from_profile(circa) == [])
    expect("circa is not read as an event", event_in(circa) is None)
    expect("circa is not a parsed date", parse_date("circa 1974") is None)
    expect("a hedged age is not a birth year", births_from_profile("He was about 40 years old on March 14, 2010.") == [])

    us = "Born 03/14/1988 in Ohio."
    births = births_from_profile(us)
    expect("a US-format profile date is 14 March 1988", [item.iso() for item in births] == ["1988-03-14"])
    day_first = "Born 14/03/1988 in London."
    expect("day-first 14/03/1988 is also 14 March", [item.iso() for item in births_from_profile(day_first)] == ["1988-03-14"])
    expect("an unhedged year is still a fact", [item.iso() for item in births_from_profile("She was born in 1974.")] == ["1974"])
    expect("find_dates skips a hedged month", find_dates("born circa March 14, 1974") == [])


def check_notes() -> None:
    variants = json.loads((DATA / "name_variants.json").read_text(encoding="utf-8"))
    names = Names(variants["groups"], variants["company_legal_forms"])
    authenticated = identity_from_note(
        {
            "note_id": "N1",
            "created_at": "2020-01-01",
            "text": "Passport authenticated for JANE MARIE SMITH. Date of birth: 14 March 1988. Issued in France.",
        },
        names,
        False,
    )
    expect("an authenticated passport supplies the name and date", authenticated is not None and authenticated.name == "JANE MARIE SMITH" and authenticated.dob and authenticated.dob.iso() == "1988-03-14")
    holder = identity_from_note(
        {
            "note_id": "N2",
            "created_at": "2020-01-01",
            "text": "National ID vetted. Holder Ada Lovelace. DOB: 03/14/1988.",
        },
        names,
        False,
    )
    expect("Holder plus a US date is read", holder is not None and holder.name == "Ada Lovelace" and holder.dob and holder.dob.iso() == "1988-03-14")
    failed = identity_from_note(
        {
            "note_id": "N3",
            "created_at": "2020-01-01",
            "text": "Identity document could not be verified for JOHN SMITH.",
        },
        names,
        False,
    )
    expect("a failed verification is not an identity", failed is None)


def write_jsonl(folder: Path, name: str, rows: list[dict]) -> None:
    with (folder / name).open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


def check_marriage() -> None:
    """The later approved identity check is the legal name."""
    with tempfile.TemporaryDirectory() as raw:
        folder = Path(raw)
        variants = json.loads((DATA / "name_variants.json").read_text(encoding="utf-8"))
        (folder / "name_variants.json").write_text(json.dumps(variants), encoding="utf-8")
        write_jsonl(folder, "customers.jsonl", [{
            "record_id": "CUS-1",
            "entity_type": "individual",
            "full_name": "Anna Jones",
            "dob": "1988-03-14",
            "residence_country": "United Kingdom",
            "city": "London",
            "email": "anna@example.com",
        }])
        write_jsonl(folder, "accounts.jsonl", [{"account_id": "ACC-1", "customer_id": "CUS-1"}])
        write_jsonl(folder, "onboarding.jsonl", [{"kyc_applicant_id": "APP-1", "customer_id": "CUS-1"}])
        write_jsonl(folder, "kyc_checks.jsonl", [
            {
                "check_id": "KYC-OLD",
                "applicant_id": "APP-1",
                "result": "approved",
                "checked_at": "2010-01-01",
                "verified_name": "ANNA JONES",
                "verified_dob": "1988-03-14",
                "document_country": "United Kingdom",
                "document_number": "P1",
            },
            {
                "check_id": "KYC-NEW",
                "applicant_id": "APP-1",
                "result": "approved",
                "checked_at": "2020-06-01",
                "verified_name": "ANNA SMITH",
                "verified_dob": "1988-03-14",
                "document_country": "United Kingdom",
                "document_number": "P2",
            },
        ])
        write_jsonl(folder, "notes.jsonl", [])
        write_jsonl(folder, "search_results.jsonl", [])
        customer = {"name": "Anna Jones", "entity_type": "individual", "dob": "1988-03-14", "country": "United Kingdom", "city": "London"}
        write_jsonl(folder, "alerts.jsonl", [
            {"alert_id": "A-1", "account_ref": "ACC-1", "customer": customer, "screened_at": "2024-01-01"},
            {"alert_id": "A-2", "account_ref": "ACC-1", "customer": customer, "screened_at": "2024-01-01"},
        ])
        write_jsonl(folder, "hits.jsonl", [
            {
                "hit_id": "H-MAIDEN",
                "alert_id": "A-1",
                "name": "Anna Jones",
                "entity_type": "individual",
                "dobs": ["1988-03-14"],
                "countries": ["United Kingdom"],
                "primary_category": "sanctions",
            },
            {
                "hit_id": "H-MARRIED",
                "alert_id": "A-2",
                "name": "Anna Smith",
                "entity_type": "individual",
                "dobs": ["1988-03-14"],
                "countries": ["United Kingdom"],
                "primary_category": "sanctions",
            },
        ])
        _world, rows = resolve(folder)
        by_hit = {row["hit_id"]: row for row in rows}
        expect(
            "the maiden name on the file is not the later legal name",
            by_hit["H-MAIDEN"]["decision"] == "DIFFERENT_ENTITY" and by_hit["H-MAIDEN"]["reason_code"] == "NAME_MISMATCH_VERIFIED",
        )
        expect(
            "the later approved name confirms the hit",
            by_hit["H-MARRIED"]["decision"] == "SAME_ENTITY",
        )


def check_repeat() -> None:
    if not (DATA / "hits.jsonl").exists():
        print("skip two-run check; development folder is not on this machine")
        return
    import subprocess
    import time
    runner = Path(__file__).resolve().parent / "run"
    with tempfile.TemporaryDirectory() as raw:
        first = Path(raw) / "a.jsonl"
        second = Path(raw) / "b.jsonl"
        started = time.perf_counter()
        for path, seed in ((first, "0"), (second, "1")):
            env = {**os.environ, "PYTHONHASHSEED": seed}
            subprocess.run([str(runner), str(DATA), str(path)], check=True, env=env)
        elapsed = time.perf_counter() - started
        expect("two runs with different hash seeds are byte-identical", first.read_bytes() == second.read_bytes())
        print(f"two full runs took {elapsed:.1f}s together")


def main() -> None:
    if not (DATA / "name_variants.json").exists():
        raise SystemExit(f"name variants were not found at {DATA}")
    check_dates()
    check_notes()
    check_marriage()
    check_repeat()
    print("stress checks passed")


if __name__ == "__main__":
    main()
