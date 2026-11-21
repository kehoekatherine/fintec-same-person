"""Country names, codes and demonyms folded to one canonical key.

Unknown long names fall back to their own folded spelling, so a country that
is missing from this table still matches itself. Codes and demonyms have to be
listed: "GB" and "British" would not otherwise meet "United Kingdom".
"""

from __future__ import annotations

import re
import unicodedata

# canonical, alpha-2, alpha-3, extra aliases including demonyms
ROWS: list[tuple[str, str, str, tuple[str, ...]]] = [
    ("afghanistan", "af", "afg", ("afghan",)),
    ("albania", "al", "alb", ("albanian",)),
    ("algeria", "dz", "dza", ("algerian",)),
    ("andorra", "ad", "and", ("andorran",)),
    ("angola", "ao", "ago", ("angolan",)),
    ("antigua and barbuda", "ag", "atg", ("antiguan",)),
    ("argentina", "ar", "arg", ("argentine", "argentinean")),
    ("armenia", "am", "arm", ("armenian",)),
    ("australia", "au", "aus", ("australian",)),
    ("austria", "at", "aut", ("austrian",)),
    ("azerbaijan", "az", "aze", ("azerbaijani",)),
    ("bahamas", "bs", "bhs", ("bahamian",)),
    ("bahrain", "bh", "bhr", ("bahraini",)),
    ("bangladesh", "bd", "bgd", ("bangladeshi",)),
    ("barbados", "bb", "brb", ("barbadian",)),
    ("belarus", "by", "blr", ("belarusian",)),
    ("belgium", "be", "bel", ("belgian",)),
    ("belize", "bz", "blz", ("belizean",)),
    ("benin", "bj", "ben", ("beninese",)),
    ("bhutan", "bt", "btn", ("bhutanese",)),
    ("bolivia", "bo", "bol", ("bolivian",)),
    ("bosnia and herzegovina", "ba", "bih", ("bosnian", "herzegovinian")),
    ("botswana", "bw", "bwa", ("botswanan",)),
    ("brazil", "br", "bra", ("brazilian", "brasil",)),
    ("brunei", "bn", "brn", ("bruneian",)),
    ("bulgaria", "bg", "bgr", ("bulgarian",)),
    ("burkina faso", "bf", "bfa", ("burkinabe",)),
    ("burundi", "bi", "bdi", ("burundian",)),
    ("cabo verde", "cv", "cpv", ("cape verde", "cape verdean")),
    ("cambodia", "kh", "khm", ("cambodian",)),
    ("cameroon", "cm", "cmr", ("cameroonian",)),
    ("canada", "ca", "can", ("canadian",)),
    ("central african republic", "cf", "caf", ()),
    ("chad", "td", "tcd", ("chadian",)),
    ("chile", "cl", "chl", ("chilean",)),
    ("china", "cn", "chn", ("chinese", "prc", "people s republic of china")),
    ("colombia", "co", "col", ("colombian",)),
    ("comoros", "km", "com", ("comorian",)),
    ("congo", "cg", "cog", ("republic of the congo", "congo brazzaville")),
    ("democratic republic of the congo", "cd", "cod", ("drc", "congo kinshasa", "congolese")),
    ("costa rica", "cr", "cri", ("costa rican",)),
    ("cote divoire", "ci", "civ", ("cote d ivoire", "ivory coast", "ivorian")),
    ("croatia", "hr", "hrv", ("croatian",)),
    ("cuba", "cu", "cub", ("cuban",)),
    ("cyprus", "cy", "cyp", ("cypriot",)),
    ("czechia", "cz", "cze", ("czech republic", "czech", "czechia")),
    ("denmark", "dk", "dnk", ("danish", "dane")),
    ("djibouti", "dj", "dji", ("djiboutian",)),
    ("dominica", "dm", "dma", ()),
    ("dominican republic", "do", "dom", ("dominican",)),
    ("ecuador", "ec", "ecu", ("ecuadorian", "ecuadorean")),
    ("egypt", "eg", "egy", ("egyptian",)),
    ("el salvador", "sv", "slv", ("salvadoran",)),
    ("equatorial guinea", "gq", "gnq", ()),
    ("eritrea", "er", "eri", ("eritrean",)),
    ("estonia", "ee", "est", ("estonian",)),
    ("eswatini", "sz", "swz", ("swaziland", "swazi")),
    ("ethiopia", "et", "eth", ("ethiopian",)),
    ("fiji", "fj", "fji", ("fijian",)),
    ("finland", "fi", "fin", ("finnish",)),
    ("france", "fr", "fra", ("french",)),
    ("gabon", "ga", "gab", ("gabonese",)),
    ("gambia", "gm", "gmb", ("gambian",)),
    ("georgia", "ge", "geo", ("georgian",)),
    ("germany", "de", "deu", ("german",)),
    ("ghana", "gh", "gha", ("ghanaian",)),
    ("greece", "gr", "grc", ("greek",)),
    ("grenada", "gd", "grd", ("grenadian",)),
    ("guatemala", "gt", "gtm", ("guatemalan",)),
    ("guinea", "gn", "gin", ("guinean",)),
    ("guinea bissau", "gw", "gnb", ("guinea-bissau",)),
    ("guyana", "gy", "guy", ("guyanese",)),
    ("haiti", "ht", "hti", ("haitian",)),
    ("honduras", "hn", "hnd", ("honduran",)),
    ("hungary", "hu", "hun", ("hungarian",)),
    ("iceland", "is", "isl", ("icelandic",)),
    ("india", "in", "ind", ("indian",)),
    ("indonesia", "id", "idn", ("indonesian",)),
    ("iran", "ir", "irn", ("iranian", "persia", "islamic republic of iran")),
    ("iraq", "iq", "irq", ("iraqi",)),
    ("ireland", "ie", "irl", ("irish", "republic of ireland", "eire")),
    ("israel", "il", "isr", ("israeli",)),
    ("italy", "it", "ita", ("italian",)),
    ("jamaica", "jm", "jam", ("jamaican",)),
    ("japan", "jp", "jpn", ("japanese",)),
    ("jordan", "jo", "jor", ("jordanian",)),
    ("kazakhstan", "kz", "kaz", ("kazakh", "kazakhstani")),
    ("kenya", "ke", "ken", ("kenyan",)),
    ("kiribati", "ki", "kir", ()),
    ("north korea", "kp", "prk", ("dprk", "democratic people s republic of korea", "north korean")),
    ("south korea", "kr", "kor", ("republic of korea", "korea republic of", "south korean", "korean")),
    ("kuwait", "kw", "kwt", ("kuwaiti",)),
    ("kyrgyzstan", "kg", "kgz", ("kyrgyz",)),
    ("laos", "la", "lao", ("lao", "laotian")),
    ("latvia", "lv", "lva", ("latvian",)),
    ("lebanon", "lb", "lbn", ("lebanese",)),
    ("lesotho", "ls", "lso", ("basotho",)),
    ("liberia", "lr", "lbr", ("liberian",)),
    ("libya", "ly", "lby", ("libyan",)),
    ("liechtenstein", "li", "lie", ()),
    ("lithuania", "lt", "ltu", ("lithuanian",)),
    ("luxembourg", "lu", "lux", ("luxembourgish",)),
    ("madagascar", "mg", "mdg", ("malagasy",)),
    ("malawi", "mw", "mwi", ("malawian",)),
    ("malaysia", "my", "mys", ("malaysian",)),
    ("maldives", "mv", "mdv", ("maldivian",)),
    ("mali", "ml", "mli", ("malian",)),
    ("malta", "mt", "mlt", ("maltese",)),
    ("mauritania", "mr", "mrt", ("mauritanian",)),
    ("mauritius", "mu", "mus", ("mauritian",)),
    ("mexico", "mx", "mex", ("mexican",)),
    ("moldova", "md", "mda", ("moldovan", "republic of moldova")),
    ("monaco", "mc", "mco", ("monegasque",)),
    ("mongolia", "mn", "mng", ("mongolian",)),
    ("montenegro", "me", "mne", ("montenegrin",)),
    ("morocco", "ma", "mar", ("moroccan",)),
    ("mozambique", "mz", "moz", ("mozambican",)),
    ("myanmar", "mm", "mmr", ("burma", "burmese",)),
    ("namibia", "na", "nam", ("namibian",)),
    ("nauru", "nr", "nru", ()),
    ("nepal", "np", "npl", ("nepalese", "nepali")),
    ("netherlands", "nl", "nld", ("dutch", "holland", "the netherlands")),
    ("new zealand", "nz", "nzl", ("new zealander",)),
    ("nicaragua", "ni", "nic", ("nicaraguan",)),
    ("niger", "ne", "ner", ("nigerien",)),
    ("nigeria", "ng", "nga", ("nigerian",)),
    ("north macedonia", "mk", "mkd", ("macedonia", "macedonian")),
    ("norway", "no", "nor", ("norwegian",)),
    ("oman", "om", "omn", ("omani",)),
    ("pakistan", "pk", "pak", ("pakistani",)),
    ("palau", "pw", "plw", ()),
    ("panama", "pa", "pan", ("panamanian",)),
    ("papua new guinea", "pg", "png", ()),
    ("paraguay", "py", "pry", ("paraguayan",)),
    ("peru", "pe", "per", ("peruvian",)),
    ("philippines", "ph", "phl", ("philippine", "filipino")),
    ("poland", "pl", "pol", ("polish",)),
    ("portugal", "pt", "prt", ("portuguese",)),
    ("qatar", "qa", "qat", ("qatari",)),
    ("romania", "ro", "rou", ("romanian",)),
    ("russia", "ru", "rus", ("russian", "russian federation")),
    ("rwanda", "rw", "rwa", ("rwandan",)),
    ("saint kitts and nevis", "kn", "kna", ()),
    ("saint lucia", "lc", "lca", ()),
    ("saint vincent and the grenadines", "vc", "vct", ()),
    ("samoa", "ws", "wsm", ("samoan",)),
    ("san marino", "sm", "smr", ()),
    ("sao tome and principe", "st", "stp", ()),
    ("saudi arabia", "sa", "sau", ("saudi",)),
    ("senegal", "sn", "sen", ("senegalese",)),
    ("serbia", "rs", "srb", ("serbian",)),
    ("seychelles", "sc", "syc", ()),
    ("sierra leone", "sl", "sle", ("sierra leonean",)),
    ("singapore", "sg", "sgp", ("singaporean",)),
    ("slovakia", "sk", "svk", ("slovak", "slovakian")),
    ("slovenia", "si", "svn", ("slovenian", "slovene")),
    ("solomon islands", "sb", "slb", ()),
    ("somalia", "so", "som", ("somali",)),
    ("south africa", "za", "zaf", ("south african",)),
    ("south sudan", "ss", "ssd", ()),
    ("spain", "es", "esp", ("spanish",)),
    ("sri lanka", "lk", "lka", ("sri lankan",)),
    ("sudan", "sd", "sdn", ("sudanese",)),
    ("suriname", "sr", "sur", ("surinamese",)),
    ("sweden", "se", "swe", ("swedish",)),
    ("switzerland", "ch", "che", ("swiss",)),
    ("syria", "sy", "syr", ("syrian", "syrian arab republic")),
    ("taiwan", "tw", "twn", ("taiwanese",)),
    ("tajikistan", "tj", "tjk", ("tajik",)),
    ("tanzania", "tz", "tza", ("tanzanian",)),
    ("thailand", "th", "tha", ("thai",)),
    ("timor leste", "tl", "tls", ("east timor",)),
    ("togo", "tg", "tgo", ("togolese",)),
    ("tonga", "to", "ton", ("tongan",)),
    ("trinidad and tobago", "tt", "tto", ("trinidadian",)),
    ("tunisia", "tn", "tun", ("tunisian",)),
    ("turkey", "tr", "tur", ("turkish", "turkiye", "türkiye")),
    ("turkmenistan", "tm", "tkm", ("turkmen",)),
    ("tuvalu", "tv", "tuv", ()),
    ("uganda", "ug", "uga", ("ugandan",)),
    ("ukraine", "ua", "ukr", ("ukrainian",)),
    ("united arab emirates", "ae", "are", ("uae", "emirati")),
    ("united kingdom", "gb", "gbr", ("uk", "u k", "great britain", "britain", "british", "english", "scottish", "welsh", "england", "scotland", "wales")),
    ("united states", "us", "usa", ("u s", "u s a", "america", "american", "united states of america")),
    ("uruguay", "uy", "ury", ("uruguayan",)),
    ("uzbekistan", "uz", "uzb", ("uzbek",)),
    ("vanuatu", "vu", "vut", ()),
    ("vatican city", "va", "vat", ("holy see",)),
    ("venezuela", "ve", "ven", ("venezuelan",)),
    ("vietnam", "vn", "vnm", ("viet nam", "vietnamese")),
    ("yemen", "ye", "yem", ("yemeni",)),
    ("zambia", "zm", "zmb", ("zambian",)),
    ("zimbabwe", "zw", "zwe", ("zimbabwean",)),
]

NOT_COUNTRIES = {
    "international",
    "europe",
    "european",
    "european union",
    "eu",
    "unknown",
    "n a",
    "none",
    "global",
    "worldwide",
    "various",
    "undetermined",
    "not known",
    "unspecified",
}

ALIAS: dict[str, str] = {}
PHRASES: list[tuple[str, str]] = []


def fold_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("'", "").replace("’", "")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _build() -> None:
    for canonical, alpha2, alpha3, extras in ROWS:
        keys = {canonical, alpha2, alpha3, *extras}
        for key in keys:
            folded = fold_text(key)
            if folded:
                ALIAS[folded] = canonical
        PHRASES.append((fold_text(canonical), canonical))
        for extra in extras:
            folded = fold_text(extra)
            if " " in folded:
                PHRASES.append((folded, canonical))
    PHRASES.sort(key=lambda item: len(item[0]), reverse=True)


_build()


def canon_country(value: str | None, *, allow_unknown: bool = True) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\[[^\]]*\]", " ", value)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    key = fold_text(cleaned)
    if not key or key in NOT_COUNTRIES:
        return None
    if key in ALIAS:
        return ALIAS[key]
    if allow_unknown and len(key) > 3 and not key.isdigit():
        return key
    return None


def countries_in_text(text: str) -> list[str]:
    """Country mentions in reading order, longest alias first, no overlaps."""
    folded = fold_text(text)
    if not folded:
        return []
    padded = f" {folded} "
    found: list[tuple[int, str]] = []
    occupied: list[tuple[int, int]] = []
    for phrase, canonical in PHRASES:
        needle = f" {phrase} "
        start = 0
        while True:
            at = padded.find(needle, start)
            if at < 0:
                break
            begin = at
            end = at + len(needle)
            if not any(not (end <= lo or begin >= hi) for lo, hi in occupied):
                found.append((begin, canonical))
                occupied.append((begin, end))
            start = at + 1
    found.sort()
    seen: list[str] = []
    for _, canonical in found:
        if canonical not in seen:
            seen.append(canonical)
    return seen


def country_from_address(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\[[^\]]*\]", " ", value)
    parts = [part.strip() for part in cleaned.split(",") if part.strip()]
    if not parts:
        parts = [cleaned.strip()]
    for part in reversed(parts):
        known = canon_country(part, allow_unknown=False)
        if known:
            return known
    for part in reversed(parts):
        if re.fullmatch(r"[\d\s-]+", part):
            continue
        unknown = canon_country(part, allow_unknown=True)
        if unknown and not unknown.isdigit():
            return unknown
    return None
