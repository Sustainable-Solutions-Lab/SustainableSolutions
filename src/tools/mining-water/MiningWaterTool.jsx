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
import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import ToolShell from '../_shell/ToolShell'
import { BusyOverlay } from '../_shell/busy-overlay.jsx'
import { basemapStyle } from '../_map/components/map/basemap-style.jsx'
import { ToolFooter } from '../_map/components/sidebar/tool-footer.jsx'

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
// region.latBounds: the Arctic and Antarctic carry no deposits and almost no
// modelled basins (deposits run 42° S to 74° N), so they only cost space.
const LAT_BOUNDS = [-56, 77]
// Share of the viewport that may hang below the southern cut, so Patagonia
// and Tasmania can clear the bottom-of-map attribution and phone chrome.
const SOUTH_SLACK = 0.4

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
          ['Basin', item.basin == null ? '—' : `#${item.basin}`],
          ['Basin water stress', item.s == null ? 'not in model' : `${pct(item.s)}, ${stressClass(item.s)}`],
          ['AWARE 2.0 factor', item.cf == null ? '—' : `${fmt(item.cf, 2)} m³-eq/m³`],
        ]
      : [
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
            `Basin #${item.id}`
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
      {item.kind === 'deposit' && (
        <p className="text-ink-3 m-0" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 6 }}>
          Deposit {item.id}. Names, grades and costs are licensed from S&amp;P Global and not shown.
        </p>
      )}
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
    if (!map.getSource('land')) map.addSource('land', { type: 'geojson', data: '/tools/food-emissions/ne110m-land.json' })
    if (!map.getSource('basins')) map.addSource('basins', { type: 'geojson', data: data.basins, promoteId: 'id' })
    if (!map.getSource('deposits')) map.addSource('deposits', { type: 'geojson', data: data.deposits })
    map.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': landFill } })
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
    const map = new maplibregl.Map({
      container: ref.current,
      style: basemapStyle(isDark ? 'dark' : 'light'),
      center: isSmall ? [10, 15] : [8, 18],
      zoom: isSmall ? 0.6 : 1.15,
      minZoom: 0,
      maxZoom: 8,
      renderWorldCopies: false,
      attributionControl: false,
      transformCameraUpdate,
    })
    // The band must always at least fill the viewport height, so no zoom
    // can reveal past the cuts. Recomputed on resize.
    const applyMinZoom = () => {
      const h = map.getContainer().clientHeight
      if (!h) return
      map.setMinZoom(Math.max(0, Math.log2((h * (1 - SOUTH_SLACK)) / (512 * (yBot - yTop)))))
      map.jumpTo({ center: map.getCenter() })
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
      basin: f.properties.basin, s: f.properties.s, cf: f.properties.cf, coords: f.geometry.coordinates,
    })
    const basinFrom = (f) => {
      const id = f.properties.id
      const inBasin = data.deposits.features.filter((d) => d.properties.basin === id)
      return {
        kind: 'basin', id, s: f.properties.s, cf: f.properties.cf,
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

// ─── Trade-off chart (Figure 2) ──────────────────────────────────────────────

function useWidth(ref) {
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function TradeoffView({ data, scenario, step, onPick }) {
  const box = useRef(null)
  const w = useWidth(box)
  const h = Math.round(Math.min(460, Math.max(300, w * 0.62)))
  const m = { t: 16, r: 18, b: 46, l: 58 }
  const all = data.scenarios.flatMap((s) => data.frontier[s])
  const x = scaleLinear().domain([0, Math.max(...all.map((d) => d.water)) / 1000 * 1.04]).nice().range([m.l, w - m.r])
  const y = scaleLinear()
    .domain([Math.min(...all.map((d) => d.cost)) / 1000 * 0.92, Math.max(...all.map((d) => d.cost)) / 1000 * 1.03])
    .nice().range([h - m.b, m.t])
  const ln = d3line().x((d) => x(d.water / 1000)).y((d) => y(d.cost / 1000))
  const [hover, setHover] = useState(null)
  const shown = hover ?? { scenario, step }
  const pt = data.frontier[shown.scenario]?.find((d) => d.step === shown.step)
  const base = data.frontier[shown.scenario]?.[0]
  const labelled = new Set(['1%', '5%', '10%', '25%'])

  const rows = (data.byMineral[scenario] ?? []).filter((d) => d.step === step)
  const baseRows = (data.byMineral[scenario] ?? []).filter((d) => d.step === '0%')
  const maxW = Math.max(1, ...baseRows.map((d) => d.water))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto px-4 py-4 md:px-8 md:py-6" style={{ maxWidth: 980 }}>
        <p className={eyebrowCls} style={eyebrowStyle}>Figure 2 · cost of avoiding water stress</p>
        <p className="font-serif text-ink" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.2, margin: '2px 0 6px' }}>
          Half of mining's stress-weighted water use can be avoided for about 10% more cost
        </p>
        <p className="text-ink-2 m-0" style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 680 }}>
          The model meets each demand scenario at least cost, then is allowed a small cost increase and asked to
          cut stress-weighted water use. Each line is one scenario; each point one cost ceiling. Totals are for
          2025–2050.
        </p>

        <div ref={box} className="relative" style={{ marginTop: 14 }}>
          <svg width={w} height={h} role="img" aria-label="Cost against stress-weighted water use, by demand scenario" style={{ display: 'block' }}>
            {y.ticks(6).map((t) => (
              <g key={`y${t}`}>
                <line x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
                <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fill="var(--ink-3)" style={{ font: '11px var(--font-mono)' }}>
                  ${fmt(t, 1)}T
                </text>
              </g>
            ))}
            {x.ticks(6).map((t) => (
              <g key={`x${t}`}>
                <line x1={x(t)} x2={x(t)} y1={h - m.b} y2={h - m.b + 4} stroke="var(--rule-strong)" />
                <text x={x(t)} y={h - m.b + 16} textAnchor="middle" fill="var(--ink-3)" style={{ font: '11px var(--font-mono)' }}>
                  {fmt(t, 0)}
                </text>
              </g>
            ))}
            <line x1={m.l} x2={w - m.r} y1={h - m.b} y2={h - m.b} stroke="var(--rule-strong)" />
            <text x={(m.l + w - m.r) / 2} y={h - 8} textAnchor="middle" fill="var(--ink-2)" style={{ font: '12px var(--font-sans)' }}>
              Stress-weighted water use, trillion m³-eq
            </text>
            <text transform={`translate(14,${(m.t + h - m.b) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-2)" style={{ font: '12px var(--font-sans)' }}>
              Total cost
            </text>
            {data.scenarios.map((s) => {
              const pts = data.frontier[s]
              const on = s === scenario
              return (
                <g key={s} opacity={on ? 1 : 0.45}>
                  <path d={ln(pts)} fill="none" stroke={SCEN_COLOR[s]} strokeWidth={on ? 2 : 1.4} />
                  {pts.map((d) => {
                    const sel = on && d.step === step
                    return (
                      <circle
                        key={d.step}
                        cx={x(d.water / 1000)} cy={y(d.cost / 1000)}
                        r={sel ? 6.5 : d.step === '0%' ? 5 : 3.5}
                        fill={SCEN_COLOR[s]}
                        stroke={sel ? 'var(--ink)' : 'var(--paper)'}
                        strokeWidth={sel ? 2 : 1}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover({ scenario: s, step: d.step })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onPick(s, d.step)}
                      />
                    )
                  })}
                  {(() => {
                    const b = pts[0]
                    return (
                      <text x={x(b.water / 1000) + 9} y={y(b.cost / 1000) - 7} fill={SCEN_COLOR[s]} style={{ font: '600 11px var(--font-sans)' }}>
                        {s}
                      </text>
                    )
                  })()}
                  {on && pts.filter((d) => labelled.has(d.step)).map((d) => (
                    <text key={`l${d.step}`} x={x(d.water / 1000) - 7} y={y(d.cost / 1000) + 4} textAnchor="end" fill="var(--ink-3)" style={{ font: '10px var(--font-mono)' }}>
                      +{d.step}
                    </text>
                  ))}
                </g>
              )
            })}
          </svg>
        </div>

        {pt && base && (
          <div className="border-t border-rule" style={{ marginTop: 6, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              ['Scenario', `${shown.scenario}, ${shown.step === '0%' ? 'least cost' : `+${shown.step} cost`}`],
              ['Total cost', `$${fmt(pt.cost / 1000, 2)}T`],
              ['Stress-weighted water', `${fmt(pt.water / 1000, 2)} trillion m³-eq${pt.reduction ? ` (${fmt(pt.reduction, 0)}%)` : ''}`],
              ['Water consumed', `${fmt(pt.consumed, 0)} billion m³`],
              ['Mines opened', `${pt.mines.toLocaleString()} (${pt.mines - base.mines >= 0 ? '+' : ''}${pt.mines - base.mines})`],
            ].map(([k, v]) => (
              <div key={k}>
                <p className={eyebrowCls} style={eyebrowStyle}>{k}</p>
                <p className="text-ink m-0" style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{v}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <p className={eyebrowCls} style={eyebrowStyle}>By mineral · {scenario}, {step === '0%' ? 'least cost' : `+${step} cost`}</p>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="text-ink-3" style={{ fontSize: 11 }}>
                <th className="text-left font-normal border-b border-rule" style={{ padding: '4px 6px' }}>Mineral</th>
                <th className="text-right font-normal border-b border-rule" style={{ padding: '4px 6px' }}>Unit cost, $/kg</th>
                <th className="text-right font-normal border-b border-rule" style={{ padding: '4px 6px' }}>Water, m³-eq/kg</th>
                <th className="text-left font-normal border-b border-rule" style={{ padding: '4px 6px', width: '38%' }}>Water vs least cost</th>
              </tr>
            </thead>
            <tbody>
              {MINERALS.map(([mi, col]) => {
                const d = rows.find((r) => r.mineral === mi)
                const b = baseRows.find((r) => r.mineral === mi)
                if (!d) return null
                const chg = b && b.water ? (d.water - b.water) / b.water : 0
                return (
                  <tr key={mi}>
                    <td className="border-b border-rule text-ink" style={{ padding: '5px 6px' }}>
                      <span className="inline-flex items-center" style={{ gap: 6 }}><Swatch color={col} />{mi}</span>
                    </td>
                    <td className="border-b border-rule text-right text-ink" style={{ padding: '5px 6px' }}>{fmt(d.cost / 1000, 2)}</td>
                    <td className="border-b border-rule text-right text-ink" style={{ padding: '5px 6px' }}>{fmt(d.water / 1000, 2)}</td>
                    <td className="border-b border-rule" style={{ padding: '5px 6px' }}>
                      <div className="flex items-center" style={{ gap: 8 }}>
                        <div style={{ height: 7, borderRadius: 2, background: col, width: `${Math.max(2, (70 * d.water) / maxW)}%` }} />
                        <span className="font-mono text-ink-3" style={{ fontSize: 11 }}>{step === '0%' ? '' : `${chg >= 0 ? '+' : ''}${Math.round(chg * 100)}%`}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-ink-3 m-0" style={{ fontSize: 11, lineHeight: 1.45, marginTop: 6 }}>
            Per kilogram of metal demanded, 2025–2050. Unit cost in discounted US dollars; water is
            stress-weighted (m³ world-equivalent, AWARE 2.0).
          </p>
        </div>
      </div>
    </div>
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
  const [step, setStep] = useState('10%')
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

  const steps = data ? data.frontier[scenario].map((d) => d.step) : []

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
        <ToggleRow value={view} onChange={(v) => { setView(v); setDrawerOpen(false) }} options={[['map', 'Map'], ['tradeoff', 'Trade-off']]} />
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
          <div className="mb-4">
            <Eyebrow>Demand scenario</Eyebrow>
            <select
              id="mw-scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
              style={{ borderRadius: 'var(--radius-sm)' }}
            >
              {data.scenarios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div style={{ marginTop: 12 }}>
              <Eyebrow>Allowed cost increase</Eyebrow>
              <select
                id="mw-step"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
                style={{ borderRadius: 'var(--radius-sm)' }}
              >
                {steps.map((s) => <option key={s} value={s}>{s === '0%' ? 'None (least cost)' : `+${s}`}</option>)}
              </select>
            </div>
            <p className="text-ink-3 m-0" style={{ fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>
              Or tap any point on the chart.
            </p>
          </div>
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
            Basins © AWARE 2.0 · Land © Natural Earth
          </p>
        </>
      )}
      {data && view === 'tradeoff' && (
        <TradeoffView
          data={data}
          scenario={scenario}
          step={step}
          onPick={(s, st) => { setScenario(s); setStep(st) }}
        />
      )}
    </ToolShell>
  )
}
