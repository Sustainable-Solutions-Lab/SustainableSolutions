/**
 * Contrails booking tool — v2.
 *
 * Schedule-only prediction of a flight's contrail warming, months ahead
 * of departure. v2 adds booking-style airport autocomplete (type a code
 * or city), route-aware aircraft selection (preselects the most common
 * type on the chosen route; types never flown on it are grayed out),
 * and an explicit flag when the airport pair has no direct flights in
 * the 2019+2021 corpus (the estimate is then a hypothetical direct).
 * Estimates are per FLIGHT: score each leg of a connection separately.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

type HourPoint = { hour_utc: number; hour_local: number; percentile: number };

type ScoreResult = {
  origin: string;
  dest: string;
  dep_utc: string;
  aircraft: string;
  distance_km: number;
  night_score: number;
  percentile: number;
  flagged_top10: boolean;
  route_in_corpus: boolean;
  origin_ll?: [number, number];
  dest_ll?: [number, number];
  expected_co2e_t_per_flight: number;
  aircraft_comparison?: { icao: string; share: number; percentile: number }[];
  hour_curve?: HourPoint[];
  error?: string;
};

type FlightLeg = {
  from: string; to: string; dep_local: string; carrier: string;
  aircraft: string; percentile: number; t_co2e: number;
  from_ll?: [number, number]; to_ll?: [number, number];
};
type FlightOption = {
  legs: FlightLeg[]; n_stops: number; dep_local: string; arr_local?: string;
  duration?: string; airline?: string; airline_logo?: string;
  total_t_co2e: number; worst_leg_percentile: number;
  aircraft_estimated: boolean; price_usd: number; currency?: string; date?: string;
};

function fmtDuration(iso?: string): string {
  const m = iso?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return '';
  const h = Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0);
  return `${h}h${m[3] ? ` ${m[3]}m` : ''}`;
}

type RouteInfo = {
  known: boolean;
  n_flights: number;
  aircraft: { icao: string; share: number }[];
};

// [iata, city, name, country]
type AirportRow = [string, string, string, string];

const API = '/api/contrails';

function pctColor(p: number): string {
  if (p >= 90) return '#9E0142';
  if (p >= 75) return '#D53E4F';
  if (p >= 50) return '#FDAE61';
  if (p >= 25) return '#ABDDA4';
  return '#66C2A5';
}

function rankMatches(q: string, airports: AirportRow[]): AirportRow[] {
  const u = q.trim().toUpperCase();
  if (u.length < 2) return [];
  const scored: [number, AirportRow][] = [];
  for (const row of airports) {
    const [iata, city, name] = row;
    let s = -1;
    if (iata === u) s = 0;
    else if (iata.startsWith(u)) s = 1;
    else if (city.toUpperCase().startsWith(u)) s = 2;
    else if (name.toUpperCase().startsWith(u)) s = 3;
    else if (city.toUpperCase().includes(u)) s = 4;
    if (s >= 0) scored.push([s, row]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1][1].localeCompare(b[1][1]));
  return scored.slice(0, 8).map(([, r]) => r);
}

function AirportInput({
  label,
  value,
  onSelect,
  airports,
}: {
  label: string;
  value: string;
  onSelect: (iata: string) => void;
  airports: AirportRow[];
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => rankMatches(text, airports), [text, airports]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(row: AirportRow) {
    onSelect(row[0]);
    setText(`${row[0]} — ${row[1]}`);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative flex flex-col gap-1 text-sm">
      <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">{label}</span>
      <input
        className="rounded-sm border border-rule bg-paper-2 px-2 py-1.5"
        value={text}
        placeholder="code or city"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); choose(matches[hi]); }
          if (e.key === 'Escape') setOpen(false);
        }}
        required
      />
      {open && matches.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 w-72 rounded-sm border border-rule bg-paper shadow-lg">
          {matches.map((m, i) => (
            <li
              key={m[0]}
              className={`cursor-pointer px-2 py-1.5 ${i === hi ? 'bg-paper-3' : ''}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(m); }}
            >
              <span className="font-mono font-bold">{m[0]}</span>
              <span className="ml-2">{m[1]}</span>
              <span className="ml-2 text-xs opacity-60">{m[2]}, {m[3]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Great-circle interpolation via 3D slerp; segments split at the
// antimeridian so Pacific routes draw cleanly.
function gcPoints(a: [number, number], b: [number, number], n = 72): [number, number][][] {
  const rad = Math.PI / 180;
  const v = (ll: [number, number]) => {
    const [lat, lon] = [ll[0] * rad, ll[1] * rad];
    return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  };
  const va = v(a);
  const vb = v(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  const segs: [number, number][][] = [];
  let cur: [number, number][] = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const s = Math.sin(om) || 1e-9;
    const w1 = Math.sin((1 - f) * om) / s;
    const w2 = Math.sin(f * om) / s;
    const x = w1 * va[0] + w2 * vb[0];
    const y = w1 * va[1] + w2 * vb[1];
    const z = w1 * va[2] + w2 * vb[2];
    const lat = Math.atan2(z, Math.hypot(x, y)) / rad;
    const lon = Math.atan2(y, x) / rad;
    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      segs.push(cur);
      cur = [];
    }
    cur.push([lat, lon]);
    prevLon = lon;
  }
  segs.push(cur);
  return segs.filter((sg) => sg.length > 1);
}

function FlightMap({
  main,
  mainColor,
  mainLabel,
  alts,
  land,
}: {
  main: { from: [number, number]; to: [number, number]; codes: [string, string] };
  mainColor: string;
  mainLabel: string;
  alts: { legs: { from_ll?: [number, number]; to_ll?: [number, number]; from: string; to: string }[]; color: string }[];
  land: [number, number][][] | null;
}) {
  // collect all arc points to auto-fit the viewport
  const arcs: { segs: [number, number][][]; color: string; width: number; dash?: string }[] = [];
  for (const alt of alts) {
    for (const l of alt.legs) {
      if (l.from_ll && l.to_ll) arcs.push({ segs: gcPoints(l.from_ll, l.to_ll), color: alt.color, width: 1.4, dash: '5 3' });
    }
  }
  arcs.push({ segs: gcPoints(main.from, main.to), color: mainColor, width: 3 });

  const pts = arcs.flatMap((a) => a.segs.flat());
  let latMin = Math.min(...pts.map((p) => p[0])) - 6;
  let latMax = Math.max(...pts.map((p) => p[0])) + 6;
  let lonMin = Math.min(...pts.map((p) => p[1])) - 6;
  let lonMax = Math.max(...pts.map((p) => p[1])) + 6;
  latMin = Math.max(-85, latMin); latMax = Math.min(88, latMax);
  const W = 680;
  const cosc = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const H = Math.max(180, Math.min(430, (W * (latMax - latMin)) / ((lonMax - lonMin) * cosc || 1)));
  const px = (lon: number) => ((lon - lonMin) / (lonMax - lonMin)) * W;
  const py = (lat: number) => ((latMax - lat) / (latMax - latMin)) * H;
  const path = (sg: [number, number][]) => sg.map((p, i) => `${i ? 'L' : 'M'}${px(p[1]).toFixed(1)},${py(p[0]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={mainLabel} style={{ width: '100%', height: 'auto' }}>
      <rect x={0} y={0} width={W} height={H} fill="var(--paper-2, #f6f6f2)" />
      {land && land.map((poly, i) => (
        <path key={i} d={path(poly.map(([x, y]) => [y, x] as [number, number]))} fill="var(--paper-3, #eaeae2)" stroke="var(--rule, #d8d8ce)" strokeWidth={0.5} />
      ))}
      {arcs.map((a, i) =>
        a.segs.map((sg, j) => (
          <path key={`${i}-${j}`} d={path(sg)} fill="none" stroke={a.color} strokeWidth={a.width} strokeDasharray={a.dash} strokeLinecap="round" opacity={a.dash ? 0.85 : 1} />
        )),
      )}
      {[{ ll: main.from, code: main.codes[0] }, { ll: main.to, code: main.codes[1] }].map((e) => (
        <g key={e.code}>
          <circle cx={px(e.ll[1])} cy={py(e.ll[0])} r={4} fill="currentColor" />
          <text x={px(e.ll[1])} y={py(e.ll[0]) - 8} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono, monospace)" fill="currentColor" fontWeight={700}>
            {e.code}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ContrailsTool() {
  const [origin, setOrigin] = useState('SFO');
  const [dest, setDest] = useState('LHR');
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 30 * 86400e3);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState('21:30');
  const [aircraft, setAircraft] = useState('B789');
  const [globalTypes, setGlobalTypes] = useState<string[]>([]);
  const [airports, setAirports] = useState<AirportRow[]>([]);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<FlightOption[] | null>(null);
  const [flexH, setFlexH] = useState('24');
  const [land, setLand] = useState<[number, number][][] | null>(null);
  const [flightsState, setFlightsState] = useState<'idle' | 'busy' | 'unconfigured' | 'error'>('idle');

  useEffect(() => {
    fetch(`${API}?meta=1`)
      .then((r) => r.json())
      .then((m) => setGlobalTypes((m.aircraft ?? []).map((a: { icao: string }) => a.icao)))
      .catch(() => setGlobalTypes(['B738', 'A320', 'B789', 'A359', 'B77W']));
    fetch('/tools/contrails-airports.json')
      .then((r) => r.json())
      .then(setAirports)
      .catch(() => setAirports([]));
    fetch('/tools/world-land.json')
      .then((r) => r.json())
      .then(setLand)
      .catch(() => setLand(null));
  }, []);

  // Route metadata: preselect the most common aircraft, gray out the rest
  useEffect(() => {
    if (origin.length !== 3 || dest.length !== 3 || origin === dest) {
      setRoute(null);
      return;
    }
    let stale = false;
    fetch(`${API}?route=1&origin=${origin}&dest=${dest}`)
      .then((r) => r.json())
      .then((info: RouteInfo) => {
        if (stale) return;
        setRoute(info);
        if (info.known && info.aircraft.length > 0) setAircraft(info.aircraft[0].icao);
      })
      .catch(() => setRoute(null));
    return () => {
      stale = true;
    };
  }, [origin, dest]);

  const routeTypes = useMemo(
    () => new Map((route?.aircraft ?? []).map((a) => [a.icao, a.share])),
    [route],
  );
  const aircraftOptions = useMemo(() => {
    const onRoute = route?.known ? [...routeTypes.keys()] : [];
    const rest = globalTypes.filter((t) => !routeTypes.has(t));
    return { onRoute, rest };
  }, [route, routeTypes, globalTypes]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ origin, dest, date, time, aircraft });
      const r = await fetch(`${API}?${q}`);
      const body: ScoreResult = await r.json();
      if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult(body);
      void findFlights();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function findFlights() {
    setFlightsState('busy');
    setFlights(null);
    try {
      const fh = Number(flexH) > 0 ? `&flex_h=${Number(flexH)}&time=${time}` : '';
      const r = await fetch(`${API}?flights=1&origin=${origin}&dest=${dest}&date=${date}${fh}`);
      const body = await r.json();
      if (r.status === 503) { setFlightsState('unconfigured'); return; }
      if (!r.ok || body.error) throw new Error(body.error);
      setFlights(body.flights ?? []);
      setFlightsState('idle');
    } catch {
      setFlightsState('error');
    }
  }

  return (
    <div className="mx-auto max-w-[820px] px-4">
      <form
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <AirportInput label="From" value={`${origin} — San Francisco`} onSelect={setOrigin} airports={airports} />
        <AirportInput label="To" value={`${dest} — London`} onSelect={setDest} airports={airports} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Date</span>
          <input type="date" className="rounded-sm border border-rule bg-paper-2 px-2 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Local departure</span>
          <input type="time" className="rounded-sm border border-rule bg-paper-2 px-2 py-1.5" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Aircraft</span>
          <select className="rounded-sm border border-rule bg-paper-2 px-2 py-1.5" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
            {aircraftOptions.onRoute.length > 0 && (
              <optgroup label="Flown on this route">
                {aircraftOptions.onRoute.map((t) => (
                  <option key={t} value={t}>
                    {t} ({Math.round((routeTypes.get(t) ?? 0) * 100)}%)
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={aircraftOptions.onRoute.length > 0 ? 'Not seen on this route' : 'Common types'}>
              {aircraftOptions.rest.map((t) => (
                <option key={t} value={t} disabled={aircraftOptions.onRoute.length > 0}>
                  {t}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button type="submit" disabled={busy} className="col-span-2 rounded-sm border border-rule bg-paper-3 px-4 py-1.5 text-sm hover:border-rule-strong sm:col-span-5">
          {busy ? 'Scoring…' : 'Predict contrail warming'}
        </button>
      </form>

      {route && !route.known && origin !== dest && (
        <p className="mt-3 rounded-sm border border-rule bg-paper-2 px-3 py-2 text-sm">
          No direct flights between {origin} and {dest} appear in our 2019–2021
          database — the estimate below treats this as a hypothetical nonstop.
          For a connecting itinerary, score each leg separately.
        </p>
      )}

      {error && <p className="mt-4 font-mono text-sm text-cardinal">{error}</p>}

      {result && (
        <div className="mt-6 border-t border-rule pt-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Contrail-warming percentile</span>
              <div className="text-4xl" style={{ color: pctColor(result.percentile) }}>
                {result.percentile.toFixed(0)}
                <span className="text-xl opacity-70">/100</span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Expected contrail warming</span>
              <div className="text-2xl">
                {result.expected_co2e_t_per_flight.toFixed(1)}{' '}
                <span className="text-base opacity-70">t CO₂-eq / flight</span>
              </div>
            </div>
            {result.flagged_top10 && (
              <div className="rounded-sm border border-cardinal px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-cardinal">
                flagged: worst 10% of flights
              </div>
            )}
          </div>

          {result.aircraft_comparison && result.aircraft_comparison.length > 1 && (
            <div className="mt-5">
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">
                Same flight, by aircraft flown on this route
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {result.aircraft_comparison.map((a) => (
                  <span
                    key={a.icao}
                    className={`rounded-sm border px-2 py-1 font-mono text-xs ${a.icao === result.aircraft ? 'border-rule-strong font-bold' : 'border-rule opacity-80'}`}
                    style={{ color: pctColor(a.percentile) }}
                  >
                    {a.icao} · {a.percentile.toFixed(0)}
                  </span>
                ))}
              </div>
              {result.aircraft_comparison[result.aircraft_comparison.length - 1].percentile -
                result.aircraft_comparison[0].percentile >= 30 && (
                <p className="mt-2 max-w-[620px] text-sm opacity-80">
                  Aircraft choice matters a lot on this route: newer types
                  (787, A320neo/737 MAX families) have cleaner-burning engines
                  that emit far less soot, and typically seed much weaker
                  contrails than older types at the same time and place.
                </p>
              )}
            </div>
          )}

          {result.origin_ll && result.dest_ll && (
            <figure className="mt-6">
              <figcaption className="mb-2 font-mono text-[11px] uppercase tracking-wider opacity-60">
                Your flight{flights && flights.length > 0 ? ' and lower-warming alternatives (dashed)' : ''} — color = warming percentile
              </figcaption>
              <FlightMap
                main={{ from: result.origin_ll, to: result.dest_ll, codes: [result.origin, result.dest] }}
                mainColor={pctColor(result.percentile)}
                mainLabel={`Great-circle route ${result.origin} to ${result.dest}`}
                alts={(flights ?? [])
                  .filter((f) => f.total_t_co2e < result.expected_co2e_t_per_flight)
                  .slice(0, 4)
                  .map((f) => ({ legs: f.legs, color: pctColor(f.worst_leg_percentile) }))}
                land={land}
              />
            </figure>
          )}

          <div className="mt-8 border-t border-rule pt-5">
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">
                Bookable flights on {date} (beta)
              </span>
              <label className="flex items-baseline gap-1 text-xs">
                <span className="opacity-60">flexibility ±</span>
                <input
                  type="number"
                  min={1}
                  max={72}
                  placeholder="0"
                  value={flexH}
                  onChange={(e) => setFlexH(e.target.value)}
                  className="w-14 rounded-sm border border-rule bg-paper-2 px-1.5 py-1 text-xs"
                  aria-label="Booking flexibility in hours around selected departure"
                />
                <span className="opacity-60">h of selected departure</span>
              </label>
              <button
                type="button"
                onClick={() => void findFlights()}
                disabled={flightsState === 'busy'}
                className="rounded-sm border border-rule bg-paper-3 px-3 py-1 text-xs hover:border-rule-strong"
              >
                {flightsState === 'busy' ? 'Searching…' : 'Search real flights'}
              </button>
            </div>
            {flightsState === 'unconfigured' && (
              <p className="mt-2 text-sm opacity-70">
                Flight search is not yet connected for this deployment.
              </p>
            )}
            {flightsState === 'error' && (
              <p className="mt-2 font-mono text-sm text-cardinal">Flight search failed — try again.</p>
            )}
            {flights && flights.length === 0 && (
              <p className="mt-2 text-sm opacity-70">No bookable itineraries returned for this date.</p>
            )}
            {flights && flights.length > 0 && result && flights[0].total_t_co2e < result.expected_co2e_t_per_flight && (
              <p className="mt-2 max-w-[640px] text-sm">
                {flights[0].total_t_co2e <= 0
                  ? `Best option more than eliminates your selected flight's expected contrail warming (net-cooling itinerary, ${flights[0].total_t_co2e.toFixed(1)} t vs ${result.expected_co2e_t_per_flight.toFixed(1)} t).`
                  : `Best option cuts expected contrail warming ${Math.round(100 * (1 - flights[0].total_t_co2e / result.expected_co2e_t_per_flight))}% vs your selected flight (${flights[0].total_t_co2e.toFixed(1)} t vs ${result.expected_co2e_t_per_flight.toFixed(1)} t).`}
              </p>
            )}
            {flights && flights.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {flights.slice(0, 5).map((f, i) => {
                  const dt = result ? f.total_t_co2e - result.expected_co2e_t_per_flight : null;
                  const nextDay = f.arr_local && f.dep_local.slice(0, 10) !== f.arr_local.slice(0, 10);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-rule bg-paper-2 px-3 py-2">
                      {f.airline_logo ? (
                        <img src={f.airline_logo} alt={f.airline ?? ''} width={26} height={26} loading="lazy" />
                      ) : (
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: pctColor(f.worst_leg_percentile) }} />
                      )}
                      <div className="flex min-w-[200px] flex-col">
                        <span className="font-mono text-sm font-bold">
                          {f.legs.map((l) => l.carrier).join(' · ')}
                          <span className="ml-2 font-normal opacity-70">
                            {f.legs[0].from}{f.legs.slice(1).map((l) => ` → ${l.from}`).join('')} → {f.legs[f.legs.length - 1].to}
                          </span>
                        </span>
                        <span className="font-mono text-xs opacity-70">
                          {f.date ?? f.dep_local.slice(0, 10)} · {f.dep_local.slice(11)}
                          {f.arr_local ? ` → ${f.arr_local.slice(11)}${nextDay ? ' +1' : ''}` : ''}
                          {f.duration ? ` · ${fmtDuration(f.duration)}` : ''}
                          {f.n_stops > 0 ? ` · ${f.n_stops} stop${f.n_stops > 1 ? 's' : ''}` : ' · nonstop'}
                        </span>
                      </div>
                      <span className="font-mono text-sm" style={{ color: pctColor(f.worst_leg_percentile) }}>
                        {f.total_t_co2e.toFixed(1)} t
                      </span>
                      {dt !== null && dt < 0 && (
                        <span className="font-mono text-xs" style={{ color: '#66C2A5' }}>
                          {dt.toFixed(0)} t vs yours
                        </span>
                      )}
                      {f.price_usd > 0 && <span className="ml-auto font-mono text-sm opacity-80">${f.price_usd.toFixed(0)}</span>}
                      {f.aircraft_estimated && <span className="text-[10px] italic opacity-50">ac est.</span>}
                    </div>
                  );
                })}
                {flights.length > 5 && (
                  <p className="text-xs opacity-60">
                    {flights.length - 5} more options in this window — the five shown produce the least contrail warming.
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-4 max-w-[620px] text-sm italic opacity-70">
            A climatological expectation from schedule information alone — not a
            weather forecast. Percentile is relative to 22M scheduled commercial
            flights flown in 2021; flights in the worst decile account for roughly
            60% of positive contrail forcing. Estimates are per flight: for a
            connecting journey, score each leg.
          </p>
        </div>
      )}
    </div>
  );
}
