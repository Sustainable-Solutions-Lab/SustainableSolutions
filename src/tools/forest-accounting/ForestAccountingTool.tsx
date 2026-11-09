/**
 * Forest carbon accounting: one piece of land, four accounting rules side
 * by side. A plain scrolling page, no side rail (the ai-labor layout): a
 * sticky bar picks the land scenario and whether the reporting company is
 * its owner (scope 1) or a downstream buyer of its output (scope 3); the
 * scenario's forest, other emissions and levers sit in a collapsed group
 * whose summary line says what the preset holds. Then what each rule puts
 * in the inventory stage by stage (Figure 1), what each rule rewards
 * (Figure 2) and what each lets the company claim (Figure 3). The
 * arithmetic is in model.ts; nothing here decides what counts.
 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Minus } from 'lucide-react';
import Methods from './Methods';
import ChainChart from './ChainChart';
import {
  actionsFor,
  COMPANIES,
  RULES,
  RULE_ORDER,
  SLIDERS,
  TRACEABILITY_LABEL,
  effect,
  fmt,
  ledger,
  withRole,
  type Company,
  type Scope,
  type Traceability,
} from './model';

/** One line per rule, under Figure 1. */
const RULE_LINE: Record<string, string> = {
  mlp: 'All carbon flux on managed land is the company’s, passive uptake included; everything nets to one number, fossil too.',
  mlpPlus: 'Same inventory, but scope 3 removals need sourcing-region traceability and forest removals may not compensate fossil emissions.',
  aba: 'Emissions as pools release carbon; removals only where management caused growth above a no-activity counterfactual; stock change disclosed outside the scopes.',
  proposed: 'MLP stock change stays on the land, reported by component with nothing netted; land removals never attach to wood, enter a buyer’s scope 3 or offset fossil; wood carries an ABA-derived harvest emission.',
};

const BASE = '/tools/forest-accounting';

const mono11: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink-3)' };
const figTitle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 600, lineHeight: 1.28, color: 'var(--ink)', margin: 0 };
const caption: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.45, margin: 0 };
const cell: React.CSSProperties = { padding: '7px 8px', fontSize: 13, borderBottom: '1px solid var(--rule)', verticalAlign: 'top' };
const num: React.CSSProperties = { ...cell, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' };
const selectStyle: React.CSSProperties = { font: '400 13.5px/1.3 var(--font-sans, Inter, system-ui)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '4px 6px', maxWidth: '100%' };
const sectionRule: React.CSSProperties = { borderTop: '1px solid var(--rule-strong)', paddingTop: 14 };

/* ---------------- controls ---------------- */

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

/** Two pills: the same look as the other explorers' chips. */
function Chips<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: Partial<Record<T, string>> }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ ...mono11, fontSize: 10.5 }}>{label}</span>
      {options.map(([v, lab]) => {
        const on = v === value;
        const why = disabled?.[v];
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => !why && onChange(v)} title={why} aria-disabled={!!why}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, padding: '3px 10px', cursor: why ? 'not-allowed' : 'pointer', borderRadius: 999, border: '1px solid var(--rule-strong)', background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : why ? 'var(--ink-4)' : 'var(--ink-2)', opacity: why ? 0.6 : 1 }}>
            {lab}
          </button>
        );
      })}
    </div>
  );
}

/** A collapsed group: the summary line carries the group's current values so a closed group still tells you what the preset holds. */
function Group({ title, digest, children }: { title: string; digest: string; children: React.ReactNode }) {
  return (
    <details className="fa-group" style={{ border: '1px solid var(--rule)', borderRadius: 3, padding: '8px 12px', background: 'var(--paper)' }}>
      <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <ChevronRight size={13} strokeWidth={2} style={{ marginTop: 2, flex: 'none', color: 'var(--ink-3)' }} className="fa-chev" />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ ...mono11, color: 'var(--ink-2)' }}>{title}</span>
          <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-3)' }}>{digest}</span>
        </span>
      </summary>
      <div style={{ padding: '12px 0 4px 19px' }}>{children}</div>
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
  const [methods, setMethods] = useState(false);

  const scenario = COMPANIES.find((p) => p.id === presetId) ?? COMPANIES[0];
  const preset = withRole(scenario, c.scope);
  const edited = JSON.stringify(c) !== JSON.stringify(preset);
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC((p) => ({ ...p, [k]: v }));

  const ledgers = useMemo(() => RULE_ORDER.map((r) => ledger(c, r)), [c]);
  const shown = ledgers.map((L) => L.rule);

  const actions = actionsFor(c);
  const reading = (a: (typeof actions)[number]) => {
    const rewards = shown.filter((r) => effect(c, r, a) < -0.05).map((r) => RULES[r].short);
    const penal = shown.filter((r) => effect(c, r, a) > 0.05).map((r) => RULES[r].short);
    if (!rewards.length && !penal.length) return null;
    const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
    return `${a.label.replace(/ \(.*\)$/, '')}: ${rewards.length ? `rewarded under ${join(rewards)}` : ''}${rewards.length && penal.length ? '; ' : ''}${penal.length ? `penalised under ${join(penal)}` : ''}.`;
  };

  const digest = [
    c.area > 0 ? `${fmt(c.area)} Mha forest, harvest ${fmt(c.harvest)} t/ha` : 'no forest of its own',
    `fossil ${fmt(c.fossil)} Mt/yr`,
    c.ag > 0 ? `agricultural ${fmt(c.ag)}` : '',
    c.luc > 0 ? `conversion ${fmt(c.luc)}` : '',
    c.leased > 0 ? `${fmt(c.leased)} Mha leased` : '',
    c.cdr > 0 ? `${fmt(c.cdr)} Mt durable removals` : '',
  ].filter(Boolean).join(' · ');
  const sliders = (g: 'forest' | 'other' | 'levers') =>
    SLIDERS.filter((s) => s.group === g && (s.key !== 'claimants' || c.scope === 'scope3')).map((s) => (
      <Slider key={s.key} label={s.label} unit={s.unit} min={s.min} max={s.max} step={s.step} note={s.note}
        value={c[s.key] as number} onChange={(v) => set(s.key, v as never)} />
    ));

  const methodsBtn = (label: string) => (
    <button type="button" onClick={() => setMethods(true)}
      style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer', letterSpacing: 'inherit', textTransform: 'inherit' }}>
      {label}
    </button>
  );

  return (
    <div className="fa-tool" style={{ height: '100%', position: 'relative', overflowY: 'auto', background: 'var(--paper)' }}>
      {methods && <Methods onClose={() => setMethods(false)} />}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <p style={{ ...mono11, margin: 0 }}>Interactive model · Forest carbon · {methodsBtn('methods')}</p>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(24px, 3.4vw, 32px)', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.01em', margin: '4px 0 6px', color: 'var(--ink)' }}>
            The same land, four accounting rules
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.45 }}>
            One piece of land, seen by its owner or a downstream buyer, under the rules before the GHG Protocol: what each puts in the inventory, what each rewards, and what each lets the company claim.
          </p>
        </div>

        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--paper)', padding: '8px 0', borderBottom: '1px solid var(--rule)', display: 'flex', gap: '8px 18px', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...mono11, fontSize: 10.5 }}>Land</span>
            <select value={presetId} style={selectStyle}
              onChange={(e) => { const p = COMPANIES.find((x) => x.id === e.target.value)!; setPresetId(p.id); setC(withRole(p, c.scope)); }}>
              {COMPANIES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Chips<Scope> label="Reporting company" value={c.scope} onChange={(v) => setC((p) => withRole(p, v))}
            options={[['scope1', 'Landowner'], ['scope3', 'Downstream buyer']]}
            disabled={c.harvest + c.ag + c.luc > 0 ? undefined : { scope3: 'This land produces nothing to buy.' }} />
          {c.scope === 'scope3' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ ...mono11, fontSize: 10.5 }}>Traceability</span>
              <select value={c.traceability} onChange={(e) => set('traceability', e.target.value as Traceability)} style={selectStyle}>
                {(Object.keys(TRACEABILITY_LABEL) as Traceability[]).map((t) => <option key={t} value={t}>{TRACEABILITY_LABEL[t]}</option>)}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: -8 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)' }}>
            {scenario.blurb} {c.scope === 'scope1' ? 'Reported by the landowner: the land is scope 1.' : `Reported by a buyer of everything it produces: the land is upstream scope 3, ${TRACEABILITY_LABEL[c.traceability].toLowerCase()}.`}{edited ? ' Edited.' : ''}
            {edited && (
              <button type="button" onClick={() => setC(preset)} style={{ marginLeft: 8, font: '11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cardinal)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                Reset
              </button>
            )}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
            <Group title="Adjust the scenario" digest={digest}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px 28px' }}>
                {(['forest', 'other', 'levers'] as const).map((g) => (
                  <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ ...mono11, margin: 0 }}>{g === 'forest' ? 'The forest' : g === 'other' ? 'Other emissions' : 'Levers'}</p>
                    {sliders(g)}
                  </div>
                ))}
              </div>
            </Group>
          </div>
        </div>

        <section style={sectionRule}>
          <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 1</p>
          <h3 style={{ ...figTitle, marginBottom: 10 }}>Where the carbon moves, and what each rule counts</h3>
          <ChainChart company={c} ledgers={ledgers} />
          <p style={{ ...caption, marginTop: 10 }}>
            Emissions right of a stage's zero line, removals left, Mt CO₂e per year; dashed is disclosed outside the scopes. One colour per netting pool, so a one-colour row nets to one number. The wide column says what passes the scope border under each rule.
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2px 18px' }}>
            {RULE_ORDER.map((r) => <li key={r}><strong style={{ color: 'var(--ink-2)' }}>{RULES[r].short}</strong> · {RULE_LINE[r]}</li>)}
          </ul>
          {ledgers.some((L) => L.notes.length) && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>
              {ledgers.flatMap((L) => L.notes.map((n, i) => <li key={`${L.rule}-${i}`}><strong style={{ color: 'var(--ink-2)' }}>{RULES[L.rule].short}</strong> · {n}</li>))}
            </ul>
          )}
        </section>

        <section style={sectionRule}>
          <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 2</p>
          <h3 style={figTitle}>What each rule rewards</h3>
          <p style={{ ...caption, margin: '4px 0 10px' }}>
            Change in what the company has left to balance, Mt CO₂e per year, if it took the action. Down means the rule rewards it.
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
                    {shown.map((r) => <td key={r} style={num}><Delta v={effect(c, r, a)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            {actions.slice(0, 3).map((a) => { const t = reading(a); return t ? <li key={a.id}>{t}</li> : null; })}
          </ul>
        </section>

        <section style={sectionRule}>
          <p style={{ ...mono11, margin: '0 0 4px' }}>Figure 3</p>
          <h3 style={figTitle}>What each rule lets the company claim</h3>
          <p style={{ ...caption, margin: '4px 0 10px' }}>
            Forest removals standing in for durable ones are those the rule lets net against emissions the company would otherwise cut or store.
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

        <footer style={{ borderTop: '1px solid var(--rule)', paddingTop: 12, paddingBottom: 48 }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--ink-3)' }}>
            A stylised model for comparing rules, not an estimate for any real company. Rules follow the MLP+ submission (May 2025) and the activity-based accounting memo before the GHG Protocol's forest carbon accounting group, the 2022 draft guidance, and the Land Sector and Removals Standard (2026). <a href={`${BASE}-methods`} style={{ color: 'var(--ink-2)' }}>Methods and sources</a>.
          </p>
        </footer>
      </div>
    </div>
  );
}
