#!/usr/bin/env python3
"""Decide whether each watchlist hit is the screened customer.

The rules are the bank's identity SOP (POLICY.md in the data folder). The same
facts always produce the same decision. With no OpenRouter key there is no
network call and no randomness. A key can only turn a clearance into a review.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from countries import canon_country, countries_in_text, country_from_address, fold_text

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}
MONTH_RE = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"

LISTING_PHRASE = {
    "sanctions": "a sanctioned individual",
    "pep": "a politically exposed person",
    "enforcement": "the subject of enforcement action",
    "adverse media": "named in adverse media",
    "soe": "a state-owned enterprise official",
}

PLACEHOLDERS = {"na", "n a", "test", "unknown", "xxx", "none", "null", "nil", "tbd", "abc"}
NAME_STOP = {
    "THE", "FOR", "FROM", "AND", "DOB", "VIA", "ON", "OF", "PASSPORT", "DRIVING",
    "LICENCE", "LICENSE", "NATIONAL", "IDENTITY", "VERIFIED", "USING", "ISSUED",
    "DOCUMENT", "CHECK", "COMPLETE", "PROCESSED", "MATCHES", "NAME", "BORN", "DATE",
    "BIRTH", "WITH", "THEIR", "HOLDER", "PER", "RESULT", "SUCCESS", "VALIDATED",
    "CONFIRMATION", "ID", "CARD", "REGISTRY", "EXTRACT", "ORIGINATING", "DOCUMENTATION",
    "SHOWS", "COMPLETED", "SUCCESSFUL", "SUCCESSFULLY",
}
CODE_PRIORITY = (
    "ENTITY_TYPE_MISMATCH",
    "DECEASED",
    "TEMPORAL_IMPOSSIBILITY",
    "DOB_MISMATCH",
    "NAME_MISMATCH_VERIFIED",
    "LOCATION_MISMATCH",
)
DECISION_OF = {
    "ENTITY_TYPE_MISMATCH": "DIFFERENT_ENTITY",
    "DECEASED": "DIFFERENT_ENTITY",
    "TEMPORAL_IMPOSSIBILITY": "DIFFERENT_ENTITY",
    "DOB_MISMATCH": "DIFFERENT_ENTITY",
    "NAME_MISMATCH_VERIFIED": "DIFFERENT_ENTITY",
    "LOCATION_MISMATCH": "DIFFERENT_ENTITY",
    "NAME_DOB_LOCATION_MATCH": "SAME_ENTITY",
    "NAME_DOB_MATCH": "SAME_ENTITY",
    "NAME_LOCATION_MATCH": "SAME_ENTITY",
    "INSUFFICIENT_DATA": "REVIEW",
    "AMBIGUOUS_CUSTOMER_RECORD": "REVIEW",
}


@dataclass(frozen=True)
class Partial:
    year: int | None = None
    month: int | None = None
    day: int | None = None

    def iso(self) -> str:
        if self.year and self.month and self.day:
            return f"{self.year:04d}-{self.month:02d}-{self.day:02d}"
        if self.year and self.month:
            return f"{self.year:04d}-{self.month:02d}"
        if self.year:
            return f"{self.year:04d}"
        return ""


def parse_date(value: str | None) -> Partial | None:
    if not value or not str(value).strip():
        return None
    text = str(value).strip()
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso:
        return _partial(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
    ym = re.fullmatch(r"(\d{4})-(\d{2})", text)
    if ym:
        return _partial(int(ym.group(1)), int(ym.group(2)), None)
    year = re.fullmatch(r"(\d{4})", text)
    if year:
        return Partial(int(year.group(1)))
    named = re.fullmatch(rf"({MONTH_RE}) (\d{{1,2}}), (\d{{4}})", text, re.I)
    if named:
        return _partial(int(named.group(3)), MONTHS[named.group(1).lower()], int(named.group(2)))
    named = re.fullmatch(rf"(\d{{1,2}}) ({MONTH_RE}) (\d{{4}})", text, re.I)
    if named:
        return _partial(int(named.group(3)), MONTHS[named.group(2).lower()], int(named.group(1)))
    named = re.fullmatch(rf"({MONTH_RE}) (\d{{4}})", text, re.I)
    if named:
        return _partial(int(named.group(2)), MONTHS[named.group(1).lower()], None)
    slash = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if slash:
        first, second, yr = int(slash.group(1)), int(slash.group(2)), int(slash.group(3))
        if first > 12:
            return _partial(yr, second, first)
        if second > 12:
            return _partial(yr, first, second)
        return _partial(yr, second, first)
    return None


def _partial(year: int, month: int | None, day: int | None) -> Partial | None:
    if month is not None and not 1 <= month <= 12:
        return None
    if day is not None and not 1 <= day <= 31:
        return None
    if year < 1800 or year > 2100:
        return None
    return Partial(year, month, day)


def find_dates(text: str) -> list[tuple[int, int, Partial]]:
    patterns = [
        re.compile(rf"\b({MONTH_RE}) (\d{{1,2}}), (\d{{4}})\b", re.I),
        re.compile(rf"\b(\d{{1,2}}) ({MONTH_RE}) (\d{{4}})\b", re.I),
        re.compile(rf"\b({MONTH_RE}) (\d{{4}})\b", re.I),
        re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),
        re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b"),
        re.compile(r"\b(\d{4})-(\d{2})\b"),
    ]
    found: list[tuple[int, int, Partial]] = []
    occupied: list[tuple[int, int]] = []

    def free(start: int, end: int) -> bool:
        return not any(not (end <= lo or start >= hi) for lo, hi in occupied)

    for index, pattern in enumerate(patterns):
        for match in pattern.finditer(text):
            if not free(match.start(), match.end()):
                continue
            parsed = _date_from_match(index, match)
            if parsed is None:
                continue
            found.append((match.start(), match.end(), parsed))
            occupied.append((match.start(), match.end()))
    found.sort()
    return found


def _date_from_match(index: int, match: re.Match[str]) -> Partial | None:
    if index == 0:
        return _partial(int(match.group(3)), MONTHS[match.group(1).lower()], int(match.group(2)))
    if index == 1:
        return _partial(int(match.group(3)), MONTHS[match.group(2).lower()], int(match.group(1)))
    if index == 2:
        return _partial(int(match.group(2)), MONTHS[match.group(1).lower()], None)
    if index == 3:
        return _partial(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    if index == 4:
        return parse_date(match.group(0))
    if index == 5:
        return _partial(int(match.group(1)), int(match.group(2)), None)
    return None


def dates_agree(customer: Partial, hit: Partial) -> bool:
    if customer.year is None or hit.year is None or customer.year != hit.year:
        return False
    if customer.month and hit.month and customer.month != hit.month:
        return False
    if customer.day and hit.day and customer.day != hit.day:
        return False
    return True


def dates_contradict(customer: Partial, hit: Partial) -> bool:
    if customer.year is None or hit.year is None:
        return False
    if abs(customer.year - hit.year) > 1:
        return True
    if customer.year == hit.year and customer.month and hit.month and customer.month != hit.month:
        return True
    if (
        customer.year == hit.year
        and customer.month
        and hit.month
        and customer.month == hit.month
        and customer.day
        and hit.day
        and customer.day != hit.day
    ):
        return True
    return False


def dob_relation(customer_dobs: list[Partial], hit_dobs: list[Partial]) -> str:
    if not customer_dobs or not hit_dobs:
        return "unknown"
    relations = set()
    for customer in customer_dobs:
        if any(dates_agree(customer, hit) for hit in hit_dobs):
            relations.add("agree")
        elif all(dates_contradict(customer, hit) for hit in hit_dobs):
            relations.add("contradict")
        else:
            relations.add("unknown")
    if relations == {"agree"}:
        return "agree"
    if relations == {"contradict"}:
        return "contradict"
    return "unknown"


def certainly_before(left: Partial, right: Partial) -> bool:
    if left.year is None or right.year is None:
        return False
    if left.year != right.year:
        return left.year < right.year
    if left.month is None or right.month is None:
        return False
    if left.month != right.month:
        return left.month < right.month
    if left.day is None or right.day is None:
        return False
    return left.day < right.day


def certainly_after(left: Partial, right: Partial) -> bool:
    return certainly_before(right, left)


def max_age(dob: Partial, on: Partial) -> int | None:
    if dob.year is None or on.year is None:
        return None
    if dob.month and dob.day and on.month and on.day:
        age = on.year - dob.year
        if (on.month, on.day) < (dob.month, dob.day):
            age -= 1
        return age
    if dob.month and on.month:
        age = on.year - dob.year
        if on.month < dob.month:
            age -= 1
        return age
    return on.year - dob.year


def edit_distance(left: str, right: str, limit: int) -> int:
    if abs(len(left) - len(right)) > limit:
        return limit + 1
    if left == right:
        return 0
    previous = list(range(len(right) + 1))
    for i, ca in enumerate(left, 1):
        current = [i]
        best = i
        for j, cb in enumerate(right, 1):
            value = min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (ca != cb))
            current.append(value)
            if value < best:
                best = value
        if best > limit:
            return limit + 1
        previous = current
    return previous[-1]


def entity_kind(value: str | None) -> str:
    key = fold_text(value or "")
    if key in {"individual", "person", "natural person"}:
        return "person"
    if key in {"company", "organisation", "organization", "business", "entity"}:
        return "company"
    return ""


def display_country(key: str) -> str:
    fixes = {
        "cote divoire": "Cote d'Ivoire",
        "united states": "United States",
        "united kingdom": "United Kingdom",
        "united arab emirates": "United Arab Emirates",
        "bosnia and herzegovina": "Bosnia and Herzegovina",
        "czech republic": "Czech Republic",
        "dominican republic": "Dominican Republic",
        "south africa": "South Africa",
        "south korea": "South Korea",
        "north korea": "North Korea",
        "new zealand": "New Zealand",
        "sri lanka": "Sri Lanka",
        "saudi arabia": "Saudi Arabia",
        "costa rica": "Costa Rica",
        "el salvador": "El Salvador",
        "hong kong": "Hong Kong",
    }
    if key in fixes:
        return fixes[key]
    small = {"and", "of", "the"}
    words = []
    for index, word in enumerate(key.split()):
        words.append(word if word in small and index else word.capitalize())
    return " ".join(words)


def join_countries(keys: list[str]) -> str:
    return ", ".join(display_country(key) for key in keys)


class Names:
    def __init__(self, groups: list[list[str]], legal_forms: list[str]) -> None:
        self.groups = groups
        self.legal_forms = {fold_text(form) for form in legal_forms}
        self.part_groups: dict[str, set[int]] = defaultdict(set)
        for index, group in enumerate(groups):
            for name in group:
                self.part_groups[fold_text(name)].add(index)

    def tokenize(self, value: str | None, company: bool) -> list[str]:
        if not value:
            return []
        text = re.sub(r"\([^)]*\)", " ", value)
        text = re.sub(r"\[[^\]]*\]", " ", text)
        parts: list[str] = []
        seen: set[str] = set()
        for token in fold_text(text).split():
            if token in PLACEHOLDERS or token.isdigit() or not any(ch.isalpha() for ch in token):
                continue
            if len(token) < 2:
                continue
            if company and token in self.legal_forms:
                continue
            if token in seen:
                continue
            seen.add(token)
            parts.append(token)
        return parts

    def parts_match(self, left: str, right: str) -> bool:
        if left == right:
            return True
        left_groups = self.part_groups.get(left, set())
        right_groups = self.part_groups.get(right, set())
        if left_groups and right_groups and left_groups & right_groups:
            return True
        shorter = min(len(left), len(right))
        if shorter < 4:
            return False
        limit = 1 if shorter <= 6 else 2
        return edit_distance(left, right, limit) <= limit

    def agree(self, left: list[str], right: list[str]) -> bool:
        if not left or not right:
            return False
        for xs in _configurations(left):
            for ys in _configurations(right):
                count = _match_count(xs, ys, self.parts_match)
                shorter = min(len(xs), len(ys))
                if count >= 2 or (shorter and count == shorter):
                    return True
        return False

    def any_agree(self, lefts: list[list[str]], rights: list[list[str]]) -> bool:
        return any(self.agree(left, right) for left in lefts for right in rights)


def _configurations(parts: list[str]) -> list[list[str]]:
    results: list[list[str]] = []

    def walk(index: int, acc: list[str]) -> None:
        if index >= len(parts):
            results.append(list(acc))
            return
        acc.append(parts[index])
        walk(index + 1, acc)
        acc.pop()
        if index + 1 < len(parts):
            acc.append(parts[index] + parts[index + 1])
            walk(index + 2, acc)
            acc.pop()

    walk(0, [])
    return results


def _match_count(xs: list[str], ys: list[str], parts_match) -> int:
    best = 0
    used = [False] * len(ys)

    def walk(index: int, count: int) -> None:
        nonlocal best
        if count > best:
            best = count
        if index == len(xs) or count + (len(xs) - index) <= best:
            return
        walk(index + 1, count)
        for j, y in enumerate(ys):
            if used[j]:
                continue
            if parts_match(xs[index], y):
                used[j] = True
                walk(index + 1, count + 1)
                used[j] = False

    walk(0, 0)
    return best


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def countries_from_value(value: str | None) -> list[str]:
    """A field may be a country, a demonym, or a place string ending in a country.

    "Belgrade, Serbia" is Serbia. A long address is not itself a country.
    """
    if not value:
        return []
    direct = canon_country(value, allow_unknown=False)
    if direct:
        return [direct]
    found = countries_in_text(value)
    if found:
        return found
    cleaned = re.sub(r"\[[^\]]*\]", " ", value)
    parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    tail = parts[-1] if parts else cleaned
    if len(fold_text(tail).split()) <= 3:
        unknown = canon_country(tail, allow_unknown=True)
        if unknown:
            return [unknown]
    return []


def listing_phrase(hit: dict) -> str:
    category = hit.get("primary_category") or ((hit.get("categories") or [None])[0]) or ""
    return LISTING_PHRASE.get(fold_text(str(category)), "named on a watchlist")


def _sentence_names(sentence: str, name_sets: list[set[str]]) -> bool:
    """True when the sentence contains every part of one of the hit's names."""
    if not name_sets:
        return False
    words = set(fold_text(sentence).split())
    return any(tokens and tokens <= words for tokens in name_sets)


def snippet_countries(blob: str, name_tokens: set[str]) -> set[str]:
    """Countries a snippet ties to the listing, ignoring the person's own name.

    A given name that is also a country does not count. "in Jordan" still
    counts, because that is the place, not the name.
    """
    found = countries_in_text(blob)
    if not name_tokens:
        return set(found)
    padded = f" {fold_text(blob)} "
    kept: set[str] = set()
    for country in found:
        if not (set(country.split()) & name_tokens):
            kept.add(country)
            continue
        if any(f" {prep} {country} " in padded for prep in ("in", "from", "within", "inside")):
            kept.add(country)
    return kept


def split_sentences(text: str) -> list[str]:
    chunks = re.split(r"(?<=[.!?])\s+", text.strip())
    return [chunk.strip() for chunk in chunks if chunk.strip()]


def event_in(sentence: str) -> Partial | None:
    match = re.search(rf"\b({MONTH_RE}) (\d{{1,2}}), (\d{{4}})\b", sentence, re.I)
    if match:
        return _partial(int(match.group(3)), MONTHS[match.group(1).lower()], int(match.group(2)))
    match = re.search(rf"\b(\d{{1,2}}) ({MONTH_RE}) (\d{{4}})\b", sentence, re.I)
    if match:
        return _partial(int(match.group(3)), MONTHS[match.group(2).lower()], int(match.group(1)))
    match = re.search(rf"\b({MONTH_RE}) (\d{{4}})\b", sentence, re.I)
    if match:
        return _partial(int(match.group(2)), MONTHS[match.group(1).lower()], None)
    match = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", sentence)
    if match:
        return _partial(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = re.search(r"\b(?:in|during)\s+(\d{4})\b", sentence, re.I)
    if match:
        return Partial(int(match.group(1)))
    return None


def age_in(sentence: str) -> int | None:
    patterns = (
        r"\baged\s+(\d{1,3})\b",
        r"\b(\d{1,3})-years?-old\b",
        r"\b(\d{1,3})\s+years?\s+old\b",
        r"\b(?:at the |the )?age of\s+(\d{1,3})\b",
        r"\bage\s*:\s*(\d{1,3})\b",
        r"\bturned\s+(\d{1,3})\b",
        r",\s*(\d{1,3})\s*,",
        r"\bwas\s+(\d{1,3})\b",
    )
    for pattern in patterns:
        match = re.search(pattern, sentence, re.I)
        if not match:
            continue
        age = int(match.group(1))
        if 1 <= age <= 110:
            return age
    return None


def births_from_sentence(sentence: str) -> list[Partial]:
    if re.search(r"\b(born|date of birth|dob)\b", sentence, re.I):
        event = event_in(sentence)
        if event and event.year:
            return [event]
    age = age_in(sentence)
    event = event_in(sentence)
    if age is None or event is None or event.year is None:
        return []
    years = [event.year - age, event.year - age - 1]
    return [Partial(year) for year in years if 1880 <= year <= 2026]


def births_from_profile(notes: str | None) -> list[Partial]:
    if not notes:
        return []
    paragraph = re.split(r"\n\s*\n", notes.strip(), maxsplit=1)[0]
    for sentence in split_sentences(paragraph):
        births = births_from_sentence(sentence)
        if births:
            return births
    return []


ACCORDING_RE = re.compile(
    rf"According to [^;\n]*;\s+({MONTH_RE}) (\d{{1,2}}), (\d{{4}})\s*:",
    re.I,
)
DEATH_RE = re.compile(
    r"(?:date of death|died on|deceased on|death on)\s+([A-Za-z0-9, /-]{4,40})",
    re.I,
)


def dated_reports(notes: str | None) -> list[Partial]:
    if not notes:
        return []
    found = []
    for match in ACCORDING_RE.finditer(notes):
        parsed = _partial(int(match.group(3)), MONTHS[match.group(1).lower()], int(match.group(2)))
        if parsed:
            found.append(parsed)
    return found


def death_date(hit: dict) -> Partial | None:
    parsed = parse_date(hit.get("deceased_date"))
    if parsed:
        return parsed
    notes = hit.get("profile_notes") or ""
    match = DEATH_RE.search(notes)
    if not match:
        return None
    dates = find_dates(match.group(1))
    return dates[0][2] if dates else None


def earliest(dates: list[Partial]) -> Partial | None:
    if not dates:
        return None
    return min(dates, key=lambda item: (item.year or 9999, item.month or 99, item.day or 99))


@dataclass
class Customer:
    record_id: str
    kind: str
    names: list[list[str]]
    raw_names: list[str]
    dob: Partial | None
    full_dob: str | None
    countries: list[str]
    city_blob: str
    email: str
    phone: str


@dataclass
class CheckFact:
    source_id: str
    when: str
    name: str | None
    parts: list[str]
    dob: Partial | None
    country: str | None
    structured: bool


@dataclass
class Person:
    record_ids: list[str]
    seed: str
    kind: str
    verified_parts: list[str] | None
    verified_raw: str | None
    verified_source: str | None
    declared_names: list[list[str]]
    dobs: list[Partial]
    dob_source: str | None
    countries: list[str]
    country_sources: list[str]
    country_by_source: dict[str, list[str]]
    identity_sources: list[str]


@dataclass
class HitFacts:
    names: list[list[str]]
    raw_name: str
    countries: list[str]
    dobs: list[Partial]
    dob_origin: str
    search_ids: list[str]
    report: Partial | None
    death: Partial | None
    kind: str


@dataclass
class Outcome:
    decision: str
    reason_code: str
    customer_record_id: str | None
    reason: str
    evidence: list[str]


def read_world(data: Path):
    customers = load_jsonl(data / "customers.jsonl")
    accounts = load_jsonl(data / "accounts.jsonl")
    onboarding = load_jsonl(data / "onboarding.jsonl")
    checks = load_jsonl(data / "kyc_checks.jsonl")
    notes = load_jsonl(data / "notes.jsonl")
    alerts = load_jsonl(data / "alerts.jsonl")
    hits = load_jsonl(data / "hits.jsonl")
    searches = load_jsonl(data / "search_results.jsonl")
    variants = json.loads((data / "name_variants.json").read_text(encoding="utf-8"))
    names = Names(variants["groups"], variants["company_legal_forms"])
    return customers, accounts, onboarding, checks, notes, alerts, hits, searches, names


def build_customers(rows: list[dict], names: Names) -> dict[str, Customer]:
    built = {}
    for row in rows:
        company = entity_kind(row.get("entity_type")) == "company"
        raw_names = [row.get("full_name") or "", row.get("preferred_name") or "", row.get("login_name") or ""]
        parsed = []
        seen = set()
        for raw in raw_names:
            parts = names.tokenize(raw, company)
            if parts and tuple(parts) not in seen:
                seen.add(tuple(parts))
                parsed.append(parts)
        dob = parse_date(row.get("dob"))
        full = dob.iso() if dob and dob.year and dob.month and dob.day else None
        countries = []
        for field_name in ("residence_country", "nationality"):
            country = canon_country(row.get(field_name))
            if country and country not in countries:
                countries.append(country)
        city_blob = fold_text(f"{row.get('city') or ''} {row.get('address') or ''}")
        phone = re.sub(r"\D", "", row.get("phone") or "")
        built[row["record_id"]] = Customer(
            record_id=row["record_id"],
            kind=entity_kind(row.get("entity_type")),
            names=parsed,
            raw_names=[raw for raw in raw_names if raw],
            dob=dob,
            full_dob=full,
            countries=countries,
            city_blob=city_blob,
            email=(row.get("email") or "").lower(),
            phone=phone,
        )
    return built


def union_people(customers: dict[str, Customer], onboarding: list[dict], checks: list[dict]) -> dict[str, list[str]]:
    parent = {record_id: record_id for record_id in customers}

    def find(record_id: str) -> str:
        while parent[record_id] != record_id:
            parent[record_id] = parent[parent[record_id]]
            record_id = parent[record_id]
        return record_id

    def union(left: str, right: str) -> None:
        ra, rb = find(left), find(right)
        if ra != rb:
            parent[rb] = ra

    phone_buckets: dict[tuple[str, str], list[str]] = defaultdict(list)
    for customer in customers.values():
        if customer.phone and customer.full_dob and len(customer.phone) >= 7:
            phone_buckets[(customer.phone, customer.full_dob)].append(customer.record_id)
    for bucket in phone_buckets.values():
        for other in bucket[1:]:
            union(bucket[0], other)

    applicants: dict[str, set[str]] = defaultdict(set)
    for row in onboarding:
        if row.get("kyc_applicant_id") and row.get("customer_id"):
            applicants[row["kyc_applicant_id"]].add(row["customer_id"])
    doc_buckets: dict[str, list[str]] = defaultdict(list)
    for check in checks:
        if (check.get("result") or "").lower() != "approved":
            continue
        number = fold_text(check.get("document_number") or "")
        if not number or number in PLACEHOLDERS:
            continue
        for record_id in applicants.get(check.get("applicant_id") or "", ()):
            if record_id in customers:
                doc_buckets[number].append(record_id)
    for bucket in doc_buckets.values():
        unique = list(dict.fromkeys(bucket))
        for other in unique[1:]:
            union(unique[0], other)

    members: dict[str, list[str]] = defaultdict(list)
    for record_id in customers:
        members[find(record_id)].append(record_id)
    return {record_id: sorted(members[find(record_id)]) for record_id in customers}


def identity_from_note(note: dict, names: Names, company: bool) -> CheckFact | None:
    text = note.get("text") or ""
    lowered = text.lower()
    if re.search(r"reject|failed|failure|expired|unsuccessful|does not match|did not match|unable to verify|could not verify|mismatch", lowered):
        return None
    if not re.search(r"passport|driving licence|driving license|national id|identity|licence|license|document|registry", lowered):
        return None
    # Success words of one kind: verified, passed, confirmed, and the same
    # idea in approved, authenticated, and vetted. "confirm" covers confirms.
    if not re.search(r"verif|validat|passed|match|cleared|successful|confirm|processed|complete|approv|authenticat|\bvett", lowered):
        return None
    dob = _note_dob(text, note.get("created_at") or "")
    raw_name = _note_name(text)
    parts = names.tokenize(raw_name, company) if raw_name else []
    country = _note_country(text)
    if not parts and dob is None:
        return None
    return CheckFact(note["note_id"], note.get("created_at") or "", raw_name, parts, dob, country, False)


def _note_dob(text: str, created_at: str) -> Partial | None:
    labeled = re.search(
        r"(?:date of birth|born|d\.o\.b\.|dob)\s*[:\s]\s*([A-Za-z0-9, /-]{4,40})",
        text,
        re.I,
    )
    if labeled:
        dates = find_dates(labeled.group(1))
        if dates:
            return dates[0][2]
        parsed = parse_date(labeled.group(1).strip(" ."))
        if parsed:
            return parsed
    created = parse_date(created_at)
    candidates = []
    for start, end, parsed in find_dates(text):
        window = text[max(0, start - 12):start].lower()
        if created and parsed.iso() == created.iso():
            continue
        if re.search(r"\b(on|as of|dated)\s*$", window):
            continue
        candidates.append(parsed)
    full = [item for item in candidates if item.month and item.day]
    if len(full) == 1:
        return full[0]
    if len(candidates) == 1 and candidates[0].month:
        return candidates[0]
    return None


def _note_name(text: str) -> str | None:
    runs = re.findall(r"\b[A-Z][A-Z'’.-]{1,}(?:\s+[A-Z][A-Z'’.-]{1,})+\b", text)
    cleaned = []
    for run in runs:
        words = [word for word in run.split() if word not in NAME_STOP]
        if len(words) >= 2:
            cleaned.append(" ".join(words))
    if cleaned:
        return max(cleaned, key=len)
    match = re.search(r"\b(?:name|holder)\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,5})", text)
    if match:
        return match.group(1)
    return None


def _note_country(text: str) -> str | None:
    folded = fold_text(text)
    for cue in ("originating from", "issued in", "issued by", "from"):
        at = folded.find(cue)
        if at < 0:
            continue
        window = text[at:at + len(cue) + 40]
        found = countries_in_text(window)
        if found:
            return found[0]
    found = countries_in_text(text)
    return found[0] if len(found) == 1 else None


def lived_countries(text: str) -> list[str]:
    found = []
    residence = re.compile(
        r"\b(lived|lives|living|resided|resides|residing|residence|residency|residential|resident|domicil\w*|homes?|household|based in|settled|relocated|moved to|inhabitant|dwelling|stayed in)\b",
        re.I,
    )
    for sentence in split_sentences(text):
        if not residence.search(sentence):
            continue
        for country in countries_in_text(sentence):
            if country not in found:
                found.append(country)
    return found


class World:
    def __init__(self, data: Path) -> None:
        customers, accounts, onboarding, checks, notes, alerts, hits, searches, names = read_world(data)
        self.names = names
        self.customers = build_customers(customers, names)
        self.components = union_people(self.customers, onboarding, checks)
        self.alerts = {row["alert_id"]: row for row in alerts}
        self.hits = hits
        self.by_account: dict[str, list[str]] = defaultdict(list)
        self.by_login: dict[str, str] = {}
        self.by_email: dict[str, str] = {}
        for row in accounts:
            if row.get("customer_id") in self.customers:
                self.by_account[row["account_id"]].append(row["customer_id"])
            if row.get("login_handle") and row.get("customer_id") in self.customers:
                self.by_login[row["login_handle"].lower()] = row["customer_id"]
        for customer in self.customers.values():
            if customer.email:
                self.by_email[customer.email] = customer.record_id
        for key, value in list(self.by_account.items()):
            self.by_account[key] = list(dict.fromkeys(value))

        self.notes_by_email: dict[str, list[dict]] = defaultdict(list)
        for note in notes:
            email = (note.get("requester_email") or "").lower()
            if email:
                self.notes_by_email[email].append(note)

        self.checks_by_customer: dict[str, list[dict]] = defaultdict(list)
        applicants: dict[str, set[str]] = defaultdict(set)
        for row in onboarding:
            if row.get("customer_id") and row.get("kyc_applicant_id"):
                applicants[row["kyc_applicant_id"]].add(row["customer_id"])
        for check in checks:
            if (check.get("result") or "").lower() != "approved":
                continue
            for record_id in applicants.get(check.get("applicant_id") or "", ()):
                self.checks_by_customer[record_id].append(check)

        self.search_by_query: dict[str, list[dict]] = defaultdict(list)
        for result in searches:
            query = fold_text(result.get("query") or "")
            if query:
                self.search_by_query[query].append(result)
                sorted_query = " ".join(sorted(query.split()))
                if sorted_query != query:
                    self.search_by_query[sorted_query].append(result)

        self._part_index: dict[str, list[str]] = defaultdict(list)
        self._by_length: dict[int, list[str]] = defaultdict(list)
        seen_parts: set[str] = set()
        for customer in self.customers.values():
            parts = {part for name in customer.names for part in name}
            # Adjacent joins so "Abdulsalam" finds "Abdul Salam".
            for name in customer.names:
                for index in range(len(name) - 1):
                    parts.add(name[index] + name[index + 1])
            for part in parts:
                self._part_index[part].append(customer.record_id)
                if part not in seen_parts:
                    seen_parts.add(part)
                    self._by_length[len(part)].append(part)
        self._match_cache: dict[str, set[str]] = {}
        self._person_cache: dict[str, Person] = {}
        self._hit_cache: dict[str, HitFacts] = {}

    def matching_parts(self, part: str) -> set[str]:
        cached = self._match_cache.get(part)
        if cached is not None:
            return cached
        found = set()
        if part in self._part_index:
            found.add(part)
        for gid in self.names.part_groups.get(part, ()):
            for variant in self.names.groups[gid]:
                folded = fold_text(variant)
                if folded in self._part_index:
                    found.add(folded)
        if len(part) >= 4:
            limit = 1 if len(part) <= 6 else 2
            for length in range(max(4, len(part) - limit), len(part) + limit + 1):
                for other in self._by_length.get(length, ()):
                    if other not in found and self.names.parts_match(part, other):
                        found.add(other)
        self._match_cache[part] = found
        return found

    def seeds(self, alert: dict) -> list[str]:
        screened = alert.get("customer") or {}
        kind = entity_kind(screened.get("entity_type"))
        company = kind == "company"
        screened_names = [self.names.tokenize(screened.get("name"), company)]
        screened_names = [parts for parts in screened_names if parts]
        screened_dob = parse_date(screened.get("dob"))
        screened_country = canon_country(screened.get("country"))
        screened_city = fold_text(screened.get("city") or "")

        linked: list[str] = []
        if alert.get("account_ref"):
            linked = self.by_account.get(alert["account_ref"], [])
        elif alert.get("login_handle"):
            record_id = self.by_login.get(str(alert["login_handle"]).lower())
            linked = [record_id] if record_id else []
        elif alert.get("email"):
            record_id = self.by_email.get(str(alert["email"]).lower())
            linked = [record_id] if record_id else []
        if linked:
            if len(linked) == 1:
                return linked
            fitted = [record_id for record_id in linked if self._fits(record_id, screened_names, screened_dob, screened_country, screened_city, kind, require_name=True)]
            if fitted:
                return fitted
            named = [record_id for record_id in linked if self._fits(record_id, screened_names, None, None, "", kind, require_name=True)]
            return named or linked
        return self._search(screened_names, screened_dob, screened_country, screened_city, kind)

    def _fits(self, record_id, screened_names, screened_dob, screened_country, screened_city, kind, require_name: bool) -> bool:
        customer = self.customers[record_id]
        if kind and customer.kind and kind != customer.kind:
            return False
        if screened_dob is not None and (customer.dob is None or not dates_agree(customer.dob, screened_dob)):
            return False
        if screened_country and screened_country not in customer.countries:
            return False
        if screened_city and screened_city not in customer.city_blob:
            return False
        if require_name and not self.names.any_agree(customer.names, screened_names):
            return False
        return True

    def _search(self, screened_names, screened_dob, screened_country, screened_city, kind) -> list[str]:
        if not screened_names:
            return []
        parts = list(screened_names[0])
        for index in range(len(parts) - 1):
            parts.append(parts[index] + parts[index + 1])
        candidates: set[str] = set()
        for part in parts:
            for matched in self.matching_parts(part):
                candidates.update(self._part_index.get(matched, ()))
        found = [
            record_id
            for record_id in candidates
            if self._fits(record_id, screened_names, screened_dob, screened_country, screened_city, kind, require_name=True)
        ]
        found.sort()
        return found

    def person(self, seed: str) -> Person:
        cached = self._person_cache.get(seed)
        if cached:
            return cached
        record_ids = self.components.get(seed, [seed])
        records = [self.customers[record_id] for record_id in record_ids]
        kind = self.customers[seed].kind or next((record.kind for record in records if record.kind), "person")
        company = kind == "company"
        checks: list[CheckFact] = []
        for record in records:
            for check in self.checks_by_customer.get(record.record_id, ()):
                checks.append(CheckFact(
                    check["check_id"],
                    check.get("checked_at") or "",
                    check.get("verified_name"),
                    self.names.tokenize(check.get("verified_name"), company),
                    parse_date(check.get("verified_dob")),
                    canon_country(check.get("document_country")),
                    True,
                ))
            for note in self.notes_by_email.get(record.email, ()):
                parsed = identity_from_note(note, self.names, company)
                if parsed:
                    checks.append(parsed)
        checks.sort(key=lambda item: (item.when, item.structured, item.source_id), reverse=True)
        verified_parts = next((item.parts for item in checks if item.parts), None)
        verified_raw = next((item.name for item in checks if item.parts), None)
        verified_source = next((item.source_id for item in checks if item.parts), None)
        dob_fact = next((item for item in checks if item.dob), None)
        country_fact = next((item for item in checks if item.country), None)

        if dob_fact and dob_fact.dob:
            dobs = [dob_fact.dob]
            dob_source = dob_fact.source_id
        else:
            dobs = []
            seen_dob = set()
            for record in records:
                if record.dob and record.dob.iso() not in seen_dob:
                    seen_dob.add(record.dob.iso())
                    dobs.append(record.dob)
            dob_source = seed if dobs else None

        countries: list[str] = []
        country_sources: list[str] = []
        country_by_source: dict[str, list[str]] = {}

        def contribute(source_id: str, extra: list[str]) -> None:
            if not extra:
                return
            bucket = country_by_source.setdefault(source_id, [])
            if source_id not in country_sources:
                country_sources.append(source_id)
            for country in extra:
                if country not in bucket:
                    bucket.append(country)
                if country not in countries:
                    countries.append(country)

        for record in records:
            contribute(record.record_id, record.countries)
        if country_fact and country_fact.country:
            contribute(country_fact.source_id, [country_fact.country])
        for record in records:
            for note in self.notes_by_email.get(record.email, ()):
                contribute(note["note_id"], lived_countries(note.get("text") or ""))
        declared = []
        seen_names = set()
        for record in records:
            for parts in record.names:
                if tuple(parts) not in seen_names:
                    seen_names.add(tuple(parts))
                    declared.append(parts)
        identity_sources = []
        for source_id in (verified_source, dob_source if dob_fact else None, country_fact.source_id if country_fact else None):
            if source_id and source_id not in identity_sources and not source_id.startswith("CUS-"):
                identity_sources.append(source_id)
        person = Person(
            record_ids=record_ids,
            seed=seed,
            kind=kind or "person",
            verified_parts=verified_parts,
            verified_raw=verified_raw,
            verified_source=verified_source,
            declared_names=declared,
            dobs=dobs,
            dob_source=dob_source,
            countries=countries,
            country_sources=country_sources,
            country_by_source=country_by_source,
            identity_sources=identity_sources,
        )
        for record_id in record_ids:
            self._person_cache[record_id] = person
        return person

    def people_for_alert(self, alert: dict) -> list[Person]:
        people = []
        seen = set()
        for seed in self.seeds(alert):
            person = self.person(seed)
            key = tuple(person.record_ids)
            if key in seen:
                continue
            seen.add(key)
            # Keep the seed that the link actually selected when several records are one person.
            if seed in person.record_ids and seed != person.seed:
                person = Person(**{**person.__dict__, "seed": seed})
            people.append(person)
        return people

    def hit_facts(self, hit: dict) -> HitFacts:
        cached = self._hit_cache.get(hit["hit_id"])
        if cached:
            return cached
        company = entity_kind(hit.get("entity_type")) == "company"
        raw_names = [hit.get("name") or "", *(hit.get("aliases") or [])]
        parsed = []
        seen = set()
        for raw in raw_names:
            parts = self.names.tokenize(raw, company)
            if parts and tuple(parts) not in seen:
                seen.add(tuple(parts))
                parsed.append(parts)
        countries: list[str] = []
        for field_name in ("countries", "nationality", "citizenship"):
            for value in hit.get(field_name) or []:
                for country in countries_from_value(value):
                    if country not in countries:
                        countries.append(country)
        for address in hit.get("addresses") or []:
            for country in countries_from_value(address):
                if country not in countries:
                    countries.append(country)
        for country in countries_from_value(hit.get("place_of_birth")):
            if country not in countries:
                countries.append(country)

        field_dobs = []
        for value in hit.get("dobs") or []:
            parsed_date = parse_date(value)
            if parsed_date and parsed_date.iso() not in {item.iso() for item in field_dobs}:
                field_dobs.append(parsed_date)
        search_ids: list[str] = []
        if field_dobs:
            dobs, origin = field_dobs, "field"
        else:
            profile_dobs = [] if company else births_from_profile(hit.get("profile_notes"))
            if profile_dobs:
                dobs, origin = profile_dobs, "profile"
            else:
                dobs, search_ids = self._search_births(hit, countries, company)
                origin = "search" if dobs else "none"
        facts = HitFacts(
            names=parsed,
            raw_name=hit.get("name") or "",
            countries=countries,
            dobs=dobs,
            dob_origin=origin,
            search_ids=search_ids,
            report=earliest(dated_reports(hit.get("profile_notes"))),
            death=death_date(hit),
            kind=entity_kind(hit.get("entity_type")),
        )
        self._hit_cache[hit["hit_id"]] = facts
        return facts

    def _search_births(self, hit: dict, countries: list[str], company: bool) -> tuple[list[Partial], list[str]]:
        if company or not countries:
            return [], []
        phrase = listing_phrase(hit)
        queries = []
        name_sets: list[set[str]] = []
        name_tokens: set[str] = set()
        for raw in [hit.get("name") or "", *(hit.get("aliases") or [])]:
            folded = fold_text(re.sub(r"\([^)]*\)", " ", raw))
            if not folded:
                continue
            queries.append(folded)
            queries.append(" ".join(sorted(folded.split())))
            tokens = {token for token in folded.split() if len(token) >= 2}
            if tokens:
                name_sets.append(tokens)
                name_tokens.update(tokens)
        seen_results = set()
        collected: list[Partial] = []
        used: list[str] = []
        hit_countries = set(countries)
        for query in queries:
            for result in self.search_by_query.get(query, ()):
                if result["result_id"] in seen_results:
                    continue
                seen_results.add(result["result_id"])
                blob = f"{result.get('title') or ''} {result.get('snippet') or ''}"
                if phrase not in blob.lower():
                    continue
                # The query is already the hit's name. The snippet still has to
                # carry this category's listing phrase and a country tied to the
                # hit. A given name that is also a country does not qualify.
                if not (snippet_countries(blob, name_tokens) & hit_countries):
                    continue
                births: list[Partial] = []
                for sentence in split_sentences(blob):
                    if phrase in sentence.lower() and _sentence_names(sentence, name_sets):
                        births = births_from_sentence(sentence)
                        if births:
                            break
                if not births:
                    # The age may sit in the previous sentence ("She is 40. She
                    # is a sanctioned individual in France."). A different
                    # person's age in that sentence does not count.
                    for sentence in split_sentences(blob):
                        if not _sentence_names(sentence, name_sets):
                            continue
                        births = births_from_sentence(sentence)
                        if births:
                            break
                if births:
                    collected.extend(births)
                    used.append(result["result_id"])
        unique: list[Partial] = []
        seen_iso = set()
        for item in collected:
            if item.iso() not in seen_iso:
                seen_iso.add(item.iso())
                unique.append(item)
        # One age at a date is two adjacent birth years. A wider spread is two
        # people who share the name, so neither year is safe to use.
        years = [item.year for item in unique if item.year is not None]
        if len(years) >= 2 and max(years) - min(years) > 1:
            return [], []
        return unique, used


def _hit_name_used(world: World, person: Person, facts: HitFacts) -> str:
    ours = [person.verified_parts] if person.verified_parts else person.declared_names
    for parts, raw in zip(facts.names, [facts.raw_name]):
        if world.names.any_agree(ours, [parts]):
            return raw
    return facts.raw_name


def _format_hit_dobs(facts: HitFacts) -> str:
    if facts.dob_origin in {"profile", "search"} and facts.dobs and all(item.month is None for item in facts.dobs):
        years = sorted({item.year for item in facts.dobs if item.year})
        if len(years) == 2 and years[1] == years[0] + 1:
            return f"{years[0]} or {years[1]}"
        return ", ".join(str(year) for year in years)
    return ", ".join(item.iso() for item in facts.dobs)


def _dob_clause(person: Person, facts: HitFacts) -> str:
    dob = person.dobs[0].iso() if person.dobs else "unknown"
    source = f" ({person.dob_source})" if person.dob_source else ""
    hit_dates = _format_hit_dobs(facts)
    if facts.dob_origin == "profile":
        where = f"the hit's profile notes put its birth year at {hit_dates}"
    elif facts.dob_origin == "search":
        where = f"the hit's search results put its birth year at {hit_dates}"
    else:
        where = f"the hit's listed date of birth is {hit_dates}"
    return f"The customer's date of birth is {dob}{source} but {where}."


def decide_one(world: World, person: Person, facts: HitFacts, screened_at: Partial | None) -> tuple[str, list[str], list[str]]:
    """Return the reason code, the evidence ids, and the reason sentences."""
    company = person.kind == "company" or facts.kind == "company"
    comparable_names = [person.verified_parts] if person.verified_parts else person.declared_names
    name_agree = world.names.any_agree(comparable_names, facts.names) if comparable_names else False
    # Individuals with fewer than two real name parts can be neither confirmed nor cleared on name.
    # A company often has one distinctive word once the legal form is removed.
    if person.kind != "company":
        verified_too_thin = bool(person.verified_parts) and len(person.verified_parts) < 2
        declared_too_thin = not person.verified_parts and not any(len(parts) >= 2 for parts in person.declared_names)
        if verified_too_thin or declared_too_thin:
            name_agree = False
        name_mismatch = bool(person.verified_parts) and len(person.verified_parts) >= 2 and not world.names.any_agree([person.verified_parts], facts.names)
    else:
        name_mismatch = bool(person.verified_parts) and not world.names.any_agree([person.verified_parts], facts.names)
    relation = "unknown" if company and facts.dob_origin != "field" else dob_relation(person.dobs, facts.dobs)
    if company and facts.dob_origin == "field":
        relation = dob_relation(person.dobs, facts.dobs)
    overlap = [country for country in person.countries if country in facts.countries]
    disjoint = bool(person.countries) and bool(facts.countries) and not overlap
    type_mismatch = bool(person.kind) and bool(facts.kind) and person.kind != facts.kind
    deceased = bool(facts.death and screened_at and certainly_before(facts.death, screened_at))
    temporal = False
    age_cap = None
    if person.kind == "person" and facts.report and person.dobs:
        ages = [max_age(dob, facts.report) for dob in person.dobs]
        if ages and all(age is not None and age < 16 for age in ages):
            temporal = True
            age_cap = max(age for age in ages if age is not None)
    if person.kind == "company" and facts.report and person.dobs and all(certainly_after(dob, facts.report) for dob in person.dobs):
        temporal = True
    # A country clash does not clear a hit whose name and date of birth already agree.
    location_clear = disjoint and not (name_agree and relation == "agree")
    codes = []
    if type_mismatch:
        codes.append("ENTITY_TYPE_MISMATCH")
    if deceased:
        codes.append("DECEASED")
    if temporal:
        codes.append("TEMPORAL_IMPOSSIBILITY")
    if relation == "contradict":
        codes.append("DOB_MISMATCH")
    if name_mismatch:
        codes.append("NAME_MISMATCH_VERIFIED")
    if location_clear:
        codes.append("LOCATION_MISMATCH")
    if codes:
        code = next(item for item in CODE_PRIORITY if item in codes)
        return code, _evidence(person, facts, code, codes), _different_reason(person, facts, code, age_cap, overlap)

    if person.kind == "company" and name_agree and overlap and not type_mismatch:
        return "NAME_LOCATION_MATCH", _evidence(person, facts, "NAME_LOCATION_MATCH", []), _same_company_reason(world, person, facts, overlap)
    if person.kind != "company" and name_agree and relation == "agree" and not disjoint:
        code = "NAME_DOB_LOCATION_MATCH" if overlap else "NAME_DOB_MATCH"
        return code, _evidence(person, facts, code, []), _same_person_reason(world, person, facts, overlap, code)
    return "INSUFFICIENT_DATA", _evidence(person, facts, "INSUFFICIENT_DATA", []), _review_reason(world, person, facts, name_agree, overlap, relation, disjoint)


def _overlapping_sources(person: Person, facts: HitFacts) -> list[str]:
    hit = set(facts.countries)
    return [source_id for source_id, countries in person.country_by_source.items() if hit.intersection(countries)]


def _evidence(person: Person, facts: HitFacts, code: str, codes: list[str]) -> list[str]:
    used = set(codes or [code])
    ids: list[str] = []

    def add(value: str | None) -> None:
        if value and value not in ids:
            ids.append(value)

    # A review that shares a country cites only the records that supply that country.
    # A note about living somewhere else was read and did not decide the hit.
    if code == "INSUFFICIENT_DATA" and facts.countries and person.countries:
        overlap = set(person.countries).intersection(facts.countries)
        if overlap:
            for source_id in _overlapping_sources(person, facts):
                add(source_id)
            return ids

    cites_records = code in {
        "NAME_DOB_LOCATION_MATCH", "NAME_DOB_MATCH", "NAME_LOCATION_MATCH", "INSUFFICIENT_DATA",
        "LOCATION_MISMATCH", "TEMPORAL_IMPOSSIBILITY", "DECEASED", "ENTITY_TYPE_MISMATCH",
    } or "LOCATION_MISMATCH" in used or "TEMPORAL_IMPOSSIBILITY" in used
    if cites_records:
        for record_id in person.record_ids:
            add(record_id)
    if code in {"DOB_MISMATCH", "TEMPORAL_IMPOSSIBILITY", "NAME_DOB_MATCH", "NAME_DOB_LOCATION_MATCH"} or "DOB_MISMATCH" in used:
        add(person.dob_source if person.dob_source and not str(person.dob_source).startswith("CUS-") else None)
        if person.dob_source and person.dob_source.startswith("CUS-") and code == "DOB_MISMATCH":
            add(person.dob_source)
    if code in {"NAME_MISMATCH_VERIFIED", "NAME_LOCATION_MATCH", "NAME_DOB_MATCH", "NAME_DOB_LOCATION_MATCH", "INSUFFICIENT_DATA"} or "NAME_MISMATCH_VERIFIED" in used:
        add(person.verified_source)
    if code == "LOCATION_MISMATCH" or "LOCATION_MISMATCH" in used or (code == "INSUFFICIENT_DATA" and not facts.countries):
        for source in person.country_sources:
            add(source)
    if code in {"NAME_DOB_LOCATION_MATCH", "NAME_LOCATION_MATCH"}:
        for source_id in _overlapping_sources(person, facts):
            add(source_id)
    if facts.dob_origin == "search" and (code in {"DOB_MISMATCH", "NAME_DOB_MATCH", "NAME_DOB_LOCATION_MATCH", "TEMPORAL_IMPOSSIBILITY"} or "DOB_MISMATCH" in used):
        for result_id in facts.search_ids:
            add(result_id)
    return ids


def _different_reason(person: Person, facts: HitFacts, code: str, age_cap: int | None, overlap: list[str]) -> list[str]:
    if code == "ENTITY_TYPE_MISMATCH":
        return [
            f"The resolved customer is a {person.kind} ({person.seed}) and the hit is a {facts.kind}.",
            "A person and a company are different entities, so the hit is cleared.",
        ]
    if code == "DECEASED":
        return [
            f"The hit's profile gives a date of death of {facts.death.iso() if facts.death else 'unknown'}, before the customer was screened.",
            "The listed person had already died, so this is not the customer.",
        ]
    if code == "TEMPORAL_IMPOSSIBILITY":
        source = f" ({person.dob_source})" if person.dob_source else ""
        when = facts.report.iso() if facts.report else "the dated report"
        if person.kind == "company":
            return [
                f"The customer was incorporated on {person.dobs[0].iso()}{source}, which is after the hit's earliest dated report on {when}.",
                "A company cannot be the subject of a report from before it existed, so the hit is cleared.",
            ]
        born = person.dobs[0].iso() if person.dobs else "an unknown year"
        return [
            f"The customer was born in {born}{source}, so they were at most {age_cap} when the hit's profile reports activity on {when}.",
            "Someone younger than 16 at the earliest dated report cannot be the listed person, so the hit is cleared.",
        ]
    if code == "DOB_MISMATCH":
        return [
            _dob_clause(person, facts),
            "Every birth date on the hit contradicts the customer's, so the hit is cleared.",
        ]
    if code == "NAME_MISMATCH_VERIFIED":
        source = f" ({person.verified_source})" if person.verified_source else ""
        return [
            f"The customer's verified name is {person.verified_raw}{source}, which does not match the hit's name {facts.raw_name}.",
            "The verified legal name outranks the name on the customer record, so the hit is cleared.",
        ]
    customer_where = join_countries(person.countries) or "nowhere recorded"
    hit_where = join_countries(facts.countries) or "nowhere recorded"
    return [
        f"The customer is linked only to {customer_where} but the hit is linked only to {hit_where}.",
        "Every country on one side differs from every country on the other, and the name and date of birth do not both agree, so the hit is cleared.",
    ]


def _same_person_reason(world: World, person: Person, facts: HitFacts, overlap: list[str], code: str) -> list[str]:
    source = f" ({person.dob_source})" if person.dob_source else ""
    dob = person.dobs[0].iso() if person.dobs else "unknown"
    hit_name = facts.raw_name
    sentences = [f"The customer's date of birth {dob}{source} agrees with the hit's {_format_hit_dobs(facts)}."]
    if code == "NAME_DOB_LOCATION_MATCH":
        sentences.append(f"Both the customer and the hit are linked to {join_countries(overlap)}.")
    sentences.append(f"The customer's name agrees with the hit's name {hit_name}, and nothing in the records contradicts the hit.")
    return sentences


def _same_company_reason(world: World, person: Person, facts: HitFacts, overlap: list[str]) -> list[str]:
    return [
        f"Both the customer and the hit are linked to {join_countries(overlap)}.",
        f"The customer's name agrees with the hit's name {facts.raw_name}, and nothing in the records contradicts the hit.",
    ]


def _review_reason(world: World, person: Person, facts: HitFacts, name_agree: bool, overlap: list[str], relation: str, disjoint: bool) -> list[str]:
    if name_agree:
        name_sentence = f"The customer's name agrees with the hit's name {facts.raw_name}."
    elif person.verified_raw:
        name_sentence = f"The customer's verified name {person.verified_raw} could not be confirmed against the hit's name {facts.raw_name}."
    else:
        name_sentence = f"The customer's name could not be confirmed against the hit's name {facts.raw_name}."
    if overlap:
        place = f"Both the customer and the hit are linked to {join_countries(overlap)}."
    elif disjoint:
        place = f"The customer is linked to {join_countries(person.countries)} and the hit is linked to {join_countries(facts.countries)}."
    else:
        place = "Country does not settle the comparison, because one side has no country to compare."
    if relation == "unknown":
        dob = "the date of birth cannot be compared with the hit"
    elif relation == "agree":
        dob = "the dates of birth agree, but another required fact is missing or conflicts"
    else:
        dob = "the dates of birth are not close enough to confirm and not far enough to clear"
    return [
        f"{name_sentence} {place}",
        f"{dob[0].upper()}{dob[1:]}, so nothing compared here is enough to clear the hit or to confirm it.",
    ]


def decide_hit(world: World, alert: dict, hit: dict) -> Outcome:
    facts = world.hit_facts(hit)
    screened_at = parse_date(alert.get("screened_at") if alert else None)
    people = world.people_for_alert(alert) if alert else []
    if not people:
        return Outcome(
            "REVIEW",
            "INSUFFICIENT_DATA",
            None,
            "No customer record could be resolved from the alert's link or from the screened name, date of birth, country and city. Without a customer to compare, the hit can be neither cleared nor confirmed.",
            [],
        )
    people = sorted(people, key=lambda person: person.seed)
    outcomes = [(person, decide_one(world, person, facts, screened_at)) for person in people]
    codes = {item[1][0] for item in outcomes}
    decisions = {DECISION_OF[code] for code in codes}
    if len(people) > 1 and len(decisions) > 1:
        evidence: list[str] = []
        for person, (_code, ids, _sentences) in outcomes:
            for record_id in person.record_ids:
                if record_id not in evidence:
                    evidence.append(record_id)
            for item in ids:
                if item not in evidence:
                    evidence.append(item)
        return Outcome(
            "REVIEW",
            "AMBIGUOUS_CUSTOMER_RECORD",
            "AMBIGUOUS",
            "More than one person in the system of record fits this alert, and the comparisons do not reach the same decision. The hit stays with a reviewer and the customer record is ambiguous.",
            evidence,
        )
    # Several people can share a decision while naming different grounds. A fixed order
    # makes that choice stable across runs.
    if len(codes) == 1:
        code = outcomes[0][1][0]
    elif "DIFFERENT_ENTITY" in decisions:
        code = next(item for item in CODE_PRIORITY if item in codes)
    else:
        code = next(item for item in ("NAME_DOB_LOCATION_MATCH", "NAME_LOCATION_MATCH", "NAME_DOB_MATCH", "INSUFFICIENT_DATA") if item in codes)
    chosen = next(item for item in outcomes if item[1][0] == code)
    person, (_code, evidence, sentences) = chosen
    if len(people) > 1:
        # Same decision either way. Any record in the cluster would be wrong to pick, so the id is ambiguous.
        evidence = []
        for _other, (_item_code, ids, _sentences) in outcomes:
            for item in ids:
                if item not in evidence:
                    evidence.append(item)
        record_id = "AMBIGUOUS"
        sentences = ["More than one person fits this alert, and each comparison reaches the same result."] + sentences
    else:
        record_id = person.seed
    reason = " ".join(sentences)
    outcome = Outcome(DECISION_OF[code], code, record_id, reason, evidence)
    return guard_clearance(outcome, _compared_facts(people, facts))


_GUARD_CACHE: dict[str, str] = {}
_HOLD_SENTENCE = "A reviewer should confirm the clearance."
_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _compared_facts(people: list[Person], facts: HitFacts) -> tuple[str, str, str]:
    """Names, dates, and countries the rules already compared. Nothing else."""
    customer_names = []
    customer_dates = []
    customer_countries = []
    for person in people:
        if person.verified_raw:
            customer_names.append(person.verified_raw)
        elif person.declared_names:
            customer_names.append(" / ".join(" ".join(parts) for parts in person.declared_names))
        else:
            customer_names.append("none")
        customer_dates.append(", ".join(item.iso() for item in person.dobs) or "none")
        customer_countries.append(join_countries(person.countries) or "none")
    names = "customer " + " | ".join(customer_names) + "; hit " + (facts.raw_name or "none")
    hit_dates = _format_hit_dobs(facts) if facts.dobs else "none"
    dates = "customer " + " | ".join(customer_dates) + "; hit " + hit_dates
    countries = "customer " + " | ".join(customer_countries) + "; hit " + (join_countries(facts.countries) or "none")
    return names, dates, countries


def _guard_prompt(outcome: Outcome, names: str, dates: str, countries: str) -> str:
    return "\n".join((
        "Reply with one token: ALLOW or HOLD.",
        f"Reason code: {outcome.reason_code}",
        f"Reason: {outcome.reason}",
        f"Names: {names}",
        f"Dates: {dates}",
        f"Countries: {countries}",
    ))


def _ask_openrouter(api_key: str, prompt: str) -> str:
    """ALLOW keeps the clearance. Anything else, including a failed call, holds it."""
    model = os.environ.get("OPENROUTER_MODEL") or "openai/gpt-4o-mini"
    body = {
        "model": model,
        "temperature": 0,
        "seed": 0,
        "max_tokens": 8,
        "messages": [{"role": "user", "content": prompt}],
    }
    request = urllib.request.Request(
        _OPENROUTER_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status != 200:
                return "HOLD"
            payload = json.loads(response.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
    except Exception:
        # A timeout, a bad status, or a body we cannot read holds this hit.
        # The run continues. The key is never printed.
        return "HOLD"
    if not isinstance(content, str):
        return "HOLD"
    if content.strip().upper() == "ALLOW":
        return "ALLOW"
    return "HOLD"


def guard_clearance(outcome: Outcome, compared: tuple[str, str, str]) -> Outcome:
    """Ask OpenRouter only about a clearance. No key means the rules stand.

    The model cannot create a clearance. HOLD, a timeout, a bad status, or any
    other body turns this hit into a review and leaves the customer id and the
    evidence as they are.
    """
    if outcome.decision != "DIFFERENT_ENTITY":
        return outcome
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        return outcome
    prompt = _guard_prompt(outcome, *compared)
    digest = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    verdict = _GUARD_CACHE.get(digest)
    if verdict is None:
        verdict = _ask_openrouter(api_key, prompt)
        _GUARD_CACHE[digest] = verdict
    if verdict == "ALLOW":
        return outcome
    reason = outcome.reason.rstrip()
    if reason and reason[-1] not in ".!?":
        reason += "."
    if _HOLD_SENTENCE not in reason:
        reason = f"{reason} {_HOLD_SENTENCE}".strip()
    return Outcome("REVIEW", "INSUFFICIENT_DATA", outcome.customer_record_id, reason, list(outcome.evidence))


def resolve(data: Path) -> list[dict]:
    world = World(data)
    rows = []
    for hit in world.hits:
        alert = world.alerts.get(hit["alert_id"])
        outcome = decide_hit(world, alert, hit)
        rows.append({
            "hit_id": hit["hit_id"],
            "alert_id": hit["alert_id"],
            "decision": outcome.decision,
            "reason_code": outcome.reason_code,
            "customer_record_id": outcome.customer_record_id,
            "reason": outcome.reason,
            "evidence": outcome.evidence,
        })
    return rows


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: system/run <data folder> <output file>", file=sys.stderr)
        sys.exit(2)
    data = Path(sys.argv[1])
    output = Path(sys.argv[2])
    started = time.perf_counter()
    rows = resolve(data)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    elapsed = time.perf_counter() - started
    print(f"wrote {len(rows)} hits to {output} in {elapsed:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
