/**
 * Supply-chain Sankey for the magnet explorer.
 * Columns (Concentrate → Oxide → Alloy → Magnet → Demand): each region's bar is
 * its share of the material flowing onward at that stage — INCLUDING recycling-
 * derived oxide, so every ribbon emanates from a real, same-coloured bar. Ribbons
 * are coloured by origin and taper to fill both the bar they leave and the bar
 * they enter (recovery losses + recycling injection mean throughput changes
 * between stages, so flows are proportional per interface, not conserved end-to-end).
 */

import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
const W = 900, H = 460, PADX = 64, PADY = 52, NODE_W = 16;
const innerH = H - 2 * PADY;
const colX = COLS.map((_, i) => PADX + i * ((W - 2 * PADX - NODE_W) / (COLS.length - 1)));

const outSum = (fl: FlowMap, iface: string, r: string) =>
  (fl[iface] ?? []).filter((f) => f.from === r).reduce((a, f) => a + f.value, 0);
const inSum = (fl: FlowMap, iface: string, r: string) =>
  (fl[iface] ?? []).filter((f) => f.to === r).reduce((a, f) => a + f.value, 0);

export default function FlowDiagram({ flows, active, scale = {} }: {
  flows: FlowsByClass; active: Set<string>; scale?: Record<string, number>;
}) {
  const [cls, setCls] = useState<'total' | 'heavy' | 'light'>('total');
  const fl = flows[cls];
  const wrapRef = useRef<HTMLDivElement>(null);
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
  COLS.forEach((c, i) => {
    if (!c.iface) return;
    const ifaceFlows = (fl[c.iface] ?? []);
    const total = ifaceFlows.reduce((a, f) => a + f.value, 0);
    if (total <= 0) return;
    const srcScale = innerH / total;
    // taper: target side fills each target bar exactly (handles recovery/recycling)
    const tgtScale = (r: string) => {
      const inv = inSum(fl, c.iface!, r), barH = segY[i + 1][r].y1 - segY[i + 1][r].y0;
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
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>Global supply chain</h2>
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
      <div ref={wrapRef} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Supply-chain Sankey">
        {ribbons}
        {COLS.map((c, i) => (
          <g key={c.label}>
            {REGIONS.map((r) => {
              const s = segY[i][r], hh = s.y1 - s.y0;
              if (hh < 0.6) return null;
              return <rect key={r} x={colX[i]} y={s.y0} width={NODE_W} height={hh} fill={REGION_COLOR[r]} stroke="var(--paper)" strokeWidth={1}
                style={{ cursor: 'help' }}
                onMouseMove={(e) => onNodeMove(e, i, r, hh)} onMouseLeave={() => setHover(null)} />;
            })}
            {REGIONS.map((r) => {
              const s = segY[i][r], h = s.y1 - s.y0;
              if (h < 16) return null;
              const last = i === COLS.length - 1;
              return (
                <text key={r + 'p'} x={last ? colX[i] - 6 : colX[i] + NODE_W + 6} y={(s.y0 + s.y1) / 2}
                  textAnchor={last ? 'end' : 'start'} dominantBaseline="central"
                  style={{ font: '600 15px var(--font-mono)', fill: REGION_COLOR[r] }}>
                  {Math.round((h / innerH) * 100)}%
                </text>
              );
            })}
            <text x={colX[i] + NODE_W / 2} y={15} textAnchor="middle" style={{ font: '600 16px var(--font-mono)', fill: 'var(--ink)', opacity: 0.85, cursor: 'help' }}>
              {c.label}<title>{c.desc}</title>
            </text>
            {wrapLabel(c.sub).map((ln, li, arr) => (
              <text key={`sub${li}`} x={colX[i] + NODE_W / 2} y={(arr.length === 2 ? 31 : 36) + li * 11} textAnchor="middle"
                style={{ font: '400 11px var(--font-mono)', fill: 'var(--accent)', opacity: 0.75, cursor: 'help' }}>
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
          boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10)', padding: '8px 10px',
        }}>
          <div style={{ font: '600 11.5px var(--font-mono)', marginBottom: hover.rows.length || hover.note ? 5 : 0 }}>
            {hover.head} <span style={{ fontWeight: 400, opacity: 0.55 }}>· {hover.sub}</span>
          </div>
          {hover.rows.map((row) => (
            <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, marginBottom: 2 }}>
              <span>{row.name} <span style={{ opacity: 0.5 }}>· {row.country}</span></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>{row.pct}% <span style={{ fontWeight: 400, opacity: 0.6 }}>· {kt(row.mass)} kt</span></span>
            </div>
          ))}
          {hover.note && <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4 }}>{hover.note}</div>}
        </div>
      )}
      </div>
      <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.5 }}>
        The <b>real-world-projected</b> chain, ~2035. Each bar is a region’s share of that stage
        (concentrate → oxide → alloy → magnet → demand). The chain is the <b>model’s own cost-optimal
        flows</b> at your current settings — already routing <b>allies→US</b> under friendshoring and
        reflecting the China-export + price-floor levers — with the <b>real projects you select below</b>
        layered on as ex-China capacity that displaces China; total throughput scales with demand.
        <b>Note the masses differ by stage</b> (hover any bar): the first three
        columns are <b>rare-earth oxide</b> (the RE content), while magnet + demand are <b>finished-magnet
        mass</b> (RE + iron + boron), ~3× heavier — the ribbons taper to fit both. Toggle projects
        (Round Top, Mt Weld, Lynas, …) to add ex-China capacity. The model, left to itself, mines
        almost all-China (Chinese ore isn’t export-restricted and is cheapest), so <b>ex-China mining
        appears only as you select real projects</b> — an ex-China mine may still ship its concentrate
        to Chinese separation, which the diagram shows. Read the palette as a US-security signal:
        <span style={{ color: '#66C2A5', fontWeight: 600 }}> US-made</span> (secure) ·
        <span style={{ color: '#FDAE61', fontWeight: 600 }}> allies</span> (medium) ·
        <span style={{ color: '#D53E4F', fontWeight: 600 }}> China</span> (exposed).
      </p>
    </section>
  );
}
