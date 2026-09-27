/**
 * Supply-chain Sankey for the magnet explorer.
 * Columns (Concentrate → Oxide → Alloy → Magnet → Demand): each region's bar is
 * its share of the material flowing onward at that stage — INCLUDING recycling-
 * derived oxide, so every ribbon emanates from a real, same-coloured bar. Ribbons
 * are coloured by origin and taper to fill both the bar they leave and the bar
 * they enter (recovery losses + recycling injection mean throughput changes
 * between stages, so flows are proportional per interface, not conserved end-to-end).
 */

import { Pickaxe, FlaskConical, Flame, Magnet, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { facilityBreakdown, type Stage } from './projects';

type Flow = { from: string; to: string; value: number };
type FlowMap = Record<string, Flow[]>;
type FlowsByClass = { total: FlowMap; heavy: FlowMap; light: FlowMap };

const REGIONS = ['China', 'RoW', 'USA'];
// US = green, allies = amber, China = red — so the chain reads as a US-security
// signal (secure → medium → exposed), the same palette as the trade-risk index.
const REGION_COLOR: Record<string, string> = { China: '#D53E4F', RoW: '#FDAE61', USA: '#66C2A5' };
// Each column is a PROCESS stage (Mining → Separation → Alloying → Magnet); `label`
// names the process (big text), `sub` lists its sub-steps (small text). The bar is
// that process's OUTPUT material flowing onward to the next stage.
// `mass` names the physical quantity each column tracks — they are NOT the same mass:
// the first three columns are rare-earth OXIDE (the RE content only); the magnet +
// demand columns are FINISHED-magnet mass (RE + iron + boron), ~3× heavier. The ribbons
// taper to fill both bars at each interface, so this mass change is handled per-stage.
const COLS = [
  { label: 'Mining', sub: 'Beneficiation and cracking', iface: 'concentrate' as string | null, mass: 'rare-earth oxide',
    desc: 'MINING → mixed rare-earth concentrate. Ore is extracted, beneficiated (crush / grind / flotation or leach), and cracked into a mixed rare-earth oxide concentrate. The bar is each region’s share of mining output. MASS SHOWN: rare-earth-oxide (REO) content — the Nd/Pr + Dy/Tb that flow on to separation, NOT the bulk ore.' },
  { label: 'Separation', sub: 'Solvent extraction of oxides', iface: 'oxide', mass: 'rare-earth oxide',
    desc: 'SEPARATION → individual rare-earth oxides. Solvent extraction splits the concentrate into purified Nd/Pr and Dy/Tb oxides (incl. recycling-derived oxide). The strategic chokepoint of the chain. MASS SHOWN: rare-earth-oxide mass.' },
  { label: 'Alloying', sub: 'Reduction to metal and casting', iface: 'alloy', mass: 'rare-earth oxide-equiv.',
    desc: 'ALLOYING → NdFeB strip-cast alloy. Oxides are reduced to metal and strip-cast into alloy flake. MASS SHOWN: the rare-earth-oxide-equivalent flowing into alloying (so it lines up with the oxide column), NOT the full alloy mass with iron + boron.' },
  { label: 'Magnet', sub: 'Powdering, alignment, sintering, magnetization', iface: 'magnet', mass: 'finished magnet',
    desc: 'MAGNET MAKING → finished sintered NdFeB magnets. Alloy is milled to powder, field-aligned, pressed, sintered, machined, coated, and magnetized. MASS SHOWN: FINISHED-magnet mass (RE + iron + boron) — ~3× the rare-earth-oxide mass of the earlier columns, because iron + boron are ~64% of an NdFeB magnet.' },
  { label: 'Demand', sub: 'Consumption', iface: null, mass: 'finished magnet',
    desc: 'Finished-magnet consumption by region — each bar is that region’s share of WORLD magnet demand (China ~50%, allies ~38%, US ~12%), NOT of US demand. MASS SHOWN: finished-magnet mass.' },
];
// Sankey material interface → the producing project stage (for the facility hover).
const IFACE_TO_STAGE: Record<string, Stage> = {
  concentrate: 'mining', oxide: 'separation', alloy: 'alloy', magnet: 'magnet',
};
// kt formatter: integers for big numbers, one decimal for small (heavy oxide ~1 kt).
const kt = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1));
// Wrap a stage sub-label onto ≤2 centered lines so the step lists don't overrun the
// column width; the split point is chosen to balance the two lines. Short labels
// (≤14 chars, e.g. "Consumption") stay on one line.
const wrapLabel = (s: string): string[] => {
  const words = s.split(' ');
  if (s.length <= 14 || words.length === 1) return [s];
  let best = 1, bestMax = Infinity;
  for (let k = 1; k < words.length; k++) {
    const mx = Math.max(words.slice(0, k).join(' ').length, words.slice(k).join(' ').length);
    if (mx < bestMax) { bestMax = mx; best = k; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
};
// Drop the stage word from a facility name — it's redundant with the column we're
// hovering (e.g. "Mountain Pass separation" → "Mountain Pass", "MP Fort Worth
// (metal/alloy)" → "MP Fort Worth"). Word-bounded so "e-VAC Magnetics" is untouched.
const STAGE_RE: Partial<Record<Stage, RegExp>> = {
  mining: /\b(?:mine|mining)\b/ig,
  separation: /\bseparation\b/ig,
  alloy: /\b(?:metal\/alloy|metal|alloy)\b/ig,
  magnet: /\bmagnets?\b/ig,
};
const cleanName = (name: string, stage: Stage) => {
  const re = STAGE_RE[stage];
  return (re ? name.replace(re, '') : name)
    .replace(/[,;]\s*\)/g, ')').replace(/\(\s*[,;]?\s*\)/g, '')   // tidy "(Estonia, )" / empty "()"
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' ').trim();
};
// The canvas. On a phone it is drawn 900 wide and scaled to the screen. In the
// desktop's results column (`compact`) it is drawn at the width it is given, in
// true pixels, and shallower, so that the capacity columns under it are in view
// with it.
const W_FULL = 900, PADX = 64, PADY = 52, NODE_W = 16;
const INNER_H_FULL = 408, INNER_H_COMPACT = 268;
/** Under the bars when there is no return loop: the caption sits right below. */
const FOOT = 6;
// One Lucide glyph per process stage, set inline to the LEFT of the column
// label. Inline rather than stacked above because PADY is 52 and a stacked
// icon pushes the two-line sub-labels into the top of the bars.
// The label font is MONOSPACE, so half its width is exactly
// length x 9.6 / 2 and the icon can be placed deterministically without
// measuring text.
const ICON = 15;
const STAGE_ICON: Record<string, JSX.Element> = {
  Mining: <Pickaxe size={ICON} strokeWidth={1.5} />,
  Separation: <FlaskConical size={ICON} strokeWidth={1.5} />,
  Alloying: <Flame size={ICON} strokeWidth={2.1} />,
  Magnet: <Magnet size={ICON} strokeWidth={1.5} />,
  Demand: <Zap size={ICON} strokeWidth={1.5} />,
};
// The end-of-life return loop leaves the RIGHT side of the demand column, runs
// under the chain and re-enters the separation column from the left, so it reads
// as one more ribbon of the diagram rather than a line hung beneath it. The
// canvas GROWS, below and to the right, by what the loops need and collapses
// when there are none, rather than reserving dead space at a zero collection
// rate. The bar area (innerH) is fixed either way.
const LOOP_GAP = 3;        // between nested loops
const LOOP_CLEAR = 18;     // between the bars and the nearest loop
const LOOP_BEND = 8;       // inside radius of the tightest loop
const LOOP_LABEL = 20;     // room for the label under the lowest loop

const outSum = (fl: FlowMap, iface: string, r: string) =>
  (fl[iface] ?? []).filter((f) => f.from === r).reduce((a, f) => a + f.value, 0);
const inSum = (fl: FlowMap, iface: string, r: string) =>
  (fl[iface] ?? []).filter((f) => f.to === r).reduce((a, f) => a + f.value, 0);

export default function FlowDiagram({ flows, active, scale = {}, year, pending = false,
                                      compact = false, controls }: {
  flows: FlowsByClass; active: Set<string>; scale?: Record<string, number>; year?: string;
  /** The flows for these settings have not arrived yet. The box keeps the
   *  diagram's shape, so the page does not move when they do. */
  pending?: boolean;
  /** In the desktop's results column: drawn at its own width, and shallower. */
  compact?: boolean;
  /** Shown in the heading row, after the title (the year selector). */
  controls?: ReactNode;
}) {
  const [cls, setCls] = useState<'total' | 'heavy' | 'light'>('total');
  const fl = flows[cls];
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [boxW, setBoxW] = useState(W_FULL);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !compact || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (w > 0) setBoxW(Math.round(w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);
  const W = compact ? Math.max(640, boxW) : W_FULL;
  const innerH = compact ? INNER_H_COMPACT : INNER_H_FULL;
  const colX = COLS.map((_, i) => PADX + i * ((W - 2 * PADX - NODE_W) / (COLS.length - 1)));
  // Type is in true pixels when compact, and scaled with the drawing when not.
  const F = compact ? { pct: 13, label: 14, sub: 10.5 } : { pct: 15, label: 16, sub: 11 };
  const LABEL_CH = F.label * 0.6;   // monospace: a character is 0.6 em wide
  type Hover = { x: number; y: number; flip: boolean; head: string; sub: string; rows: { name: string; country: string; pct: number; mass: number }[]; note: string };
  const [hover, setHover] = useState<Hover | null>(null);

  // The real projects behind a stage×region node, each with its share of the stage
  // (so they sum to the bar's %) AND the mass it contributes. Drives the hover card.
  const nodeInfo = (i: number, r: string, h: number): Omit<Hover, 'x' | 'y' | 'flip'> => {
    const barPct = Math.round((h / innerH) * 100);
    const regionMass = colVals[i][r] ?? 0;   // this region's kt at this stage
    const stage = IFACE_TO_STAGE[COLS[i].iface ?? ''];
    if (!stage) return { head: `${r} — ${barPct}% of global magnet demand`, sub: `${kt(regionMass)} kt finished magnet`,
      rows: [], note: r === 'China' ? 'China’s share of WORLD demand (it consumes about half of all NdFeB) — not of US demand.' : `${r}’s share of world magnet demand.` };
    const head = `${r} · ${COLS[i].label} — ${barPct}%`;
    const sub = `${kt(regionMass)} kt ${COLS[i].mass}`;   // name the mass (oxide vs finished magnet)
    const facs = facilityBreakdown(stage, r as 'USA' | 'China' | 'RoW', active, scale, cls === 'total' ? undefined : cls);
    if (facs.length === 0)
      return { head, sub, rows: [], note: r === 'China' ? 'Residual balance — China is the model’s backstop (no listed facilities).' : 'No listed ex-China facilities at this stage.' };
    const tot = facs.reduce((a, f) => a + f.cap, 0) || 1;
    const rows = facs.map((f) => ({ name: cleanName(f.name, stage), country: f.country, pct: Math.round((f.cap / tot) * barPct), mass: (f.cap / tot) * regionMass }));
    return { head, sub, rows, note: '' };
  };
  const onNodeMove = (e: ReactMouseEvent, i: number, r: string, h: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = e.clientX - box.left, y = e.clientY - box.top;
    setHover({ x, y, flip: x > box.width * 0.62, ...nodeInfo(i, r, h) });
  };
  // Column values: bars sized by what each region sends ONWARD (outflows), so
  // bars and ribbons are consistent. Demand = magnet received (inflows).
  const colVals = COLS.map((c) =>
    Object.fromEntries(REGIONS.map((r) => [r, c.iface ? outSum(fl, c.iface, r) : inSum(fl, 'magnet', r)])));

  const segY = colVals.map((vals) => {
    const total = REGIONS.reduce((a, r) => a + vals[r], 0) || 1;
    let y = PADY;
    const out: Record<string, { y0: number; y1: number }> = {};
    for (const r of REGIONS) { const h = (vals[r] / total) * innerH; out[r] = { y0: y, y1: y + h }; y += h; }
    return out;
  });

  const ribbons: JSX.Element[] = [];
  // THE RETURN LOOP. End-of-life magnets are collected where they were used and
  // come back as oxide, bypassing mining and separation, so the ribbon leaves
  // the demand bar of the region that used them and lands in that region's
  // share of the oxide column. Its width is on the OXIDE scale, the scale of the
  // column it enters, so a kiloton of recycled oxide is as thick as a kiloton
  // of separated oxide beside it; the concentrate ribbons give up exactly that
  // much of the bar (see `entering` below).
  const recycleArcs: JSX.Element[] = [];
  const iDem = COLS.length - 1, iSep = 1;
  const oxideTotal = (fl.oxide ?? []).reduce((a, f) => a + f.value, 0);
  const recScale = oxideTotal > 1e-9 ? innerH / oxideTotal : 0;
  // Innermost first: the lowest bar (the US) turns tightest, so the loops nest.
  const loops = (((fl as any).recycled ?? []) as Flow[])
    .filter((r) => r.value > 0.01 && segY[iDem][r.from] && segY[iSep][r.to])
    .sort((a, b) => REGIONS.indexOf(b.from) - REGIONS.indexOf(a.from))
    .map((r) => {
      const room = (segY[iSep][r.to].y1 - segY[iSep][r.to].y0) * 0.9;
      const leave = (segY[iDem][r.from].y1 - segY[iDem][r.from].y0) * 0.9;
      return { ...r, w: Math.max(1.5, Math.min(r.value * recScale, room, leave)) };
    });
  const recTot = loops.reduce((a, r) => a + r.value, 0);
  /** Height of a separation bar taken by recycled oxide, by region. */
  const entering: Record<string, number> = {};
  loops.forEach((r) => { entering[r.to] = (entering[r.to] ?? 0) + r.w; });
  const loopSpan = loops.reduce((a, r) => a + r.w + LOOP_GAP, 0);
  const padRight = Math.max(PADX, loops.length ? LOOP_CLEAR + loopSpan + 6 : 0);
  const CW = W - PADX + padRight;
  const H = PADY + innerH + (loops.length ? LOOP_CLEAR + loopSpan + LOOP_LABEL : FOOT);
  if (loops.length) {
    const yFloor = PADY + innerH;
    const xOut = colX[iDem] + NODE_W, xIn = colX[iSep];
    let off = LOOP_CLEAR;
    loops.forEach((r) => {
      const c = off + r.w / 2;          // centreline distance from the bars
      off += r.w + LOOP_GAP;
      const y0 = segY[iDem][r.from].y1 - r.w / 2;
      const y1 = segY[iSep][r.to].y1 - r.w / 2;
      const xr = xOut + c, xl = xIn - c, yb = yFloor + c;
      // Concentric corners: each loop bends around the one inside it.
      const k = Math.max(2, Math.min(c - LOOP_CLEAR + LOOP_BEND, (yb - y0) / 2, (yb - y1) / 2));
      const d = `M${xOut},${y0} L${xr - k},${y0} Q${xr},${y0} ${xr},${y0 + k}`
        + ` L${xr},${yb - k} Q${xr},${yb} ${xr - k},${yb}`
        + ` L${xl + k},${yb} Q${xl},${yb} ${xl},${yb - k}`
        + ` L${xl},${y1 + k} Q${xl},${y1} ${xl + k},${y1} L${xIn},${y1}`;
      recycleArcs.push(
        <path key={`rec-${r.from}-${r.to}`} d={d}
          fill="none" stroke={REGION_COLOR[r.from]} strokeWidth={r.w} strokeOpacity={0.5}>
          <title>{`${r.from}: ${r.value.toFixed(1)} kt of oxide recovered from end-of-life magnets collected in ${r.from}, re-entering the chain as ${r.to} oxide`}</title>
        </path>,
      );
    });
    recycleArcs.push(
      <text key="rec-label" x={(xIn + xOut) / 2} y={yFloor + LOOP_CLEAR + loopSpan + 14}
        textAnchor="middle"
        style={{ font: '600 10.5px var(--font-mono)', fill: 'var(--ink)', opacity: 0.55 }}>
        {`end-of-life magnets recycled back to oxide · ${recTot.toFixed(1)} kt`}
      </text>,
    );
  }
  COLS.forEach((c, i) => {
    if (!c.iface) return;
    const ifaceFlows = (fl[c.iface] ?? []);
    const total = ifaceFlows.reduce((a, f) => a + f.value, 0);
    if (total <= 0) return;
    const srcScale = innerH / total;
    // taper: target side fills each target bar exactly (handles recovery/recycling)
    const tgtScale = (r: string) => {
      const inv = inSum(fl, c.iface!, r);
      // The foot of a separation bar belongs to the recycled oxide entering it.
      const barH = segY[i + 1][r].y1 - segY[i + 1][r].y0
        - (i + 1 === iSep ? (entering[r] ?? 0) : 0);
      return inv > 1e-9 ? barH / inv : 0;
    };
    const srcCum = Object.fromEntries(REGIONS.map((r) => [r, segY[i][r].y0]));
    const tgtCum = Object.fromEntries(REGIONS.map((r) => [r, segY[i + 1][r].y0]));
    for (const src of REGIONS) {
      const outs = ifaceFlows.filter((f) => f.from === src)
        .sort((a, b) => (a.to === src ? -1 : b.to === src ? 1 : REGIONS.indexOf(a.to) - REGIONS.indexOf(b.to)));
      for (const f of outs) {
        const sw = f.value * srcScale, tw = f.value * tgtScale(f.to);
        const x1 = colX[i] + NODE_W, x2 = colX[i + 1], mx = (x1 + x2) / 2;
        const sy = srcCum[src], ty = tgtCum[f.to];
        srcCum[src] += sw; tgtCum[f.to] += tw;
        ribbons.push(
          <path key={`${c.iface}-${f.from}-${f.to}`}
            d={`M${x1},${sy} C${mx},${sy} ${mx},${ty} ${x2},${ty} L${x2},${ty + tw} C${mx},${ty + tw} ${mx},${sy + sw} ${x1},${sy + sw} Z`}
            fill={REGION_COLOR[src]} fillOpacity={0.5}>
            <title>{`${f.from}${f.from === f.to ? ' (stays in region)' : ` → ${f.to}`}: ${f.value.toFixed(1)} kt`}</title>
          </path>,
        );
      }
    }
  });

  return (
    <section ref={boxRef} style={{ border: '1px solid var(--rule)', borderRadius: compact ? 8 : 10,
                      padding: compact ? '10px 14px 10px' : 20, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 2 : 6, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ font: `600 ${compact ? 12 : 13}px var(--font-mono)`, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Global supply chain</h2>
          {controls}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['total', 'heavy', 'light'] as const).map((c) => (
              <button key={c} onClick={() => setCls(c)} title={c === 'heavy' ? 'Dy/Tb (heavy) flow' : c === 'light' ? 'Nd/Pr (light) flow' : 'all material'}
                style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${cls === c ? 'var(--accent)' : 'var(--rule-strong)'}`, background: cls === c ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
                {c === 'total' ? 'Total' : c === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {REGIONS.map((r) => (
              <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: REGION_COLOR[r] }} />
                <span style={{ opacity: 0.75 }}>{r}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      {pending && (
        <div role="status" style={{ aspectRatio: `${W} / ${PADY + innerH + FOOT}`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      font: '400 12px var(--font-mono)', color: 'var(--ink-3)' }}>
          Loading the flows for these settings
        </div>
      )}
      <div ref={wrapRef} style={{ position: 'relative', display: pending ? 'none' : 'block' }}
        onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${CW} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Supply-chain Sankey">
        {ribbons}
        {recycleArcs}
        {COLS.map((c, i) => (
          <g key={c.label}>
            {REGIONS.map((r) => {
              const s = segY[i][r], hh = s.y1 - s.y0;
              if (hh < 0.6) return null;
              return <rect key={r} x={colX[i]} y={s.y0} width={NODE_W} height={hh} fill={REGION_COLOR[r]} stroke="var(--paper)" strokeWidth={1}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) => onNodeMove(e, i, r, hh)} onMouseLeave={() => setHover(null)} />;
            })}
            {REGIONS.map((r) => {
              const s = segY[i][r], h = s.y1 - s.y0;
              if (h < 16) return null;
              const last = i === COLS.length - 1;
              return (
                <text key={r + 'p'} x={last ? colX[i] - 6 : colX[i] + NODE_W + 6} y={(s.y0 + s.y1) / 2}
                  textAnchor={last ? 'end' : 'start'} dominantBaseline="central"
                  style={{ font: `600 ${F.pct}px var(--font-mono)`, fill: REGION_COLOR[r] }}>
                  {Math.round((h / innerH) * 100)}%
                </text>
              );
            })}
            <svg x={colX[i] + NODE_W / 2 - (c.label.length * LABEL_CH) / 2 - ICON - 5} y={2}
              width={ICON} height={ICON} style={{ color: 'var(--ink)', opacity: 0.7, overflow: 'visible' }}>
              {STAGE_ICON[c.label]}
            </svg>
            <text x={colX[i] + NODE_W / 2} y={15} textAnchor="middle" style={{ font: `600 ${F.label}px var(--font-mono)`, fill: 'var(--ink)', opacity: 0.85, cursor: 'default' }}>
              {c.label}<title>{c.desc}</title>
            </text>
            {wrapLabel(c.sub).map((ln, li, arr) => (
              <text key={`sub${li}`} x={colX[i] + NODE_W / 2} y={(arr.length === 2 ? 31 : 36) + li * 11} textAnchor="middle"
                style={{ font: `400 ${F.sub}px var(--font-mono)`, fill: 'var(--accent)', opacity: 0.75, cursor: 'default' }}>
                {ln}<title>{c.desc}</title>
              </text>
            ))}
          </g>
        ))}
      </svg>
      {hover && (
        <div style={{
          position: 'absolute', top: hover.y + 14,
          ...(hover.flip ? { right: (wrapRef.current?.clientWidth ?? 0) - hover.x + 14 } : { left: hover.x + 14 }),
          pointerEvents: 'none', zIndex: 20, maxWidth: 250,
          background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10)', padding: '7px 10px',
        }}>
          <div style={{ font: '600 11.5px var(--font-mono)', lineHeight: 1.28, marginBottom: hover.rows.length || hover.note ? 4 : 0 }}>
            {hover.head} <span style={{ fontWeight: 400, opacity: 0.55 }}>· {hover.sub}</span>
          </div>
          {hover.rows.map((row) => (
            <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, lineHeight: 1.28, marginBottom: 0 }}>
              <span>{row.name} <span style={{ opacity: 0.5 }}>· {row.country}</span></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>{row.pct}% <span style={{ fontWeight: 400, opacity: 0.6 }}>· {kt(row.mass)} kt</span></span>
            </div>
          ))}
          {hover.note && <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.35, marginTop: 4 }}>{hover.note}</div>}
        </div>
      )}
      </div>
      <p style={{ fontSize: 11, opacity: 0.55, margin: 0, lineHeight: 1.35, maxWidth: 'none' }}>
        <b>Least-cost supply chain</b> showing regions’ share by stage under selected
        assumptions{year ? <>, <b>{year}</b></> : null}. Note that masses differ by stage
        (hover any bar): first 3 columns are rare-earth oxide (RE content), while magnet
        and demand are finished-magnet mass (RE + iron + boron; ~3× heavier). Colors
        indicate US-security:
        <span style={{ color: '#66C2A5', fontWeight: 600 }}> US-made</span> (secure) ·
        <span style={{ color: '#FDAE61', fontWeight: 600 }}> allies</span> (medium) ·
        <span style={{ color: '#D53E4F', fontWeight: 600 }}> China</span> (exposed).
      </p>
      {cls === 'heavy' && (
        <p style={{ fontSize: 11, opacity: 0.72, marginTop: 6, lineHeight: 1.5,
                    borderLeft: '2px solid var(--cardinal)', paddingLeft: 8 }}>
          <b>Reading the Dy/Tb view:</b> the mining and separation bars are <b>ore and oxide tonnage</b>,
          not pure dysprosium + terbium. A “heavy” deposit is heavy-<i>enriched</i> but still mostly light
          REO — only ~6% of its output is Dy/Tb — so an ex-China heavy project covers far less of the heavy
          chokepoint than its headline capacity implies, and the binding constraint is heavy <b>ore</b>
          (a China/Myanmar ion-clay near-monopoly), not where the separation plant sits.
        </p>
      )}
    </section>
  );
}
