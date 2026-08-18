/**
 * Contrails booking tool — v1 prototype.
 *
 * Schedule-only prediction of a flight's contrail warming, months ahead
 * of departure. The user enters route, date, local departure time, and
 * aircraft; the /api/contrails function scores it against the lab's
 * LEAN+AC model and returns a percentile vs. all 2021 flights plus a
 * 24-hour "when to fly" curve for the same route and date.
 */

import { useEffect, useState } from 'react';

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
  expected_co2e_t_per_flight: number;
  hour_curve?: HourPoint[];
  error?: string;
};

type AircraftMeta = { icao: string; n: number };

const API = '/api/contrails';

function pctColor(p: number): string {
  // Spectral-ish: calm teal for low percentiles → deep red for the worst
  if (p >= 90) return '#9E0142';
  if (p >= 75) return '#D53E4F';
  if (p >= 50) return '#FDAE61';
  if (p >= 25) return '#ABDDA4';
  return '#66C2A5';
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
      {/* top-10% band */}
      <rect x={padL} y={y(100)} width={W - padL - 8} height={y(90) - y(100)} fill="#9E0142" opacity={0.08} />
      <line x1={padL} x2={W - 8} y1={y(90)} y2={y(90)} stroke="#9E0142" strokeDasharray="4 3" strokeWidth={1} opacity={0.6} />
      <text x={W - 10} y={y(90) - 4} textAnchor="end" fontSize={10} fill="#9E0142" fontFamily="var(--font-mono, monospace)">
        top-10% threshold
      </text>
      {[0, 25, 50, 75, 100].map((p) => (
        <g key={p}>
          <text x={padL - 6} y={y(p) + 3} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.55} fontFamily="var(--font-mono, monospace)">{p}</text>
        </g>
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
  const [aircraftList, setAircraftList] = useState<AircraftMeta[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}?meta=1`)
      .then((r) => r.json())
      .then((m) => setAircraftList(m.aircraft ?? []))
      .catch(() => setAircraftList([]));
  }, []);

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
        {[
          { label: 'From', value: origin, set: setOrigin, w: 'uppercase', ph: 'SFO' },
          { label: 'To', value: dest, set: setDest, w: 'uppercase', ph: 'LHR' },
        ].map((f) => (
          <label key={f.label} className="flex flex-col gap-1 text-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider opacity-60">{f.label}</span>
            <input
              className={`rounded-sm border border-rule bg-paper-2 px-2 py-1.5 ${f.w}`}
              value={f.value}
              placeholder={f.ph}
              maxLength={3}
              onChange={(e) => f.set(e.target.value.toUpperCase())}
              required
            />
          </label>
        ))}
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
            {(aircraftList.length ? aircraftList.map((a) => a.icao) : ['B738', 'A320', 'B789', 'A359', 'B77W']).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy} className="col-span-2 rounded-sm border border-rule bg-paper-3 px-4 py-1.5 text-sm hover:border-rule-strong sm:col-span-5">
          {busy ? 'Scoring…' : 'Predict contrail warming'}
        </button>
      </form>

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
            60% of positive contrail forcing.
          </p>
        </div>
      )}
    </div>
  );
}
