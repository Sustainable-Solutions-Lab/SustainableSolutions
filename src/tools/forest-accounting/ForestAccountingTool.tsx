/**
 * Forest carbon accounting: one stylised company, up to four accounting
 * rules side by side. The rail sets the company and its forest; the main
 * area shows what each rule puts in the inventory (the ledger chart), what
 * each rule rewards (the actions table) and what each lets the company
 * claim (the net-zero table). The arithmetic is in model.ts; nothing here
 * decides what counts.
 *
 * Reads downward on a phone; rail beside charts on a desktop (ToolShell).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Minus } from 'lucide-react';
import ToolShell from '../_shell/ToolShell';
import Methods from './Methods';
import SupplyStrip, { ruleTabs } from './SupplyStrip';
import {
  actionsFor,
  COMPANIES,
  DEFAULT_PROPOSED,
  RULES,
  RULE_ORDER,
  SLIDERS,
  TRACEABILITY_LABEL,
  effect,
  fmt,
  ledger,
  type Company,
  type Ledger,
  type ProposedOptions,
  type RuleId,
  type Segment,
  type Traceability,
} from './model';

const BASE = '/tools/forest-accounting';

const COLOR: Record<string, string> = {
  fossil: 'var(--ink-3)',
  ag: 'var(--spectral-4)',
  luc: 'var(--spectral-3)',
  forest: 'var(--spectral-2)',
  mgmt: 'var(--spectral-9)',
  legacy: 'var(--spectral-8)',
  ambient: 'var(--spectral-10)',
  leased: 'var(--spectral-11)',
};
const LEGEND: Array<[string, string]> = [
  ['fossil', 'Fossil and industrial'],
  ['ag', 'Agricultural CH₄ and N₂O'],
  ['luc', 'Land-use change'],
  ['forest', 'Harvest and wood use'],
  ['mgmt', 'Growth caused by management'],
  ['legacy', 'Regrowth from past harvest'],
  ['ambient', 'Ambient growth'],
  ['leased', 'Growth on leased forest'],
];

const mono11: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };
const caption: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0 };
const cell: React.CSSProperties = { padding: '7px 8px', fontSize: 13, borderBottom: '1px solid var(--rule)', verticalAlign: 'top' };
const num: React.CSSProperties = { ...cell, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => { for (const e of es) setW(e.contentRect.width); });
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------------- rail controls ---------------- */

function Slider({ label, unit, min, max, step, value, note, onChange }: {
  label: string; unit: string; min: number; max: number; step: number; value: number; note?: string; onChange: (v: number) => void;
}) {
  const d = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.3 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
          {value.toFixed(d)}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      {note && <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: 'var(--ink-4)' }}>{note}</p>}
    </div>
  );
}

function Check({ checked, onChange, label, sub }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 12.5, lineHeight: 1.35, color: 'var(--ink-2)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--cardinal)' }} />
      <span>
        <span style={{ color: 'var(--ink)' }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-4)' }}>{sub}</span>}
      </span>
    </label>
  );
}

const groupHead = (t: string) => <p style={{ ...mono11, margin: '14px 0 2px' }}>{t}</p>;

/* ---------------- the ledger chart ---------------- */

type Focus = { rule: RuleId; seg: Segment; info?: boolean } | null;

function LedgerChart({ ledgers, focus, setFocus }: { ledgers: Ledger[]; focus: Focus; setFocus: (f: Focus) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 360;
  const m = { l: 46, r: 8, t: 26, b: 48 };
  const iw = Math.max(width - m.l - m.r, 120);
  const n = Math.max(ledgers.length, 1);
  const col = iw / n;
  const bw = Math.min(col * 0.42, 84);
  const infoW = Math.max(bw * 0.38, 10);

  let hi = 0;
  let lo = 0;
  for (const L of ledgers) {
    hi = Math.max(hi, L.fossil + L.landEmissions, ...L.info.filter((s) => s.value > 0).map((s) => s.value), L.position);
    lo = Math.min(lo, L.removalsTotal, L.position, ...L.info.filter((s) => s.value < 0).map((s) => s.value));
  }
  const span = Math.max(hi - lo, 1);
  hi += span * 0.08; lo -= span * 0.08;
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const step = niceStep((hi - lo) / 6);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(Number(v.toFixed(6)));

  const seg = (rule: RuleId, s: Segment, x: number, w: number, y0: number, y1: number, info = false) => {
    const on = focus && focus.rule === rule && focus.seg.key === s.key && !!focus.info === info;
    const top = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), 1);
    return (
      <rect
        key={`${rule}-${s.key}-${info}`}
        x={x} y={top} width={w} height={h}
        fill={info ? 'transparent' : COLOR[s.key] ?? 'var(--ink-4)'}
        stroke={info ? 'var(--ink-3)' : on ? 'var(--ink)' : 'var(--paper)'}
        strokeWidth={on ? 1.5 : 1}
        strokeDasharray={info ? '3 3' : undefined}
        opacity={focus && !on ? 0.55 : 1}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setFocus({ rule, seg: s, info })}
        onMouseLeave={() => setFocus(null)}
        onClick={() => setFocus(on ? null : { rule, seg: s, info })}
      >
        <title>{`${RULES[rule].short} · ${s.label}: ${fmt(s.value)} Mt CO₂e/yr${info ? ' (outside the scopes)' : ''}`}</title>
      </rect>
    );
  };

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={width} height={H} role="img" aria-label="Inventory under each accounting rule" style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--ink-2)' : 'var(--rule)'} strokeWidth={t === 0 ? 1 : 0.75} />
            <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" style={{ font: '10.5px var(--font-mono)', fill: 'var(--ink-3)' }}>{t}</text>
          </g>
        ))}
        <text x={m.l - 6} y={m.t - 12} textAnchor="end" style={{ font: '10px var(--font-mono)', fill: 'var(--ink-4)', letterSpacing: '0.06em' }}>Mt CO₂e/yr</text>

        {ledgers.map((L, i) => {
          const cx = m.l + col * i + col / 2;
          const x = cx - (bw + 6 + infoW) / 2;
          const xi = x + bw + 6;
          const els: JSX.Element[] = [];
          let up = 0;
          const pos: Segment[] = [{ key: 'fossil', label: 'Fossil and industrial', value: L.fossil }, ...L.emissions].filter((s) => s.value > 0);
          for (const s of pos) { els.push(seg(L.rule, s, x, bw, y(up), y(up + s.value))); up += s.value; }
          let dn = 0;
          for (const s of L.removals) { els.push(seg(L.rule, s, x, bw, y(dn), y(dn + s.value))); dn += s.value; }
          let iu = 0, idn = 0;
          for (const s of L.info) {
            if (s.value >= 0) { els.push(seg(L.rule, s, xi, infoW, y(iu), y(iu + s.value), true)); iu += s.value; }
            else { els.push(seg(L.rule, s, xi, infoW, y(idn), y(idn + s.value), true)); idn += s.value; }
          }
          return (
            <g key={L.rule}>
              {els}
              {up > 0 && <text x={x + bw / 2} y={y(up) - 4} textAnchor="middle" style={{ font: '11px var(--font-mono)', fill: 'var(--ink-2)' }}>+{fmt(up)}</text>}
              {dn < 0 && <text x={x + bw / 2} y={y(dn) + 12} textAnchor="middle" style={{ font: '11px var(--font-mono)', fill: 'var(--ink-2)' }}>{fmt(dn)}</text>}
              {/* the company's net-zero position: what it must still balance (above zero) or reports as surplus (below) */}
              <line x1={x - 5} x2={x + bw + 5} y1={y(L.position)} y2={y(L.position)} stroke="var(--cardinal)" strokeWidth={2} />
              <text x={x + bw + 8 + (L.info.length ? infoW : 0)} y={y(L.position)} dy="0.32em" style={{ font: '10.5px var(--font-mono)', fill: 'var(--cardinal)' }}>{fmt(L.position)}</text>
              <text x={cx} y={H - m.b + 18} textAnchor="middle" style={{ font: '600 12px var(--font-sans, Inter, system-ui)', fill: 'var(--ink)' }}>{RULES[L.rule].short}</text>
              <text x={cx} y={H - m.b + 33} textAnchor="middle" style={{ font: '10.5px var(--font-mono)', fill: 'var(--ink-3)' }}>
                {L.netsFossil ? 'nets everything' : L.netsLand ? 'nets within land' : 'two ledgers'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/* ---------------- tables ---------------- */

function Delta({ v }: { v: number }) {
  const z = Math.abs(v) < 0.05;
  const color = z ? 'var(--ink-4)' : v < 0 ? 'var(--positive)' : 'var(--negative)';
  const Icon = z ? Minus : v < 0 ? ArrowDown : ArrowUp;
  return (
    <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {z ? '0' : (v > 0 ? '+' : '') + fmt(v)}
    </span>
  );
}

/* ---------------- the tool ---------------- */

export default function ForestAccountingTool() {
  const [presetId, setPresetId] = useState(COMPANIES[0].id);
  const [c, setC] = useState<Company>(COMPANIES[0]);
  const [rules, setRules] = useState<RuleId[]>(RULE_ORDER);
  const [opt, setOpt] = useState<ProposedOptions>(DEFAULT_PROPOSED);
  const [focus, setFocus] = useState<Focus>(null);
  const [methods, setMethods] = useState(false);
  const [stripRule, setStripRule] = useState<RuleId>('mlp');

  const preset = COMPANIES.find((p) => p.id === presetId) ?? COMPANIES[0];
  const edited = JSON.stringify(c) !== JSON.stringify(preset);
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC((p) => ({ ...p, [k]: v }));

  const ledgers = useMemo(() => RULE_ORDER.filter((r) => rules.includes(r)).map((r) => ledger(c, r, opt)), [c, rules, opt]);
  const shown = ledgers.map((L) => L.rule);
  const stripL = ledgers.find((L) => L.rule === stripRule) ?? ledgers[0];
  const present = new Set<string>(['fossil']);
  for (const L of ledgers) for (const s of [...L.emissions, ...L.removals]) present.add(s.key);

  const actions = actionsFor(c);
  const reading = (a: (typeof actions)[number]) => {
    const rewards = shown.filter((r) => effect(c, r, a, opt) < -0.05).map((r) => RULES[r].short);
    const penal = shown.filter((r) => effect(c, r, a, opt) > 0.05).map((r) => RULES[r].short);
    if (!rewards.length && !penal.length) return null;
    const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
    return `${a.label.replace(/ \(.*\)$/, '')}: ${rewards.length ? `rewarded under ${join(rewards)}` : ''}${rewards.length && penal.length ? '; ' : ''}${penal.length ? `penalised under ${join(penal)}` : ''}.`;
  };

  const rail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groupHead('Company')}
      <select
        value={presetId}
        onChange={(e) => { const p = COMPANIES.find((x) => x.id === e.target.value)!; setPresetId(p.id); setC(p); }}
        aria-label="Company"
        style={{ font: '13px var(--font-sans, Inter, system-ui)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 4, padding: '6px 8px' }}
      >
        {COMPANIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--ink-3)' }}>{preset.blurb}</p>
      {c.scope === 'scope3' ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: 'var(--ink-2)' }}>
          Traceability of the wood
          <select value={c.traceability} onChange={(e) => set('traceability', e.target.value as Traceability)}
            style={{ font: '12.5px var(--font-sans, Inter, system-ui)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 4, padding: '5px 8px' }}>
            {(Object.keys(TRACEABILITY_LABEL) as Traceability[]).map((t) => <option key={t} value={t}>{TRACEABILITY_LABEL[t]}</option>)}
          </select>
        </label>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-4)' }}>Scope 1: forest the company owns or controls.</p>
      )}
      {edited && (
        <button type="button" onClick={() => setC(preset)} style={{ alignSelf: 'flex-start', font: '11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cardinal)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          Reset to preset
        </button>
      )}

      {groupHead('Rules to compare')}
      {RULE_ORDER.map((r) => (
        <Check key={r} checked={rules.includes(r)} label={`${RULES[r].short}: ${RULES[r].name}`} sub={RULES[r].source}
          onChange={(v) => setRules((xs) => (v ? RULE_ORDER.filter((x) => x === r || xs.includes(x)) : xs.filter((x) => x !== r)))} />
      ))}
      {rules.includes('proposed') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 10, borderLeft: '2px solid var(--rule-strong)' }}>
          <Check checked={opt.attributableOnly} onChange={(v) => setOpt({ ...opt, attributableOnly: v })} label="Attributable removals only" sub="Count growth the company caused; disclose the background sink, don't claim it." />
          <Check checked={opt.separateLedgers} onChange={(v) => setOpt({ ...opt, separateLedgers: v })} label="Separate ledgers" sub="Report emissions and removals as two totals; no net line." />
          <Check checked={opt.likeForLike} onChange={(v) => setOpt({ ...opt, likeForLike: v })} label="Like for like" sub="Fossil CO₂ is balanced only by durable storage." />
          <Check checked={opt.oneClaimant} onChange={(v) => setOpt({ ...opt, oneClaimant: v })} label="One claimant per tonne" sub="A shared scope 3 removal is divided among those who report it." />
        </div>
      )}

      {(['forest', 'other', 'levers'] as const).map((g) => (
        <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupHead(g === 'forest' ? 'The forest' : g === 'other' ? 'Other emissions' : 'Levers')}
          {SLIDERS.filter((s) => s.group === g && (s.key !== 'claimants' || c.scope === 'scope3')).map((s) => (
            <Slider key={s.key} label={s.label} unit={s.unit} min={s.min} max={s.max} step={s.step} note={s.note}
              value={c[s.key] as number} onChange={(v) => set(s.key, v as never)} />
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
        <button type="button" onClick={() => setMethods(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: '11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', background: 'none', border: '1px solid var(--rule-strong)', borderRadius: 4, padding: '6px 10px', cursor: 'pointer' }}>
          <BookOpen size={14} strokeWidth={1.5} /> Methods
        </button>
        <a href={`${BASE}-methods`} style={{ font: '11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Rules in detail</a>
      </div>
    </div>
  );

  return (
    <div className="fa-tool" style={{ height: '100%' }}>
      <ToolShell
        eyebrow="Accounting explorer"
        title="Forest carbon accounting"
        summary="The same forest, four accounting rules. What each puts in a company's inventory, what each rewards, and what each lets the company claim."
        rail={rail}
        mainScroll
      >
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '20px 16px 96px', display: 'flex', flexDirection: 'column', gap: 36 }}>
          <header>
            <p style={{ ...mono11, margin: 0 }}>{c.scope === 'scope1' ? 'Scope 1 · owned or controlled forest' : `Scope 3 · ${TRACEABILITY_LABEL[c.traceability].toLowerCase()}`}</p>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600, lineHeight: 1.15, margin: '4px 0 6px', color: 'var(--ink)' }}>{preset.name}{edited ? ', edited' : ''}</h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{preset.blurb}</p>
          </header>

          {stripL && (
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <p style={{ ...mono11, margin: '0 0 4px' }}>The supply chain</p>
                  <h3 style={figTitle}>Where the carbon moves, and what nets under {RULES[stripL.rule].short}</h3>
                </div>
                {ruleTabs(shown, stripL.rule, setStripRule)}
              </div>
              <SupplyStrip company={c} ledger={stripL} />
              <p style={{ ...caption, marginTop: 10 }}>
                Mt CO₂e per year at each stage, in chain order under the scope it falls in. The bar under a stage shows which pool it nets in under this rule; a dashed value is disclosed outside the scopes.
              </p>
            </section>
          )}

          <section>
            <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 1</p>
            <h3 style={figTitle}>What each rule puts in the inventory</h3>
            <LedgerChart ledgers={ledgers} focus={focus} setFocus={setFocus} />
            <div style={{ minHeight: 20, margin: '4px 0 8px' }}>
              {focus ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>
                  <strong>{RULES[focus.rule].short}</strong> · {focus.seg.label}: <span style={{ fontFamily: 'var(--font-mono)' }}>{fmt(focus.seg.value)} Mt CO₂e/yr</span>{focus.info ? ', reported outside the scopes' : ''}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-4)' }}>Tap a bar segment for its value.</p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, color: 'var(--ink-2)' }}>
              {LEGEND.filter(([k]) => present.has(k)).map(([k, l]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: COLOR[k], borderRadius: 2, display: 'inline-block' }} />{l}
                </span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, border: '1px dashed var(--ink-3)', borderRadius: 2, display: 'inline-block' }} />Reported outside the scopes
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 2, background: 'var(--cardinal)', display: 'inline-block' }} />Net-zero position: what the rule says is left to balance (above zero) or in surplus (below)
              </span>
            </div>
            <p style={{ ...caption, marginTop: 10 }}>
              Emissions above the line, removals below, Mt CO₂e per year. Every rule sees the same forest; they differ in which growth counts as the company's, what nets against what, and what is disclosed rather than claimed.
            </p>
            {ledgers.some((L) => L.notes.length) && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>
                {ledgers.flatMap((L) => L.notes.map((n, i) => <li key={`${L.rule}-${i}`}><strong style={{ color: 'var(--ink-2)' }}>{RULES[L.rule].short}</strong> · {n}</li>))}
              </ul>
            )}
          </section>

          <section>
            <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 2</p>
            <h3 style={figTitle}>What each rule rewards</h3>
            <p style={{ ...caption, margin: '4px 0 10px' }}>
              Change in the company's net-zero position, Mt CO₂e per year, if it took the action. Down means the rule rewards it; the same move can be rewarded under one rule and penalised under another.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, textAlign: 'left', ...mono11, borderBottom: '1px solid var(--rule-strong)' }}>Action</th>
                    {shown.map((r) => <th key={r} style={{ ...num, ...mono11, borderBottom: '1px solid var(--rule-strong)' }}>{RULES[r].short}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td style={{ ...cell, color: 'var(--ink)' }}>{a.label}</td>
                      {shown.map((r) => <td key={r} style={num}><Delta v={effect(c, r, a, opt)} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
              {actions.slice(0, 3).map((a) => { const t = reading(a); return t ? <li key={a.id}>{t}</li> : null; })}
            </ul>
          </section>

          <section>
            <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 3</p>
            <h3 style={figTitle}>What each rule lets the company claim</h3>
            <p style={{ ...caption, margin: '4px 0 10px' }}>
              Forest removals that stand in for durable removals are the ones the rule lets net against emissions the company would otherwise have to cut or balance with storage.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, textAlign: 'left', ...mono11, borderBottom: '1px solid var(--rule-strong)' }}>Reading</th>
                    {shown.map((r) => <th key={r} style={{ ...num, ...mono11, borderBottom: '1px solid var(--rule-strong)' }}>{RULES[r].short}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <Row label="Emissions in the scopes, Mt/yr" vals={ledgers.map((L) => fmt(L.fossil + L.landEmissions))} />
                  <Row label="Removals in the scopes, Mt/yr" vals={ledgers.map((L) => fmt(L.removalsTotal))} />
                  <Row label="Forest removals standing in for durable removals, Mt/yr" vals={ledgers.map((L) => fmt(L.substitutes))} />
                  <Row label={`Durable removals still needed to claim net zero, Mt/yr${c.cdr > 0 ? ` (after ${fmt(c.cdr)} bought)` : ''}`} vals={ledgers.map((L) => fmt(L.cdrNeeded))} strong />
                  <Row label={`Cost at $${c.cdrPrice}/t, $M/yr`} vals={ledgers.map((L) => fmt(L.cdrCost, 0))} />
                  <Row label="Wood footprint, t CO₂e per t of wood" vals={ledgers.map((L) => (L.woodFootprint === null ? '–' : fmt(L.woodFootprint, 2)))} />
                </tbody>
              </table>
            </div>
            <p style={{ ...caption, marginTop: 10 }}>
              A negative wood footprint means the rule reports wood as carbon negative: using more of it lowers the inventory.
            </p>
          </section>

          <footer style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)' }}>
              A stylised model for comparing rules, not an estimate for any real company. Rules follow the MLP+ submission (May 2025) and the activity-based accounting memo before the GHG Protocol's forest carbon accounting group, the 2022 draft guidance, and the Land Sector and Removals Standard (2026). <a href={`${BASE}-methods`} style={{ color: 'var(--ink-2)' }}>Methods and sources</a>.
            </p>
          </footer>
        </div>
      </ToolShell>
      {methods && <Methods onClose={() => setMethods(false)} />}
    </div>
  );
}

function Row({ label, vals, strong }: { label: string; vals: string[]; strong?: boolean }) {
  return (
    <tr>
      <td style={{ ...cell, color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>{label}</td>
      {vals.map((v, i) => <td key={i} style={{ ...num, color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>{v}</td>)}
    </tr>
  );
}
