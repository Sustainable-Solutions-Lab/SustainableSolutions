#!/usr/bin/env python3
"""Build api/_contrails_assets/airport_names.json — the display-name →
IATA resolver behind the contrails batch endpoint (bookmarklet/extension).

Keys are normalized airport names and cities from
public/tools/contrails-airports.json, PLUS every token prefix of each
("frankfurt am main" also yields "frankfurt" and "frankfurt am"), so
Google Flights labels like "Frankfurt Airport" resolve even though our
records say "Frankfurt am Main". Collisions go to the airport with the
most 2019+2021 corpus traffic (summed from routes.json) rather than
being dropped; explicit aliases win last.

Run from the repo root:  python3 scripts/gen-contrails-airport-names.py
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROWS = json.load(open(ROOT / "public/tools/contrails-airports.json"))
ROUTES = json.load(open(ROOT / "api/_contrails_assets/routes.json"))
OUT = ROOT / "api/_contrails_assets/airport_names.json"

STOP = {"airport", "international", "intl", "regional", "municipal",
        "field", "aeropuerto", "airfield"}

ALIASES = {
    "haneda": "HND", "narita": "NRT", "heathrow": "LHR", "gatwick": "LGW",
    "stansted": "STN", "john f kennedy": "JFK", "jfk": "JFK",
    "laguardia": "LGA", "la guardia": "LGA", "newark liberty": "EWR",
    "charles de gaulle": "CDG", "orly": "ORY", "schiphol": "AMS",
    "changi": "SIN", "incheon": "ICN", "gimpo": "GMP", "hong kong": "HKG",
    "chek lap kok": "HKG", "dulles": "IAD", "reagan national": "DCA",
    "ronald reagan washington national": "DCA", "ben gurion": "TLV",
    "indira gandhi": "DEL", "chhatrapati shivaji": "BOM",
    "suvarnabhumi": "BKK", "don mueang": "DMK", "istanbul": "IST",
    "sheremetyevo": "SVO", "domodedovo": "DME",
    "adolfo suarez madrid barajas": "MAD", "barajas": "MAD",
    "el prat": "BCN", "josep tarradellas barcelona el prat": "BCN",
    "fiumicino": "FCO", "leonardo da vinci": "FCO", "malpensa": "MXP",
    "linate": "LIN", "sky harbor": "PHX", "o hare": "ORD", "ohare": "ORD",
    "midway": "MDW", "logan": "BOS", "hartsfield jackson atlanta": "ATL",
    "hartsfield jackson": "ATL", "seattle tacoma": "SEA",
    "harry reid": "LAS", "mccarran": "LAS",
    "george bush intercontinental": "IAH", "william p hobby": "HOU",
    "dallas fort worth": "DFW", "love": "DAL", "pearson": "YYZ",
    "toronto pearson": "YYZ", "montreal trudeau": "YUL",
    "pierre elliott trudeau": "YUL", "kingsford smith": "SYD",
    "tullamarine": "MEL", "guarulhos": "GRU", "galeao": "GIG",
    "jorge chavez": "LIM", "benito juarez": "MEX", "el dorado": "BOG",
    "arturo merino benitez": "SCL", "ministro pistarini": "EZE",
    "ezeiza": "EZE", "king abdulaziz": "JED", "king khalid": "RUH",
    "hamad": "DOH", "kuala lumpur": "KUL", "soekarno hatta": "CGK",
    "ninoy aquino": "MNL", "taoyuan": "TPE", "taiwan taoyuan": "TPE",
    "pudong": "PVG", "shanghai pudong": "PVG", "hongqiao": "SHA",
    "beijing capital": "PEK", "daxing": "PKX", "kansai": "KIX",
    "itami": "ITM", "chubu centrair": "NGO", "new chitose": "CTS",
    "noi bai": "HAN", "tan son nhat": "SGN", "zaventem": "BRU",
    "kloten": "ZRH", "franz josef strauss": "MUC", "tegel": "TXL",
    "brandenburg": "BER", "vaclav havel": "PRG", "chopin": "WAW",
    "ferihegy": "BUD", "eleftherios venizelos": "ATH", "ataturk": "ISL",
    "sabiha gokcen": "SAW", "king shaka": "DUR", "or tambo": "JNB",
    "cape town": "CPT", "jomo kenyatta": "NBO", "bole": "ADD",
    "murtala muhammed": "LOS", "cairo": "CAI", "mohammed v": "CMN",
    "dubai": "DXB", "abu dhabi": "AUH", "queen alia": "AMM",
    "rajiv gandhi": "HYD", "kempegowda": "BLR",
    "netaji subhas chandra bose": "CCU", "jinnah": "KHI",
    "allama iqbal": "LHE", "velana": "MLE", "bandaranaike": "CMB",
    "tribhuvan": "KTM", "hazrat shahjalal": "DAC", "wattay": "VTE",
    "phnom penh": "PNH", "juanda": "SUB", "ngurah rai": "DPS",
    "auckland": "AKL", "christchurch": "CHC", "wellington": "WLG",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def strip_stop(s: str) -> str:
    return " ".join(t for t in s.split() if t not in STOP)


def main() -> None:
    traffic: dict[str, int] = defaultdict(int)
    for key, r in ROUTES.items():
        o, d = key.split(">")
        traffic[o] += r["n"]
        traffic[d] += r["n"]

    best: dict[str, str] = {}

    def add(key: str, iata: str) -> None:
        if not key:
            return
        if key not in best or traffic[iata] > traffic[best[key]]:
            best[key] = iata

    for iata, city, name, _country in ROWS:
        variants = {norm(name), strip_stop(norm(name)),
                    norm(city), strip_stop(norm(city))}
        for v in list(variants):
            toks = v.split()
            for i in range(1, len(toks) + 1):
                add(" ".join(toks[:i]), iata)

    present = {r[0] for r in ROWS}
    for k, v in ALIASES.items():
        if v in present:
            best[norm(k)] = v

    json.dump(best, open(OUT, "w"))
    print(f"{len(best):,} keys -> {OUT.relative_to(ROOT)}")
    for probe in ("frankfurt", "haneda", "san francisco", "tokyo",
                  "munich", "hong kong"):
        print(f"  {probe!r} -> {best.get(probe)}")


if __name__ == "__main__":
    main()
