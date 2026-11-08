/**
 * Forest carbon accounting: one stylised company, up to four accounting
 * rules side by side. The rail picks the company; its forest, other
 * emissions and levers sit behind collapsed groups whose summary line says
 * what the preset holds. The main area shows what each rule puts in the
 * inventory stage by stage (Figure 1), what each rule rewards (Figure 2) and
 * what each lets the company claim (Figure 3). The arithmetic is in
 * model.ts; nothing here decides what counts.
 *
 * Reads downward on a phone; rail beside charts on a desktop (ToolShell).
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, ChevronRight, Minus } from 'lucide-react';
import ToolShell from '../_shell/ToolShell';
import Methods from './Methods';
import ChainChart from './ChainChart';
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
  type ProposedOptions,
  type RuleId,
  type Traceability,
} from './model';

const BASE = '/tools/forest-accounting';

const mono11: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };
const caption: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0 };
const cell: React.CSSProperties = { padding: '7px 8px', fontSize: 13, borderBottom: '1px solid var(--rule)', verticalAlign: 'top' };
const num: React.CSSProperties = { ...cell, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' };
const selectStyle: React.CSSProperties = { font: '13px var(--font-sans, Inter, system-ui)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 4, padding: '6px 8px', width: '100%' };

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

/** A collapsed group: the summary line carries the group's current values so a closed group still tells you what the preset holds. */
function Group({ title, digest, open, children }: { title: string; digest: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }} className="fa-group">
      <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <ChevronRight size={13} strokeWidth={2} style={{ marginTop: 2, flex: 'none', color: 'var(--ink-3)' }} className="fa-chev" />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ ...mono11, color: 'var(--ink-2)' }}>{title}</span>
          <span style={{ fontSize: 11.5, lineHeight: 1.35, color: 'var(--ink-4)' }}>{digest}</span>
        </span>
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0 6px 19px' }}>{children}</div>
    </details>
  );
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

function Row({ label, vals, strong }: { label: string; vals: string[]; strong?: boolean }) {
  return (
    <tr>
      <td style={{ ...cell, color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>{label}</td>
      {vals.map((v, i) => <td key={i} style={{ ...num, color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>{v}</td>)}
    </tr>
  );
}

/* ---------------- the tool ---------------- */

export default function ForestAccountingTool() {
  const [presetId, setPresetId] = useState(COMPANIES[0].id);
  const [c, setC] = useState<Company>(COMPANIES[0]);
  const [rules, setRules] = useState<RuleId[]>(RULE_ORDER);
  const [opt, setOpt] = useState<ProposedOptions>(DEFAULT_PROPOSED);
  const [methods, setMethods] = useState(false);

  const preset = COMPANIES.find((p) => p.id === presetId) ?? COMPANIES[0];
  const edited = JSON.stringify(c) !== JSON.stringify(preset);
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC((p) => ({ ...p, [k]: v }));

  const ledgers = useMemo(() => RULE_ORDER.filter((r) => rules.includes(r)).map((r) => ledger(c, r, opt)), [c, rules, opt]);
  const shown = ledgers.map((L) => L.rule);

  const actions = actionsFor(c);
  const reading = (a: (typeof actions)[number]) => {
    const rewards = shown.filter((r) => effect(c, r, a, opt) < -0.05).map((r) => RULES[r].short);
    const penal = shown.filter((r) => effect(c, r, a, opt) > 0.05).map((r) => RULES[r].short);
    if (!rewards.length && !penal.length) return null;
    const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
    return `${a.label.replace(/ \(.*\)$/, '')}: ${rewards.length ? `rewarded under ${join(rewards)}` : ''}${rewards.length && penal.length ? '; ' : ''}${penal.length ? `penalised under ${join(penal)}` : ''}.`;
  };

  const guardOn = Object.values(opt).filter(Boolean).length;
  const digests = {
    forest: c.area > 0
      ? `${fmt(c.area)} Mha · growth ${fmt(c.ambient)} ambient, ${fmt(c.legacy)} legacy, ${fmt(c.mgmt)} managed · harvest ${fmt(c.harvest)} t/ha/yr`
      : `No forest of its own · leased forest grows ${fmt(c.ambient)} ambient, ${fmt(c.legacy)} legacy t/ha/yr`,
    other: [`fossil ${fmt(c.fossil)}`, c.ag > 0 ? `agricultural ${fmt(c.ag)}` : '', c.luc > 0 ? `land-use change ${fmt(c.luc)}` : ''].filter(Boolean).join(' · ') + ' Mt/yr',
    levers: [`leased forest ${fmt(c.leased)} Mha`, `durable removals ${fmt(c.cdr)} Mt at $${c.cdrPrice}/t`, c.scope === 'scope3' ? `${c.claimants} claimant${c.claimants === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
  };
  const sliders = (g: 'forest' | 'other' | 'levers') =>
    SLIDERS.filter((s) => s.group === g && (s.key !== 'claimants' || c.scope === 'scope3')).map((s) => (
      <Slider key={s.key} label={s.label} unit={s.unit} min={s.min} max={s.max} step={s.step} note={s.note}
        value={c[s.key] as number} onChange={(v) => set(s.key, v as never)} />
    ));

  const rail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...mono11, margin: '14px 0 2px' }}>Company</p>
      <select value={presetId} aria-label="Company" style={selectStyle}
        onChange={(e) => { const p = COMPANIES.find((x) => x.id === e.target.value)!; setPresetId(p.id); setC(p); }}>
        {COMPANIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: 'var(--ink-3)' }}>{preset.blurb}</p>
      {c.scope === 'scope3' ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: 'var(--ink-2)' }}>
          Traceability of the wood
          <select value={c.traceability} onChange={(e) => set('traceability', e.target.value as Traceability)} style={{ ...selectStyle, fontSize: 12.5, padding: '5px 8px' }}>
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

      <p style={{ ...mono11, margin: '14px 0 2px' }}>Rules to compare</p>
      {RULE_ORDER.map((r) => (
        <Check key={r} checked={rules.includes(r)} label={`${RULES[r].short}: ${RULES[r].name}`}
          onChange={(v) => setRules((xs) => (v ? RULE_ORDER.filter((x) => x === r || xs.includes(x)) : xs.filter((x) => x !== r)))} />
      ))}

      <div style={{ marginTop: 8 }}>
        {rules.includes('proposed') && (
          <Group title="Guardrail switches" digest={`${guardOn} of 4 on: ${[opt.attributableOnly && 'attributable only', opt.separateLedgers && 'separate ledgers', opt.likeForLike && 'like for like', opt.oneClaimant && 'one claimant'].filter(Boolean).join(', ') || 'none'}`}>
            <Check checked={opt.attributableOnly} onChange={(v) => setOpt({ ...opt, attributableOnly: v })} label="Attributable removals only" sub="Count growth the company caused; disclose the background sink, don't claim it." />
            <Check checked={opt.separateLedgers} onChange={(v) => setOpt({ ...opt, separateLedgers: v })} label="Separate ledgers" sub="Report emissions and removals as two totals; no net line." />
            <Check checked={opt.likeForLike} onChange={(v) => setOpt({ ...opt, likeForLike: v })} label="Like for like" sub="Fossil CO₂ is balanced only by durable storage." />
            <Check checked={opt.oneClaimant} onChange={(v) => setOpt({ ...opt, oneClaimant: v })} label="One claimant per tonne" sub="A shared scope 3 removal is divided among those who report it." />
          </Group>
        )}
        <Group title="The forest" digest={digests.forest}>{sliders('forest')}</Group>
        <Group title="Other emissions" digest={digests.other}>{sliders('other')}</Group>
        <Group title="Levers" digest={digests.levers}>{sliders('levers')}</Group>
      </div>

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

          <section>
            <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 1</p>
            <h3 style={{ ...figTitle, marginBottom: 12 }}>Where the carbon moves, and what each rule counts</h3>
            <ChainChart company={c} ledgers={ledgers} />
            <p style={{ ...caption, marginTop: 10 }}>
              Stages in supply chain order under the scope they fall in; one row per rule. Emissions extend right of a stage's zero line and removals left, Mt CO₂e per year; a dashed outline is disclosed outside the scopes. Bars share a colour where the rule nets them together, so a row of one colour nets to one number. The arrow at the scope border marks removals crossing it. Every rule sees the same forest; they differ in which growth counts as the company's, what nets against what, and what is disclosed rather than claimed.
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
