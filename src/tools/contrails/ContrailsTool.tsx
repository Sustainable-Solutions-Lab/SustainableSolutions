/**
 * Contrails booking tool — v3.
 *
 * Left rail holds every input (route OR flight-number mode, date, time,
 * aircraft, rebooking flexibility) behind a single "Assess contrails"
 * action that scores the flight and fetches the five least-warming real
 * alternatives in one pass. Right column: headline percentile, the
 * same-route aircraft comparison, a hover-linked great-circle map
 * (thick arc = your flight, thin solid arcs = alternatives), and
 * comparison cards showing deltas vs the selected flight (contrail
 * tonnes, duration parenthetical, stops, price).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import ToolShell from '../_shell/ToolShell';

type FlightLeg = {
  from: string; to: string; dep_local: string; carrier: string;
  aircraft: string; percentile: number; t_co2e: number; kg_per_pax?: number;
  from_ll?: [number, number]; to_ll?: [number, number];
};

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
  expected_co2e_kg_per_pax: number;
  pax_assumed?: number;
  est_duration_h?: number;
  aircraft_comparison?: { icao: string; share: number; percentile: number }[];
  error?: string;
};

type FlightOption = {
  legs: FlightLeg[]; n_stops: number; dep_local: string; arr_local?: string;
  duration?: string; airline?: string; airline_logo?: string;
  total_t_co2e: number; total_kg_per_pax: number; worst_leg_percentile: number;
  aircraft_estimated: boolean; price_usd: number; currency?: string; date?: string;
};

type RouteInfo = {
  known: boolean;
  n_flights: number;
  aircraft: { icao: string; share: number }[];
};

// [iata, city, name, country]
type AirportRow = [string, string, string, string];

const API = '/api/contrails';
// bump when the API response schema changes: busts stale CDN-cached responses
const SV = 'sv=3';

function pctColor(p: number): string {
  if (p >= 90) return '#9E0142';
  if (p >= 75) return '#D53E4F';
  if (p >= 50) return '#FDAE61';
  if (p >= 25) return '#ABDDA4';
  return '#66C2A5';
}

function durationMin(iso?: string): number | null {
  const m = iso?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function fmtDelta(min: number, kind: 'dep' | 'dur'): string {
  const a = Math.abs(min);
  if (a < 15) return kind === 'dep' ? 'similar departure' : 'similar duration';
  const t = fmtMin(a);
  if (kind === 'dep') return `departs ${t} ${min < 0 ? 'earlier' : 'later'}`;
  return `${t} ${min < 0 ? 'shorter' : 'longer'}`;
}

function fmtKg(kg: number): string {
  return `${Math.round(kg)} kg${kg < 0 ? ' (cooling)' : ''}`;
}

function fmtMin(min: number): string {
  const h = Math.floor(Math.abs(min) / 60);
  const mm = Math.round(Math.abs(min) % 60);
  return h > 0 ? `${h}h${mm ? ` ${mm}m` : ''}` : `${mm}m`;
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
        className="rounded-sm border border-rule bg-paper px-2 py-1.5"
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

function WorldIdle({ land }: { land: [number, number][][] | null }) {
  const W = 680;
  const H = 260;
  const px = (lon: number) => ((lon + 180) / 360) * W;
  const py = (lat: number) => ((78 - lat) / (78 + 60)) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map" style={{ width: '100%', height: 'auto' }}>
      <rect x={0} y={0} width={W} height={H} fill="var(--paper-2, #f6f6f2)" />
      {land && land.map((poly, i) => (
        <path
          key={i}
          d={poly.map(([lon, lat], j) => `${j ? 'L' : 'M'}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(' ')}
          fill="var(--paper-3, #eaeae2)"
          stroke="var(--rule, #d8d8ce)"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}

type ArcPart = { segs: [number, number][][]; bow: number };
type MapArc = { key: string; parts: ArcPart[]; segs: [number, number][][]; color: string; width: number };

function FlightMap({
  main,
  mainColor,
  alts,
  land,
  hoverKey,
  onHover,
  labels,
}: {
  main: { from: [number, number]; to: [number, number]; codes: [string, string] };
  mainColor: string;
  alts: { key: string; legs: FlightLeg[]; color: string }[];
  land: [number, number][][] | null;
  hoverKey: string | null;
  onHover: (k: string | null) => void;
  labels: Record<string, { top: string; sub: string }>;
}) {
  const arcs: MapArc[] = [];
  const vias: { key: string; ll: [number, number]; code: string; color: string }[] = [];
  // Same-route arcs would overlay exactly; give duplicates a small
  // screen-space bow (alternating sides, growing per duplicate) so each
  // remains individually hoverable. The selected flight keeps the true
  // great circle.
  const seen = new Map<string, number>();
  const bowFor = (from: string, to: string) => {
    const k = from < to ? `${from}>${to}` : `${to}>${from}`;
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    return c === 0 ? 0 : (c % 2 ? 1 : -1) * Math.ceil(c / 2) * 8;
  };
  bowFor(main.codes[0], main.codes[1]);          // main claims the true arc
  for (const alt of alts) {
    const parts: ArcPart[] = [];
    for (const [li, l] of alt.legs.entries()) {
      if (l.from_ll && l.to_ll) {
        parts.push({ segs: gcPoints(l.from_ll, l.to_ll), bow: bowFor(l.from, l.to) });
      }
      if (li > 0 && l.from_ll) vias.push({ key: alt.key, ll: l.from_ll, code: l.from, color: alt.color });
    }
    if (parts.length) {
      arcs.push({ key: alt.key, parts, segs: parts.flatMap((pp) => pp.segs), color: alt.color, width: 1.2 });
    }
  }
  arcs.push({ key: 'main', parts: [{ segs: gcPoints(main.from, main.to), bow: 0 }],
              segs: gcPoints(main.from, main.to), color: mainColor, width: 4.2 });

  const pts = arcs.flatMap((a) => a.segs.flat());
  let latMin = Math.min(...pts.map((p) => p[0])) - 5;
  let latMax = Math.max(...pts.map((p) => p[0])) + 5;
  let lonMin = Math.min(...pts.map((p) => p[1])) - 5;
  let lonMax = Math.max(...pts.map((p) => p[1])) + 5;
  latMin = Math.max(-85, latMin); latMax = Math.min(88, latMax);
  // Fixed, thin canvas: instead of letting tall routes grow the map,
  // widen whichever window dimension is short so the aspect always fits.
  const W = 680;
  const H = 240;
  const cosc = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180) || 1;
  const targetLatPerLon = (H / W) * cosc;
  const latR = latMax - latMin;
  const lonR = lonMax - lonMin;
  if (latR / lonR > targetLatPerLon) {
    const need = latR / targetLatPerLon;
    const cx0 = (lonMin + lonMax) / 2;
    lonMin = cx0 - need / 2; lonMax = cx0 + need / 2;
  } else {
    const need = lonR * targetLatPerLon;
    let cy0 = (latMin + latMax) / 2;
    cy0 = Math.min(Math.max(cy0, -85 + need / 2), 88 - need / 2);
    latMin = cy0 - need / 2; latMax = cy0 + need / 2;
  }
  const px = (lon: number) => ((lon - lonMin) / (lonMax - lonMin)) * W;
  const py = (lat: number) => ((latMax - lat) / (latMax - latMin)) * H;
  const path = (sg: [number, number][]) => sg.map((p, i) => `${i ? 'L' : 'M'}${px(p[1]).toFixed(1)},${py(p[0]).toFixed(1)}`).join(' ');
  const pathBow = (sg: [number, number][], bow: number) => {
    const pts2 = sg.map((p) => [px(p[1]), py(p[0])]);
    if (!bow || pts2.length < 3) return path(sg);
    const n = pts2.length;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = pts2[Math.max(0, i - 1)];
      const b = pts2[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy) || 1;
      const o = bow * Math.sin((Math.PI * i) / (n - 1));
      out.push([pts2[i][0] - (dy / L) * o, pts2[i][1] + (dx / L) * o]);
    }
    return out.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route map ${main.codes[0]} to ${main.codes[1]}`} style={{ width: '100%', height: 'auto' }}>
      <rect x={0} y={0} width={W} height={H} fill="var(--paper-2, #f6f6f2)" />
      {land && land.map((poly, i) => (
        <path key={i} d={path(poly.map(([x, y]) => [y, x] as [number, number]))} fill="var(--paper-3, #eaeae2)" stroke="var(--rule, #d8d8ce)" strokeWidth={0.5} />
      ))}
      {arcs.map((a) =>
        a.parts.flatMap((part, pi) =>
          part.segs.map((sg, j) => {
            const hovered = hoverKey === a.key;
            const dimmed = hoverKey !== null && !hovered;
            const d = pathBow(sg, part.bow);
            return (
              <g key={`${a.key}-${pi}-${j}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hovered ? a.width + 1.8 : a.width}
                  strokeLinecap="round"
                  opacity={dimmed ? 0.35 : 1}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => onHover(a.key)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => onHover(hovered ? null : a.key)}
                />
              </g>
            );
          }),
        ),
      )}
      {vias.map((v, i) => {
        const hovered = hoverKey === v.key;
        const dimmed = hoverKey !== null && !hovered;
        return (
          <g key={`via-${i}`} pointerEvents="none" opacity={dimmed ? 0.35 : 1}>
            <circle cx={px(v.ll[1])} cy={py(v.ll[0])} r={hovered ? 4.5 : 3.5} fill={v.color} stroke="var(--paper, #fff)" strokeWidth={1} />
            {hovered && (
              <text x={px(v.ll[1])} y={py(v.ll[0]) - 7} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono, monospace)" fill="currentColor">
                {v.code}
              </text>
            )}
          </g>
        );
      })}

      {(() => {
        // percentile color bar, bottom-left
        const segsBar = [
          { c: '#66C2A5', from: 0, to: 25 },
          { c: '#ABDDA4', from: 25, to: 50 },
          { c: '#FDAE61', from: 50, to: 75 },
          { c: '#D53E4F', from: 75, to: 90 },
          { c: '#9E0142', from: 90, to: 100 },
        ];
        const bw = 150;
        const bx0 = (W - bw) / 2;
        const by0 = H - 30;
        return (
          <g pointerEvents="none">
            <rect x={bx0 - 6} y={by0 - 16} width={bw + 12} height={40} rx={3} fill="var(--paper, #fff)" opacity={0.82} />
            <text x={bx0} y={by0 - 5} fontSize={9} fontFamily="var(--font-mono, monospace)" fill="currentColor" opacity={0.7}>
              WARMING PERCENTILE
            </text>
            {segsBar.map((sb) => (
              <rect key={sb.c} x={bx0 + (sb.from / 100) * bw} y={by0} width={((sb.to - sb.from) / 100) * bw} height={7} fill={sb.c} />
            ))}
            {[0, 25, 50, 75, 90, 100].map((t) => (
              <text key={t} x={bx0 + (t / 100) * bw} y={by0 + 17} textAnchor="middle" fontSize={8.5} fontFamily="var(--font-mono, monospace)" fill="currentColor" opacity={0.7}>
                {t}
              </text>
            ))}
          </g>
        );
      })()}
      {[{ ll: main.from, code: main.codes[0] }, { ll: main.to, code: main.codes[1] }].map((e) => (
        <g key={e.code}>
          <circle cx={px(e.ll[1])} cy={py(e.ll[0])} r={4} fill="currentColor" />
          <text x={px(e.ll[1])} y={py(e.ll[0]) - 8} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono, monospace)" fill="currentColor" fontWeight={700}>
            {e.code}
          </text>
        </g>
      ))}
      {(() => {
        // hover chip pinned to the hovered arc's midpoint: flight facts
        // on the first line, plain-language city chain on the second
        const a = arcs.find((x) => x.key === hoverKey);
        const label = hoverKey ? labels[hoverKey] : undefined;
        if (!a || !label) return null;
        const all = a.segs.flat();
        const mid = all[Math.floor(all.length / 2)];
        const cx = px(mid[1]);
        const cy = py(mid[0]);
        const w = Math.max(label.top.length, label.sub.length) * 6.2 + 14;
        const bx = Math.min(Math.max(cx - w / 2, 4), W - w - 4);
        const by = cy > 52 ? cy - 44 : cy + 14;
        return (
          <g pointerEvents="none">
            <circle cx={cx} cy={cy} r={4} fill={a.color} stroke="var(--paper, #fff)" strokeWidth={1.5} />
            <rect x={bx} y={by} width={w} height={34} rx={3} fill="var(--paper, #fff)" stroke={a.color} strokeWidth={1} />
            <text x={bx + 7} y={by + 14} fontSize={10.5} fontFamily="var(--font-mono, monospace)" fill="currentColor">
              {label.top}
            </text>
            <text x={bx + 7} y={by + 27} fontSize={10} fontFamily="var(--font-mono, monospace)" fill="currentColor" opacity={0.75}>
              {label.sub}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

export default function ContrailsTool() {
  const [mode, setMode] = useState<'route' | 'flightno'>('flightno');
  const [flightNo, setFlightNo] = useState('UA 875');
  const [origin, setOrigin] = useState('SFO');
  const [dest, setDest] = useState('LHR');
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 30 * 86400e3);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState('21:30');
  const [aircraft, setAircraft] = useState('B789');
  const [flexH, setFlexH] = useState('24');
  const [globalTypes, setGlobalTypes] = useState<string[]>([]);
  const [airports, setAirports] = useState<AirportRow[]>([]);
  const [land, setLand] = useState<[number, number][][] | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [flights, setFlights] = useState<FlightOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flightsNote, setFlightsNote] = useState<string | null>(null);
  const [altsBusy, setAltsBusy] = useState(false);
  const [sortMode, setSortMode] = useState<'warming' | 'value' | 'time'>('warming');
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [origMatch, setOrigMatch] = useState<FlightOption | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // Mobile controls drawer (chrome lives in ToolShell); closes itself
  // whenever an assessment kicks off so the results are visible.
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}?meta=1&${SV}`)
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

  // Route metadata: preselect the most common aircraft for the pair
  useEffect(() => {
    if (mode !== 'route' || origin.length !== 3 || dest.length !== 3 || origin === dest) {
      setRoute(null);
      return;
    }
    let stale = false;
    fetch(`${API}?route=1&origin=${origin}&dest=${dest}&${SV}`)
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
  }, [origin, dest, mode]);

  const routeTypes = useMemo(
    () => new Map((route?.aircraft ?? []).map((a) => [a.icao, a.share])),
    [route],
  );
  const aircraftOptions = useMemo(() => {
    const onRoute = route?.known ? [...routeTypes.keys()] : [];
    const rest = globalTypes.filter((t) => !routeTypes.has(t));
    return { onRoute, rest };
  }, [route, routeTypes, globalTypes]);

  async function assess() {
    setBusy(true);
    setError(null);
    setFlights(null);
    setFlightsNote(null);
    setResolvedLabel(null);
    setOrigMatch(null);
    setHoverKey(null);
    setPanelOpen(false);
    try {
      let o = origin, d = dest, t = time, ac = aircraft;
      if (mode === 'flightno') {
        const rr = await fetch(`${API}?flightno=${encodeURIComponent(flightNo)}&${SV}`);
        const rb = await rr.json();
        if (!rb.found) throw new Error(`Flight ${flightNo.toUpperCase().replace(/\s/g, '')} not found in our 2019–2021 schedules — try route mode.`);
        o = rb.origin; d = rb.dest; t = rb.time_local;
        if (rb.aircraft) ac = rb.aircraft;
        setOrigin(o); setDest(d); setTime(t); if (rb.aircraft) setAircraft(rb.aircraft);
        setResolvedLabel(`${flightNo.toUpperCase().replace(/\s/g, '')} · typical schedule from ${rb.n_observed} observed flights`);
      }
      const q = new URLSearchParams({ origin: o, dest: d, date, time: t, aircraft: ac });
      const r = await fetch(`${API}?${q}&${SV}`);
      const body: ScoreResult = await r.json();
      if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
      setResult(body);
      setBusy(false);
      // alternatives in the same action (slower — separate indicator)
      setAltsBusy(true);
      try {
        const fh = Number(flexH) > 0 ? `&flex_h=${Number(flexH)}&time=${t}` : '';
        const fr = await fetch(`${API}?flights=1&origin=${o}&dest=${d}&date=${date}${fh}&${SV}`);
        if (fr.status === 503) setFlightsNote('Flight search not yet connected for this deployment.');
        else {
          const fb = await fr.json();
          if (fr.ok && !fb.error) {
            const list: FlightOption[] = fb.flights ?? [];
            // guess which bookable itinerary IS the user's flight:
            // nonstop, same pair, departure within 100 min of selection
            const selMin = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
            let best: FlightOption | null = null;
            let bestGap = 101;
            for (const f of list) {
              if (f.n_stops !== 0 || f.legs[0].from !== o || f.legs[0].to !== d) continue;
              if ((f.date ?? f.dep_local.slice(0, 10)) !== date) continue;
              const m = Number(f.dep_local.slice(11, 13)) * 60 + Number(f.dep_local.slice(14, 16));
              const gap = Math.abs(m - selMin);
              if (gap < bestGap) { bestGap = gap; best = f; }
            }
            setOrigMatch(best);
            setFlights(best ? list.filter((f) => f !== best) : list);
          } else setFlightsNote('Flight search failed.');
        }
      } finally {
        setAltsBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setBusy(false);
    }
  }

  // Assess the default flight on load so the map opens populated
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    void assess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const origPrice = origMatch && origMatch.price_usd > 0 ? origMatch.price_usd : null;
  const estMin = result?.est_duration_h ? result.est_duration_h * 60 : null;
  const baselineMin = (origMatch && durationMin(origMatch.duration)) ?? estMin;
  // value sort needs a real fare for the user's own flight
  useEffect(() => {
    if (sortMode === 'value' && origPrice === null) setSortMode('warming');
  }, [sortMode, origPrice]);
  const pool = useMemo(
    () => (flights ?? []).filter((f) => !nonstopOnly || f.n_stops === 0),
    [flights, nonstopOnly],
  );
  // only genuinely lower-warming options count as alternatives
  const betterPool = useMemo(
    () => (result ? pool.filter((f) => f.total_kg_per_pax < result.expected_co2e_kg_per_pax - 0.5) : []),
    [pool, result],
  );
  const topAlts = useMemo(() => {
    const list = [...betterPool];
    if (result && sortMode === 'value' && origPrice !== null) {
      const value = (f: FlightOption) => {
        const avoided = result.expected_co2e_kg_per_pax - f.total_kg_per_pax;
        if (avoided <= 0 || f.price_usd <= 0) return -Infinity;
        return avoided / Math.max(f.price_usd - origPrice, 1);
      };
      list.sort((a, b) => value(b) - value(a));
    } else if (result && sortMode === 'time' && baselineMin !== null) {
      const value = (f: FlightOption) => {
        const avoided = result.expected_co2e_kg_per_pax - f.total_kg_per_pax;
        const dm = durationMin(f.duration);
        if (avoided <= 0 || dm === null) return -Infinity;
        return avoided / Math.max((dm - baselineMin) / 60, 0.1);
      };
      list.sort((a, b) => value(b) - value(a));
    }
    return list.slice(0, 5);
  }, [betterPool, sortMode, result, origPrice, baselineMin]);
  const cityOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const [iata, city] of airports) m.set(iata, city);
    return (code: string) => m.get(code) ?? code;
  }, [airports]);
  const mapLabels: Record<string, { top: string; sub: string }> = useMemo(() => {
    const out: Record<string, { top: string; sub: string }> = {};
    if (result) {
      out.main = {
        top: `Your flight · ${fmtKg(result.expected_co2e_kg_per_pax)}/passenger`,
        sub: `${cityOf(result.origin)} → ${cityOf(result.dest)}`,
      };
    }
    topAlts.forEach((f, i) => {
      const chain = [f.legs[0].from, ...f.legs.map((l) => l.to)];
      out[`alt${i}`] = {
        top: `${f.legs.map((l) => l.carrier).join('·')} · ${fmtKg(f.total_kg_per_pax)}/passenger${f.price_usd > 0 ? ` · $${f.price_usd.toFixed(0)}` : ''}`,
        sub: chain.map(cityOf).join(' → '),
      };
    });
    return out;
  }, [topAlts, result, cityOf]);

  return (
    <ToolShell
      eyebrow="Prototype · schedule-only model"
      title="Predicting contrails at booking"
      summary="Predicts a flight's contrail climate impact from schedule information alone, and finds lower-warming bookable alternatives."
      mainScroll
      drawerOpen={panelOpen}
      onDrawerOpenChange={setPanelOpen}
      rail={
        <>
        <div className="flex gap-1 font-mono text-[11px] uppercase tracking-wider">
          {(['flightno', 'route'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-sm border px-2 py-1 ${mode === m ? 'border-rule-strong bg-paper-3 font-bold' : 'border-rule opacity-60'}`}
            >
              {m === 'route' ? 'Route' : 'Flight #'}
            </button>
          ))}
        </div>

        {mode === 'flightno' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Flight number</span>
            <input
              className="rounded-sm border border-rule bg-paper px-2 py-1.5 font-mono uppercase"
              value={flightNo}
              placeholder="UA 875"
              onChange={(e) => setFlightNo(e.target.value)}
            />
            <span className="text-[11px] italic opacity-60">Route, time and aircraft filled from 2019–2021 schedules.</span>
          </label>
        ) : (
          <>
            <AirportInput label="From" value={`${origin} — San Francisco`} onSelect={setOrigin} airports={airports} />
            <AirportInput label="To" value={`${dest} — London`} onSelect={setDest} airports={airports} />
          </>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Date</span>
          <input type="date" className="rounded-sm border border-rule bg-paper px-2 py-1.5" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {mode === 'route' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Local departure</span>
              <input type="time" className="rounded-sm border border-rule bg-paper px-2 py-1.5" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Aircraft</span>
              <select className="rounded-sm border border-rule bg-paper px-2 py-1.5" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
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
          </>
        )}

        <label className="flex items-baseline gap-1 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">Flexibility ±</span>
          <input
            type="number"
            min={1}
            max={72}
            value={flexH}
            onChange={(e) => setFlexH(e.target.value)}
            className="w-16 rounded-sm border border-rule bg-paper px-1.5 py-1"
          />
          <span className="text-xs opacity-60">hours</span>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={nonstopOnly}
            onChange={(e) => setNonstopOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--cardinal,#8C1515)]"
          />
          <span>Nonstop alternatives only</span>
        </label>

        <button
          type="button"
          onClick={() => void assess()}
          disabled={busy || (mode === 'flightno' && flightNo.trim().length < 3)}
          className="mt-1 rounded-sm border border-rule-strong bg-paper-3 px-4 py-2 text-sm font-bold hover:border-ink disabled:opacity-50"
        >
          {busy ? 'Assessing…' : 'Assess contrails'}
        </button>

        {route && !route.known && mode === 'route' && origin !== dest && (
          <p className="text-xs opacity-70">
            No direct flights between {origin} and {dest} in our 2019–2021
            database — the estimate treats this as a hypothetical nonstop.
          </p>
        )}
        {error && <p className="font-mono text-xs text-cardinal">{error}</p>}
        </>
      }
    >
      <style>{`
        .contrail-shimmer { position: relative; overflow: hidden; }
        .contrail-shimmer::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(24,24,56,0.10), transparent);
          animation: contrail-shimmer-sweep 1.4s ease-in-out infinite;
        }
        [data-theme='dark'] .contrail-shimmer::after {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.09), transparent);
        }
        @keyframes contrail-shimmer-sweep { 100% { transform: translateX(100%); } }
      `}</style>
      <div className="p-3.5 md:p-5">
        {!result && (
          <div>
            <p className="mt-2 text-sm italic opacity-60">
              Choose a flight on the left and assess it to see its predicted
              contrail warming, the aircraft lever on its route, and
              lower-warming bookable alternatives.
            </p>
            <div className="mt-4">
              <WorldIdle land={land} />
            </div>
          </div>
        )}

        {result && (
          <>
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
                  {Math.round(result.expected_co2e_kg_per_pax)}{' '}
                  <span className="text-base opacity-70">
                    kg CO₂-eq / passenger{result.expected_co2e_kg_per_pax < 0 ? ' (cooling)' : ''}
                  </span>
                </div>
                <span className="font-mono text-[11px] opacity-50">
                  aircraft total ≈ {result.expected_co2e_t_per_flight.toFixed(1)} t · assumes {Math.round(result.pax_assumed ?? 140)} passengers
                </span>
              </div>
              {result.flagged_top10 && (
                <div className="rounded-sm border border-cardinal px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-cardinal">
                  flagged: worst 10% of flights
                </div>
              )}
            </div>

            {result.aircraft_comparison && result.aircraft_comparison.length > 1 && (
              <div className="mt-4">
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
                  <p className="mt-2 max-w-[640px] text-sm opacity-80">
                    Aircraft choice matters a lot on this route: newer types have
                    cleaner-burning engines that emit far less soot and typically
                    seed much weaker contrails at the same time and place.
                  </p>
                )}
              </div>
            )}

            {result.origin_ll && result.dest_ll && (
              <figure className="mt-5">
                <FlightMap
                  main={{ from: result.origin_ll, to: result.dest_ll, codes: [result.origin, result.dest] }}
                  mainColor={pctColor(result.percentile)}
                  alts={topAlts.map((f, i) => ({ key: `alt${i}`, legs: f.legs, color: pctColor(f.worst_leg_percentile) }))}
                  land={land}
                  hoverKey={hoverKey}
                  onHover={setHoverKey}
                  labels={mapLabels}
                />
              </figure>
            )}

            {/* original-flight card */}
            <div
              className={`mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border-2 px-3 py-2 ${hoverKey === 'main' ? 'border-ink' : 'border-rule-strong'}`}
              onMouseEnter={() => setHoverKey('main')}
              onClick={() => setHoverKey((k) => (k === 'main' ? null : 'main'))}
              onMouseLeave={() => setHoverKey(null)}
            >
              {origMatch?.airline_logo ? (
                <img src={origMatch.airline_logo} alt={origMatch.airline ?? ''} width={26} height={26} loading="lazy" />
              ) : (
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: pctColor(result.percentile) }} />
              )}
              <div className="flex min-w-[200px] flex-col">
                <span className="font-mono text-sm font-bold">
                  {resolvedLabel
                    ? resolvedLabel.split(' · ')[0]
                    : origMatch
                      ? `Your flight · likely ${origMatch.legs[0].carrier}`
                      : 'Your flight'}
                  <span className="ml-2 font-normal opacity-70">{result.origin} → {result.dest}</span>
                  <span className="ml-3 font-normal" style={{ color: pctColor(result.percentile) }}>
                    {fmtKg(result.expected_co2e_kg_per_pax)}
                  </span>
                </span>
                <span className="font-mono text-xs opacity-70">
                  {date} · {origMatch ? origMatch.dep_local.slice(11) : time}
                  {origMatch?.arr_local ? ` → ${origMatch.arr_local.slice(11)}` : ''}
                  {origMatch && durationMin(origMatch.duration) !== null
                    ? ` · ${fmtMin(durationMin(origMatch.duration) as number)}`
                    : estMin ? ` · ~${fmtMin(estMin)}` : ''}
                  {' · '}{result.aircraft}
                  {!result.route_in_corpus ? ' · hypothetical nonstop' : ''}
                </span>
              </div>
              {origPrice !== null && <span className="ml-auto font-mono text-sm opacity-80">${origPrice.toFixed(0)}</span>}
              {resolvedLabel && <span className="text-[11px] italic opacity-60">{resolvedLabel.split(' · ')[1]}</span>}
            </div>

            {flightsNote && <p className="mt-3 text-sm opacity-70">{flightsNote}</p>}
            {flights && flights.length === 0 && (
              <p className="mt-3 text-sm opacity-70">No bookable itineraries found in this window.</p>
            )}
            {flights && flights.length > 0 && pool.length === 0 && (
              <p className="mt-3 text-sm opacity-70">
                No nonstop alternatives in this window — uncheck "Nonstop
                alternatives only" to see connecting options.
              </p>
            )}
            {result && pool.length > 0 && betterPool.length === 0 && (
              <p className="mt-3 max-w-[640px] rounded-sm border px-3 py-2 text-sm" style={{ borderColor: '#66C2A5' }}>
                Good news — your chosen flight is predicted to be the
                lowest-warming option within ±{flexH || 24} h
                {nonstopOnly ? ' among nonstops' : ''} ({pool.length}{' '}
                alternative{pool.length > 1 ? 's' : ''} checked).
              </p>
            )}

            {altsBusy && (
              <div className="mt-3 flex flex-col gap-2" aria-live="polite">
                <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">
                  Searching bookable flights within ±{flexH || 24} h…
                </span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="contrail-shimmer h-12 rounded-sm border border-rule bg-paper-2" />
                ))}
                <p className="text-xs italic opacity-60">
                  Live schedule search takes up to a minute — results appear here.
                </p>
              </div>
            )}
            {topAlts.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">
                    Alternatives within ±{flexH || 24} h
                  </span>
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as 'warming' | 'value' | 'time')}
                    className="rounded-sm border border-rule bg-paper-2 px-1.5 py-0.5 font-mono text-[11px]"
                    aria-label="Sort alternatives"
                  >
                    <option value="warming">least warming</option>
                    <option value="value" disabled={origPrice === null}>
                      warming avoided per ${origPrice === null ? ' (needs your fare)' : ''}
                    </option>
                    <option value="time">warming avoided per added travel time</option>
                  </select>
                </div>
                {topAlts.map((f, i) => {
                  const dt = f.total_kg_per_pax - result.expected_co2e_kg_per_pax;
                  const altMin = durationMin(f.duration);
                  const dDur = altMin !== null && baselineMin !== null ? altMin - baselineMin : null;
                  const baseDep = origMatch ? origMatch.dep_local : `${date}T${time}`;
                  const dDep = (new Date(f.dep_local).getTime() - new Date(baseDep).getTime()) / 60000;
                  const nextDay = f.arr_local && f.dep_local.slice(0, 10) !== f.arr_local.slice(0, 10);
                  const altAc = [...new Set(f.legs.map((l) => l.aircraft))].join('/');
                  const key = `alt${i}`;
                  return (
                    <div
                      key={i}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border bg-paper-2 px-3 py-2 ${hoverKey === key ? 'border-ink' : 'border-rule'}`}
                      onMouseEnter={() => setHoverKey(key)}
                      onClick={() => setHoverKey((k) => (k === key ? null : key))}
                      onMouseLeave={() => setHoverKey(null)}
                    >
                      {f.airline_logo ? (
                        <img src={f.airline_logo} alt={f.airline ?? ''} width={26} height={26} loading="lazy" />
                      ) : (
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: pctColor(f.worst_leg_percentile) }} />
                      )}
                      <div className="flex min-w-[220px] flex-col">
                        <span className="font-mono text-sm font-bold">
                          {f.legs.map((l) => l.carrier).join(' · ')}
                          <span className="ml-2 font-normal opacity-70">
                            {f.legs[0].from}{f.legs.slice(1).map((l) => ` → ${l.from}`).join('')} → {f.legs[f.legs.length - 1].to}
                          </span>
                          <span className="ml-3 font-normal" style={{ color: pctColor(f.worst_leg_percentile) }}>
                            {fmtKg(f.total_kg_per_pax)}
                          </span>
                        </span>
                        <span className="font-mono text-xs opacity-70">
                          {f.date ?? f.dep_local.slice(0, 10)} · {f.dep_local.slice(11)}
                          {f.arr_local ? ` → ${f.arr_local.slice(11)}${nextDay ? ' +1' : ''}` : ''}
                          {altMin !== null ? ` · ${fmtMin(altMin)}` : ''}
                          {f.n_stops > 0 ? ` · ${f.n_stops} stop${f.n_stops > 1 ? 's' : ''}` : ' · nonstop'}
                        </span>
                      </div>
                      <div className="ml-auto flex flex-col items-end gap-0.5 text-right font-mono text-[11px]">
                        <span style={{ color: '#66C2A5' }}>{dt.toFixed(0)} kg CO₂e vs yours</span>
                        {Number.isFinite(dDep) && <span className="opacity-75">{fmtDelta(dDep, 'dep')}</span>}
                        {dDur !== null && (
                          <span className="opacity-75">
                            {fmtDelta(dDur, 'dur')}
                            {f.n_stops > 0 ? ` (+${f.n_stops} stop${f.n_stops > 1 ? 's' : ''})` : ''}
                          </span>
                        )}
                        {dDur === null && f.n_stops > 0 && (
                          <span className="opacity-75">+{f.n_stops} stop{f.n_stops > 1 ? 's' : ''}</span>
                        )}
                        <span className="opacity-75">
                          {altAc === result.aircraft ? `same aircraft (${altAc})` : `${altAc} vs your ${result.aircraft}`}
                          {f.aircraft_estimated ? '*' : ''}
                        </span>
                        {f.price_usd > 0 && (
                          <span className="opacity-75">
                            ${f.price_usd.toFixed(0)}
                            {origPrice !== null ? ` (${f.price_usd >= origPrice ? '+' : '−'}$${Math.abs(f.price_usd - origPrice).toFixed(0)})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {betterPool.length > 5 && (
                  <p className="text-xs opacity-60">
                    {betterPool.length - 5} more lower-warming options in this window — the five shown
                    {sortMode === 'warming'
                      ? ' are predicted to produce the least contrail warming.'
                      : sortMode === 'value'
                        ? ' are predicted to avoid the most warming per dollar above your fare.'
                        : ' are predicted to avoid the most warming per hour of additional travel time.'}
                  </p>
                )}
              </div>
            )}

            <p className="mt-5 max-w-[640px] text-sm italic opacity-70">
              A climatological expectation from schedule information alone — not a
              weather forecast. Percentile is relative to 22M scheduled commercial
              flights flown in 2021. Warming figures are per passenger, using
              typical passenger counts for each leg's aircraft; connecting
              itineraries sum their legs.
            </p>
          </>
        )}
      </div>
    </ToolShell>
  );
}
