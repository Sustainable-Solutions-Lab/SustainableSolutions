import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import './styles/app.css'
import { loadGrid } from './data/grid.js'
import { evaluate } from './engine/evaluate.js'
import { normalizeDefinition, validateDefinition } from './engine/schema.js'
import { PRESETS, presetById } from './interventions/library.js'
import MapView from './map/MapView.jsx'
import { Legend } from './map/Legend.jsx'
import { YearBar } from './map/YearBar.jsx'
import { DetailPanel } from './map/DetailPanel.jsx'
import { fieldDomain } from './map/raster.js'
import { Shell } from './ui/Shell.jsx'
import { Builder } from './ui/Builder.jsx'
import { Results } from './ui/Results.jsx'
import { Field, Select } from './ui/controls.jsx'
import { RESULT_VARIABLES, layerVariables, computeField } from './ui/mapVariables.js'

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
  const [theme, toggleTheme] = useTheme(embedded)

  useEffect(() => { loadGrid(dataBase).then(setGrid).catch((e) => setError(e.message)) }, [dataBase])

  const deferredDef = useDeferredValue(def)
  const res = useMemo(() => (grid ? evaluate(deferredDef, grid) : null), [deferredDef, grid, gridVersion])
  const problems = useMemo(() => (grid ? validateDefinition(def, grid.layerIds()) : []), [def, grid, gridVersion])

  const variables = useMemo(() => (grid ? [...RESULT_VARIABLES, ...layerVariables(grid)] : RESULT_VARIABLES), [grid, gridVersion])
  const variable = variables.find((v) => v.id === varId) ?? variables[0]
  const yearClamped = Math.min(year, def.horizon.years - 1)
  const field = useMemo(() => {
    if (!res) return null
    // ?debug=stripes paints 15° latitude bands to check the raster against the graticule.
    if (window.location.search.includes('debug=stripes')) {
      const f = new Float32Array(grid.size)
      for (let i = 0; i < grid.size; i++) { const [lon, lat] = grid.lonLatOf(i); f[i] = (Math.floor(lat / 15) + Math.floor(lon / 30)) % 2 === 0 ? 1 : 0 }
      return f
    }
    return computeField(variable, res, grid, yearClamped)
  }, [variable, res, grid, yearClamped])
  const domain = useMemo(() => (field ? fieldDomain(field, variable) : null), [field, variable])

  const onPreset = (id) => { setPresetId(id); setDef(normalizeDefinition(presetById(id))); setSelected(null) }
  const onChange = useCallback((d) => setDef(normalizeDefinition(d)), [])
  const onGridChange = () => setGridVersion((v) => v + 1)

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
      <Results res={res} grid={grid} />
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
          <MapView grid={grid} field={field} domain={domain} colormap={variable.colormap} selected={selected} onSelect={(i) => setSelected(i >= 0 ? i : null)} theme={theme} onToggleTheme={embedded ? null : toggleTheme} />
          <Legend variable={variable} domain={domain} floating />
          {res ? <YearBar startYear={def.horizon.startYear} years={def.horizon.years} year={yearClamped} onYear={setYear} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} active={!!variable.yearly} /> : null}
          {res && selected != null ? <DetailPanel grid={grid} res={res} cell={selected} onClose={() => setSelected(null)} /> : null}
        </>
      ) : <div className="busy">Loading the grid…</div>}
    </Shell>
  )
}
