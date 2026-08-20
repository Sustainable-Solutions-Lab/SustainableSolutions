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
  expected_co2e_t_per_flight: number;
  hour_curve?: HourPoint[];
  error?: string;
};

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

function HourCurve({ curve, selHourLocal }: { curve: HourPoint[]; selHourLocal: number }) {
  const W = 640;
  const H = 180;
  const padL = 34;
  const padB = 26;
  const pts = [...curve].sort((a, b) => a.hour_local - b.hour_local);
  const x = (h: number) => padL + (h / 24) * (W - padL - 8);
  const y = (p: number) => 8 + (1 - p / 100) * (H - padB - 8);
  const path = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.hour_local).toFixed(1)},${y(d.percentile).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Predicted contrail-forcing percentile by local departure hour" style={{ width: '100%', height: 'auto' }}>
      <rect x={padL} y={y(100)} width={W - padL - 8} height={y(90) - y(100)} fill="#9E0142" opacity={0.08} />
      <line x1={padL} x2={W - 8} y1={y(90)} y2={y(90)} stroke="#9E0142" strokeDasharray="4 3" strokeWidth={1} opacity={0.6} />
      <text x={W - 10} y={y(90) - 4} textAnchor="end" fontSize={10} fill="#9E0142" fontFamily="var(--font-mono, monospace)">
        top-10% threshold
      </text>
      {[0, 25, 50, 75, 100].map((p) => (
        <text key={p} x={padL - 6} y={y(p) + 3} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.55} fontFamily="var(--font-mono, monospace)">{p}</text>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.55} fontFamily="var(--font-mono, monospace)">
          {String(h).padStart(2, '0')}:00
        </text>
      ))}
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.8} />
      {pts.map((d) => (
        <circle key={d.hour_utc} cx={x(d.hour_local)} cy={y(d.percentile)} r={Math.abs(d.hour_local - selHourLocal) < 0.5 ? 5 : 2.5} fill={pctColor(d.percentile)} stroke={Math.abs(d.hour_local - selHourLocal) < 0.5 ? 'currentColor' : 'none'} strokeWidth={1.2} />
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

  useEffect(() => {
    fetch(`${API}?meta=1`)
      .then((r) => r.json())
      .then((m) => setGlobalTypes((m.aircraft ?? []).map((a: { icao: string }) => a.icao)))
      .catch(() => setGlobalTypes(['B738', 'A320', 'B789', 'A359', 'B77W']));
    fetch('/tools/contrails-airports.json')
      .then((r) => r.json())
      .then(setAirports)
      .catch(() => setAirports([]));
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
      const q = new URLSearchParams({ origin, dest, date, time, aircraft, curve: '1' });
      const r = await fetch(`${API}?${q}`);
      const body: ScoreResult = await r.json();
      if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const selHourLocal = Number(time.split(':')[0]) + Number(time.split(':')[1] ?? 0) / 60;

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

          {result.hour_curve && (
            <figure className="mt-6">
              <figcaption className="mb-2 font-mono text-[11px] uppercase tracking-wider opacity-60">
                Same route and date, by local departure hour
              </figcaption>
              <HourCurve curve={result.hour_curve} selHourLocal={selHourLocal} />
            </figure>
          )}

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
