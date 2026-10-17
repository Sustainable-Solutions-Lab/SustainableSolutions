/**
 * mining-water/MiningWaterTool.jsx
 *
 * Companion explorer to Busch et al., "Reducing water stress from mining
 * battery materials" (preprint). Two views, one per figure in the paper:
 *
 *   Map        Figure 1 — AWARE 2.0 basins shaded by the paper's water stress
 *              index, with the 1,293 copper, nickel, cobalt and lithium
 *              deposits in the model sized by contained resources.
 *   Trade-off  Figure 2 — the cost of cutting stress-weighted water use, one
 *              Pareto frontier per demand scenario, and the split by mineral
 *              at any point on it.
 *
 * Bespoke rather than a `_map` config: the `_map` engine draws from PMTiles,
 * and this dataset is small enough (≈2.6 MB, built by
 * scripts/build-mining-water.mjs) to ship as GeoJSON from
 * public/tools/mining-water/. It reuses the engine's flat basemap, world land
 * underlay and footer, and wraps itself in ToolShell like every other tool.
 *
 * Hover reads a feature on desktop; click or tap pins it to the card, which
 * is the touch equivalent.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import ToolShell from '../_shell/ToolShell'
import { BusyOverlay } from '../_shell/busy-overlay.jsx'
import { basemapStyle } from '../_map/components/map/basemap-style.jsx'
import { ToolFooter } from '../_map/components/sidebar/tool-footer.jsx'
import WaterCost from './WaterCost.jsx'

const DATA = '/tools/mining-water'

// Spectral, the lab's data palette. Water stress runs up the warm half;
// minerals take the cool half so deposits stay legible over stressed basins.
const STRESS_STOPS = [
  [0, '#FFFFBF'],
  [0.25, '#FEE08B'],
  [0.45, '#FDAE61'],
  [0.65, '#F46D43'],
  [0.82, '#D53E4F'],
  [1, '#9E0142'],
]
const MINERALS = [
  ['Copper', '#5E4FA2'],
  ['Nickel', '#3288BD'],
  ['Cobalt', '#66C2A5'],
  ['Lithium', '#ABDDA4'],
]
const MINERAL_COLOR = Object.fromEntries(MINERALS)
// Scenario lines: the paper's three IEA demand cases.
const SCEN_COLOR = { 'Current policies': '#6B6B80', Pledges: '#D53E4F', 'Net-zero': '#3288BD' }
// Latitude band the camera may show, as Food Emissions does with
// region.latBounds. North stops just past the northernmost deposit (73.6° N);
// south just past Cape Horn (56° S). The bands beyond carry no deposits, and
// north of ~75° N the AWARE basins thin into artefacts over Greenland.
const LAT_BOUNDS = [-57, 75]
// Share of the viewport that may hang below the southern cut: just enough
// for Cape Horn to clear the attribution line and phone chrome. It also
// sets how far out the user can zoom on a tall screen.
const SOUTH_SLACK = 0.04

// The water and mining work is a STEER project (Materials for Humanity).
const STEER = {
  name: 'STEER',
  url: 'https://steer-stanford.webflow.io/',
  logo: '/logos/steer/STEER-forweb-light.png',
  logoDark: '/logos/steer/STEER-forweb-dark.png',
  note: <>A STEER project at Stanford ↗</>,
}

// Basins above this index count as stressed for the filter (the paper's
// "moderate" threshold).
const STRESSED = 0.1

const isDarkNow = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'

const fmt = (v, d = 1) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }))
const pct = (v) => (v == null ? '—' : `${Math.round(Math.min(1, v) * 100)}%`)
const stressClass = (s) =>
  s == null ? 'not in model'
    : s >= 1 ? 'at the AWARE maximum'
    : s >= 0.25 ? 'high'
    : s >= STRESSED ? 'moderate'
    : s >= 0.01 ? 'low'
    : 'very low'
// Basin names come from the build script: the river it lies on (or drains
// to) and the state/province and country under it. AWARE itself numbers them.
const basinName = (river, place) =>
  river ? `${river} basin` : place ? `Basin in ${place.split(', ')[0]}` : 'Unnamed basin'
const latlon = ([x, y]) => `${fmt(Math.abs(y), 1)}° ${y >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(x), 1)}° ${x >= 0 ? 'E' : 'W'}`

const eyebrowCls = 'font-mono text-xs uppercase tracking-wider text-ink-3 leading-none'
const eyebrowStyle = { margin: '0 0 3px' }

// ─── Small pieces ────────────────────────────────────────────────────────────

function Eyebrow({ children }) {
  return <p className={eyebrowCls} style={eyebrowStyle}>{children}</p>
}

function ToggleRow({ value, options, onChange }) {
  return (
    <div className="flex gap-4">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={[
            'bg-transparent border-0 cursor-pointer p-0',
            'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
            'transition-colors hover:text-ink',
            value === v ? 'font-bold text-ink underline' : 'font-normal text-ink-3',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Clickable words, as the View toggle, wrapping onto more lines as needed.
function WordRow({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap" style={{ gap: '6px 14px' }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={[
            'bg-transparent border-0 cursor-pointer p-0',
            'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
            'transition-colors hover:text-ink',
            value === v ? 'font-bold text-ink underline' : 'font-normal text-ink-3',
          ].join(' ')}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Swatch({ color, round = true }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 9, height: 9, borderRadius: round ? '50%' : 2, background: color,
        border: '1px solid var(--rule-strong)', display: 'inline-block', flexShrink: 0,
      }}
    />
  )
}

function StressLegend({ compact = false }) {
  const grad = `linear-gradient(to right, ${STRESS_STOPS.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`
  return (
    <div>
      <div style={{ height: 8, borderRadius: 2, background: grad, border: '1px solid var(--rule)' }} />
      {/* Ticks sit where the square-root scale puts them: s = t². */}
      <div className="relative font-mono text-ink-3" style={{ fontSize: 9, height: 12, marginTop: 2 }}>
        {[[0, '0%', 'left'], [0.25, '6%', 'center'], [0.5, '25%', 'center'], [1, '≥100%', 'right']].map(([t, l, a]) => (
          <span key={l} className="absolute" style={{ left: `${t * 100}%`, transform: a === 'center' ? 'translateX(-50%)' : a === 'right' ? 'translateX(-100%)' : 'none' }}>{l}</span>
        ))}
      </div>
      {!compact && (
        <p className="text-ink-3 m-0" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 4 }}>
          Square-root scale, as in the paper. Unshaded land is outside the model.
        </p>
      )}
    </div>
  )
}

function SizeLegend({ radius }) {
  return (
    <div className="flex items-end" style={{ gap: 10 }}>
      {[1, 10, 100].map((v) => {
        const r = radius(v)
        return (
          <span key={v} className="inline-flex items-end font-mono text-ink-3" style={{ gap: 4, fontSize: 10 }}>
            <svg width={2 * r + 2} height={2 * r + 2} aria-hidden="true">
              <circle cx={r + 1} cy={r + 1} r={r} fill="none" stroke="currentColor" strokeWidth={1} />
            </svg>
            {v} Mt
          </span>
        )
      })}
    </div>
  )
}

function Detail({ item, onClose }) {
  if (!item) {
    return (
      <p className="text-ink-3 m-0" style={{ fontSize: 12, lineHeight: 1.45 }}>
        Hover a deposit or basin, or tap one, for its details.
      </p>
    )
  }
  const rows =
    item.kind === 'deposit'
      ? [
          ['Contained resources', `${fmt(item.res, 2)} Mt metal`],
          ['Location', latlon(item.coords)],
          ['Basin', item.basin == null ? '—' : basinName(item.river, item.place)],
          ['Region', item.place ?? '—'],
          ['Basin water stress', item.s == null ? 'not in model' : `${pct(item.s)}, ${stressClass(item.s)}`],
          ['AWARE 2.0 factor', item.cf == null ? '—' : `${fmt(item.cf, 2)} m³-eq/m³`],
        ]
      : [
          ['Region', item.place ?? '—'],
          ['Water stress', item.s == null ? 'not in model' : `${pct(item.s)}, ${stressClass(item.s)}`],
          ['AWARE 2.0 factor', item.cf == null ? '—' : `${fmt(item.cf, 2)} m³-eq/m³`],
          ['Deposits in basin', item.count ? `${item.count} (${fmt(item.resTotal, 1)} Mt)` : 'none in the model'],
        ]
  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
        <p className="font-serif text-ink m-0" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
          {item.kind === 'deposit' ? (
            <span className="inline-flex items-center" style={{ gap: 6 }}>
              <Swatch color={MINERAL_COLOR[item.mineral]} />
              {item.mineral} deposit
            </span>
          ) : (
            basinName(item.river, item.place)
          )}
        </p>
        {item.pinned && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 cursor-pointer p-0 font-mono text-ink-3 hover:text-ink"
            style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}
          >
            Clear
          </button>
        )}
      </div>
      <dl className="m-0" style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 12 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-ink m-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-3 m-0" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 6 }}>
        {item.kind === 'deposit'
          ? <>Deposit {item.id}{item.basin != null ? `, AWARE basin ${item.basin}` : ''}. Deposit names, grades and costs are licensed from S&amp;P Global and not shown.</>
          : <>AWARE basin {item.id}. Named from Natural Earth rivers and provinces.</>}
      </p>
    </div>
  )
}

// ─── Map ─────────────────────────────────────────────────────────────────────

function MiningMap({ data, isDark, minerals, stressedOnly, onHover, onPick, picked }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)

  const stressColor = useMemo(() => {
    const expr = ['interpolate', ['linear'], ['sqrt', ['min', 1, ['get', 's']]]]
    for (const [t, c] of STRESS_STOPS) expr.push(t, c)
    return expr
  }, [])

  const addLayers = (map, dark) => {
    const landFill = dark ? '#14142A' : '#F1F1DF'
    const outline = dark ? 'rgba(248,248,232,0.85)' : 'rgba(24,24,56,0.85)'
    const depStroke = dark ? 'rgba(248,248,232,0.75)' : 'rgba(24,24,56,0.75)'
    if (!map.getSource('basins')) map.addSource('basins', { type: 'geojson', data: data.basins, promoteId: 'id' })
    if (!map.getSource('deposits')) map.addSource('deposits', { type: 'geojson', data: data.deposits })
    // Land outside the model is drawn from the basins themselves (s = null)
    // rather than from Natural Earth land, whose Eurasia polygon fills a band
    // across the Arctic at these zooms.
    map.addLayer({
      id: 'land', type: 'fill', source: 'basins',
      filter: ['==', ['get', 's'], null],
      paint: { 'fill-color': landFill, 'fill-antialias': false },
    })
    map.addLayer({
      id: 'basins', type: 'fill', source: 'basins',
      filter: ['!=', ['get', 's'], null],
      // Low stress fades toward the land fill (the _map DESIGN.md rule that a
      // sequential map's low end sits near the background), so the eye goes
      // to stressed basins. Antialiasing off: with 11,661 abutting polygons
      // at partial opacity it draws every shared edge as a visible seam.
      paint: {
        'fill-antialias': false,
        'fill-color': stressColor,
        'fill-opacity': ['interpolate', ['linear'], ['sqrt', ['min', 1, ['get', 's']]],
          0, dark ? 0.18 : 0.35, 0.25, dark ? 0.55 : 0.7, 0.45, 0.9],
      },
    })
    // Basin borders: a deliberate hairline in ink, drawn as its own layer
    // (fill antialiasing stays off, which drew seams, not borders). Fades
    // in with zoom so the world view does not turn to mesh.
    map.addLayer({
      id: 'basin-borders', type: 'line', source: 'basins',
      paint: {
        'line-color': dark ? '#F8F8E8' : '#181838',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, dark ? 0.08 : 0.07, 3, dark ? 0.2 : 0.18, 6, dark ? 0.32 : 0.3],
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.3, 4, 0.5, 8, 0.9],
      },
    })
    map.addLayer({
      id: 'basin-hl', type: 'line', source: 'basins',
      filter: ['==', ['get', 'id'], -1],
      paint: { 'line-color': outline, 'line-width': 1.4 },
    })
    map.addLayer({
      id: 'deposits', type: 'circle', source: 'deposits',
      paint: {
        'circle-color': ['match', ['get', 'mineral'], ...MINERALS.flat(), '#888'],
        // Area ∝ resources; grows with zoom so clusters separate.
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          1, ['+', 1.2, ['*', 0.85, ['sqrt', ['get', 'res']]]],
          6, ['+', 2.5, ['*', 2.2, ['sqrt', ['get', 'res']]]]],
        'circle-opacity': 0.85,
        'circle-stroke-color': depStroke,
        'circle-stroke-width': 0.5,
      },
    })
    map.addLayer({
      id: 'deposit-hl', type: 'circle', source: 'deposits',
      filter: ['==', ['get', 'id'], -1],
      paint: {
        'circle-color': 'rgba(0,0,0,0)',
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          1, ['+', 3.5, ['*', 0.85, ['sqrt', ['get', 'res']]]],
          6, ['+', 5, ['*', 2.2, ['sqrt', ['get', 'res']]]]],
        'circle-stroke-color': outline,
        'circle-stroke-width': 1.6,
      },
    })
  }

  // Create once.
  useEffect(() => {
    const isSmall = window.innerWidth < 768
    // Latitude clamp inside MapLibre's camera pipeline (the same technique
    // as _map/components/map/index.jsx): the update is corrected before it
    // applies, so dragging at the limit stays smooth. North is hard; the
    // south gets SOUTH_SLACK of the viewport as ocean.
    const mc = maplibregl.MercatorCoordinate
    const yTop = mc.fromLngLat({ lng: 0, lat: LAT_BOUNDS[1] }).y
    const yBot = mc.fromLngLat({ lng: 0, lat: LAT_BOUNDS[0] }).y
    const transformCameraUpdate = ({ center, zoom }) => {
      const h = ref.current?.clientHeight
      if (!h || center == null || zoom == null) return {}
      const half = h / (512 * 2 ** zoom) / 2
      const lo = yTop + half
      let hi = yBot - half * (1 - 2 * SOUTH_SLACK)
      if (lo > hi) hi = lo
      const cy = Math.min(hi, Math.max(lo, mc.fromLngLat({ lng: 0, lat: center.lat }).y))
      const lat = new mc(0.5, cy, 0).toLngLat().lat
      if (Math.abs(lat - center.lat) < 1e-9) return {}
      return { center: { lng: center.lng, lat } }
    }
    const startCenter = isSmall ? [-79.5, 21.5] : [-30, 20]
    const map = new maplibregl.Map({
      container: ref.current,
      style: basemapStyle(isDark ? 'dark' : 'light'),
      // Opening view: the mid-Atlantic on desktop, Cuba on a phone. The
      // minimum zoom below raises the zoom if the band needs it.
      center: startCenter,
      zoom: isSmall ? 1.2 : 1.15,
      minZoom: 0,
      maxZoom: 8,
      renderWorldCopies: false,
      attributionControl: false,
      transformCameraUpdate,
    })
    // The band must always at least fill the viewport height, so no zoom
    // can reveal past the cuts. Recomputed on resize.
    // The first call re-applies the opening centre: at the constructor's
    // zoom the world can be narrower than the screen, which pins longitude
    // to 0 until the zoom is raised.
    let first = true
    const applyMinZoom = () => {
      const h = map.getContainer().clientHeight
      if (!h) return
      const minZ = Math.max(0, Math.log2((h * (1 - SOUTH_SLACK)) / (512 * (yBot - yTop))))
      map.setMinZoom(minZ)
      map.jumpTo(first ? { center: startCenter, zoom: Math.max(map.getZoom(), minZ) } : { center: map.getCenter() })
      first = false
    }
    applyMinZoom()
    map.on('resize', applyMinZoom)
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.touchPitch.disable()
    map.keyboard?.disableRotation?.()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    map.on('load', () => {
      addLayers(map, isDark)
      setReady(true)
    })

    const depositFrom = (f) => ({
      kind: 'deposit', id: f.properties.id, mineral: f.properties.mineral, res: f.properties.res,
      basin: f.properties.basin, river: f.properties.river, place: f.properties.place,
      s: f.properties.s, cf: f.properties.cf, coords: f.geometry.coordinates,
    })
    const basinFrom = (f) => {
      const id = f.properties.id
      const inBasin = data.deposits.features.filter((d) => d.properties.basin === id)
      return {
        kind: 'basin', id, river: f.properties.river, place: f.properties.place, s: f.properties.s, cf: f.properties.cf,
        count: inBasin.length, resTotal: inBasin.reduce((a, d) => a + d.properties.res, 0),
      }
    }
    const pick = (e) => {
      const dep = map.queryRenderedFeatures(e.point, { layers: ['deposits'] })[0]
      if (dep) return depositFrom(dep)
      const b = map.queryRenderedFeatures(e.point, { layers: ['basins'] })[0]
      return b ? basinFrom(b) : null
    }
    map.on('mousemove', (e) => {
      if (!map.getLayer('deposits')) return
      const item = pick(e)
      map.getCanvas().style.cursor = item ? 'pointer' : ''
      onHover(item)
    })
    map.on('mouseout', () => onHover(null))
    map.on('click', (e) => {
      if (!map.getLayer('deposits')) return
      onPick(pick(e))
    })
    return () => map.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Theme: re-style and re-add the data layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setStyle(basemapStyle(isDark ? 'dark' : 'light'))
    map.once('styledata', () => {
      addLayers(map, isDark)
      applyFilter(map)
      applyHighlight(map)
    })
  }, [isDark]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFilter = (map) => {
    if (!map.getLayer('deposits')) return
    const f = ['all', ['in', ['get', 'mineral'], ['literal', minerals]]]
    if (stressedOnly) f.push(['all', ['!=', ['get', 's'], null], ['>', ['get', 's'], STRESSED]])
    map.setFilter('deposits', f)
  }
  const applyHighlight = (map) => {
    if (!map.getLayer('deposit-hl')) return
    map.setFilter('deposit-hl', ['==', ['get', 'id'], picked?.kind === 'deposit' ? picked.id : -1])
    map.setFilter('basin-hl', ['==', ['get', 'id'], picked ? (picked.kind === 'basin' ? picked.id : picked.basin ?? -1) : -1])
  }
  useEffect(() => { if (ready) applyFilter(mapRef.current) }, [ready, minerals.join(','), stressedOnly]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) applyHighlight(mapRef.current) }, [ready, picked]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* maplibre-gl.css sets .maplibregl-map { position: relative }, so the
          container cannot itself be the absolutely positioned box. */}
      <div className="absolute inset-0">
        <div ref={ref} className="h-full w-full" />
      </div>
      <BusyOverlay busy={!ready} label="Loading basins" />
    </>
  )
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export default function MiningWaterTool({ companion = null, repoLinks = null, display = null }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isDark, setIsDark] = useState(isDarkNow())
  const [view, setView] = useState('map')
  const [minerals, setMinerals] = useState(MINERALS.map(([m]) => m))
  const [stressedOnly, setStressedOnly] = useState(false)
  const [hover, setHover] = useState(null)
  const [picked, setPicked] = useState(null)
  const [scenario, setScenario] = useState('Pledges')
  const [material, setMaterial] = useState('All')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    Promise.all(['basins', 'deposits', 'frontier'].map((n) => fetch(`${DATA}/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`${n}.json: ${r.status}`)
      return r.json()
    })))
      .then(([basins, deposits, frontier]) => setData({ basins, deposits, ...frontier }))
      .catch((e) => setError(String(e)))
  }, [])

  // Follow the site's theme toggle.
  useEffect(() => {
    const html = document.documentElement
    const obs = new MutationObserver(() => setIsDark(isDarkNow()))
    obs.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  // Matches the circle-radius expression near the opening zoom.
  const radius = (v) => 1.3 + 0.9 * Math.sqrt(v)
  const shownItem = hover ?? (picked ? { ...picked, pinned: true } : null)
  const counts = useMemo(() => {
    if (!data) return null
    let n = 0, mt = 0
    for (const f of data.deposits.features) {
      const p = f.properties
      if (!minerals.includes(p.mineral)) continue
      if (stressedOnly && !(p.s != null && p.s > STRESSED)) continue
      n++; mt += p.res
    }
    return { n, mt }
  }, [data, minerals.join(','), stressedOnly]) // eslint-disable-line react-hooks/exhaustive-deps


  const controls = (
    <>
      {companion && (
        <div className="mb-2.5">
          <Eyebrow>Companion paper</Eyebrow>
          <a
            href={companion.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-2 hover:text-ink border-b-0"
            style={{ fontSize: 13, lineHeight: 1.4, display: 'block' }}
          >
            {companion.lead} · {companion.journal} · {companion.year}
          </a>
        </div>
      )}

      <div className="mb-4">
        <Eyebrow>View</Eyebrow>
        <ToggleRow value={view} onChange={(v) => { setView(v); setDrawerOpen(false) }} options={[['map', 'Map'], ['tradeoff', 'Water vs. cost']]} />
      </div>

      {view === 'map' ? (
        <>
          <div className="mb-4">
            <Eyebrow>Deposits</Eyebrow>
            <div className="flex flex-wrap" style={{ gap: '6px 14px' }}>
              {MINERALS.map(([mi, col]) => (
                <label key={mi} className="inline-flex items-center cursor-pointer text-ink-2" style={{ gap: 6, fontSize: 13 }}>
                  <input
                    id={`mw-${mi}`}
                    type="checkbox"
                    checked={minerals.includes(mi)}
                    onChange={(e) => setMinerals((cur) => (e.target.checked ? [...cur, mi] : cur.filter((x) => x !== mi)))}
                    style={{ accentColor: 'var(--ink)' }}
                  />
                  <Swatch color={col} />
                  {mi}
                </label>
              ))}
            </div>
            <label className="inline-flex items-center cursor-pointer text-ink-2" style={{ gap: 6, fontSize: 13, marginTop: 8 }}>
              <input id="mw-stressed" type="checkbox" checked={stressedOnly} onChange={(e) => setStressedOnly(e.target.checked)} style={{ accentColor: 'var(--ink)' }} />
              Only in stressed basins (above 10%)
            </label>
            {counts && (
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 10, marginTop: 6 }}>
                {counts.n.toLocaleString()} deposits · {fmt(counts.mt, 0)} Mt contained metal
              </p>
            )}
          </div>

          <div className="mb-4">
            <Eyebrow>Basin water stress</Eyebrow>
            <StressLegend />
          </div>

          <div className="mb-4">
            <Eyebrow>Deposit size</Eyebrow>
            <SizeLegend radius={radius} />
          </div>

          <div className="mb-4 border-t border-rule" style={{ paddingTop: 10 }}>
            <Detail item={shownItem} onClose={() => setPicked(null)} />
          </div>
        </>
      ) : (
        data && (
          <>
            <div className="mb-4">
              <Eyebrow>Demand scenario</Eyebrow>
              <WordRow value={scenario} onChange={setScenario} options={data.scenarios.map((x) => [x, x])} />
            </div>
            <div className="mb-4">
              <Eyebrow>Minerals</Eyebrow>
              <WordRow value={material} onChange={setMaterial}
                options={[['All', 'All four'], ...MINERALS.map(([mi]) => [mi, mi])]} />
            </div>
            <div className="mb-4">
              <Eyebrow>Impact</Eyebrow>
              <WordRow value="water" onChange={() => {}} options={[['water', 'Water stress']]} />
              <p className="text-ink-3 m-0" style={{ fontSize: 10.5, lineHeight: 1.45, marginTop: 6 }}>
                The paper's fish biodiversity runs are not yet public; they will appear here when they are.
              </p>
            </div>
            <p className="text-ink-3 m-0 mb-4" style={{ fontSize: 11, lineHeight: 1.45 }}>
              Drag the red point along the curve, or focus it and use the arrow keys.
            </p>
          </>
        )
      )}

      <div className="border-t border-rule" style={{ paddingTop: 8 }}>
        <p className="text-ink-3 m-0" style={{ fontSize: 10, lineHeight: 1.45 }}>
          Basins: AWARE 2.0 (Seitfudem, Berger &amp; Boulay, CC BY 4.0), simplified for display. Deposits and
          results: the paper's replication data.
        </p>
        {/* STEER credit through ToolFooter's initiative slot (as Food
            Emissions credits Cornerstone), with the wordmark the magnet
            explorer uses. */}
        <ToolFooter config={{ initiative: STEER }} repoLinks={repoLinks} isDark={isDark} />
      </div>
    </>
  )

  return (
    <ToolShell
      eyebrow={display?.eyebrow ?? 'Interactive map'}
      title={display?.title ?? 'Mining within water limits'}
      summary={
        display?.summary ??
        'Where the copper, nickel, cobalt and lithium for batteries would be mined, how much of it lies in water-stressed basins, and what it would cost to mine elsewhere.'
      }
      surface="paper"
      rail={controls}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={setDrawerOpen}
      mainScroll={view === 'tradeoff'}
    >
      {error && (
        <p className="text-ink-2 p-6" style={{ fontSize: 14 }}>The data did not load ({error}). Reload the page to try again.</p>
      )}
      {!data && !error && <BusyOverlay busy label="Loading" />}
      {data && view === 'map' && (
        <>
          <MiningMap
            data={data}
            isDark={isDark}
            minerals={minerals}
            stressedOnly={stressedOnly}
            onHover={setHover}
            onPick={setPicked}
            picked={picked}
          />
          {/* Mobile: the rail is a drawer, so a tapped feature gets its card
              on the map, clear of the attribution strip and Safari's bar. */}
          {picked && (
            <div
              className="block md:hidden absolute z-10 border border-rule"
              style={{
                left: 8, right: 8, bottom: 55, padding: '8px 10px', borderRadius: 4,
                background: isDark ? 'rgba(12, 12, 28, 0.94)' : 'rgba(248, 248, 232, 0.94)',
              }}
            >
              <Detail item={{ ...picked, pinned: true }} onClose={() => setPicked(null)} />
            </div>
          )}
          {/* Mobile legend, as the map engine's: the rail's legend lives in
              the drawer on a phone. */}
          {!picked && (
            <div
              className="block md:hidden absolute z-10"
              style={{
                bottom: 55, right: 8, width: 170, padding: '6px 8px', borderRadius: 4,
                background: isDark ? 'rgba(12, 12, 28, 0.92)' : 'rgba(248, 248, 232, 0.92)',
              }}
            >
              <p className="font-mono text-ink-3 m-0" style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                Basin water stress
              </p>
              <StressLegend compact />
            </div>
          )}
          <p
            className="absolute font-mono text-ink-3 m-0"
            style={{ right: 8, bottom: 4, fontSize: 9, zIndex: 5, pointerEvents: 'none' }}
          >
            Basins © AWARE 2.0 · Names: Natural Earth
          </p>
        </>
      )}
      {data && view === 'tradeoff' && <WaterCost data={data} scenario={scenario} material={material} />}
    </ToolShell>
  )
}
