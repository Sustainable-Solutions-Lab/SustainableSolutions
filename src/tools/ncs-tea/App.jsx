import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import './styles/app.css'
import { loadGrid } from './data/grid.js'
import { evaluate, STATUS } from './engine/evaluate.js'
import { normalizeDefinition, validateDefinition } from './engine/schema.js'
import { PRESETS, presetById } from './interventions/library.js'
import MapView from './map/MapView.jsx'
import { Legend } from './map/Legend.jsx'
import { YearBar } from './map/YearBar.jsx'
import { DetailPanel } from './map/DetailPanel.jsx'
import { fieldDomain } from './map/domain.js'
import { focusMask } from './map/focus.js'
import { Shell } from './ui/Shell.jsx'
import { Builder, FocusSection } from './ui/Builder.jsx'
import { Results } from './ui/Results.jsx'
import { Field, Select } from './ui/controls.jsx'
import { RESULT_VARIABLES, layerVariables, computeField } from './ui/mapVariables.js'
import { fmtGt, fmtMha } from './map/format.js'

const REPO = 'https://github.com/Sustainable-Solutions-Lab/ncs-tea'

// Standalone: the tool owns the theme. Embedded in the lab site: the site's
// nav toggles data-theme on <html> and the tool follows it.
function useTheme(embedded) {
  const [theme, setTheme] = useState(() => {
    const doc = document.documentElement.dataset.theme
    if (embedded && doc) return doc
    try { const s = localStorage.getItem('ncs-theme'); if (s && !embedded) return s } catch { /* private mode */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    if (embedded) {
      const el = document.documentElement
      const sync = () => setTheme(el.dataset.theme === 'dark' ? 'dark' : 'light')
      sync()
      const obs = new MutationObserver(sync)
      obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
      return () => obs.disconnect()
    }
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('ncs-theme', theme) } catch { /* ignore */ }
  }, [theme, embedded])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768)
  useEffect(() => { const f = () => setM(window.innerWidth < 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  return m
}

export default function App({ embedded = false, dataBase = '/data/grid' }) {
  const [grid, setGrid] = useState(null)
  const [gridVersion, setGridVersion] = useState(0)
  const [error, setError] = useState(null)
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [def, setDef] = useState(() => normalizeDefinition(PRESETS[0]))
  const [varId, setVarId] = useState('lcoa')
  const [year, setYear] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState(null)
  const [focus, setFocus] = useState(null)
  const [drawing, setDrawing] = useState(false)
  const [brush, setBrush] = useState(null)
  const [theme, toggleTheme] = useTheme(embedded)
  const isMobile = useIsMobile()

  useEffect(() => { loadGrid(dataBase).then(setGrid).catch((e) => setError(e.message)) }, [dataBase])

  const deferredDef = useDeferredValue(def)
  const res = useMemo(() => (grid ? evaluate(deferredDef, grid) : null), [deferredDef, grid, gridVersion])
  const problems = useMemo(() => (grid ? validateDefinition(def, grid.layerIds()) : []), [def, grid, gridVersion])

  // Focus mask (cells inside the circle or polygon) and the brush from the
  // supply curve (cells within a run of cost per tonne). Both restrict what
  // the map shows; the focus also restricts the results.
  const mask = useMemo(() => (grid && focus ? focusMask(grid, focus) : null), [grid, focus])
  useEffect(() => { setBrush(null) }, [deferredDef, focus])
  const displayMask = useMemo(() => {
    if (!res || (!mask && !brush)) return null
    const out = new Uint8Array(res.status.length)
    for (let i = 0; i < out.length; i++) {
      if (mask && !mask[i]) continue
      if (brush) { if (res.status[i] !== STATUS.OK) continue; const c = res.lcoa[i]; if (!(c >= brush.costLo && c <= brush.costHi)) continue }
      out[i] = 1
    }
    return out
  }, [res, mask, brush])

  const variables = useMemo(() => (grid ? [...RESULT_VARIABLES, ...layerVariables(grid)] : RESULT_VARIABLES), [grid, gridVersion])
  const variable = variables.find((v) => v.id === varId) ?? variables[0]
  const yearClamped = Math.min(year, def.horizon.years - 1)
  const rawField = useMemo(() => (res ? computeField(variable, res, grid, yearClamped) : null), [variable, res, grid, yearClamped])
  const domain = useMemo(() => (rawField ? fieldDomain(rawField, variable) : null), [rawField, variable])
  const field = useMemo(() => {
    if (!rawField || !displayMask) return rawField
    const f = new Float32Array(rawField.length)
    for (let i = 0; i < f.length; i++) f[i] = displayMask[i] ? rawField[i] : NaN
    return f
  }, [rawField, displayMask])

  const onPreset = (id) => { setPresetId(id); setDef(normalizeDefinition(presetById(id))); setSelected(null) }
  const onChange = useCallback((d) => setDef(normalizeDefinition(d)), [])
  const onGridChange = () => setGridVersion((v) => v + 1)
  const onFocus = (f) => { setDrawing(false); setFocus(f) }
  const onDraw = (on) => { setDrawing(on); if (on) setFocus(null) }
  const onDrawFinish = (geometry) => { setDrawing(false); setFocus({ type: 'polygon', geometry, name: 'the drawn polygon' }) }

  const focusSummary = useMemo(() => {
    if (!res || !mask) return null
    let n = 0, a = 0, m = 0
    for (let i = 0; i < mask.length; i++) if (mask[i] && res.status[i] === STATUS.OK) { n++; a += res.area[i]; m += res.mitTotal[i] }
    return `${n.toLocaleString()} treated cells inside · ${fmtMha(a)} · ${fmtGt(m)} over ${res.T} years`
  }, [res, mask])

  if (error) return <div className="busy">Could not load the grid: {error}. Run pipeline/build_grid.py, then npm run fetch:grid.</div>

  const rail = grid && res ? (
    <>
      <Field label="Map shows">
        <Select value={variable.id} onChange={setVarId} options={[
          ...RESULT_VARIABLES.map((v) => ({ id: v.id, label: v.label })),
          ...layerVariables(grid).map((v) => ({ id: v.id, label: `Input · ${v.label}` })),
        ]} />
        {variable.hint ? <p className="hint">{variable.hint}</p> : null}
      </Field>
      <Legend variable={variable} domain={domain} />
      <Results res={res} mask={mask} focusLabel={focus ? (focus.type === 'circle' ? 'inside the circle' : 'inside the polygon') : null} brush={brush} onBrush={setBrush} />
      <FocusSection focus={focus} onFocus={onFocus} drawing={drawing} onDraw={onDraw} summary={focusSummary} />
      <Builder def={def} onChange={onChange} grid={grid} onGridChange={onGridChange} presets={PRESETS} presetId={presetId} onPreset={onPreset} onShowLayer={(id) => setVarId(`layer:${id}`)} problems={problems} />
      <div className="footer">
        Costs in real 2024 USD. Default numbers are starting points, documented in the repository; replace them with your own. <a href={REPO} target="_blank" rel="noopener noreferrer">ncs-tea ↗</a>
      </div>
    </>
  ) : <p className="note">Loading the grid…</p>

  return (
    <Shell eyebrow="Sustainable Solutions Lab · tool" title="Technoeconomics of nature-based climate solutions" summary="Build a cost and carbon assessment of a land-based practice from menus, and see where it pays off." rail={rail}>
      {grid ? (
        <>
          <MapView grid={grid} field={field} domain={domain} variable={variable} selected={selected} onSelect={(i) => setSelected(i >= 0 ? i : null)} theme={theme} onToggleTheme={embedded ? null : toggleTheme}
            focus={focus} onFocusChange={setFocus} drawing={drawing} onDrawFinish={onDrawFinish} onDrawCancel={() => setDrawing(false)} isMobile={isMobile} />
          <Legend variable={variable} domain={domain} floating />
          {res ? <YearBar startYear={def.horizon.startYear} years={def.horizon.years} year={yearClamped} onYear={setYear} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} active={!!variable.yearly} /> : null}
          {res && selected != null ? <DetailPanel grid={grid} res={res} cell={selected} onClose={() => setSelected(null)} /> : null}
        </>
      ) : <div className="busy">Loading the grid…</div>}
    </Shell>
  )
}
