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
 *
 * The contours are of whatever the menus at the top have in focus, in the
 * place in focus, and the vertical axes on offer are the ones that act on it.
 * The figure is drawn at the size it is shown, not scaled from a fixed
 * canvas, so its type is the same size on a phone as on a desktop.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { contours } from 'd3-contour';
import {
  INTENSITY_LEVERS,
  leverDraw,
  leverWorldValue,
  resolveSsp,
  runModel,
  type GroupKey,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';
import { focusGrowth, setIntensity, type Focus } from './focus';

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

/** The vertical axes that act on a group: all six for all four together. */
export function axesFor(group: GroupKey | 'total'): ContourAxis[] {
  return group === 'total' ? CONTOUR_AXIS_KEYS : CONTOUR_AXIS_KEYS.filter((k) => CONTOUR_AXES[k].group === group);
}

const N = 15;
const M = { l: 50, r: 10, t: 10, b: 44 };

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
  focus,
  axis,
  onAxis,
  onMove,
  scatter,
  history,
}: {
  inputs: ModelInputs;
  levers: Levers;
  focus: Focus;
  axis: ContourAxis;
  onAxis: (a: ContourAxis) => void;
  /**
   * The ring dragged to a new place: world GDP-per-person growth (2024-2060)
   * and the vertical axis's value, both inside the frame.
   */
  onMove?: (gdppcGrowth: number, value: number) => void;
  scatter: ScatterData | null;
  /** Recent conditions, for the star: world GDP/capita growth and each lever. */
  history: { gdpGrowth: number; lever: Record<string, number> };
}) {
  const spec = CONTOUR_AXES[axis];
  const axes = axesFor(focus.group);

  // Drawn at its real width, so 12px type is 12px on the screen.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = Math.round(Math.max(260, Math.min(400, W * 0.6)));
  const PW = W - M.l - M.r;
  const PH = H - M.t - M.b;

  const [surface, setSurface] = useState<{
    axis: ContourAxis;
    focus: Focus;
    z: Float64Array;
    xs: number[];
    ys: number[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
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
  /**
   * The levers the surface depends on. Every point on it overrides the
   * socioeconomic position, both tilts and the axis's own lever, so those are
   * blanked here: dragging the ring changes exactly those, and must not set
   * off 225 runs to redraw a surface that has not changed.
   */
  const surfaceKey = useMemo(() => {
    const l: Levers = { ...levers, sspU: 0, popTilt: 0, gdppcTilt: 0 };
    if (axis === 'metalRecycling') { l.recyclingFe = 0; l.recyclingNonFe = 0; }
    else if (axis === 'mineralDowncycling') l.downcycling = 0;
    else setIntensity(l, [axis], 0);
    return JSON.stringify(l);
  }, [levers, axis]);
  const surfaceLevers = useMemo(() => JSON.parse(surfaceKey) as Levers, [surfaceKey]);

  useEffect(() => {
    const levers = surfaceLevers;
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
        z[iy * N + ix] = 100 * focusGrowth(focus, runModel(inputs, trial));
      }
      iy++;
    };
    const step = () => {
      if (job.current !== id) return;
      for (let r = 0; r < ROWS_PER_FRAME && iy < N; r++) row();
      if (iy < N) {
        tick(step);
      } else {
        setSurface({ axis, focus, z, xs: frame.xs, ys: frame.ys });
        setBusy(false);
      }
    };
    tick(step);
    return () => {
      job.current++;
    };
  }, [inputs, axis, focus, frame, surfaceLevers]);

  const paths = useMemo(() => {
    if (!surface || surface.axis !== axis || surface.focus !== focus) return null;
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
  }, [surface, axis, focus, PW, PH]);

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

  const tick = { font: '400 12px var(--font-mono)', fill: 'var(--ink-3)' };
  const what = focus.group === 'total' ? 'material use' : focus.name.toLowerCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {axes.length > 1 && (
        <label className="mat-contour-axis">
          Vertical axis
          <select value={axis} onChange={(e) => onAxis(e.target.value as ContourAxis)} aria-label="Vertical axis">
            {axes.map((k) => <option key={k} value={k}>{CONTOUR_AXES[k].label}</option>)}
          </select>
        </label>
      )}
      <p className="mat-contour-ytitle">↑ {spec.label}, {spec.unit}</p>

      <div ref={box} style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        aria-label={`Growth in ${what}, ${focus.place}, across income growth and ${spec.label}`}
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
        {paths?.zero && <path d={paths.zero} fill="none" stroke="#1B7837" strokeWidth={2.4} />}

        {cloud.map((p, i) => (
          <circle key={i} cx={xOf(p.x)} cy={yOf(p.y)} r={1.3} fill="var(--ink)" opacity={0.18} />
        ))}

        {/* Recent conditions, as the paper marks them */}
        {Number.isFinite(star.y) && (
          <g transform={`translate(${xOf(star.x)},${yOf(star.y)})`}>
            <path d={STAR} fill="var(--ink)" stroke="var(--paper)" strokeWidth={1} />
          </g>
        )}
        </g>

        <rect x={M.l} y={M.t} width={PW} height={PH} fill="none" stroke="var(--rule-strong)" />

        {/* Yours, on top and draggable: where it is let go sets income growth
            and the vertical axis's assumption, and every slider follows. */}
        <g style={{ cursor: onMove ? (dragging ? 'grabbing' : 'grab') : undefined, touchAction: 'none' }}
          onPointerDown={onMove ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); } : undefined}
          onPointerMove={onMove ? (e) => {
            if (!dragging) return;
            const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
            const sx = ((e.clientX - r.left) * W) / r.width;
            const sy = ((e.clientY - r.top) * H) / r.height;
            const fx = Math.max(0, Math.min(1, (sx - M.l) / PW));
            const fy = Math.max(0, Math.min(1, (M.t + PH - sy) / PH));
            onMove(frame.xGrowthLo + fx * (frame.xGrowthHi - frame.xGrowthLo), frame.yLo + fy * (frame.yHi - frame.yLo));
          } : undefined}
          onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
          <circle cx={xOf(here.x)} cy={yOf(here.y)} r={16} fill="transparent" />
          <circle cx={xOf(here.x)} cy={yOf(here.y)} r={dragging ? 8 : 6.5} fill={onMove ? 'color-mix(in srgb, var(--cardinal) 15%, transparent)' : 'none'}
            stroke="var(--cardinal)" strokeWidth={2.4} />
          <circle cx={xOf(here.x)} cy={yOf(here.y)} r={2} fill="var(--cardinal)" />
        </g>

        {xTicks.map((t) => (
          <text key={t} x={xOf(t)} y={M.t + PH + 17} textAnchor="middle" style={tick}>
            {(100 * t).toFixed(1)}
          </text>
        ))}
        <text x={M.l + PW / 2} y={H - 6} textAnchor="middle"
          style={{ font: '400 13px var(--font-sans)', fill: 'var(--ink-2)' }}>
          World GDP per person, % a year →
        </text>
        {yTicks.map((t) => (
          <text key={t} x={M.l - 7} y={yOf(t)} textAnchor="end" dominantBaseline="middle" style={tick}>
            {spec.fmt(t)}
          </text>
        ))}

        {busy && (
          <text x={M.l + PW / 2} y={M.t + 18} textAnchor="middle"
            style={{ font: '400 12px var(--font-mono)', fill: 'var(--ink-3)' }}>
            recomputing…
          </text>
        )}
      </svg>
      </div>

      <div className="mat-contour-key" aria-label="Key">
        <span className="mat-contour-ramp">
          {[-1, 0, 1, 2, 3, 4].map((v) => (
            <span key={v}><i style={{ background: levelColor(v) }} />{v > 0 ? `+${v}` : v}</span>
          ))}
          <em>% a year</em>
        </span>
        <span><svg width={18} height={10} aria-hidden="true"><line x1={0} x2={18} y1={5} y2={5} stroke="#1B7837" strokeWidth={2.4} /></svg>zero</span>
        <span><svg width={14} height={14} aria-hidden="true"><circle cx={7} cy={7} r={5} fill="none" stroke="var(--cardinal)" strokeWidth={2} /></svg>{onMove ? 'yours (drag it)' : 'yours'}</span>
        <span><svg width={14} height={14} viewBox="-7.5 -7.5 15 15" aria-hidden="true"><path d={STAR} fill="var(--ink)" /></svg>today</span>
        <span><svg width={10} height={10} aria-hidden="true"><circle cx={5} cy={5} r={2} fill="var(--ink)" opacity={0.4} /></svg>paper’s runs</span>
      </div>
    </div>
  );
}

const STAR = 'M0,-7 L2,-2.2 L7,-2.2 L3,1 L4.4,6 L0,3 L-4.4,6 L-3,1 L-7,-2.2 L-2,-2.2 Z';
