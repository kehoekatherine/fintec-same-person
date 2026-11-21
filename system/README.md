# How the resolver decides

`system/run` is a deterministic rules engine. With no `OPENROUTER_API_KEY` it does not call a model, so there is no prompt, no temperature, and no fee. A development run of 819 hits takes about eight seconds on one core. Running it again writes the same file byte for byte: ties break on record id, search candidates are sorted, JSON keys are sorted, and nothing in the decision depends on hash order or the clock. Every run prints the review rate by customer country. `python3 system/stress.py` repeats the run under two hash seeds and checks the readers below.

If `OPENROUTER_API_KEY` is set, the rules still decide first. Only a clearance (`DIFFERENT_ENTITY`) is sent to OpenRouter. The model may answer ALLOW, which keeps the clearance, or HOLD, which turns that hit into a review (`INSUFFICIENT_DATA`) and adds one sentence that a reviewer should confirm the clearance. The customer id and the evidence stay as the rules left them. A timeout, a bad status, or any other reply is a HOLD. The model cannot create a clearance, and it does not change `SAME_ENTITY` or `REVIEW`. The model is `OPENROUTER_MODEL`, or `openai/gpt-4o-mini` when that is unset. Temperature is 0 and the request sends a seed. The prompt is only the reason code, the reason text, and the names, dates, and countries already compared, and it asks for one token: ALLOW or HOLD. Identical prompts are cached by hash in memory for that process. The cache is not written to disk. A failed call holds that hit and the run continues.

```text
alert link or name search
        |
        v
one person (possibly several customer records)
        |
        v
verified identity, if an approved check or note has one
        |
        v
hit dates, countries, death, earliest dated report
        |
        v
clear, confirm, or review
```

## Finding the customer

The alert's link is followed in order: account reference, otherwise login handle, otherwise email. A joint account can name several holders. The screened name, date of birth, country, and city pick out the holder they describe. A single linked customer is kept even when the screened name is a nickname, because the link is stronger than the typed name.

When the alert has no link, the screened name is looked up in an index of name parts. A candidate is kept only when the name agrees and every date, country, and city the alert actually gives agrees too.

Records that are the same person are grouped before the comparison. Two records are joined when they share a phone number of at least seven digits and the same full year-month-day of birth, or when the same approved identity-document number was checked for both. The join is transitive. A shared address or a shared phone on its own is not enough, because a family can share both.

## Reading the customer

An approved identity check, or a note that describes a successful document check, outranks the name and date typed on the customer record. The note is recognised by a document word (passport, licence, identity, registry, and the same kind of word) together with a success word (verified, passed, confirmed, approved, authenticated, vetted, and the same kind of word). The most recent such fact supplies the legal name, the date of birth, and the document country. A rejected, expired, or unverified check is ignored, including a note that says the document could not be verified. Declared names and dates are used only when nothing verified exists. A later approved name replaces an older one, so a name left on the customer file after a marriage is not the legal name.

Countries tied to the customer are the residence and nationality on every record in the group, the document country, and a country a note says they lived in. A note that they lived somewhere is recognised from the wording (lived, resident, residing, residential, home, household, domiciled, and the same kind of phrase), not from a fixed template.

## Reading the hit

Dates of birth on the hit are taken in order. A date in the hit's own date field wins. A hedged date is not a fact: "circa 1974" and "about 40 years old" stay unknown, and the hit goes to review when nothing else decides it. A missing field is never a mismatch. A profile can give a date as `6/20/1955` or `03/14/1988`. When the day is greater than 12 the order is unambiguous. When both numbers are 12 or less, the date is read day first. Otherwise a sentence in the first paragraph that gives an age at a date supplies the two possible birth years: the year of the event minus the age, and one year earlier. A web search result is used only when the query is the hit's name, the snippet contains that category's listing phrase (for example "a sanctioned individual" or "a politically exposed person"), and the snippet mentions a country tied to the hit. If any of the three is missing, the snippet is ignored. A country word that is only part of the person's name does not count, unless the snippet also uses it as a place (`in`, `from`, `within`, or `inside` that country). A given name that is also a country, followed by a listing in some other country, is that other country. The birth year has to come from a sentence that names the hit, so a different person's age in the same snippet cannot supply it. One age at a date is two adjacent birth years. If the years from the matching snippets are more than a year apart, none of them is used. A company has an incorporation date only when the date field says so. Age sentences and search snippets are not treated as incorporation dates.

The earliest line of the form "According to …; Month D, YYYY:" is the dated report used for a temporal check. A month and year with no day does not count. A death date clears the hit only when the death is certainly before the customer was screened.

## Names, dates, and countries

Comparison ignores case, accents, punctuation, and text in brackets. A single letter is an initial and is dropped. Placeholder tokens such as "N/A" and "UNKNOWN" are dropped. Company legal forms (Ltd, GmbH, S.A., and the rest of the list in the name-variant file) are not name parts.

Two parts match when they are the same, when they belong to the same name-variant group, when one is the other written together or apart, or when the edit distance is small: one edit if the shorter part is 4 to 6 letters, two edits if it is longer. Shorter than four letters must match exactly. Two names agree when at least two parts match, or when every part of the shorter name matches. Order does not matter, so Wei Li agrees with Li Wei. An individual whose name has fewer than two real parts cannot be confirmed or cleared on the name.

Two dates agree when the year is one of the hit's years and every shared month and day is equal. A year on its own can agree with a full date. They contradict when the years differ by more than one, or when the same year has different months, or when the same year and month have different days. A gap of one year is neither agreement nor a contradiction. One agreeing hit date stops a date-of-birth clearance.

Countries are matched on the country name, the ISO code, and the demonym, so "GB", "British", and "United Kingdom" are one country. "Côte d'Ivoire" and "Cote D'Ivoire" are one country. "International" and "Europe" are not countries. An address contributes the country at the end of it, not the city.

## The decision

For one resolved person the first matching ground wins:

| Ground | Decision | When |
| --- | --- | --- |
| `ENTITY_TYPE_MISMATCH` | Clear | One side is a person and the other is a company |
| `DECEASED` | Clear | The listed person died before the screen date |
| `TEMPORAL_IMPOSSIBILITY` | Clear | The customer was under 16 at the earliest dated report, or a company was incorporated after it |
| `DOB_MISMATCH` | Clear | Every birth date on the hit contradicts the customer's |
| `NAME_MISMATCH_VERIFIED` | Clear | A verified legal name of at least two parts agrees with none of the hit's names |
| `LOCATION_MISMATCH` | Clear | Both sides have countries, none are shared, and the name and date do not both agree |
| `NAME_DOB_LOCATION_MATCH` | Confirm | Name and date agree and a country is shared |
| `NAME_DOB_MATCH` | Confirm | Name and date agree and a country is missing on one side |
| `NAME_LOCATION_MATCH` | Confirm | A company whose name and country agree |
| `INSUFFICIENT_DATA` | Review | Nothing contradicts the hit and the facts do not all agree |

A country clash does not clear a hit whose name and date of birth already agree. That hit is a review. If no customer can be resolved, the hit is a review and `customer_record_id` is null.

## Closeness

A review or a confirmation still needs a person to accept it. Those hits include a closeness score: how near the compared identity facts are, out of 100. A cleared hit has the comparison and no score. The score uses only the name, date of birth, and country the decision already compared.

| Fact | Agrees | Unsettled | Does not agree |
| --- | --- | --- | --- |
| Name | 40 | 15, when the name is missing or an individual name has fewer than two real parts | 0 |
| Date of birth | 30 | 10, when a date is missing or the years are one apart | 0 |
| Country | 30, when a country is shared | 10, when one side has no country | 0 |

80–100 is Close, 40–79 is Partial, and 0–39 is Distant. Each compared fact is also recorded as Match, Different, or Undefined with the customer value and the hit value.

When several people fit the alert and every comparison reaches the same decision, that decision is emitted and `customer_record_id` is `AMBIGUOUS`. When the comparisons disagree, the hit is a review with reason code `AMBIGUOUS_CUSTOMER_RECORD`.

## Evidence

`evidence` lists only the record ids that decided the hit. A date-of-birth clearance cites the check or note that supplied the customer's date, and the search result when the hit's year came from search. A confirmed hit cites the customer records and the check or note that supplied the agreeing identity or country, plus the search result when one was used. A review cites the records that supply the shared country: if the customer file itself does not share a country but a note says the customer lived in the hit's country, that note is the evidence. Accounts, alerts, and notes about a country that played no part are left out.

## How four published patterns are decided

The task statement uses four patterns to show the rules. They are not rows in the development data, and the desk does not open them.

**Clear.** Mohammed Ali, born 14 March 1988 in London, against Mohamed Ali, born 1952 in Cairo. The names agree, but the birth years differ by more than one. That is `DOB_MISMATCH`, a different person.

**Confirm.** Li Wei, born 1975 in Singapore, against Wei Li, born 1975 in Singapore. The name is the same parts in a different order, the year agrees, and the country agrees. Nothing contradicts the hit. That is `NAME_DOB_LOCATION_MATCH`, the same person.

**Review.** Anna K. Petrova, with no date of birth, against Anna Petrova, born 1969 in Moscow. The name can agree, but there is no date to compare and not enough else to rule the hit in or out. That is `INSUFFICIENT_DATA`.

A fourth published pattern is temporal. Tom Okafor, born 2004, against Thomas Okafor named in a fraud report dated 2011, was about seven when the report was written. Under 16 at the earliest dated report is `TEMPORAL_IMPOSSIBILITY`, a different person.
