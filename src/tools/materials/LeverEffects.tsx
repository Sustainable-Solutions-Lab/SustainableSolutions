/**
 * Two readings the knobs cannot give on their own.
 *
 * LeverEffects: what each assumption is worth, in growth, from one end of its
 * range to the other with everything else left where you put it. This is the
 * efficiency-versus-circularity question answered in the units of the paper's
 * result rather than argued about.
 *
 * RecyclingCeiling: why pushing recovery to the top does less than it looks.
 * Secondary supply is the collection rate times the share of demand that is
 * retiring, and during growth the second term is the binding one.
 */
import { useMemo } from 'react';
import {
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  cagr,
  runModel,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';

const pct = (v: number) => `${v >= 0 ? '+' : ''}${(100 * v).toFixed(2)}%`;

function withIntensity(levers: Levers, keys: IntensityLever[], u: number): Levers {
  const next: Levers = {
    ...levers,
    flowIntensityU: { ...levers.flowIntensityU },
    stockIntensityU: { ...levers.stockIntensityU },
  };
  for (const lever of keys) {
    const spec = INTENSITY_LEVERS[lever];
    for (const k of spec.flows) next.flowIntensityU[k] = u;
    for (const [g, su] of spec.stocks) {
      next.stockIntensityU[g] = { ...next.stockIntensityU[g], [su]: u };
    }
  }
  return next;
}

interface Bar {
  key: string;
  label: string;
  /** Growth with the lever at its most and least ambitious end. */
  best: number;
  worst: number;
  /** Growth as currently set. */
  now: number;
}

export function useLeverEffects(inputs: ModelInputs, levers: Levers) {
  return useMemo(() => {
    const growth = (l: Levers): number => {
      const run = runModel(inputs, l);
      return cagr(run.years, run.primary.total, 2025, 2060) ?? 0;
    };
    const now = growth(levers);
    const p = (name: string) => inputs.mcParams[name];

    const span = (key: string, label: string, best: Levers, worst: Levers): Bar => ({
      key,
      label,
      best: growth(best),
      worst: growth(worst),
      now,
    });

    const bars: Bar[] = [
      span(
        'growth',
        'Population and income',
        { ...levers, sspU: 0 },
        { ...levers, sspU: 1 },
      ),
      span(
        'efficiency',
        'Material efficiency, all four',
        withIntensity(levers, INTENSITY_LEVER_KEYS, 0),
        withIntensity(levers, INTENSITY_LEVER_KEYS, 1),
      ),
      span(
        'circularity',
        'Recycling and reuse, both',
        {
          ...levers,
          recyclingFe: p('RECYCLING_RATE_FE').max,
          recyclingNonFe: p('RECYCLING_RATE_NONFE').max,
          downcycling: p('DOWNCYCLING').max,
        },
        {
          ...levers,
          recyclingFe: p('RECYCLING_RATE_FE').min,
          recyclingNonFe: p('RECYCLING_RATE_NONFE').min,
          downcycling: p('DOWNCYCLING').min,
        },
      ),
      span(
        'grade',
        'Ore grade',
        { ...levers, gradeOreFe: p('GRADE_ORE_FE').max, gradeOreNonFe: p('GRADE_ORE_NONFE').max },
        { ...levers, gradeOreFe: p('GRADE_ORE_FE').min, gradeOreNonFe: p('GRADE_ORE_NONFE').min },
      ),
      span(
        'lifetime',
        'How long things last',
        {
          ...levers,
          lifetimeU: {
            buildings: { mean: 1, k: 0.5 },
            civil_infrastructure: { mean: 1, k: 0.5 },
            machinery: { mean: 1, k: 0.5 },
            short_lived: { mean: 1, k: 0.5 },
          },
        },
        {
          ...levers,
          lifetimeU: {
            buildings: { mean: 0, k: 0.5 },
            civil_infrastructure: { mean: 0, k: 0.5 },
            machinery: { mean: 0, k: 0.5 },
            short_lived: { mean: 0, k: 0.5 },
          },
        },
      ),
    ];

    // Per-material efficiency, so "which material" is answerable too.
    for (const lever of INTENSITY_LEVER_KEYS) {
      bars.push(
        span(
          lever,
          `  ${INTENSITY_LEVERS[lever].label}`,
          withIntensity(levers, [lever], 0),
          withIntensity(levers, [lever], 1),
        ),
      );
    }
    return { bars, now };
  }, [inputs, levers]);
}

export function LeverEffects({ bars, now }: { bars: Bar[]; now: number }) {
  const headline = bars.filter((b) => !b.label.startsWith('  '));
  const detail = bars.filter((b) => b.label.startsWith('  '));
  const all = [...headline, ...detail];
  const lo = Math.min(0, ...all.map((b) => Math.min(b.best, b.worst)));
  const hi = Math.max(...all.map((b) => Math.max(b.best, b.worst)));
  const x = (v: number) => `${(100 * (v - lo)) / (hi - lo)}%`;

  const row = (b: Bar, muted: boolean) => {
    const a = Math.min(b.best, b.worst);
    const z = Math.max(b.best, b.worst);
    return (
      <li key={b.key} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, listStyle: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
          <span style={{ fontSize: muted ? 12 : 12.5, fontWeight: muted ? 400 : 600, color: muted ? 'var(--ink-2)' : 'var(--ink)' }}>
            {b.label.trim()}
          </span>
          <span style={{ font: '400 11px var(--font-mono)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {pct(a)} … {pct(z)}
          </span>
        </div>
        <div style={{ position: 'relative', height: muted ? 9 : 13, background: 'var(--paper-2, rgba(0,0,0,.04))', borderRadius: 3 }}>
          <span
            style={{
              position: 'absolute',
              left: x(a),
              width: `calc(${x(z)} - ${x(a)})`,
              top: 0,
              bottom: 0,
              background: muted ? 'var(--ink-3)' : 'var(--cardinal)',
              opacity: muted ? 0.35 : 0.75,
              borderRadius: 3,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: x(now),
              top: -2,
              bottom: -2,
              width: 2,
              background: 'var(--ink)',
            }}
          />
          {lo < 0 && (
            <span
              style={{
                position: 'absolute',
                left: x(0),
                top: -3,
                bottom: -3,
                width: 1,
                background: '#1B7837',
              }}
            />
          )}
        </div>
      </li>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ul style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0 }}>
        {headline.map((b) => row(b, false))}
      </ul>
      <details>
        <summary style={{ font: '600 11px var(--font-mono)', color: 'var(--ink-3)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Efficiency, material by material
        </summary>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 0', padding: 0 }}>
          {detail.map((b) => row(b, true))}
        </ul>
      </details>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0, lineHeight: 1.5 }}>
        Each bar runs from the most to the least ambitious end of that assumption, with everything
        else left where you have set it. The dark line is where your scenario sits; the green line,
        where it appears, is zero growth.
      </p>
    </div>
  );
}

/** Two sentences that read the bars, rather than leaving them to be read. */
export function leverVerdict(bars: Bar[]): string {
  const width = (k: string) => {
    const b = bars.find((x) => x.key === k);
    return b ? Math.abs(b.worst - b.best) : 0;
  };
  const pp = (v: number) => (100 * v).toFixed(2);
  const eff = width('efficiency');
  const circ = width('circularity');
  const ranked = [
    ['population and income', width('growth')],
    ['material efficiency', eff],
    ['recycling and reuse', circ],
    ['ore grade', width('grade')],
    ['how long things last', width('lifetime')],
  ].sort((a, b) => (b[1] as number) - (a[1] as number));

  const ratio = circ > 0 ? eff / circ : Infinity;
  const compare =
    ratio >= 1.15
      ? `Efficiency is the bigger lever by about ${ratio.toFixed(1)}×`
      : ratio <= 0.87
        ? `Circularity is the bigger lever by about ${(1 / ratio).toFixed(1)}×`
        : 'The two are worth about the same';

  // Name the others rather than re-announcing whichever of the two just won.
  const others = ranked
    .filter(([name]) => name !== 'material efficiency' && name !== 'recycling and reuse')
    .map(([name, w]) => `${name} ${pp(w as number)}`)
    .join(', ');

  return (
    `Taken end to end, material efficiency moves world material growth by ${pp(eff)} percentage ` +
    `points a year; recycling and reuse together move it by ${pp(circ)}. ${compare}. ` +
    `For comparison, in points a year: ${others}.`
  );
}

export function RecyclingCeiling({
  inputs,
  levers,
  year = 2050,
}: {
  inputs: ModelInputs;
  levers: Levers;
  year?: number;
}) {
  const data = useMemo(() => {
    const rates = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const points = rates.map((rate) => {
      const run = runModel(inputs, { ...levers, recyclingFe: rate, recyclingNonFe: rate });
      const i = run.years.indexOf(year);
      const p = run.primary.byGroup.metal_ores[i];
      const s = run.secondary.metal_ores[i];
      return { rate, share: s / (p + s) };
    });
    const here = runModel(inputs, levers);
    const i = here.years.indexOf(year);
    const p = here.primary.byGroup.metal_ores[i];
    const s = here.secondary.metal_ores[i];
    return {
      points,
      now: { rate: (levers.recyclingFe + levers.recyclingNonFe) / 2, share: s / (p + s) },
      ceiling: points[points.length - 1].share,
    };
  }, [inputs, levers, year]);

  const W = 420;
  const H = 210;
  const M = { l: 46, r: 12, t: 12, b: 36 };
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = (v: number) => M.l + v * pw;
  const y = (v: number) => M.t + ph - v * ph;
  const d = data.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.rate).toFixed(1)},${y(p.share).toFixed(1)}`).join('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', maxWidth: 460, height: 'auto' }}
        aria-label={`Secondary share of metal supply in ${year} against the collection rate`}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={0.6} />
            <text x={M.l - 7} y={y(t)} textAnchor="end" dominantBaseline="middle"
              style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-3)' }}>{(100 * t).toFixed(0)}%</text>
          </g>
        ))}
        {/* one-for-one reference: what a rate would give if every tonne were available */}
        <line x1={x(0)} x2={x(1)} y1={y(0)} y2={y(1)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
        <line x1={M.l} x2={M.l + pw} y1={y(data.ceiling)} y2={y(data.ceiling)} stroke="#1B7837" strokeWidth={1.2} strokeDasharray="5 3" />
        <path d={d} fill="none" stroke="var(--cardinal)" strokeWidth={2.2} />
        <circle cx={x(data.now.rate)} cy={y(data.now.share)} r={4} fill="var(--cardinal)" stroke="var(--paper)" strokeWidth={1.5} />
        <text x={M.l + pw} y={y(data.ceiling) - 6} textAnchor="end"
          style={{ font: '400 10.5px var(--font-mono)', fill: '#1B7837' }}>
          ceiling {(100 * data.ceiling).toFixed(0)}%
        </text>
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={x(t)} y={M.t + ph + 15} textAnchor="middle"
            style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-3)' }}>{(100 * t).toFixed(0)}%</text>
        ))}
        <text x={M.l + pw / 2} y={H - 4} textAnchor="middle"
          style={{ font: '400 10.5px var(--font-sans)', fill: 'var(--ink-2)' }}>
          Share of retiring metal collected
        </text>
        <text transform={`translate(11,${M.t + ph / 2}) rotate(-90)`} textAnchor="middle"
          style={{ font: '400 10.5px var(--font-sans)', fill: 'var(--ink-2)' }}>
          Secondary share of supply
        </text>
      </svg>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0, color: 'var(--ink-2)' }}>
        The line is straight, and that is the point: doubling collection doubles secondary supply,
        with no diminishing returns and no takeoff either. Collect <b>everything</b> that retires and
        secondary supply still only reaches <b>{(100 * data.ceiling).toFixed(0)}%</b> of metal supply
        in {year} — because that is how much of what is needed that year is retiring, from a stock
        built when the world was smaller. At your settings it is{' '}
        <b>{(100 * data.now.share).toFixed(0)}%</b>.
      </p>
    </div>
  );
}
