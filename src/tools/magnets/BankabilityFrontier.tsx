/**
 * Where does US capacity stop being bankable?
 *
 * A single verdict at one calibration invites the reader to believe the
 * calibration. The honest object is the FRONTIER: sweep the two assumptions the
 * US conclusion actually turns on and show the line they cross.
 *
 *   x  the premium — what a buyer pays extra per kilogram of a plant's product
 *      because it never touched China, net of any premium the plant pays for
 *      its own inputs: the premium the plant KEEPS. It is the only price lever
 *      on the page. Every other price is fixed at China's. For a plant that
 *      sells oxide it is per kg of Nd/Pr oxide, Dy/Tb moving in today's
 *      proportion, and today's observed level is marked on the axis.
 *   y  US cost — the plant's cost to build and run, as a multiple of what the
 *      model charges a US plant.
 *
 * ONE CHART, ONE LINE PER STAGE. Each stage used to have its own 13x13 matrix
 * of red and green cells; the information in a matrix is one boundary, so the
 * boundaries are now drawn together and the stages can be compared directly.
 * To the right of a stage's line everything the plan asks of that stage
 * clears. The faint band to its left is where only part of it does.
 *
 * Each stage keeps its OWN marker, because both axes are per-stage quantities:
 * $10 a kilogram is a different claim about alloy than about finished magnets.
 * The markers are the controls: drag one, or pick a stage in the list and tap
 * the chart, or focus a marker and use the arrow keys.
 *
 * Cheap because the screen is arithmetic. NPV is linear in the premium, so the
 * premium a cohort needs at a given cost is two evaluations and a division —
 * no sweep, no solver, nothing precomputed.
 */
import { useEffect, useMemo, useRef, useState,
         type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { screen, drawnKt, defaultPremium, sellsOxide, TODAY_OXIDE_PREMIUM,
         type Buildout } from './projectFinance';

const COST_MIN = 0.5, COST_MAX = 3.5, COST_STEP = 0.05;
/** Cost levels each frontier is solved at. */
const NY = 31;
const H_FULL = 300;
const M = { l: 48, r: 16, t: 12, b: 38 };
/** Compact, for the desktop's results column. */
const H_COMPACT = 250;
/** Air between the cost axis and $0, so a marker at no premium clears the tick labels. */
const INSET = 18;

/** What the premium is paid on. */
const PER: Record<string, string> = {
  mining: 'concentrate', separation: 'Nd/Pr oxide', alloy: 'alloy',
  magnet: 'magnet', recycling: 'Nd/Pr oxide',
};
const LABEL: Record<string, string> = {
  mining: 'Mining', separation: 'Separation', alloy: 'Alloying',
  magnet: 'Magnet', recycling: 'Recycling',
};
const ORDER = ['mining', 'separation', 'alloy', 'magnet', 'recycling'];
const GREEN = 'var(--brand-green)';
const RED = '#D53E4F';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type ScreenSettings = {
  rate: number;
  instruments: Record<string, number>;
  foakMult: number;
  /** How far the planner-side price floor is set, so its de-risking matches the stacks. */
  floorLevel: number;
};

/** Premium each cohort needs at one cost level, $/kg of the stage's product.
 *  NPV is linear in the premium for every stage, an oxide maker's included,
 *  because its prices are linear in the premium. */
function needs(rows: Buildout[], settings: ScreenSettings, cost: number): number[] {
  const opts = {
    rate: settings.rate,
    offtake: settings.instruments.offtake,
    floorInterface: 'magnet', floorRelief: settings.instruments.floor,
    floorLevel: settings.floorLevel,
    creditSupport: settings.instruments.guarantee,
    costMult: cost, foakMult: settings.foakMult,
  };
  const at0 = screen(rows, { ...opts, premium: 0 });
  const at1 = screen(rows, { ...opts, premium: 1 });
  return at0.map((v, i) => (v.npv >= -1e-6 ? 0
    : -v.npv / Math.max(1e-9, at1[i].npv - v.npv)));
}

type Stage = {
  key: string;
  rows: Buildout[];
  askedKt: number;
  /** One point per cost level: the premium that funds all of it, and any of it. */
  line: { cost: number; all: number; any: number }[];
  premium: number;
  cost: number;
  /** Share of the asked capacity that clears at the marker. */
  share: number;
  /** Premium that funds the whole stage at the marker's cost. */
  needed: number;
};

export default function BankabilityFrontier({ rows, settings, costMult, premium: premiums,
                                              onMove, compact = false }: {
  rows: Buildout[];
  settings: ScreenSettings;
  costMult: Record<string, number>;
  /** The premium each stage's plants keep, $/kg of product; absent = the default. */
  premium: Record<string, number>;
  onMove: (stage: string, premium: number, costMult: number) => void;
  compact?: boolean;
}) {
  const H = compact ? H_COMPACT : H_FULL;
  const keys = ORDER.filter((s) => rows.some((b) => b.s === s));
  // An oxide premium is per kg of Nd/Pr oxide and runs higher: today's is
  // $71, and the axis has to hold it with room either side.
  const oxide = keys.some(sellsOxide);
  const xMax = oxide ? 140 : 60;

  const lines = useMemo(() => Object.fromEntries(keys.map((s) => {
    const mine = rows.filter((b) => b.s === s);
    return [s, Array.from({ length: NY }, (_, j) => {
      const cost = COST_MIN + (j / (NY - 1)) * (COST_MAX - COST_MIN);
      const n = needs(mine, settings, cost);
      return { cost, all: Math.max(...n), any: Math.min(...n) };
    })];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [rows, settings.rate, settings.foakMult, settings.floorLevel,
        settings.instruments.offtake, settings.instruments.floor, settings.instruments.guarantee]);

  const stages: Stage[] = keys.map((s) => {
    const mine = rows.filter((b) => b.s === s);
    const premium = premiums[s] ?? defaultPremium(s), cost = costMult[s] ?? 1;
    const n = needs(mine, settings, cost);
    const kt = mine.map(drawnKt);
    const asked = kt.reduce((a, v) => a + v, 0) || 1;
    return {
      key: s, rows: mine, askedKt: asked, line: lines[s] ?? [], premium, cost,
      share: kt.reduce((a, v, i) => a + (n[i] <= premium + 1e-9 ? v : 0), 0) / asked,
      needed: Math.max(...n),
    };
  });

  // The stage a tap on the chart moves. Opens on the largest ask.
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && keys.includes(picked) ? picked
    : stages.reduce((a, s) => (s.askedKt > a.askedKt ? s : a), stages[0])?.key;

  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [keys.length > 0]);

  const iw = w - M.l - M.r - INSET, ih = H - M.t - M.b;
  const sx = (p: number) => M.l + INSET + (p / xMax) * iw;
  const sy = (c: number) => M.t + (1 - (c - COST_MIN) / (COST_MAX - COST_MIN)) * ih;
  const valueAt = (clientX: number, clientY: number): [number, number] => {
    const r = wrap.current!.getBoundingClientRect();
    const p = clamp((clientX - r.left - M.l - INSET) / iw, 0, 1) * xMax;
    const c = COST_MIN + clamp(1 - (clientY - r.top - M.t) / ih, 0, 1) * (COST_MAX - COST_MIN);
    return [Math.round(p), Math.round(c / COST_STEP) * COST_STEP];
  };

  // DRAGGING listens on the window, not the marker. Pointer capture on an
  // element that re-renders on every move proved unreliable on a phone, and a
  // finger that slides off a 40px target should keep hold of it.
  const move = useRef(onMove);
  move.current = onMove;
  const geometry = useRef(valueAt);
  geometry.current = valueAt;
  const [dragging, setDragging] = useState<string | null>(null);
  const lastPointer = useRef('mouse');
  const startDrag = (stage: string, e: RPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPicked(stage);
    setDragging(stage);
    const onMoveEv = (ev: PointerEvent) => {
      ev.preventDefault();
      const [p, c] = geometry.current(ev.clientX, ev.clientY);
      move.current(stage, p, c);
    };
    const end = () => {
      setDragging(null);
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', onMoveEv, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  // Safari on a phone scrolls the page under a drag unless the touch itself is
  // refused, whatever touch-action says. React attaches touch listeners as
  // passive, which cannot refuse, so these are attached by hand.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const refuse = (ev: TouchEvent) => {
      if ((ev.target as HTMLElement | null)?.closest?.('.frontier-marker')) ev.preventDefault();
    };
    el.addEventListener('touchstart', refuse, { passive: false });
    el.addEventListener('touchmove', refuse, { passive: false });
    return () => {
      el.removeEventListener('touchstart', refuse);
      el.removeEventListener('touchmove', refuse);
    };
  }, [keys.length > 0]);

  const onKey = (s: Stage) => (e: KeyboardEvent) => {
    const big = e.shiftKey ? 5 : 1;
    const step: Record<string, [number, number]> = {
      ArrowRight: [big, 0], ArrowLeft: [-big, 0],
      ArrowUp: [0, COST_STEP * big], ArrowDown: [0, -COST_STEP * big],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(s.key, clamp(s.premium + d[0], 0, xMax),
           clamp(Math.round((s.cost + d[1]) / COST_STEP) * COST_STEP, COST_MIN, COST_MAX));
  };

  // What a point on the chart would mean for each stage, for the hover readout.
  const [hover, setHover] = useState<{ x: number; y: number; p: number; c: number } | null>(null);
  const allAt = (s: Stage, c: number): number => {
    const t = clamp((c - COST_MIN) / (COST_MAX - COST_MIN), 0, 1) * (NY - 1);
    const i = Math.min(NY - 2, Math.floor(t));
    const a = s.line[i], b = s.line[i + 1];
    return a && b ? a.all + (t - i) * (b.all - a.all) : Infinity;
  };

  const path = (s: Stage, k: 'all' | 'any') =>
    s.line.map((pt, i) => `${i ? 'L' : 'M'}${sx(pt[k]).toFixed(1)},${sy(pt.cost).toFixed(1)}`).join(' ');
  const band = (s: Stage) =>
    `${path(s, 'all')} ${s.line.slice().reverse()
      .map((pt) => `L${sx(pt.any).toFixed(1)},${sy(pt.cost).toFixed(1)}`).join(' ')} Z`;

  // Markers that sit on the same point are drawn as rings inside one another,
  // so a stack of three reads as three and none is moved off its value.
  const ring = (i: number): number =>
    stages.slice(0, i).filter((o) =>
      Math.hypot(sx(o.premium) - sx(stages[i].premium), sy(o.cost) - sy(stages[i].cost)) < 5).length;

  const xTicks = Array.from({ length: xMax / (xMax > 60 ? 20 : 10) + 1 },
                            (_, i) => i * (xMax > 60 ? 20 : 10));
  const yTicks = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];

  return (
    <div className="frontier-root"
      style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
      <style>{`
        .frontier-root { --st-mining: #eb6834; --st-separation: #4a3aa7; --st-alloy: #eda100;
                         --st-magnet: #2a78d6; --st-recycling: #e87ba4; }
        [data-theme="dark"] .frontier-root { --st-mining: #d95926; --st-separation: #9085e9;
                         --st-alloy: #c98500; --st-magnet: #3987e5; --st-recycling: #d55181; }
        .frontier-marker { -webkit-user-select: none; user-select: none;
                           -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
        .frontier-marker:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
        .frontier-rows { display: grid; gap: 8px; grid-template-columns: 1fr; }
        @container (min-width: 640px) {
          .frontier-rows { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .frontier-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.55 }}>
          Bankability frontier
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>
          {stages.length === 0
            ? 'the plan asks for no US capacity here, so there is nothing to screen'
            : 'drag a circle to change what that stage is paid and what it costs'}
        </span>
      </div>
      {stages.length === 0 ? (
        <p style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4, margin: '8px 0 0', maxWidth: 560 }}>
          Blank because the plan asks for no new US capacity here. Add a mandate or raise
          the restriction and a line appears for each stage the plan wants built.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.45, margin: '0 0 10px' }}>
            One line for each stage the plan asks the United States to build. To the
            right of its line, everything asked of that stage clears; in the faint band
            beside it, only part does. Each circle is where your assumptions put that
            stage. Every price is China&rsquo;s except the premium: what a buyer pays
            extra per kilogram of a plant&rsquo;s product because it never touched
            China, after any premium the plant pays for its own inputs.
            {oxide && <> For oxide it is per kilogram of Nd/Pr oxide, with Dy/Tb oxide
              in today&rsquo;s proportion, and opens at today&rsquo;s observed level.</>}
          </p>

          <div ref={wrap} style={{ position: 'relative', height: H, touchAction: 'pan-y',
                                   cursor: dragging ? 'grabbing' : 'crosshair' }}
            onPointerDown={(e) => {
              lastPointer.current = e.pointerType;
              // A mouse drags the chosen stage from anywhere on the chart. A finger
              // there scrolls the page; a tap moves the marker (onClick below).
              if (e.pointerType !== 'mouse' || !sel) return;
              const [p, c] = valueAt(e.clientX, e.clientY);
              onMove(sel, p, c);
              startDrag(sel, e);
            }}
            onClick={(e) => {
              if (lastPointer.current === 'mouse' || !sel) return;
              const [p, c] = valueAt(e.clientX, e.clientY);
              onMove(sel, p, c);
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse' || dragging) return;
              const r = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - r.left, y = e.clientY - r.top;
              if (x < M.l || x > w - M.r || y < M.t || y > H - M.b) { setHover(null); return; }
              const [p, c] = valueAt(e.clientX, e.clientY);
              setHover({ x, y, p, c });
            }}
            onPointerLeave={() => setHover(null)}>
            <svg width={w} height={H} role="img" style={{ display: 'block', overflow: 'visible' }}
              aria-label="The premium each stage needs to clear, against US cost">
              <defs>
                <clipPath id="frontier-clip">
                  <rect x={M.l} y={M.t} width={iw + INSET} height={ih} />
                </clipPath>
              </defs>
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.l} x2={w - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--rule)"
                    strokeWidth={1} />
                  <text x={M.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="central"
                    style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink-3)' }}>
                    {t.toFixed(1)}×
                  </text>
                </g>
              ))}
              {/* the calibrated cost, the row every marker starts on */}
              <line x1={M.l} x2={w - M.r} y1={sy(1)} y2={sy(1)} stroke="var(--rule-strong)"
                strokeWidth={1} />
              <text x={w - M.r - 4} y={sy(1) + 10} textAnchor="end"
                style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink-3)' }}>
                US cost as the model has it
              </text>
              {xTicks.map((t) => (
                <text key={`x${t}`} x={sx(t)} y={H - M.b + 13} textAnchor="middle"
                  style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink-3)' }}>
                  ${t}
                </text>
              ))}
              <line x1={M.l} x2={w - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--rule-strong)" />
              <text x={M.l + INSET + iw / 2} y={H - 6} textAnchor="middle"
                style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
                premium the plant keeps, $ per kg of its product
              </text>
              {/* where the premium stands today, for the plants that sell oxide */}
              {oxide && (
                <g>
                  <line x1={sx(TODAY_OXIDE_PREMIUM)} x2={sx(TODAY_OXIDE_PREMIUM)} y1={M.t}
                    y2={H - M.b} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
                  {/* on one line where there is room to the right of the mark,
                      on two where there is not (a phone) */}
                  {w - M.r - sx(TODAY_OXIDE_PREMIUM) > 200 ? (
                    <text x={sx(TODAY_OXIDE_PREMIUM) + 4} y={M.t + 9}
                      style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink-3)' }}>
                      today’s observed oxide premium, ${TODAY_OXIDE_PREMIUM.toFixed(0)}
                    </text>
                  ) : (
                    <text x={sx(TODAY_OXIDE_PREMIUM) + 4} y={M.t + 9}
                      style={{ font: '400 9px var(--font-mono)', fill: 'var(--ink-3)' }}>
                      <tspan x={sx(TODAY_OXIDE_PREMIUM) + 4}>today’s observed</tspan>
                      <tspan x={sx(TODAY_OXIDE_PREMIUM) + 4} dy={10}>oxide premium, ${TODAY_OXIDE_PREMIUM.toFixed(0)}</tspan>
                    </text>
                  )}
                </g>
              )}
              <text transform={`translate(11, ${M.t + ih / 2}) rotate(-90)`} textAnchor="middle"
                style={{ font: '400 10px var(--font-mono)', fill: 'var(--ink-2)' }}>
                US cost, × the model’s
              </text>

              <g clipPath="url(#frontier-clip)">
                {stages.map((s) => (
                  <path key={`b${s.key}`} d={band(s)} fill={`var(--st-${s.key})`} fillOpacity={0.13} />
                ))}
                {stages.map((s) => (
                  <path key={`l${s.key}`} d={path(s, 'all')} fill="none"
                    stroke={`var(--st-${s.key})`} strokeWidth={s.key === sel ? 2.5 : 2}
                    strokeLinejoin="round" strokeLinecap="round" />
                ))}
              </g>
              {/* Each line named where it is, at a height of its own so that two
                  lines close together do not print their names on each other. */}
              {stages.map((s, i) => {
                const inside = s.line.filter((pt) => pt.all <= xMax * 0.86);
                if (!inside.length) return null;
                const want = COST_MAX - 0.3 - i * 0.32;
                const pt = inside.reduce((a, b) =>
                  (Math.abs(b.cost - want) < Math.abs(a.cost - want) ? b : a));
                return (
                  <g key={`n${s.key}`}>
                    <text x={sx(pt.all) + 7} y={sy(pt.cost)} dominantBaseline="central"
                      stroke="var(--paper)" strokeWidth={3} paintOrder="stroke"
                      style={{ font: '600 10.5px var(--font-mono)', fill: 'var(--ink)' }}>
                      {LABEL[s.key]}
                    </text>
                  </g>
                );
              })}
            </svg>

            {stages.map((s, i) => {
              const k = ring(i);
              const d = 14 + 9 * k;
              return (
                <div key={s.key} role="slider" tabIndex={0} className="frontier-marker"
                  aria-label={`${LABEL[s.key]}: premium and US cost`}
                  aria-valuemin={0} aria-valuemax={xMax} aria-valuenow={s.premium}
                  aria-valuetext={`$${s.premium.toFixed(0)} per kilogram premium, ${s.cost.toFixed(2)} times cost, `
                    + `${(s.share * 100).toFixed(0)}% of capacity clears`}
                  onKeyDown={onKey(s)} onFocus={() => setPicked(s.key)}
                  onPointerDown={(e) => { lastPointer.current = e.pointerType; startDrag(s.key, e); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', left: sx(s.premium), top: sy(s.cost),
                           width: 40, height: 40, marginLeft: -20, marginTop: -20,
                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                           cursor: dragging === s.key ? 'grabbing' : 'grab', touchAction: 'none',
                           borderRadius: '50%', zIndex: s.key === sel ? 3 : 2 }}>
                  <span style={{ width: d, height: d, borderRadius: '50%', boxSizing: 'border-box',
                                 background: k === 0 ? 'var(--paper)' : 'transparent',
                                 border: `3px solid var(--st-${s.key})`,
                                 boxShadow: s.key === sel
                                   ? '0 0 0 2px var(--paper), 0 0 0 3.5px var(--ink)'
                                   : '0 0 0 2px var(--paper)' }} />
                </div>
              );
            })}

            {hover && !dragging && (
              <div style={{ position: 'absolute', top: hover.y + 14, pointerEvents: 'none', zIndex: 5,
                            ...(hover.x > w * 0.6 ? { right: w - hover.x + 12 } : { left: hover.x + 12 }),
                            background: 'var(--paper)', border: '1px solid var(--rule-strong)',
                            borderRadius: 8, padding: '6px 9px', whiteSpace: 'nowrap',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
                            font: '400 10.5px var(--font-mono)', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 600 }}>${hover.p}/kg · {hover.c.toFixed(2)}× cost</div>
                {stages.map((s) => {
                  const need = allAt(s, hover.c);
                  return (
                    <div key={s.key}>
                      <span style={{ color: `var(--st-${s.key})` }}>●</span>{' '}
                      {LABEL[s.key]}{' '}
                      <span style={{ opacity: 0.65 }}>
                        {need <= hover.p ? 'clears' : `needs $${Math.ceil(need)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* The key and the readout in one: a row per stage, which also chooses
              the stage a tap on the chart moves. */}
          <div className="frontier-rows" style={{ marginTop: 10 }}>
            {stages.map((s) => {
              const on = s.key === sel;
              const all = s.share >= 0.999, none = s.share <= 0.001;
              return (
                <button key={s.key} type="button" className="frontier-row" aria-pressed={on}
                  onClick={() => setPicked(s.key)}
                  style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--ink)',
                           padding: '7px 10px', borderRadius: 8, minWidth: 0,
                           border: `1px solid ${on ? 'var(--rule-strong)' : 'var(--rule)'}`,
                           background: on ? 'var(--paper-2)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                    <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: '50%',
                                   boxSizing: 'border-box', flexShrink: 0,
                                   border: `3px solid var(--st-${s.key})` }} />
                    <span style={{ fontWeight: 600 }}>{LABEL[s.key]}</span>
                    <span style={{ font: '400 10px var(--font-mono)', opacity: 0.55 }}>
                      {s.askedKt.toFixed(1)} kt/yr asked
                    </span>
                  </div>
                  <div style={{ font: '400 10.5px var(--font-mono)', opacity: 0.85, marginTop: 3,
                                lineHeight: 1.5 }}>
                    <b>${s.premium.toFixed(0)}</b> per kg of {PER[s.key]} · <b>{s.cost.toFixed(2)}×</b> cost
                    <br />
                    <span style={{ color: all ? GREEN : RED }}>●</span>{' '}
                    {all ? 'all of it clears'
                      : none ? 'none of it clears' : `${(s.share * 100).toFixed(0)}% clears`}
                    {!all && (s.needed > xMax
                      ? `; no premium to $${xMax} funds it`
                      : `; $${Math.ceil(s.needed - 1e-9)} would fund it`)}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
