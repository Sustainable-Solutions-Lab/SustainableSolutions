"""
Contrail-forcing scoring API — Vercel Python serverless function.

Wraps the Sustainable Solutions Lab schedule-only contrail model
(predicting-contrails repo). Feature computation was reverse-validated
against the model's training shards (exact match); see
predicting-contrails/webtool/ for provenance, asset export, and the
distillation metrics.

Routes (GET):
  /api/contrails?meta=1
      → { aircraft: [{icao, n}...], n_calibration_flights, model }
  /api/contrails?flights=1&origin=SFO&dest=DEL&date=2026-09-19
      → real bookable itineraries from the Duffel API, each leg scored
        by the model (requires DUFFEL_API_TOKEN env var; test tokens
        return sandbox "Duffel Airways" data)
  /api/contrails?route=1&origin=SFO&dest=LHR
      → { known, n_flights, aircraft: [{icao, share}...] } — whether the
        corpus contains direct flights on this airport pair, and the
        observed aircraft mix (2019+2021)
  /api/contrails?origin=SFO&dest=LHR&date=2026-10-12&time=21:40&aircraft=B789
      [&tz=local|utc] [&curve=1]
      → score payload (percentile vs all 2021 flights, top-10% flag,
        expected CO2e, optional 24-hour departure curve)

`time` is local at the origin airport by default (tz=local); the airport
table supplies the IANA zone.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

import os
import urllib.request
import urllib.parse

import ephem
import numpy as np
import xgboost as xgb
from pyproj import Geod
from shapely import wkb as shapely_wkb
from shapely.geometry import LineString

ASSETS = Path(__file__).parent / "_contrails_assets"

NB_WAYPOINTS = 30
DURATION_INTERCEPT_H = 0.356
DURATION_SLOPE_H_PER_KM = 1.148e-3

LEAN_AC_FEATS = [
    "total_flight_distance_km",
    "day_sin", "day_cos",
    "start_hour_sin", "start_hour_cos",
    "OriginLat", "OriginLon_sin", "OriginLon_cos",
    "DestinationLat", "DestinationLon_sin", "DestinationLon_cos",
    "land_score",
    "night_score_full_0",
    "aircraft_type_icao",
]

_geod = Geod(ellps="WGS84")
_observer = ephem.Observer()
_sun = ephem.Sun()

# Module-level caches — persist across warm invocations
_airports = None
_land = None
_booster = None
_calib = None
_aircraft = None
_routes = None
_flightnos = None
_pax = None


def _load():
    global _airports, _land, _booster, _calib, _aircraft, _routes, _flightnos, _pax
    if _booster is None:
        with open(ASSETS / "airports.json") as f:
            _airports = json.load(f)
        _land = shapely_wkb.loads((ASSETS / "land_union.wkb").read_bytes())
        _booster = xgb.Booster()
        model = ASSETS / "model_canonical.ubj"
        if not model.exists():
            model = ASSETS / "model_web.ubj"
        _booster.load_model(str(model))
        with open(ASSETS / "calibration.json") as f:
            _calib = json.load(f)
        with open(ASSETS / "aircraft.json") as f:
            _aircraft = json.load(f)
        with open(ASSETS / "routes.json") as f:
            _routes = json.load(f)
        fp = ASSETS / "flightnos.json"
        _flightnos = json.load(open(fp)) if fp.exists() else {}
        pp = ASSETS / "pax_by_type.json"
        _pax = json.load(open(pp)) if pp.exists() else {}


def _night_score(olon, olat, dlon, dlat, dep_utc, arr_utc):
    pts = np.array(_geod.npts(olon, olat, dlon, dlat, NB_WAYPOINTS))
    span = (arr_utc - dep_utc).total_seconds()
    sins = []
    for i, (lon, lat) in enumerate(pts):
        t = dep_utc + timedelta(seconds=span * i / (NB_WAYPOINTS - 1))
        _observer.long = lon * ephem.degree
        _observer.lat = lat * ephem.degree
        _observer.date = t.strftime("%Y-%m-%d %H:%M:%S")
        _sun.compute(_observer)
        sins.append(max(0.0, math.sin(_sun.alt)))
    return 100.0 * (1.0 - float(np.mean(sins)))


def _land_score(olon, olat, dlon, dlat):
    line = LineString([(olon, olat), (dlon, dlat)])
    total_km = _geod.geometry_length(line) / 1e3
    if total_km <= 0:
        return 0.0
    inter = line.intersection(_land)
    land_km = 0.0 if inter.is_empty else _geod.geometry_length(inter) / 1e3
    return 100.0 * min(1.0, land_km / total_km)


def _features(origin, dest, dep_utc, aircraft):
    o, d = _airports[origin], _airports[dest]
    olat, olon, dlat, dlon = o["lat"], o["lon"], d["lat"], d["lon"]
    _, _, dist_m = _geod.inv(olon, olat, dlon, dlat)
    dist_km = dist_m / 1e3
    arr_utc = dep_utc + timedelta(
        hours=DURATION_INTERCEPT_H + DURATION_SLOPE_H_PER_KM * dist_km)
    doy = float(dep_utc.timetuple().tm_yday)
    hour = float(dep_utc.hour)  # integer-truncated, as in training
    return {
        "total_flight_distance_km": dist_km,
        "day_sin": math.sin(2 * math.pi * doy / 365),
        "day_cos": math.cos(2 * math.pi * doy / 365),
        "start_hour_sin": math.sin(2 * math.pi * hour / 24),
        "start_hour_cos": math.cos(2 * math.pi * hour / 24),
        "OriginLat": olat,
        "OriginLon_sin": math.sin(2 * math.pi * olon / 360),
        "OriginLon_cos": math.cos(2 * math.pi * olon / 360),
        "DestinationLat": dlat,
        "DestinationLon_sin": math.sin(2 * math.pi * dlon / 360),
        "DestinationLon_cos": math.cos(2 * math.pi * dlon / 360),
        "land_score": _land_score(olon, olat, dlon, dlat),
        "night_score_full_0": _night_score(olon, olat, dlon, dlat,
                                           dep_utc, arr_utc),
        "aircraft_type_icao": aircraft,
    }


def _predict(rows):
    # numpy path (no pandas in the bundle): categorical feature passed as
    # its training category CODE with feature_types — verified to produce
    # byte-identical predictions to the pandas-categorical path.
    idx = {c: i for i, c in enumerate(_aircraft["categories"])}
    X = np.array(
        [[r[f] if f != "aircraft_type_icao" else idx[r[f]]
          for f in LEAN_AC_FEATS] for r in rows],
        dtype=np.float32)
    ftypes = ["c" if f == "aircraft_type_icao" else "q"
              for f in LEAN_AC_FEATS]
    dm = xgb.DMatrix(X, feature_names=LEAN_AC_FEATS, feature_types=ftypes,
                     enable_categorical=True)
    return _booster.predict(dm)


def _percentile(pred):
    grid = np.asarray(_calib["pred_log_quantiles"])
    return float(np.interp(pred, grid, np.linspace(0, 100, len(grid))))


def resolve_flightno(fn):
    """IATA flight number -> typical route/dep-time/aircraft (2019+2021
    schedules; numbers change, so treat as a convenience prefill)."""
    rec = _flightnos.get(fn.upper().replace(" ", ""))
    if rec is None:
        return {"found": False}
    o, d, mod_utc, ac, n = rec
    if o not in _airports or d not in _airports:
        return {"found": False}
    # convert median UTC minute-of-day to origin-local clock time
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    utc = _dt(2021, 6, 15, mod_utc // 60, mod_utc % 60, tzinfo=_tz.utc)
    local = utc.astimezone(ZoneInfo(_airports[o]["tz"]))
    return {"found": True, "origin": o, "dest": d,
            "time_local": local.strftime("%H:%M"),
            "aircraft": ac if ac in _aircraft["categories"] else "",
            "n_observed": n}


def route_info(origin, dest):
    r = _routes.get(f"{origin}>{dest}")
    if r is None:
        return {"known": False, "n_flights": 0, "aircraft": []}
    return {"known": True, "n_flights": r["n"],
            "aircraft": [{"icao": k, "share": v} for k, v in r["ac"].items()]}


def score(origin, dest, date_s, time_s, aircraft, tz_mode, want_curve):
    if origin not in _airports:
        return {"error": f"unknown origin airport '{origin}'"}, 400
    if dest not in _airports:
        return {"error": f"unknown destination airport '{dest}'"}, 400
    if aircraft not in _aircraft["categories"]:
        return {"error": f"unknown aircraft type '{aircraft}'"}, 400

    naive = datetime.fromisoformat(f"{date_s}T{time_s}")
    if tz_mode == "utc":
        dep_utc = naive
    else:
        zone = ZoneInfo(_airports[origin]["tz"])
        dep_utc = naive.replace(tzinfo=zone).astimezone(timezone.utc) \
                       .replace(tzinfo=None)

    feats = _features(origin, dest, dep_utc, aircraft)
    pred = float(_predict([feats])[0])
    pct = _percentile(pred)
    b = min(99, int(pct))
    kg_km = _calib["bin_mean_co2e_kg_per_km"][b]
    o_ap, d_ap = _airports[origin], _airports[dest]
    out = {
        "origin": origin, "dest": dest,
        "origin_ll": [round(o_ap["lat"], 3), round(o_ap["lon"], 3)],
        "dest_ll": [round(d_ap["lat"], 3), round(d_ap["lon"], 3)],
        "route_in_corpus": f"{origin}>{dest}" in _routes,
        "dep_utc": dep_utc.isoformat(), "aircraft": aircraft,
        "distance_km": round(feats["total_flight_distance_km"], 1),
        "night_score": round(feats["night_score_full_0"], 1),
        "percentile": round(pct, 1),
        "flagged_top10": pred >= _calib["threshold_top10_pred_log"],
        "expected_co2e_kg_per_km": round(kg_km, 3),
        "expected_co2e_t_per_flight": round(
            kg_km * feats["total_flight_distance_km"] / 1000.0, 2),
        "pax_assumed": _pax.get(aircraft, 140),
        "expected_co2e_kg_per_pax": round(
            kg_km * feats["total_flight_distance_km"]
            / _pax.get(aircraft, 140), 1),
        "est_duration_h": round(
            DURATION_INTERCEPT_H
            + DURATION_SLOPE_H_PER_KM * feats["total_flight_distance_km"], 2),
    }
    # Score every aircraft flown on this route at the same departure —
    # engine generation can move a flight across most of the percentile
    # range, so the UI surfaces the comparison.
    rkey = _routes.get(f"{origin}>{dest}")
    if rkey:
        comp_types = [t for t in rkey["ac"] if t in _aircraft["categories"]]
        if comp_types:
            rows = [dict(feats, aircraft_type_icao=t) for t in comp_types]
            preds = _predict(rows)
            out["aircraft_comparison"] = sorted(
                [{"icao": t, "share": rkey["ac"][t],
                  "percentile": round(_percentile(float(pp)), 1)}
                 for t, pp in zip(comp_types, preds)],
                key=lambda x: x["percentile"])

    if want_curve:
        base = dep_utc.replace(hour=0, minute=0)
        rows = [_features(origin, dest, base + timedelta(hours=h), aircraft)
                for h in range(24)]
        preds = _predict(rows)
        offset_h = (naive - dep_utc).total_seconds() / 3600 if tz_mode != "utc" else 0
        out["hour_curve"] = [
            {"hour_utc": h,
             "hour_local": round((h + offset_h) % 24, 1),
             "percentile": round(_percentile(float(p)), 1)}
            for h, p in enumerate(preds)
        ]
    return out, 200


# ── Duffel integration ───────────────────────────────────────────────────
# (Amadeus self-service was decommissioned 2026-07-17.)
# IATA aircraft type designators (returned by Duffel) → ICAO types the
# model was trained on. Covers the common fleet; unknown codes fall back
# to the route's most common type, flagged in the response.
IATA_TO_ICAO_AC = {
    "319": "A319", "320": "A320", "321": "A321", "32A": "A320",
    "32B": "A321", "32N": "A20N", "32Q": "A21N", "32S": "A320",
    "332": "A332", "333": "A333", "338": "A338", "339": "A339",
    "343": "A343", "346": "A346", "351": "A35K", "359": "A359",
    "388": "A388", "717": "B712", "737": "B737", "738": "B738",
    "739": "B739", "73G": "B737", "73H": "B738", "73J": "B739",
    "7M8": "B38M", "7M9": "B39M", "744": "B744", "748": "B748",
    "752": "B752", "753": "B753", "763": "B763", "764": "B764",
    "772": "B772", "773": "B773", "77L": "B77L", "77W": "B77W",
    "781": "B78X", "788": "B788", "789": "B789",
    "CR7": "CRJ7", "CR9": "CRJ9", "CRK": "CRJX", "E70": "E170",
    "E75": "E75L", "E90": "E190", "E95": "E195", "290": "E290",
    "295": "E295", "221": "BCS1", "223": "BCS3",
}

_flights_cache = {}


def bookable_flights(origin, dest, date_s):
    """Real itineraries for the date via Duffel, each leg model-scored."""
    token = os.environ.get("DUFFEL_API_TOKEN")
    if not token:
        return {"error": "flight_search_not_configured"}, 503
    ck = (origin, dest, date_s)
    if ck in _flights_cache:
        return _flights_cache[ck], 200

    payload = json.dumps({"data": {
        "slices": [{"origin": origin, "destination": dest,
                    "departure_date": date_s}],
        "passengers": [{"type": "adult"}],
        "cabin_class": "economy",
    }}).encode()
    req = urllib.request.Request(
        "https://api.duffel.com/air/offer_requests?return_offers=true",
        data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}",
                 "Duffel-Version": "v2",
                 "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            offers = json.load(r)["data"].get("offers", [])
    except urllib.error.HTTPError as e:
        return {"error": f"duffel {e.code}: {e.read().decode()[:200]}"}, 502

    results = {}
    for off in offers:
        sl = off["slices"][0]
        owner = off.get("owner") or {}
        legs = []
        total_t = 0.0
        total_pax_kg = 0.0
        worst_pct = 0.0
        approx = False
        key_parts = []
        ok = True
        for seg in sl.get("segments", []):
            o = (seg.get("origin") or {}).get("iata_code", "")
            d = (seg.get("destination") or {}).get("iata_code", "")
            dep_local = (seg.get("departing_at") or "")[:16]
            iata_ac = ((seg.get("aircraft") or {}) or {}).get("iata_code") or ""
            icao_ac = IATA_TO_ICAO_AC.get(iata_ac)
            if icao_ac is None or icao_ac not in _aircraft["categories"]:
                rm = _routes.get(f"{o}>{d}")
                icao_ac = next(iter(rm["ac"])) if rm else "B738"
                approx = True
            if o not in _airports or d not in _airports or not dep_local:
                ok = False
                break
            carrier = ((seg.get("marketing_carrier") or {}).get("iata_code", "")
                       + str(seg.get("marketing_carrier_flight_number", "")))
            date_p, time_p = dep_local.split("T")
            body, code = score(o, d, date_p, time_p, icao_ac, "local", False)
            if code != 200:
                ok = False
                break
            legs.append({
                "from": o, "to": d, "dep_local": dep_local,
                "from_ll": body["origin_ll"], "to_ll": body["dest_ll"],
                "carrier": carrier, "aircraft": icao_ac,
                "percentile": body["percentile"],
                "t_co2e": body["expected_co2e_t_per_flight"],
                "kg_per_pax": body["expected_co2e_kg_per_pax"],
            })
            total_t += body["expected_co2e_t_per_flight"]
            total_pax_kg += body["expected_co2e_kg_per_pax"]
            worst_pct = max(worst_pct, body["percentile"])
            key_parts.append(f"{carrier}@{dep_local}")
        if not ok or not legs:
            continue
        key = "|".join(key_parts)
        price = float(off.get("total_amount") or 0)
        if key not in results or (0 < price < results[key]["price_usd"]):
            arr_local = (sl["segments"][-1].get("arriving_at") or "")[:16]
            results[key] = {
                "legs": legs, "n_stops": len(legs) - 1,
                "dep_local": legs[0]["dep_local"],
                "arr_local": arr_local,
                "duration": sl.get("duration", ""),
                "airline": owner.get("name", ""),
                "airline_logo": owner.get("logo_symbol_url", ""),
                "total_t_co2e": round(total_t, 2),
                "total_kg_per_pax": round(total_pax_kg, 1),
                "worst_leg_percentile": worst_pct,
                "aircraft_estimated": approx,
                "price_usd": price,
                "currency": off.get("total_currency", "USD"),
            }
    out = {"flights": sorted(results.values(),
                             key=lambda f: f["total_t_co2e"])}
    _flights_cache[ck] = out
    return out, 200


def advisor_flights(origin, dest, date_s, time_s, flex_h):
    """Pool bookable itineraries within ±flex_h HOURS of the selected
    local departure, sorted by total contrail CO2e. flex_h capped at 72
    (window spans at most 7 date-searches; per-date results cached)."""
    from datetime import datetime as _dt, timedelta as _td
    flex_h = max(1, min(72, flex_h))
    sel = _dt.fromisoformat(f"{date_s}T{time_s}")
    lo, hi = sel - _td(hours=flex_h), sel + _td(hours=flex_h)
    all_flights = []
    searched, failed = [], []
    d = lo.date()
    while d <= hi.date():
        ds = d.isoformat()
        body, code = bookable_flights(origin, dest, ds)
        if code != 200:
            if body.get("error") == "flight_search_not_configured":
                return body, 503
            failed.append(ds)
        else:
            searched.append(ds)
            for f in body["flights"]:
                try:
                    dep = _dt.fromisoformat(f["dep_local"])
                except ValueError:
                    continue
                if lo <= dep <= hi:
                    all_flights.append(dict(f, date=f["dep_local"][:10]))
        d += _td(days=1)
    all_flights.sort(key=lambda f: f["total_t_co2e"])
    return {"flights": all_flights, "searched_dates": searched,
            "failed_dates": failed, "window_h": flex_h}, 200


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        _load()
        q = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        try:
            if q.get("meta"):
                body, code = {
                    "aircraft": _aircraft["top_types"],
                    "n_calibration_flights": _calib["n_flights"],
                    "model": "LEAN+AC schedule-only XGBoost",
                }, 200
            elif q.get("flightno"):
                body, code = resolve_flightno(q["flightno"]), 200
            elif q.get("flights"):
                o, d = q.get("origin", "").upper(), q.get("dest", "").upper()
                flex_h = int(float(q.get("flex_h", "0") or 0))
                if o not in _airports or d not in _airports:
                    body, code = {"error": "unknown airport"}, 400
                elif flex_h > 0:
                    body, code = advisor_flights(o, d, q.get("date", ""),
                                                 q.get("time", "12:00"), flex_h)
                else:
                    body, code = bookable_flights(o, d, q.get("date", ""))
            elif q.get("route"):
                o, d = q.get("origin", "").upper(), q.get("dest", "").upper()
                if o not in _airports or d not in _airports:
                    body, code = {"error": "unknown airport"}, 400
                else:
                    body, code = route_info(o, d), 200
            else:
                body, code = score(
                    q.get("origin", "").upper(), q.get("dest", "").upper(),
                    q.get("date", ""), q.get("time", "12:00"),
                    q.get("aircraft", "B738").upper(),
                    q.get("tz", "local"), q.get("curve") == "1",
                )
        except (KeyError, ValueError) as e:
            body, code = {"error": str(e)}, 400
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        # Never CDN-cache errors (a cached 503 once masked a fixed env
        # var for a day) or live flight inventory; scores/meta are
        # deterministic per-URL and cache fine.
        if code != 200 or q.get("flights"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)
