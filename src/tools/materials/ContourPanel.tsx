/**
 * Figure 3 of the paper, made live.
 *
 * The paper draws six fixed panels: growth in income against one lever, with
 * contours of what a material group then does. Here the surface is computed
 * from the model as you watch, so the panel answers the question for whatever
 * else you have already set rather than for the paper's central case alone.
 *
 * The line that matters is zero. Left and below it, consumption of that group
 * falls; anywhere else it grows. Most of these panels have no zero line at all
 * inside the plausible range, which is the paper's finding in one picture.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { contours } from 'd3-contour';
import {
  GROUP_LABEL,
  INTENSITY_LEVERS,
  cagr,
  leverDraw,
  leverWorldValue,
  resolveSsp,
  runModel,
  type GroupKey,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';

/** A vertical axis the panel can take: the paper's six, in its own order. */
export type ContourAxis = IntensityLever | 'metalRecycling' | 'mineralDowncycling';

export const CONTOUR_AXES: Record<
  ContourAxis,
  { label: string; unit: string; fmt: (v: number) => string; group: GroupKey }
> = {
  biomass: {
    label: 'Biomass intensity',
    unit: 'kg per $ of GDP',
    fmt: (v) => v.toFixed(3),
    group: 'biomass',
  },
  fossil: {
    label: 'Fossil fuel intensity',
    unit: 'kg per $ of GDP',
    fmt: (v) => v.toFixed(3),
    group: 'fossil_fuels',
  },
  metalStock: {
    label: 'Metal stock intensity',
    unit: 'kg in use per $ of GDP',
    fmt: (v) => v.toFixed(2),
    group: 'metal_ores',
  },
  mineralStock: {
    label: 'Mineral stock intensity',
    unit: 'kg in use per $ of GDP',
    fmt: (v) => v.toFixed(1),
    group: 'nonmetallic_minerals',
  },
  metalRecycling: {
    label: 'Metal recovered at end of life',
    unit: 'share of what retires',
    fmt: (v) => `${(100 * v).toFixed(0)}%`,
    group: 'metal_ores',
  },
  mineralDowncycling: {
    label: 'Minerals reused after demolition',
    unit: 'share of what retires',
    fmt: (v) => `${(100 * v).toFixed(0)}%`,
    group: 'nonmetallic_minerals',
  },
};

export const CONTOUR_AXIS_KEYS = Object.keys(CONTOUR_AXES) as ContourAxis[];

const N = 15;
const W = 660;
const H = 400;
const M = { l: 70, r: 112, t: 12, b: 46 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

/** Contour levels in %/yr. Zero is drawn separately and heavily. */
const LEVELS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/**
 * Red where a material grows, green where it falls.
 *
 * Opaque, and painted lowest band first. d3-contour's bands are nested — each
 * is the whole region above its threshold — so translucent fills stack and the
 * middle of the plot turns to mud. Opaque fills in ascending order give the
 * banding the shapes already describe.
 */
/** Mixed against the page's own paper, so the bands follow the theme. */
const GREEN = '#1B7837';
const RED = '#B2182B';

function levelColor(pct: number): string {
  const [hue, t] =
    pct <= 0 ? [GREEN, 0.18 + 0.62 * Math.min(1, -pct / 2)] : [RED, 0.1 + 0.72 * Math.min(1, pct / 4)];
  return `color-mix(in srgb, ${hue} ${(100 * (t as number)).toFixed(0)}%, var(--paper))`;
}

export interface ScatterData {
  gdpGrowth: number[];
  lever: Record<string, number[]>;
  cagr: Record<string, (number | null)[]>;
}

export default function ContourPanel({
  inputs,
  levers,
  axis,
  onAxis,
  scatter,
  history,
}: {
  inputs: ModelInputs;
  levers: Levers;
  axis: ContourAxis;
  onAxis: (a: ContourAxis) => void;
  scatter: ScatterData | null;
  /** Recent conditions, for the star: world GDP/capita growth and each lever. */
  history: { gdpGrowth: number; lever: Record<string, number> };
}) {
  const spec = CONTOUR_AXES[axis];
  const group = spec.group;
  const [surface, setSurface] = useState<{
    axis: ContourAxis;
    z: Float64Array;
    xs: number[];
    ys: number[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const job = useRef(0);

  // The axis ranges: income growth spans the sampled SSPs, the lever spans the
  // range the Monte Carlo drew — the same frame the published runs sit in.
  const frame = useMemo(() => {
    const lo = resolveSsp(inputs, 0);
    const hi = resolveSsp(inputs, 1);
    const xs: number[] = [];
    for (let i = 0; i < N; i++) xs.push(i / (N - 1));
    let yLo: number;
    let yHi: number;
    if (axis === 'metalRecycling' || axis === 'mineralDowncycling') {
      const p = inputs.mcParams[axis === 'metalRecycling' ? 'RECYCLING_RATE_FE' : 'DOWNCYCLING'];
      yLo = p.min;
      yHi = p.max;
    } else {
      const mid = resolveSsp(inputs, levers.sspU);
      const a = leverWorldValue(inputs, axis, 0, mid).value;
      const b = leverWorldValue(inputs, axis, 1, mid).value;
      yLo = Math.min(a, b);
      yHi = Math.max(a, b);
    }
    const ys: number[] = [];
    for (let i = 0; i < N; i++) ys.push(yLo + (i / (N - 1)) * (yHi - yLo));
    return { xGrowthLo: lo.gdppcGrowth, xGrowthHi: hi.gdppcGrowth, xs, ys, yLo, yHi };
  }, [inputs, axis, levers.sspU]);

  // 225 model runs is about half a second, so the surface is built a couple of
  // rows per frame rather than in one block that would drop the page's scroll.
  // Paced to paint: a background tab clamps setTimeout to a second a tick,
  // which would stretch this to a quarter of a minute.
  useEffect(() => {
    const id = ++job.current;
    setBusy(true);
    const z = new Float64Array(N * N);
    const ROWS_PER_FRAME = 2;
    const tick = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn: () => void) => setTimeout(fn, 0);
    let iy = 0;
    const row = () => {
      for (let ix = 0; ix < N; ix++) {
        // The horizontal axis IS income growth, so a scenario's own tilt on it
        // is dropped here: otherwise the surface would be shifted sideways
        // from the axis that labels it.
        const trial: Levers = {
          ...levers,
          popTilt: 0,
          gdppcTilt: 0,
        };
        trial.sspU = frame.xs[ix];
        const blend = resolveSsp(inputs, trial.sspU);
        const y = frame.ys[iy];
        if (axis === 'metalRecycling') {
          trial.recyclingFe = y;
          trial.recyclingNonFe = y;
        } else if (axis === 'mineralDowncycling') {
          trial.downcycling = y;
        } else {
          const u = leverDraw(inputs, axis, y, blend);
          const s = INTENSITY_LEVERS[axis];
          trial.flowIntensityU = { ...levers.flowIntensityU };
          trial.stockIntensityU = { ...levers.stockIntensityU };
          for (const k of s.flows) trial.flowIntensityU[k] = u;
          for (const [g, su] of s.stocks) {
            trial.stockIntensityU[g] = { ...trial.stockIntensityU[g], [su]: u };
          }
        }
        const run = runModel(inputs, trial);
        const series = run.primary.byGroup[group];
        const v = cagr(run.years, series, 2025, 2060);
        z[iy * N + ix] = v == null ? NaN : 100 * v;
      }
      iy++;
    };
    const step = () => {
      if (job.current !== id) return;
      for (let r = 0; r < ROWS_PER_FRAME && iy < N; r++) row();
      if (iy < N) {
        tick(step);
      } else {
        setSurface({ axis, z, xs: frame.xs, ys: frame.ys });
        setBusy(false);
      }
    };
    tick(step);
    return () => {
      job.current++;
    };
  }, [inputs, axis, group, frame, levers]);

  const paths = useMemo(() => {
    if (!surface || surface.axis !== axis) return null;
    const z = Array.from(surface.z, (v) => (Number.isNaN(v) ? 0 : v));
    const gen = contours().size([N, N]);
    const toPath = (mp: { coordinates: number[][][][] }) =>
      mp.coordinates
        .map((poly) =>
          poly
            .map(
              (ring) =>
                ring
                  .map(
                    ([gx, gy], k) =>
                      // d3-contour works in cell coordinates: a grid point sits
                      // at the centre of its cell, half a cell in from the edge.
                      `${k ? 'L' : 'M'}${(M.l + ((gx - 0.5) / (N - 1)) * PW).toFixed(1)},${(
                        M.t +
                        PH -
                        ((gy - 0.5) / (N - 1)) * PH
                      ).toFixed(1)}`,
                  )
                  .join('') + 'Z',
            )
            .join(''),
        )
        .join('');
    const bands = gen.thresholds(LEVELS)(z).map((c) => ({ value: c.value, d: toPath(c) }));
    const zeroBand = gen.thresholds([0])(z)[0];
    return { bands, zero: zeroBand ? toPath(zeroBand) : null };
  }, [surface, axis]);

  const xOf = (growth: number) =>
    M.l + ((growth - frame.xGrowthLo) / (frame.xGrowthHi - frame.xGrowthLo)) * PW;
  const yOf = (v: number) => M.t + PH - ((v - frame.yLo) / (frame.yHi - frame.yLo)) * PH;

  // Where the current scenario sits.
  const here = useMemo(() => {
    const blend = resolveSsp(inputs, levers.sspU);
    let y: number;
    if (axis === 'metalRecycling') y = (levers.recyclingFe + levers.recyclingNonFe) / 2;
    else if (axis === 'mineralDowncycling') y = levers.downcycling;
    else {
      const s = INTENSITY_LEVERS[axis];
      const u = s.flows.length
        ? (levers.flowIntensityU[s.flows[0]] ?? 0.5)
        : (levers.stockIntensityU[s.stocks[0][0]]?.[s.stocks[0][1]] ?? 0.5);
      y = leverWorldValue(inputs, axis, u, blend).value;
    }
    // Where the scenario sits on the income axis, tilt included, kept inside
    // the frame so a tilt beyond the SSPs still shows which edge it is past.
    const x = Math.max(
      frame.xGrowthLo,
      Math.min(frame.xGrowthHi, (1 + blend.gdppcGrowth) * (1 + (levers.gdppcTilt ?? 0)) - 1),
    );
    return { x, y };
  }, [inputs, levers, axis, frame]);

  const star = { x: history.gdpGrowth, y: history.lever[axis] };

  const xTicks = useMemo(() => {
    const out: number[] = [];
    const lo = frame.xGrowthLo * 100;
    const hi = frame.xGrowthHi * 100;
    for (let v = Math.ceil(lo * 2) / 2; v <= hi + 1e-9; v += 0.5) out.push(v / 100);
    return out;
  }, [frame]);
  const yTicks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push(frame.yLo + (i / 4) * (frame.yHi - frame.yLo));
    return out;
  }, [frame]);

  const cloud = useMemo(() => {
    if (!scatter) return [];
    const ys = scatter.lever[axis];
    if (!ys) return [];
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < ys.length; i += 2) {
      pts.push({ x: scatter.gdpGrowth[i], y: ys[i] });
    }
    return pts;
  }, [scatter, axis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
        Vertical axis
        <select
          value={axis}
          onChange={(e) => onAxis(e.target.value as ContourAxis)}
          aria-label="Vertical axis"
          style={{
            font: '400 13px/1.3 var(--font-sans)',
            color: 'var(--ink)',
            background: 'var(--paper)',
            border: '1px solid var(--rule-strong)',
            borderRadius: 2,
            padding: '3px 6px',
          }}
        >
          <optgroup label="Using less material">
            {(['biomass', 'fossil', 'metalStock', 'mineralStock'] as ContourAxis[]).map((k) => (
              <option key={k} value={k}>{CONTOUR_AXES[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="Using it again">
            {(['metalRecycling', 'mineralDowncycling'] as ContourAxis[]).map((k) => (
              <option key={k} value={k}>{CONTOUR_AXES[k].label}</option>
            ))}
          </optgroup>
        </select>
        <span style={{ color: 'var(--ink-3)' }}>
          → contours of {GROUP_LABEL[group].toLowerCase()} growth
        </span>
      </label>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        aria-label={`Growth in ${GROUP_LABEL[group]} consumption across income growth and ${spec.label}`}
      >
        <defs>
          <clipPath id="mat-contour-clip">
            <rect x={M.l} y={M.t} width={PW} height={PH} />
          </clipPath>
        </defs>
        <rect x={M.l} y={M.t} width={PW} height={PH} fill={levelColor(LEVELS[0] - 0.5)} />
        <g clipPath="url(#mat-contour-clip)">
        {paths?.bands.map((b) => (
          <path key={b.value} d={b.d} fill={levelColor(b.value)} stroke="none" />
        ))}
        {paths?.zero && <path d={paths.zero} fill="none" stroke="#1B7837" strokeWidth={2.2} />}

        {cloud.map((p, i) => (
          <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r={1.1} fill="var(--ink)" opacity={0.18} />
        ))}

        {/* Recent conditions, as the paper marks them */}
        {Number.isFinite(star.y) && (
          <g transform={`translate(${xOf(star.x)},${yOf(star.y)})`}>
            <path
              d="M0,-7 L2,-2.2 L7,-2.2 L3,1 L4.4,6 L0,3 L-4.4,6 L-3,1 L-7,-2.2 L-2,-2.2 Z"
              fill="var(--ink)"
              stroke="var(--paper)"
              strokeWidth={1}
            />
          </g>
        )}
        <circle cx={xOf(here.x)} cy={yOf(here.y)} r={6} fill="none" stroke="var(--cardinal)" strokeWidth={2.4} />
        <circle cx={xOf(here.x)} cy={yOf(here.y)} r={2} fill="var(--cardinal)" />
        </g>

        <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke="var(--rule-strong)" />

        {xTicks.map((t) => (
          <text
            key={t}
            x={xOf(t)}
            y={M.t + PH + 17}
            textAnchor="middle"
            style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}
          >
            {(100 * t).toFixed(1)}
          </text>
        ))}
        <text
          x={M.l + PW / 2}
          y={H - 6}
          textAnchor="middle"
          style={{ font: '400 11px var(--font-sans)', fill: 'var(--ink-2)' }}
        >
          World GDP per person, % a year
        </text>
        {yTicks.map((t) => (
          <text
            key={t}
            x={M.l - 8}
            y={yOf(t)}
            textAnchor="end"
            dominantBaseline="middle"
            style={{ font: '400 10.5px var(--font-mono)', fill: 'var(--ink-3)' }}
          >
            {spec.fmt(t)}
          </text>
        ))}
        <text
          transform={`translate(14,${M.t + PH / 2}) rotate(-90)`}
          textAnchor="middle"
          style={{ font: '400 11px var(--font-sans)', fill: 'var(--ink-2)' }}
        >
          {spec.label}, {spec.unit}
        </text>

        {/* Key */}
        <g transform={`translate(${M.l + PW + 14},${M.t + 6})`}>
          <text style={{ font: '600 10px var(--font-mono)', fill: 'var(--ink-3)' }}>GROWTH %/YR</text>
          {[4, 3, 2, 1, 0, -1].map((v, i) => (
            <g key={v} transform={`translate(0,${14 + i * 16})`}>
              <rect width={16} height={11} fill={levelColor(v)} stroke="var(--rule)" strokeWidth={0.5} />
              <text x={21} y={9} style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}
          <g transform={`translate(0,${14 + 6 * 16 + 8})`}>
            <line x1={0} x2={16} y1={5} y2={5} stroke="#1B7837" strokeWidth={2.2} />
            <text x={21} y={9} style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
              zero
            </text>
          </g>
          <g transform={`translate(0,${14 + 7 * 16 + 14})`}>
            <circle cx={8} cy={5} r={5} fill="none" stroke="var(--cardinal)" strokeWidth={2} />
            <text x={21} y={9} style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
              yours
            </text>
          </g>
          <g transform={`translate(0,${14 + 8 * 16 + 18})`}>
            <path
              d="M8,0 L10,4.8 L15,4.8 L11,8 L12.4,13 L8,10 L3.6,13 L5,8 L1,4.8 L6,4.8 Z"
              fill="var(--ink)"
            />
            <text x={21} y={11} style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
              today
            </text>
          </g>
        </g>

        {busy && (
          <text
            x={M.l + PW / 2}
            y={M.t + 14}
            textAnchor="middle"
            style={{ font: '400 11px var(--font-mono)', fill: 'var(--ink-3)' }}
          >
            recomputing…
          </text>
        )}
      </svg>
    </div>
  );
}
