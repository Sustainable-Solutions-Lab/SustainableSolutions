/**
 * AI and labor: how AI changes jobs and pay across 84 US industries, all in
 * general equilibrium at full AI progress. All industries at once (the range
 * of impacts, what drives each industry), then one industry in detail
 * (industry picker, scorecard, forces, contour over any two assumptions).
 * A plain scrolling page: no side rail. Data: ./data/tool.json,
 * from the ai-labor research repo (web/build_tool_data.py).
 *
 * The K&M aggregate panel is built but hidden (SHOW_KM) per SD 2026-10-05
 * ("maybe drop for now but save ability to bring it back") — flip the flag
 * to restore it at the bottom.
 */
import { useMemo, useRef, useState } from 'react';
import MethodsPane from './MethodsPane';
import OutlookChart from './OutlookChart';
import ForceMix from './ForceMix';
import { Scorecard, DecidesBar, ForceBars, GEContour } from './SectorDetail';
import { Chips, shortName } from './ui.jsx';
import * as km from './km.js';
import SECTORS from './data/sectors.json';
import TOOL from './data/tool.json';

const SHOW_KM = false;

/* ---------------- shared bits ---------------- */

const mono11 = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };
const caption = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0 };

/** Tick marks under a slider rail. A thumb's center travels from half its
 *  width inside one end of the track to half inside the other, so a tick at
 *  value fraction f sits at f·(100% − thumb) + thumb/2 (same geometry as the
 *  magnet explorer's Slider). Cardinal ticks mark measured values. */
function Ticks({ min, max, marks }) {
  const hasLabels = marks.some((m) => m.label);
  return (
    <div style={{ position: 'relative', height: hasLabels ? 16 : 7, marginTop: 1 }} aria-hidden="true">
      {marks.map((m, i) => {
        const f = Math.min(Math.max((m.v - min) / (max - min), 0), 1);
        const left = `calc(${f} * (100% - var(--dc-thumb)) + var(--dc-thumb) / 2)`;
        return (
          <span key={i}>
            <span style={{ position: 'absolute', left, top: 0, width: 2, height: 6, marginLeft: -1, background: m.accent ? 'var(--cardinal)' : 'var(--ink-4)' }} />
            {m.label && (
              <span style={{ position: 'absolute', left, top: 6, transform: `translateX(${f < 0.12 ? '0%' : f > 0.88 ? '-100%' : '-50%'})`, fontFamily: 'var(--font-mono)', fontSize: 9, color: m.accent ? 'var(--cardinal)' : 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                {m.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function Ctl({ k, lab, min, max, step, value, fmt, sub, onChange, extra, ticks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <label htmlFor={`dc-${k}`} style={{ fontSize: 13, color: 'var(--ink-2)' }}>{lab}</label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmt(value)}{extra}
        </span>
      </div>
      <input id={`dc-${k}`} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(+e.target.value)} />
      {ticks && ticks.length > 0 && <Ticks min={min} max={max} marks={ticks} />}
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}



/** Crosshair-tooltip wrapper for an SVG chart with a shared x domain. */
function HoverFig({ children, width, xToData, format }) {
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const onMove = (ev) => {
    const box = ref.current?.querySelector('svg')?.getBoundingClientRect();
    const fig = ref.current?.getBoundingClientRect();
    if (!box || !fig) return;
    const fx = ((ev.clientX - box.left) / box.width) * width;
    const d = xToData(fx);
    if (!d) return setTip(null);
    let x = ev.clientX - fig.left + 14;
    if (x > fig.width - 230) x -= 250;
    setTip({ x, y: ev.clientY - fig.top - 10, text: format(d) });
  };
  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerMove={onMove} onPointerLeave={() => setTip(null)}>
      {children}
      {tip && (
        <div style={{ position: 'absolute', left: tip.x, top: tip.y, pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.5, padding: '6px 9px', borderRadius: 2, whiteSpace: 'nowrap', zIndex: 4 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

const svgText = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--ink-3)' };
const svgLabel = { fontFamily: 'var(--font-sans)', fontSize: 12, fill: 'var(--ink-2)' };

const CT_NAMES = { physical: 'Physical ceiling', time_budget: 'Time-budget ceiling', open_ended: 'Open-ended', provenance: 'Provenance' };

/* ---------------- K&M aggregate panel (hidden behind SHOW_KM) ---------------- */

const KM_SLIDERS = [
  { k: 'sig', lab: 'σ — physical vs intelligence', min: 0.3, max: 3, step: 0.01, fmt: (v) => v.toFixed(2), sub: 'Below 1: complements (intelligence saturates). Above 1: substitutes.' },
  { k: 'sigI', lab: 'σᴵ — within intelligence tasks', min: 0.6, max: 5, step: 0.05, fmt: (v) => v.toFixed(2) },
  { k: 'sigP', lab: 'σᴾ — capital vs labor in physical', min: 0.3, max: 3, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'thI', lab: 'θᴵ — returns to scale in intelligence', min: 0.5, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'tau', lab: 'τ — weight on the physical sector', min: 0.05, max: 0.5, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'aP', lab: 'αᴾ — capital weight in physical', min: 0.3, max: 0.9, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: 'KI', lab: 'Kᴵ — AI capital stock', min: 0.5, max: 50, step: 0.5, fmt: (v) => v.toFixed(1) },
  { k: 'KP', lab: 'Kᴾ — physical capital stock', min: 0.3, max: 5, step: 0.02, fmt: (v) => v.toFixed(2) },
];
const KM_PRESETS = [
  { name: 'K&M baseline', v: { ...km.BASE } },
  { name: 'Substitutable sectors', v: { ...km.BASE, sig: 1.5 } },
  { name: 'Hard intelligence tasks', v: { ...km.BASE, sigI: 0.9 } },
  { name: 'AI abundance', v: { ...km.BASE, KI: 40 } },
];
const KM_BASE_SWEEP = km.sweep(km.params(km.BASE));

function kmPath(data, yof, ymin, ymax, M, W, H, keepAbundant) {
  const sx = (a) => M.l + a * (W - M.l - M.r);
  let s = '', pen = false;
  for (const d of data) {
    const on = keepAbundant === null || d.abundant === keepAbundant;
    if (on) {
      const y = H - M.b - ((yof(d) - ymin) / (ymax - ymin)) * (H - M.b - M.t);
      s += `${pen ? 'L' : 'M'}${sx(d.aI).toFixed(1)},${y.toFixed(1)}`;
      pen = true;
    } else pen = false;
  }
  return s;
}

function KmCharts({ cur }) {
  const data = useMemo(() => km.sweep(km.params(cur)), [cur]);
  const W = 640, H = 330, M = { l: 46, r: 88, t: 14, b: 36 };
  const sx = (a) => M.l + a * (W - M.l - M.r);
  const wAll = [...data.map((d) => d.w), ...KM_BASE_SWEEP.map((d) => d.w)];
  const wmin = Math.min(...wAll) * 0.96, wmax = Math.max(...wAll) * 1.04;
  const peak = data.reduce((a, b) => (b.w > a.w ? b : a));
  const interior = peak.aI > data[0].aI && peak.aI < 1 && peak.w > data[0].w && peak.w > data[data.length - 1].w;
  const bad = data.filter((d) => !d.abundant);
  const yW = (v) => H - M.b - ((v - wmin) / (wmax - wmin)) * (H - M.b - M.t);
  const ymax2 = Math.max(...data.map((d) => d.Y)) * 1.05;
  const yL = (v) => H - M.b - (v / ymax2) * (H - M.b - M.t);
  const last = data[data.length - 1];
  const bEnd = KM_BASE_SWEEP[Math.floor(KM_BASE_SWEEP.length * 0.72)];
  const axisX = (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={sx(t)} y={H - M.b + 16} textAnchor="middle" style={svgText}>{t}</text>
      ))}
      <text x={(M.l + W - M.r) / 2} y={H - 4} textAnchor="middle" style={svgLabel}>Automation share of intelligence tasks α_I</text>
    </>
  );
  const shade = bad.length > 0 && (
    <>
      <rect x={sx(Math.min(...bad.map((d) => d.aI)))} y={M.t}
        width={Math.max(2, sx(Math.max(...bad.map((d) => d.aI))) - sx(Math.min(...bad.map((d) => d.aI))))}
        height={H - M.t - M.b} fill="var(--paper-3)" />
      <text x={(sx(Math.min(...bad.map((d) => d.aI))) + sx(Math.max(...bad.map((d) => d.aI)))) / 2} y={M.t + 12}
        textAnchor="middle" style={svgText}>AI scarce</text>
    </>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ ...mono11, margin: 0 }}>Wage = marginal product of labor · K&M eq. 17</p>
        <HoverFig width={W}
          xToData={(fx) => {
            const a = Math.min(1, Math.max(0, (fx - M.l) / (W - M.l - M.r)));
            return data.reduce((p, c) => (Math.abs(c.aI - a) < Math.abs(p.aI - a) ? c : p));
          }}
          format={(d) => `α ${d.aI.toFixed(2)}  wage ${d.w.toFixed(3)}${d.abundant ? '' : '  (AI scarce)'}`}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
            aria-label="Wage against automation share, current parameters and the published baseline">
            {shade}
            <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--rule-strong)" />
            {axisX}
            <text x={M.l - 34} y={M.t + 2} style={svgLabel}>wage</text>
            <path d={kmPath(KM_BASE_SWEEP, (d) => d.w, wmin, wmax, M, W, H, null)} fill="none" stroke="var(--ink-4)" strokeWidth="1.3" strokeDasharray="4 4" />
            <path d={kmPath(data, (d) => d.w, wmin, wmax, M, W, H, false)} fill="none" stroke="var(--ink)" strokeOpacity="0.3" strokeWidth="2" />
            <path d={kmPath(data, (d) => d.w, wmin, wmax, M, W, H, true)} fill="none" stroke="var(--ink)" strokeWidth="2.2" />
            <text x={sx(bEnd.aI) + 4} y={yW(bEnd.w) + 14} style={svgText}>K&M baseline</text>
            {interior && (
              <>
                <circle cx={sx(peak.aI)} cy={yW(peak.w)} r="4" fill="var(--accent-brand)" />
                <text x={Math.min(sx(peak.aI) + 8, W - M.r - 10)} y={Math.max(yW(peak.w) - 8, M.t + 10)}
                  style={{ ...svgText, fill: 'var(--accent-brand)' }}>peak α={peak.aI.toFixed(2)}</text>
              </>
            )}
          </svg>
        </HoverFig>
        <figcaption style={caption}>
          {interior
            ? `The wage rises until α = ${peak.aI.toFixed(2)}, then falls: early automation lifts every worker's product, late automation crowds workers into physical tasks faster than output grows. Dashed: the published baseline (peak at 0.30).`
            : 'The wage moves monotonically under these parameters — no hump. Dashed: the published baseline, whose wage peaks at α = 0.30 and then declines.'}
        </figcaption>
      </figure>
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ ...mono11, margin: 0 }}>Allocation and output · K&M fig. 2</p>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: 'block', width: '100%', height: 'auto' }}
          aria-label="Share of labor in the physical sector and total output against automation share">
          {shade}
          <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--rule-strong)" />
          {axisX}
          <text x={M.l - 34} y={M.t + 2} style={svgLabel}>level</text>
          <path d={kmPath(data, (d) => d.Y, 0, ymax2, M, W, H, true)} fill="none" stroke="var(--negative)" strokeWidth="2.2" />
          <path d={kmPath(data, (d) => d.Y, 0, ymax2, M, W, H, false)} fill="none" stroke="var(--negative)" strokeOpacity="0.3" strokeWidth="2" />
          <path d={kmPath(data, (d) => d.beta, 0, ymax2, M, W, H, true)} fill="none" stroke="var(--info)" strokeWidth="2.2" />
          <path d={kmPath(data, (d) => d.beta, 0, ymax2, M, W, H, false)} fill="none" stroke="var(--info)" strokeOpacity="0.3" strokeWidth="2" />
          <text x={sx(1) + 6} y={yL(last.Y) + 4} style={{ ...svgLabel, fill: 'var(--negative)' }}>Y output</text>
          <text x={sx(1) + 6} y={yL(last.beta) + 4} style={{ ...svgLabel, fill: 'var(--info)' }}>β* physical</text>
        </svg>
        <figcaption style={caption}>
          β* is the share of labor in the physical sector once wages equalize; Y is total output.
          Both rise with automation under every parameterization — the action for workers is in
          the wage, not in output.
        </figcaption>
      </figure>
    </div>
  );
}

function KmSection() {
  const [cur, setCur] = useState({ ...km.BASE });
  return (
    <section aria-label="Aggregate model" style={{ borderTop: '2px solid var(--ink)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ ...mono11, margin: 0 }}>The aggregate model · Kording & Marinescu (2025)</p>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 23, fontWeight: 600, lineHeight: 1.2, margin: '4px 0 6px', color: 'var(--ink)' }}>
          When does automating intelligence help workers?
        </h2>
        <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.5 }}>
          The baseline our project extends: two complementary sectors, physical and intelligence,
          with labor flowing between them. Output always rises with automation, yet the wage can
          rise and then fall. Drag the parameters to see which worlds produce the hump.
        </p>
      </div>
      <div className="dc-km-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--rule)', borderRadius: 4, padding: '14px 14px 16px', background: 'var(--paper-2)', alignSelf: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {KM_PRESETS.map((p) => {
              const on = KM_SLIDERS.every((s) => Math.abs(p.v[s.k] - cur[s.k]) < 1e-9);
              return (
                <button key={p.name} type="button" onClick={() => setCur({ ...p.v })}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 9px', cursor: 'pointer',
                    border: '1px solid var(--rule-strong)', borderRadius: 2,
                    background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : 'var(--ink-2)',
                  }}>
                  {p.name}
                </button>
              );
            })}
          </div>
          {KM_SLIDERS.map((s) => (
            <Ctl key={s.k} k={`km-${s.k}`} lab={s.lab} min={s.min} max={s.max} step={s.step}
              value={cur[s.k]} fmt={s.fmt} sub={s.sub}
              onChange={(v) => setCur((c) => ({ ...c, [s.k]: v }))} />
          ))}
        </div>
        <KmCharts cur={cur} />
      </div>
    </section>
  );
}

/* ---------------- the tool ---------------- */

export default function DemandCeilingsTool() {
  const DEFAULT = TOOL.sectors.find((s) => s.code === '622000') ? '622000' : TOOL.sectors[0].code;
  const [selCode, setSelCode] = useState(DEFAULT);
  const [metric, setMetric] = useState('jobs');
  const [growth, setGrowth] = useState('none');
  const [methodsOpen, setMethodsOpen] = useState(false);
  const detailRef = useRef(null);

  const tsel = TOOL.sectors.find((x) => x.code === selCode) ?? null;
  const emp = Object.fromEntries(SECTORS.map((x) => [x.code, x.emp]));
  const nAll = TOOL.meta.n_outcomes;
  const what = metric === 'jobs' ? 'jobs' : 'average real wage';
  const nCase = metric === 'jobs' ? nAll / 2 : nAll / 6;
  const groups = useMemo(() => {
    const g = {};
    for (const s of SECTORS) (g[s.ct] = g[s.ct] || []).push(s);
    return g;
  }, []);

  const h2 = { fontFamily: 'var(--font-serif)', fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.01em', margin: '4px 0 6px', color: 'var(--ink)' };
  const lede = { margin: 0, fontSize: 14.5, color: 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.5 };
  const sectionRule = { borderTop: '1px solid var(--rule-strong)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 };

  const methodsBtn = (label) => (
    <button type="button" onClick={() => setMethodsOpen(true)}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', letterSpacing: 'inherit', textTransform: 'inherit' }}>
      {label}
    </button>
  );

  return (
    <div className="dc-tool" style={{ height: '100%', position: 'relative', overflowY: 'auto', background: 'var(--paper)' }}>
      {methodsOpen && <MethodsPane onClose={() => setMethodsOpen(false)} />}
        <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <p style={{ ...mono11, margin: 0 }}>Interactive model · AI and labor · {methodsBtn('methods')}</p>
            <h2 style={{ ...h2, fontSize: 'clamp(24px, 3.4vw, 32px)' }}>How AI changes US jobs and pay across industries</h2>
            <p style={lede}>
              Across 84 US industries employing 71 million people, analytic and creative services
              (insurance, legal, software, finance) lose jobs under almost any assumption; care, schooling and in-person services gain. AI capability
              decides how far the losers fall. Demand decides the survivors: as people grow richer
              they buy more human attention per unit in care and education. Pay is a separate
              story: unless AI also multiplies output, average real wages fall in every industry.
            </p>
          </div>

          <div style={{ padding: '8px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: '8px 18px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Chips label="Show" value={metric} onChange={setMetric} options={[['jobs', 'Jobs'], ['wage', 'Average real wage']]} />
            <Chips label="Growth" value={growth} onChange={setGrowth} options={[['none', 'No extra growth'], ['growth', 'Output ×3.5']]} />
            {tsel && (
              <button type="button" onClick={() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--accent-brand)', background: 'var(--paper)', color: 'var(--accent-brand)', cursor: 'pointer' }}>
                Selected: {shortName(tsel.name)} ↓
              </button>
            )}
          </div>

          <section aria-label="The range of impacts" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ ...mono11, margin: 0 }}>The range of impacts</p>
            <h3 style={figTitle}>
              {metric === 'jobs' ? 'Some industries shed jobs and others absorb them' : (growth === 'none' ? 'Without new growth, pay falls everywhere' : 'With growth, pay rises everywhere')}
            </h3>
            <OutlookChart sectors={TOOL.sectors} metric={metric} growth={growth} selCode={selCode} onPick={setSelCode} />
            <p style={caption}>
              Each circle is an industry, sized by employment, at its median change in {what} at
              full AI progress, coloured by whether it loses or gains jobs across all scenarios.
              Lanes group industries by what drives them: care, where income-elastic demand for
              human attention outruns AI; saturated in-person services, little touched by AI and
              little helped by income; education and civic work, highly exposed but shielded by a
              preference for people; desk work in finance, law and software, exposed with no such
              shield; and a mixed group of goods and utilities. Tap a circle to select it. The bar on the selected circle spans the middle
              90% (5–95%) of outcomes across a full grid of the model's other assumptions, every
              combination of AI reach into physical, analytic and creative tasks, capital supply,
              the human share of attention spending, the demand estimate
              {metric === 'jobs' ? ' and capital ownership' : ''}: {nCase.toLocaleString()} outcomes
              for this growth case. Jobs are shares of a fixed workforce. Real wages are buying
              power, wages deflated by consumer prices that AI lowers; they differ by industry
              because workers move between industries imperfectly
              {metric === 'wage' ? ', and wage outcomes hold ownership at today-like levels' : ''}.
            </p>
          </section>

          <section aria-label="What drives each industry" style={sectionRule}>
            <p style={{ ...mono11, margin: 0 }}>What drives each industry</p>
            <h3 style={figTitle}>The forces behind every industry's change in jobs</h3>
            <ForceMix sectors={TOOL.sectors} growth={growth} selCode={selCode} onPick={setSelCode} />
            <p style={caption}>
              Each column is an industry, width proportional to its wage bill, ordered by its net
              change in jobs (central assumptions). AI taking over physical, analytic or creative
              tasks pushes jobs down; the human-attention shield, cheaper output, a shift toward
              labor as it gets cheaper, and spending shifts push them up. The parts add up exactly
              to the net change (the line). Tap a column to select the industry.
            </p>
          </section>

          {tsel && (
            <section ref={detailRef} aria-label="One industry in detail"
              style={{ borderTop: '2px solid var(--ink)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 60 }}>
              <p style={{ ...mono11, margin: 0 }}>One industry in detail</p>
              <label htmlFor="dc-sector" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>Industry (or tap any circle or column above)</span>
                <select id="dc-sector" value={selCode} onChange={(e) => setSelCode(e.target.value)}
                  style={{ font: '600 clamp(18px, 2.6vw, 24px)/1.25 var(--font-serif)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '6px 8px', maxWidth: '100%' }}>
                  {['physical', 'time_budget', 'open_ended', 'provenance'].map((ct) =>
                    groups[ct] ? (
                      <optgroup key={ct} label={CT_NAMES[ct]}>
                        {groups[ct].map((x) => (
                          <option key={x.code} value={x.code}>{x.name} ({x.emp}M jobs)</option>
                        ))}
                      </optgroup>
                    ) : null
                  )}
                </select>
              </label>
              <Scorecard s={tsel} nOutcomes={nAll} />
              <DecidesBar s={tsel} />
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h3 style={{ ...figTitle, fontSize: 16 }}>The forces behind this industry's change in jobs</h3>
                <ForceBars s={tsel} growth={growth} />
                <figcaption style={caption}>
                  The same decomposition as the columns above, for this industry alone (central
                  assumptions, {growth === 'none' ? 'no extra growth' : 'output ×3.5'}). Bars add up,
                  in logs, to the net change.
                </figcaption>
              </figure>
              <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h3 style={{ ...figTitle, fontSize: 16 }}>How this industry's {what} responds to any two assumptions</h3>
                <GEContour s={tsel} metric={metric} growth={growth} />
                <figcaption style={caption}>
                  Change in this industry's {what} at full AI progress across the two assumptions you
                  choose, all others at central values (growth follows the chip above unless it is on
                  an axis). Bands running parallel to an axis mean the other assumption decides the
                  outcome.
                </figcaption>
              </figure>
            </section>
          )}

          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
            <div>
              <h3 style={{ ...mono11, fontWeight: 500, margin: '0 0 6px' }}>What to try</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                Switch between jobs and average wage, then turn on growth: pay falls everywhere
                without it and rises everywhere with it. Pick legal services and put creative reach
                against growth on the contour: creative reach decides it. Pick full-service
                restaurants: growth decides it, through saturated food demand. Pick hospitals: the
                human-attention shield nearly cancels displacement.
              </p>
            </div>
            <div>
              <h3 style={{ ...mono11, fontWeight: 500, margin: '0 0 6px' }}>Honest caveats</h3>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
                One economy-wide model: total employment is fixed, so industry changes are shifts in
                shares of jobs, not unemployment. Elasticities are measured 1959–2025 and
                extrapolated; AI reach and growth are scenarios, not forecasts; wage results rest on
                an assumed mobility between industries. Full details in the {methodsBtn('methods pane')}.
              </p>
            </div>
          </div>

          {SHOW_KM && <KmSection />}

          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, borderTop: '1px solid var(--rule)', paddingTop: 12, margin: 0 }}>
            Sector data: BEA 2017 detail benchmark × BLS QCEW 2025 employment × OEWS/O*NET task
            decomposition × PCE Engel slopes (1959–2025); results from the project's 84-industry
            general equilibrium. The aggregate framework builds on{' '}
            <a href="https://www.brookings.edu/articles/artificial-intelligence-saturation-and-the-future-of-work/">
              Kording & Marinescu (2025)
            </a>. Full {methodsBtn('methods')} in the tool; the{' '}
            <a href="/tools/ai-labor-methods">model schematic</a> page carries the equations and
            data provenance.
          </p>
        </div>
    </div>
  );
}
