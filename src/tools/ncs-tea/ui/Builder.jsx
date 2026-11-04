/**
 * ui/Builder.jsx — the menus a user builds the assessment from: where the
 * practice applies, the cost components, the carbon effects, the finance
 * settings and the data layers. Every edit produces a new definition
 * object; the app re-evaluates it.
 */
import { useRef, useState } from 'react'
import { Plus, Download, Upload } from 'lucide-react'
import { COST_BASES, COST_CATEGORIES, GASES, blankCost, blankMitigation, costCategory } from '../engine/schema.js'
import { parsePolygonFile } from '../map/focus.js'
import { PROFILE_TYPES } from '../engine/profiles.js'
import { RATE_TYPES } from '../engine/rates.js'
import { csvToLayer } from '../data/grid.js'
import { Section, Field, Select, Num, Txt, Check, Range, RemoveButton } from './controls.jsx'
import { fmt, fmtBn, fmtGt } from '../map/format.js'

const layerOptions = (grid, numericOnly = true) =>
  Object.values(grid.meta).filter((m) => !numericOnly || m.id !== 'country_id').map((m) => ({ id: m.id, label: `${m.label}${m.unit ? ` (${m.unit})` : ''}` }))

// ── Rate specs ────────────────────────────────────────────────────────────
function RateEditor({ spec, onChange, grid, allowProduct = true, unitHint }) {
  const types = RATE_TYPES.filter((t) => allowProduct || t.id !== 'product')
  const set = (patch) => onChange({ ...spec, ...patch })
  const changeType = (type) => {
    const first = Object.values(grid.meta).find((m) => m.id !== 'country_id')?.id
    const base = { label: spec.label }
    if (type === 'constant') onChange({ ...base, type, value: Number(spec.value) || 1 })
    else if (type === 'layer') onChange({ ...base, type, layer: spec.layer ?? first, scale: 1, offset: 0, missing: 1 })
    else if (type === 'layer_linear') onChange({ ...base, type, layer: spec.layer ?? first, x0: 0, y0: 1, x1: 1, y1: 1, min: 0, max: 2, missing: 1 })
    else if (type === 'layer_classes') onChange({ ...base, type, layer: spec.layer ?? first, breaks: [0.5], values: [1, 1], missing: 1 })
    else if (type === 'table') onChange({ ...base, type, layer: 'country_id', table: {}, default: 1 })
    else if (type === 'product') onChange({ ...base, type, factors: [{ type: 'constant', value: Number(spec.value) || 1, label: 'Base' }] })
  }
  const ids = Object.keys(grid.layers)
  const layerSel = (
    <Field label="Layer">
      <Select value={ids.includes(spec.layer) ? spec.layer : ''} onChange={(v) => set({ layer: v })} options={[...(ids.includes(spec.layer) ? [] : [{ id: '', label: `(missing: ${spec.layer})`, disabled: true }]), ...layerOptions(grid)]} />
    </Field>
  )
  return (
    <div>
      <Field label={spec.label ? `${spec.label} · how it varies` : 'How it varies'}>
        <Select value={spec.type} onChange={changeType} options={types} />
      </Field>
      {spec.type === 'constant' ? (
        <Field label={unitHint ? `Value (${unitHint})` : 'Value'}><Num value={spec.value} onChange={(v) => set({ value: v })} /></Field>
      ) : null}
      {spec.type === 'layer' ? (
        <>
          {layerSel}
          <div className="row">
            <Field label="× scale"><Num value={spec.scale ?? 1} onChange={(v) => set({ scale: v })} /></Field>
            <Field label="+ offset"><Num value={spec.offset ?? 0} onChange={(v) => set({ offset: v })} /></Field>
          </div>
          <div className="row">
            <Field label="Min"><Num value={spec.min} onChange={(v) => set({ min: v })} placeholder="none" /></Field>
            <Field label="Max"><Num value={spec.max} onChange={(v) => set({ max: v })} placeholder="none" /></Field>
          </div>
        </>
      ) : null}
      {spec.type === 'layer_linear' ? (
        <>
          {layerSel}
          <p className="hint" style={{ marginBottom: 4 }}>A straight line through two points, clamped to the range below.</p>
          <div className="row">
            <Field label="At layer ="><Num value={spec.x0} onChange={(v) => set({ x0: v })} /></Field>
            <Field label="value is"><Num value={spec.y0} onChange={(v) => set({ y0: v })} /></Field>
          </div>
          <div className="row">
            <Field label="At layer ="><Num value={spec.x1} onChange={(v) => set({ x1: v })} /></Field>
            <Field label="value is"><Num value={spec.y1} onChange={(v) => set({ y1: v })} /></Field>
          </div>
          <div className="row">
            <Field label="Min"><Num value={spec.min} onChange={(v) => set({ min: v })} placeholder="none" /></Field>
            <Field label="Max"><Num value={spec.max} onChange={(v) => set({ max: v })} placeholder="none" /></Field>
          </div>
        </>
      ) : null}
      {spec.type === 'layer_classes' ? (
        <>
          {layerSel}
          <Field label="Class breaks (comma-separated)" hint="n breaks make n + 1 classes; the first class is below the first break.">
            <Txt value={(spec.breaks ?? []).join(', ')} onChange={(v) => set({ breaks: parseList(v) })} />
          </Field>
          <Field label="Value in each class">
            <Txt value={(spec.values ?? []).join(', ')} onChange={(v) => set({ values: parseList(v) })} />
          </Field>
        </>
      ) : null}
      {spec.type === 'table' ? (
        <>
          <Field label="Country table" hint="One country per line: ISO3 code, then the value. Countries not listed take the default.">
            <textarea className="textarea" value={tableToText(spec.table, grid)} onChange={(e) => set({ table: textToTable(e.target.value, grid) })} placeholder={'USA 1.2\nBRA 0.6\nIND 0.4'} />
          </Field>
          <Field label="Default"><Num value={spec.default ?? 1} onChange={(v) => set({ default: v })} /></Field>
        </>
      ) : null}
      {spec.type !== 'constant' && spec.type !== 'product' && spec.type !== 'table' ? (
        <Field label="Where the layer has no value" hint="Leave empty to drop such cells from the assessment.">
          <Num value={spec.missing} onChange={(v) => set({ missing: v })} placeholder="drop the cell" />
        </Field>
      ) : null}
      {spec.type === 'product' ? (
        <div>
          {(spec.factors ?? []).map((f, k) => (
            <div className="sub" key={k}>
              <div className="sub-title">
                <Txt value={f.label ?? ''} placeholder="Factor name" onChange={(v) => set({ factors: replaceAt(spec.factors, k, { ...f, label: v }) })} />
                <RemoveButton onClick={() => set({ factors: spec.factors.filter((_, j) => j !== k) })} />
              </div>
              <RateEditor spec={f} onChange={(nf) => set({ factors: replaceAt(spec.factors, k, nf) })} grid={grid} allowProduct={false} unitHint={k === 0 ? unitHint : 'multiplier'} />
            </div>
          ))}
          <button type="button" className="btn" onClick={() => set({ factors: [...(spec.factors ?? []), { type: 'layer_classes', layer: 'aridity', breaks: [0.5], values: [1, 1], missing: 1, label: 'New factor' }] })}>
            <Plus size={13} strokeWidth={1.5} /> Add a factor
          </button>
        </div>
      ) : null}
    </div>
  )
}

const parseList = (s) => s.split(/[,;\s]+/).map((x) => parseFloat(x)).filter((x) => Number.isFinite(x))
const replaceAt = (arr, k, v) => arr.map((x, j) => (j === k ? v : x))
function tableToText(table, grid) {
  if (!table) return ''
  const byId = new Map(grid.countries.map((c) => [c.id, c.iso3]))
  return Object.entries(table).map(([id, v]) => `${byId.get(Number(id)) ?? id} ${v}`).join('\n')
}
function textToTable(text, grid) {
  const byIso = new Map(grid.countries.map((c) => [c.iso3.toUpperCase(), c.id]))
  const out = {}
  for (const line of text.split(/\n/)) {
    const [iso, v] = line.trim().split(/[\s,;=]+/)
    const id = byIso.get((iso ?? '').toUpperCase())
    if (id && Number.isFinite(parseFloat(v))) out[id] = parseFloat(v)
  }
  return out
}

// ── Time profiles ─────────────────────────────────────────────────────────
const COST_TIMINGS = ['constant', 'once', 'every', 'window', 'series']
function ProfileEditor({ profile, onChange, forCost = false, horizon }) {
  const types = PROFILE_TYPES.filter((t) => !forCost || COST_TIMINGS.includes(t.id))
  const set = (patch) => onChange({ ...profile, ...patch })
  const p = profile ?? { type: 'constant' }
  return (
    <>
      <Field label={forCost ? 'When it occurs' : 'Over time'}>
        <Select value={p.type} onChange={(type) => onChange({ type })} options={types.map((t) => ({ id: t.id, label: forCost && t.id === 'constant' ? 'Every year' : t.label }))} />
      </Field>
      {p.type === 'once' ? <Field label="Year (0 = first)"><Num value={p.year ?? 0} onChange={(v) => set({ year: Math.round(v) })} step={1} min={0} /></Field> : null}
      {p.type === 'every' ? (
        <div className="row">
          <Field label="Every n years"><Num value={p.interval ?? 1} onChange={(v) => set({ interval: Math.max(1, Math.round(v)) })} step={1} min={1} /></Field>
          <Field label="Starting year"><Num value={p.from ?? 0} onChange={(v) => set({ from: Math.round(v) })} step={1} min={0} /></Field>
        </div>
      ) : null}
      {p.type === 'window' || p.type === 'constant' && !forCost ? (
        <div className="row">
          <Field label="From year"><Num value={p.from ?? 0} onChange={(v) => set({ from: Math.round(v) })} step={1} min={0} /></Field>
          <Field label="To year"><Num value={p.to} onChange={(v) => set({ to: Math.round(v) })} step={1} min={0} placeholder={`${horizon - 1}`} /></Field>
        </div>
      ) : null}
      {p.type === 'saturating' ? (
        <Field label="Time constant (years)" hint={`First-year rate declines by e each ${Math.round(1 / (p.k ?? 0.02))} years; the total potential is ${(1 / (1 - Math.exp(-(p.k ?? 0.02)))).toFixed(0)} × the first-year rate.`}>
          <Num value={Math.round(1 / (p.k ?? 0.02))} onChange={(v) => set({ k: 1 / Math.max(1, v) })} step={1} min={1} />
        </Field>
      ) : null}
      {p.type === 'linear_decline' ? <Field label="Years to reach zero"><Num value={p.years ?? 20} onChange={(v) => set({ years: v })} min={1} /></Field> : null}
      {p.type === 'ramp' ? <Field label="Years to full effect"><Num value={p.years ?? 5} onChange={(v) => set({ years: v })} min={1} /></Field> : null}
      {p.type === 'delayed' ? (
        <>
          <Field label="Delay (years)"><Num value={p.lag ?? 0} onChange={(v) => set({ lag: Math.round(v) })} step={1} min={0} /></Field>
          <div className="sub"><ProfileEditor profile={p.then ?? { type: 'constant' }} onChange={(then) => set({ then })} forCost={forCost} horizon={horizon} /></div>
        </>
      ) : null}
      {p.type === 'series' ? (
        <Field label="Value by year (comma-separated)" hint="Multiplies the rate (or counts occurrences of the cost). Later years repeat the last value when ticked.">
          <Txt value={(p.values ?? []).join(', ')} onChange={(v) => set({ values: parseList(v) })} />
          <Check checked={p.extend} onChange={(v) => set({ extend: v })}>Repeat the last value</Check>
        </Field>
      ) : null}
    </>
  )
}

// ── Cost components ───────────────────────────────────────────────────────
function CostCard({ cost, onChange, onRemove, grid, horizon }) {
  const [open, setOpen] = useState(false)
  const set = (patch) => onChange({ ...cost, ...patch })
  const basis = COST_BASES.find((b) => b.id === cost.basis) ?? COST_BASES[0]
  const cat = costCategory(cost.category)
  const timing = cost.timing?.type === 'constant' ? '/yr' : cost.timing?.type === 'once' ? ' once' : cost.timing?.type === 'every' ? ` every ${cost.timing.interval} yr` : ''
  return (
    <div className="card">
      <button type="button" className="card-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="name">{cost.label}<span className="cat">{cat.short}</span></span>
        <span className={`meta ${cost.value < 0 ? 'neg' : ''}`}>{fmt(cost.value, '$')}{basis.unit.replace('$', '')}{timing}</span>
      </button>
      {open ? (
        <div className="card-body">
          <Field label="Name"><Txt value={cost.label} onChange={(v) => set({ label: v })} /></Field>
          <Field label="Category" hint={cat.description}>
            <Select value={cost.category} onChange={(v) => { const k = costCategory(v); set({ category: v, basis: k.basis, timing: k.timing, quantity: k.basis === 'per_t_material' ? cost.quantity ?? { type: 'constant', value: 1, label: 'Application rate' } : cost.quantity }) }} options={COST_CATEGORIES.map((c) => ({ id: c.id, label: c.label, hint: c.description }))} />
          </Field>
          <Field label="Scales" hint={basis.hint}>
            <Select value={cost.basis} onChange={(v) => set({ basis: v, quantity: v === 'per_t_material' ? cost.quantity ?? { type: 'constant', value: 1, label: 'Application rate' } : cost.quantity })} options={COST_BASES.map((b) => ({ id: b.id, label: b.label, hint: b.hint }))} />
          </Field>
          <Field label={`Unit cost (${basis.unit})`} hint="Negative for a saving or revenue.">
            <Num value={cost.value} onChange={(v) => set({ value: v })} />
          </Field>
          {cost.basis === 'per_t_material' ? (
            <div className="sub">
              <p className="label">Application rate (t per ha)</p>
              <RateEditor spec={cost.quantity ?? { type: 'constant', value: 1 }} onChange={(q) => set({ quantity: q })} grid={grid} allowProduct={false} unitHint="t/ha" />
            </div>
          ) : null}
          <ProfileEditor profile={cost.timing} onChange={(timing) => set({ timing })} forCost horizon={horizon} />
          <Field label="Real cost change per year" hint="Fraction per year; 0.01 means costs rise 1% a year in real terms, −0.02 that they fall 2%.">
            <Num value={cost.escalation ?? 0} onChange={(v) => set({ escalation: v })} step={0.005} />
          </Field>
          <div>
            <p className="label">Multipliers</p>
            {(cost.modifiers ?? []).map((m, k) => (
              <div className="sub" key={k}>
                <div className="sub-title">
                  <Txt value={m.label ?? ''} placeholder="Multiplier name" onChange={(v) => set({ modifiers: replaceAt(cost.modifiers, k, { ...m, label: v }) })} />
                  <RemoveButton onClick={() => set({ modifiers: cost.modifiers.filter((_, j) => j !== k) })} />
                </div>
                <RateEditor spec={m} onChange={(nm) => set({ modifiers: replaceAt(cost.modifiers, k, nm) })} grid={grid} allowProduct={false} unitHint="multiplier" />
              </div>
            ))}
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => set({ modifiers: [...(cost.modifiers ?? []), { type: 'table', layer: 'country_id', table: {}, default: 1, label: 'Country factor' }] })}><Plus size={13} strokeWidth={1.5} /> By country</button>
              <button type="button" className="btn" onClick={() => set({ modifiers: [...(cost.modifiers ?? []), { type: 'layer_linear', layer: 'cropland_frac', x0: 0, y0: 1, x1: 1, y1: 1, min: 0, max: 5, missing: 1, label: 'Layer factor' }] })}><Plus size={13} strokeWidth={1.5} /> By a layer</button>
              <button type="button" className="btn" style={{ marginLeft: 'auto', color: 'var(--negative)' }} onClick={onRemove}>Remove this cost</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Mitigation components ─────────────────────────────────────────────────
function MitigationCard({ m, onChange, onRemove, grid, horizon }) {
  const [open, setOpen] = useState(false)
  const set = (patch) => onChange({ ...m, ...patch })
  const base = m.rate?.type === 'constant' ? m.rate.value : m.rate?.type === 'product' ? m.rate.factors?.find((f) => f.type === 'constant')?.value : null
  const prof = PROFILE_TYPES.find((t) => t.id === m.profile?.type)?.label ?? ''
  return (
    <div className="card">
      <button type="button" className="card-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="name">{m.label}</span>
        <span className={`meta ${m.sign < 0 ? '' : 'neg'}`}>{m.sign < 0 ? '−' : '+'}{base != null ? fmt(base, '') : '…'} t/ha{m.profile?.type === 'once' ? '' : '/yr'}</span>
      </button>
      {open ? (
        <div className="card-body">
          <div className="row">
            <Field label="Name"><Txt value={m.label} onChange={(v) => set({ label: v })} /></Field>
            <Field label="Gas"><Select value={m.gas} onChange={(v) => set({ gas: v })} options={GASES.map((g) => ({ id: g, label: g }))} /></Field>
          </div>
          <Field label="Direction">
            <Select value={String(m.sign ?? 1)} onChange={(v) => set({ sign: Number(v) })} options={[{ id: '1', label: 'Mitigation (removal or avoided emission)' }, { id: '-1', label: 'Emission caused by the practice' }]} />
          </Field>
          <div className="sub">
            <p className="label">Rate, t CO₂e per ha {m.profile?.type === 'once' ? '(the one-off amount)' : 'in the first year'}</p>
            <RateEditor spec={m.rate} onChange={(rate) => set({ rate })} grid={grid} unitHint="t CO₂e/ha/yr" />
          </div>
          <p className="hint" style={{ marginBottom: 6 }}>{prof}</p>
          <ProfileEditor profile={m.profile} onChange={(profile) => set({ profile })} horizon={horizon} />
          <div className="row">
            <Field label="Leakage" hint="Share displaced elsewhere."><Num value={m.leakage ?? 0} onChange={(v) => set({ leakage: v })} step={0.05} min={0} max={1} /></Field>
            <Field label="Reversal per year" hint="Share of the stock lost each year."><Num value={m.reversal ?? 0} onChange={(v) => set({ reversal: v })} step={0.005} min={0} max={1} /></Field>
          </div>
          <div className="btn-row"><button type="button" className="btn" style={{ marginLeft: 'auto', color: 'var(--negative)' }} onClick={onRemove}>Remove this effect</button></div>
        </div>
      ) : null}
    </div>
  )
}

// ── Data layers ───────────────────────────────────────────────────────────
function DataSection({ grid, onGridChange, onShowLayer }) {
  const fileRef = useRef(null)
  const [err, setErr] = useState(null)
  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const text = await f.text()
      const { array, kind, n } = csvToLayer(text, grid)
      const id = f.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      grid.addLayer(id, array, { label: f.name.replace(/\.[^.]+$/, ''), unit: '', source: `uploaded ${kind} CSV, ${n} rows` })
      setErr(null)
      onGridChange()
    } catch (ex) { setErr(ex.message) }
    e.target.value = ''
  }
  return (
    <Section title="Data layers" aside={`${Object.keys(grid.meta).length} layers`} defaultOpen={false}>
      <p className="hint" style={{ marginBottom: 6 }}>Global grid at {grid.res}°. Add your own layer as a CSV of points (lon, lat, value) or of countries (iso3, value); it then appears in every layer menu.</p>
      <table className="table">
        <tbody>
          {Object.values(grid.meta).map((m) => (
            <tr key={m.id}>
              <td>
                <button type="button" className="btn link" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }} onClick={() => onShowLayer(m.id)} title={m.source}>{m.label}</button>
                <div className="hint" style={{ margin: 0 }}>{m.unit}{m.unit ? ' · ' : ''}{m.source}</div>
              </td>
              <td className="num" style={{ verticalAlign: 'top' }}>{m.builtin ? null : <RemoveButton onClick={() => { grid.removeLayer(m.id); onGridChange() }} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={13} strokeWidth={1.5} /> Add a CSV layer</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFile} />
      </div>
      {err ? <p className="hint warn">{err}</p> : null}
    </Section>
  )
}

// ── Region focus ──────────────────────────────────────────────────────────
export function FocusSection({ focus, onFocus, drawing, onDraw, summary }) {
  const aside = focus ? (focus.type === 'circle' ? `${Math.round(focus.radiusKm * 2).toLocaleString()} km circle` : 'Polygon') : 'Whole world'
  const fileRef = useRef(null)
  const [err, setErr] = useState(null)
  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try { onFocus({ type: 'polygon', geometry: parsePolygonFile(f.name, await f.text()), name: f.name }); setErr(null) } catch (ex) { setErr(ex.message) }
    e.target.value = ''
  }
  return (
    <Section title="Region focus" aside={aside} defaultOpen>
      <div className="mode-row">
        <button type="button" className="mode" aria-pressed={focus?.type === 'circle'} onClick={() => (focus?.type === 'circle' ? onFocus(null) : onFocus({ type: 'circle', lat: 40, lon: -95, radiusKm: 600, centreOnMap: true }))}>Circle</button>
        <button type="button" className="mode" aria-pressed={drawing} onClick={() => onDraw(!drawing)}>Define polygon</button>
        <button type="button" className="mode" onClick={() => fileRef.current?.click()}>Upload polygon</button>
        {focus ? <button type="button" className="mode" onClick={() => onFocus(null)}>Clear</button> : null}
        <input ref={fileRef} type="file" accept=".geojson,.json,.kml,application/geo+json,application/json" style={{ display: 'none' }} onChange={onFile} />
      </div>
      <p className="hint">
        {drawing ? 'Click the map to place the corners of a polygon; double-click or press Finish to close it.'
          : focus?.type === 'circle' ? 'Drag the circle to move it and its east handle to resize it. Results and the curve are for the cells inside.'
          : focus?.type === 'polygon' ? `Results and the curve are for the cells inside ${focus.name ?? 'the polygon'}.`
          : 'Restrict the results to a circle, a polygon you draw, or a GeoJSON or KML file (a sourcing area, a watershed, a country).'}
      </p>
      {summary ? <p className="note">{summary}</p> : null}
      {err ? <p className="hint warn">{err}</p> : null}
    </Section>
  )
}

// ── The builder ───────────────────────────────────────────────────────────
export function Builder({ def, onChange, grid, onGridChange, presets, presetId, onPreset, onShowLayer, problems, totals }) {
  const set = (patch) => onChange({ ...def, ...patch })
  const importRef = useRef(null)
  const horizon = def.horizon.years
  const areaLayer = grid.meta[def.area.layer]?.label ?? def.area.layer
  const pct = Math.round((def.area.share ?? 1) * 100)
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${def.id || 'intervention'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try { onChange(JSON.parse(await f.text())) } catch { /* ignore a bad file */ }
    e.target.value = ''
  }

  return (
    <>
      <Section title="Intervention" aside={def.name} defaultOpen>
        <Field label="Start from">
          <Select value={presetId} onChange={onPreset} options={presets.map((p) => ({ id: p.id, label: p.name }))} />
        </Field>
        <Field label="Name"><Txt value={def.name} onChange={(v) => set({ name: v })} /></Field>
        {def.description ? <p className="note">{def.description}</p> : null}
        {def.notes ? <p className="hint">{def.notes}</p> : null}
        <div className="btn-row">
          <button type="button" className="btn" onClick={exportJson}><Download size={13} strokeWidth={1.5} /> Save as JSON</button>
          <button type="button" className="btn" onClick={() => importRef.current?.click()}><Upload size={13} strokeWidth={1.5} /> Load JSON</button>
          <input ref={importRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJson} />
        </div>
        {problems.length ? <ul className="hint warn" style={{ paddingLeft: 16, margin: '6px 0 0' }}>{problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      </Section>

      <Section title="Where it applies" aside={`${pct}% of ${areaLayer.toLowerCase()}`} defaultOpen={false}>
        <Field label="Area treated per cell comes from">
          <Select value={def.area.layer} onChange={(v) => set({ area: { ...def.area, layer: v } })} options={layerOptions(grid)} />
        </Field>
        <Field label="Share of that area adopting">
          <Range value={Math.round((def.area.share ?? 1) * 100)} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => set({ area: { ...def.area, share: v / 100 } })} />
        </Field>
        <p className="label">Eligibility rules (all must hold)</p>
        {(def.area.eligibility ?? []).map((e, k) => (
          <div className="row" key={k} style={{ marginBottom: 6 }}>
            <Select value={e.layer} onChange={(v) => set({ area: { ...def.area, eligibility: replaceAt(def.area.eligibility, k, { ...e, layer: v }) } })} options={layerOptions(grid)} />
            <Num value={e.min} placeholder="min" onChange={(v) => set({ area: { ...def.area, eligibility: replaceAt(def.area.eligibility, k, { ...e, min: v }) } })} width={62} />
            <Num value={e.max} placeholder="max" onChange={(v) => set({ area: { ...def.area, eligibility: replaceAt(def.area.eligibility, k, { ...e, max: v }) } })} width={62} />
            <span className="narrow"><RemoveButton onClick={() => set({ area: { ...def.area, eligibility: def.area.eligibility.filter((_, j) => j !== k) } })} /></span>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => set({ area: { ...def.area, eligibility: [...(def.area.eligibility ?? []), { layer: 'prec_mm', min: 300 }] } })}><Plus size={13} strokeWidth={1.5} /> Add a rule</button>
      </Section>

      <Section title="Costs" aside={totals ? `${n(def.costs.length, 'item', 'items')} · ${fmtBn(totals.costNPV)} PV` : n(def.costs.length, 'item', 'items')} defaultOpen={false}>
        {def.costs.map((c, k) => (
          <CostCard key={c.id} cost={c} grid={grid} horizon={horizon} onChange={(nc) => set({ costs: replaceAt(def.costs, k, nc) })} onRemove={() => set({ costs: def.costs.filter((_, j) => j !== k) })} />
        ))}
        <p className="label" style={{ marginTop: 4 }}>Add a cost</p>
        <div className="btn-row">
          {COST_CATEGORIES.map((c) => (
            <button key={c.id} type="button" className="btn" title={c.description}
              onClick={() => set({ costs: [...def.costs, blankCost({ label: c.label, category: c.id, basis: c.basis, timing: c.timing, value: c.id === 'revenue' ? -20 : c.id === 'transaction' ? 1e6 : c.id === 'mrv' ? 5 : c.id === 'capex' ? 200 : c.id === 'transport' ? 0.1 : 50, quantity: c.basis === 'per_t_material' ? { type: 'constant', value: 5, label: 'Application rate' } : null, modifiers: c.id === 'transport' ? [{ type: 'constant', value: 100, label: 'Distance (km)' }] : [] })] })}>
              <Plus size={13} strokeWidth={1.5} /> {c.short}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Carbon effects" aside={totals ? `${n(def.mitigation.length, 'effect', 'effects')} · ${fmtGt(totals.mitTotal)}` : n(def.mitigation.length, 'effect', 'effects')} defaultOpen={false}>
        {def.mitigation.map((m, k) => (
          <MitigationCard key={m.id} m={m} grid={grid} horizon={horizon} onChange={(nm) => set({ mitigation: replaceAt(def.mitigation, k, nm) })} onRemove={() => set({ mitigation: def.mitigation.filter((_, j) => j !== k) })} />
        ))}
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => set({ mitigation: [...def.mitigation, blankMitigation({ label: 'Soil carbon gain', rate: { type: 'product', factors: [{ type: 'constant', value: 1, label: 'Base rate' }] }, profile: { type: 'saturating', k: 0.02 } })] })}><Plus size={13} strokeWidth={1.5} /> Saturating gain</button>
          <button type="button" className="btn" onClick={() => set({ mitigation: [...def.mitigation, blankMitigation({ label: 'Avoided emission', rate: { type: 'constant', value: 0.5 }, profile: { type: 'constant' } })] })}><Plus size={13} strokeWidth={1.5} /> Constant each year</button>
          <button type="button" className="btn" onClick={() => set({ mitigation: [...def.mitigation, blankMitigation({ label: 'One-off storage', rate: { type: 'constant', value: 10 }, profile: { type: 'once', year: 0 }, reversal: 0.001 })] })}><Plus size={13} strokeWidth={1.5} /> One-off pulse</button>
          <button type="button" className="btn" onClick={() => set({ mitigation: [...def.mitigation, blankMitigation({ label: 'Emission caused', sign: -1, rate: { type: 'constant', value: 0.1 }, profile: { type: 'constant' } })] })}><Plus size={13} strokeWidth={1.5} /> Emission penalty</button>
        </div>
      </Section>

      <Section title="Finance and horizon" aside={`${def.horizon.years} yr · ${Math.round(def.finance.discountRate * 1000) / 10}% · $${def.finance.carbonPrice}/t`} defaultOpen={false}>
        <div className="row">
          <Field label="Horizon (years)"><Num value={def.horizon.years} onChange={(v) => set({ horizon: { ...def.horizon, years: Math.max(1, Math.min(200, Math.round(v))) } })} step={1} min={1} max={200} /></Field>
          <Field label="First year"><Num value={def.horizon.startYear} onChange={(v) => set({ horizon: { ...def.horizon, startYear: Math.round(v) } })} step={1} /></Field>
        </div>
        <div className="row">
          <Field label="Discount rate (%/yr)"><Num value={Math.round(def.finance.discountRate * 1000) / 10} onChange={(v) => set({ finance: { ...def.finance, discountRate: v / 100 } })} step={0.5} min={0} /></Field>
          <Field label="Carbon price ($/t)"><Num value={def.finance.carbonPrice} onChange={(v) => set({ finance: { ...def.finance, carbonPrice: v } })} step={5} min={0} /></Field>
        </div>
        <Check checked={def.finance.discountCarbon} onChange={(v) => set({ finance: { ...def.finance, discountCarbon: v } })}>Discount tonnes as well as dollars</Check>
        <p className="hint">Off: cost per tonne is the present value of costs over the plain sum of tonnes. On: tonnes are discounted at the same rate, which favours early mitigation.</p>
      </Section>

      <DataSection grid={grid} onGridChange={onGridChange} onShowLayer={onShowLayer} />
    </>
  )
}
