/**
 * map/MapView.jsx
 *
 * The map, after the lab site's food-emissions explorer: Equal Earth drawn
 * through MapLibre with every layer pre-projected (equal-earth.js is the
 * site's module), the same camera (centre, zoom limits, latitude band),
 * Natural Earth 1:10m land and national/admin-1 boundaries from the same
 * tiles on R2, and the grid drawn as cell-true semi-transparent circles
 * sized from each cell's area, so the field reads as a field rather than
 * as squares.
 *
 * Also owns the region focus: a draggable, resizable circle, or a polygon
 * drawn by clicking vertices (double-click to finish), with everything
 * outside dimmed.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { Grid3x3, Sun, Moon, Check, X } from 'lucide-react'
import { setEqualEarth, toMap, toMapLat, fromMap, projectLines, geometryToMap } from './equal-earth.js'
import { INTERPOLATORS } from './colormap.js'
import { focusLayersGeoJSON, haversineKm } from './focus.js'

setEqualEarth(true)

const R2 = 'https://pub-4152429430274d988725593fd52db3ae.r2.dev/food-emissions'
const LAND_URL = `${R2}/land10m-ee.pmtiles`
const BOUNDARIES_URL = `${R2}/boundaries-ee.pmtiles`

// Camera, as the food-emissions explorer sets it.
const REGION = { center: [-30, 21.5], zoom: 1.6, mobileCenter: [-79.5, 24], mobileZoom: 2.35, minZoom: 1.2, maxZoom: 6, latBounds: [-56, 79], southSlack: 0.13 }

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() }
function rgba(hex, a) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return `rgba(${r},${g},${b},${a})` }
function themeColors() {
  const paper = cssVar('--paper') || '#F8F8E8', paper2 = cssVar('--paper-2') || '#F1F1DF', ink = cssVar('--ink') || '#181838'
  const dark = document.documentElement.dataset.theme === 'dark'
  return {
    bg: paper, land: paper2, coast: rgba(ink, 0.25), adm0: rgba(ink, 0.30), adm1: rgba(ink, 0.20), grat: rgba(ink, 0.18),
    select: cssVar('--cardinal') || '#8C1515', focusLine: dark ? 'rgba(255,255,255,0.85)' : 'rgba(50,50,50,0.65)', focusMask: dark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.30)',
  }
}

let graticuleData = null
function getGraticule() {
  if (graticuleData) return graticuleData
  const lines = []
  for (let lon = -180; lon <= 180; lon += 15) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, -89.9], [lon, 89.9]] } })
  for (let lat = -75; lat <= 75; lat += 15) lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] } })
  graticuleData = projectLines({ type: 'FeatureCollection', features: lines }, 1)
  return graticuleData
}

// Cell centres in map coordinates and cell areas in km², computed once per grid.
function cellGeometry(grid) {
  const xy = new Float64Array(grid.size * 2)
  const km2 = new Float32Array(grid.size)
  const area = grid.layers.cell_area_ha
  for (let i = 0; i < grid.size; i++) {
    const [lon, lat] = grid.lonLatOf(i)
    const [x, y] = toMap(lon, lat)
    xy[2 * i] = x; xy[2 * i + 1] = y
    km2[i] = area ? area[i] / 100 : 3000
  }
  return { xy, km2 }
}

// Cell-true radius (lib/use-just-air-layers.js, areaRadius): each circle is
// sized from its own cell's area, growing exponentially with zoom; `fill`
// is the diameter relative to the cell pitch, a little spaced at overview
// so stacked alpha does not over-saturate, overlapping when zoomed in.
function radiusExpr() {
  // Heavier fill at overview zooms, where a 0.5° cell is two or three
  // pixels across and just-touching circles read as a dot screen.
  const fillStops = [[1, 1.9], [2.5, 1.5], [4, 1.3], [6, 1.2]]
  const fillAt = (z) => {
    if (z <= fillStops[0][0]) return fillStops[0][1]
    for (let k = 1; k < fillStops.length; k++) if (z <= fillStops[k][0]) { const [z0, v0] = fillStops[k - 1], [z1, v1] = fillStops[k]; return v0 + ((z - z0) / (z1 - z0)) * (v1 - v0) }
    return fillStops[fillStops.length - 1][1]
  }
  const kArea = 512 / (2 * 40075.016)
  const expr = ['interpolate', ['exponential', 2], ['zoom']]
  for (let z = 0; z <= 8; z++) expr.push(z, ['max', 1.25, ['*', kArea * fillAt(z) * 2 ** z, ['sqrt', ['get', 'km2']]]])
  return expr
}

function colorExpr(variable, domain) {
  const f = INTERPOLATORS[variable.colormap] ?? INTERPOLATORS.SpectralR
  const [lo, hi] = domain
  const expr = ['interpolate', ['linear'], ['get', 'v']]
  const n = 12
  for (let k = 0; k < n; k++) { const t = k / (n - 1); expr.push(lo + t * (hi - lo), f(t)) }
  return expr
}

// Sequential views: colour carries magnitude, flat high opacity. Diverging
// views: alpha grows with |value| so the zero crossing fades out.
function opacityExpr(variable, domain) {
  if (!variable.diverging) return 0.9
  const m = Math.max(Math.abs(domain[0]), Math.abs(domain[1])) || 1
  return ['interpolate', ['linear'], ['abs', ['get', 'v']], 0, 0.12, m * 0.4, 0.6, m, 0.95]
}

function cellOutline(grid, i) {
  if (i == null || i < 0) return { type: 'FeatureCollection', features: [] }
  const [lon, lat] = grid.lonLatOf(i)
  const h = grid.res / 2
  const ring = [[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geometryToMap({ type: 'Polygon', coordinates: [ring] }) }] }
}

export default function MapView({ grid, field, domain, variable, selected, onSelect, theme, onToggleTheme, focus, onFocusChange, drawing, onDrawFinish, onDrawCancel, isMobile = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [graticule, setGraticule] = useState(false)
  const [vertices, setVertices] = useState([])
  const [handle, setHandle] = useState(null)
  const [dragKm, setDragKm] = useState(null)
  const geomRef = useRef(null)
  const live = useRef({})
  live.current = { onSelect, focus, onFocusChange, drawing, onDrawFinish, vertices }

  // ── Create the map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const c = themeColors()
    geomRef.current = cellGeometry(grid)
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    // Latitude band: clamp inside MapLibre's camera pipeline (as the site
    // does) so dragging at the limit stays smooth.
    const [latS, latN] = REGION.latBounds.map(toMapLat)
    const mc = maplibregl.MercatorCoordinate
    const yTop = mc.fromLngLat({ lng: 0, lat: latN }).y, yBot = mc.fromLngLat({ lng: 0, lat: latS }).y
    const transformCameraUpdate = ({ center, zoom }) => {
      const h = containerRef.current?.clientHeight
      if (!h || center == null || zoom == null) return {}
      const half = h / (512 * 2 ** zoom) / 2
      const lo = yTop + half
      let hi = yBot - half * (1 - 2 * REGION.southSlack)
      if (lo > hi) hi = lo
      const cy = Math.min(hi, Math.max(lo, mc.fromLngLat({ lng: 0, lat: center.lat }).y))
      const lat = new mc(0.5, cy, 0).toLngLat().lat
      return Math.abs(lat - center.lat) < 1e-9 ? {} : { center: { lng: center.lng, lat } }
    }

    const small = window.innerWidth < 768
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://tiles.stadiamaps.com/fonts/{fontstack}/{range}.pbf',
        sources: {
          land: { type: 'vector', url: `pmtiles://${LAND_URL}` },
          boundaries: { type: 'vector', url: `pmtiles://${BOUNDARIES_URL}` },
          graticule: { type: 'geojson', data: getGraticule() },
          cells: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          focus: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          draft: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          selected: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': c.bg } },
          { id: 'land-fill', type: 'fill', source: 'land', 'source-layer': 'land', paint: { 'fill-color': c.land, 'fill-opacity': 1 } },
          { id: 'coast', type: 'line', source: 'land', 'source-layer': 'land', paint: { 'line-color': c.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 5, 0.8, 8, 1.1] } },
          { id: 'cells', type: 'circle', source: 'cells', paint: { 'circle-radius': radiusExpr(), 'circle-color': '#888', 'circle-opacity': 0.9, 'circle-stroke-width': 0 } },
          { id: 'adm1-lines', type: 'line', source: 'boundaries', 'source-layer': 'adm1', minzoom: 2.5, paint: { 'line-color': c.adm1, 'line-width': ['interpolate', ['linear'], ['zoom'], 2.5, 0.5, 5, 0.8, 8, 1.2] } },
          { id: 'adm0-lines', type: 'line', source: 'boundaries', 'source-layer': 'adm0', paint: { 'line-color': c.adm0, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 5, 1.0, 8, 1.5] } },
          { id: 'graticule', type: 'line', source: 'graticule', layout: { visibility: 'none' }, paint: { 'line-color': c.grat, 'line-width': 0.6 } },
          { id: 'focus-mask', type: 'fill', source: 'focus', filter: ['==', ['get', 'kind'], 'mask'], paint: { 'fill-color': c.focusMask } },
          { id: 'focus-line', type: 'line', source: 'focus', filter: ['==', ['get', 'kind'], 'outline'], paint: { 'line-color': c.focusLine, 'line-width': 1.5 } },
          { id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': c.focusLine, 'line-width': 1.5, 'line-dasharray': [2, 2] } },
          { id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': c.focusLine } },
          { id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': c.select, 'line-width': 2 } },
        ],
      },
      center: toMap(...(small && REGION.mobileCenter ? REGION.mobileCenter : REGION.center)),
      zoom: small ? REGION.mobileZoom : REGION.zoom,
      minZoom: REGION.minZoom, maxZoom: REGION.maxZoom,
      transformCameraUpdate,
      renderWorldCopies: false, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    })
    map.touchZoomRotate.disableRotation()
    if (!small) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => setReady(true))

    // Clicks: add a vertex while drawing, otherwise select the cell.
    map.on('click', (e) => {
      const L = live.current
      const [lon, lat] = fromMap(e.lngLat.lng, e.lngLat.lat)
      if (L.drawing) { setVertices((v) => [...v, [lon, lat]]); return }
      const hits = map.queryRenderedFeatures(e.point, { layers: ['cells'] })
      const i = hits.length ? hits[0].properties.i : grid.cellAt(lon, lat)
      L.onSelect?.(i, [lon, lat])
    })
    map.on('dblclick', (e) => {
      const L = live.current
      if (!L.drawing) return
      e.preventDefault()
      const v = L.vertices
      if (v.length >= 3) L.onDrawFinish?.({ type: 'Polygon', coordinates: [[...v, v[0]]] })
    })

    // Focus circle: drag inside it to move it (pointer events cover mouse
    // and touch; the pan handler is paused for the gesture).
    const canvas = map.getCanvasContainer()
    let dragging = null
    const toGeo = (ev) => { const r = canvas.getBoundingClientRect(); const ll = map.unproject([ev.clientX - r.left, ev.clientY - r.top]); return fromMap(ll.lng, ll.lat) }
    canvas.addEventListener('pointerdown', (ev) => {
      const f = live.current.focus
      if (!f || f.type !== 'circle' || live.current.drawing) return
      const [lon, lat] = toGeo(ev)
      if (haversineKm(f.lat, f.lon, lat, lon) > f.radiusKm) return
      dragging = { dLat: f.lat - lat, dLon: f.lon - lon }
      map.dragPan.disable()
      canvas.setPointerCapture?.(ev.pointerId)
    })
    canvas.addEventListener('pointermove', (ev) => {
      if (!dragging) return
      const f = live.current.focus
      const [lon, lat] = toGeo(ev)
      live.current.onFocusChange?.({ ...f, lat: Math.max(-85, Math.min(85, lat + dragging.dLat)), lon: lon + dragging.dLon })
    })
    const stop = () => { if (dragging) { dragging = null; map.dragPan.enable() } }
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)

    mapRef.current = map
    return () => { map.remove(); maplibregl.removeProtocol('pmtiles'); mapRef.current = null }
  }, [grid])

  // ── Cells: rebuild the point features when the field changes ───────────
  const features = useMemo(() => {
    if (!field || !geomRef.current) return null
    const { xy, km2 } = geomRef.current
    const out = []
    for (let i = 0; i < field.length; i++) {
      const v = field[i]
      if (v !== v) continue
      out.push({ type: 'Feature', properties: { i, v, km2: km2[i] }, geometry: { type: 'Point', coordinates: [xy[2 * i], xy[2 * i + 1]] } })
    }
    return { type: 'FeatureCollection', features: out }
  }, [field, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !features) return
    map.getSource('cells').setData(features)
  }, [features, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !domain || !variable) return
    map.setPaintProperty('cells', 'circle-color', colorExpr(variable, domain))
    map.setPaintProperty('cells', 'circle-opacity', opacityExpr(variable, domain))
  }, [domain, variable, ready])

  // ── Selection, focus, draft polygon ────────────────────────────────────
  useEffect(() => { if (mapRef.current && ready) mapRef.current.getSource('selected')?.setData(cellOutline(grid, selected)) }, [selected, ready, grid])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // A new circle opens at the centre of the view, sized to the zoom.
    if (focus?.centreOnMap) {
      const c = map.getCenter()
      const [lon, lat] = fromMap(c.lng, c.lat)
      const radiusKm = Math.max(50, Math.round(2400 / 2 ** (map.getZoom() - 1.6) / 50) * 50)
      onFocusChange?.({ type: 'circle', lat: Math.max(-70, Math.min(75, lat)), lon, radiusKm })
      return
    }
    map.getSource('focus')?.setData(focusLayersGeoJSON(focus))
    map.getCanvas().style.cursor = drawing ? 'crosshair' : ''
  }, [focus, ready, drawing])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!drawing) { if (vertices.length) setVertices([]); map.getSource('draft')?.setData({ type: 'FeatureCollection', features: [] }); return }
    const pts = vertices.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: toMap(p[0], p[1]) } }))
    const line = vertices.length >= 2 ? [{ type: 'Feature', properties: {}, geometry: projectLines({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [...vertices, ...(vertices.length >= 3 ? [vertices[0]] : [])] } }] }, 0.5).features[0].geometry }] : []
    map.getSource('draft')?.setData({ type: 'FeatureCollection', features: [...pts, ...line] })
  }, [vertices, drawing, ready])

  // Resize handle on the circle's east edge, kept in screen space.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const place = () => {
      const f = live.current.focus
      if (!f || f.type !== 'circle') { setHandle(null); return }
      const dLon = (f.radiusKm / 111.2) / Math.max(0.05, Math.cos((f.lat * Math.PI) / 180))
      const p = map.project(toMap(f.lon + dLon, f.lat))
      setHandle({ x: p.x, y: p.y })
    }
    place()
    map.on('move', place)
    return () => map.off('move', place)
  }, [focus, ready])

  const onHandleDown = (ev) => {
    ev.preventDefault(); ev.stopPropagation()
    const map = mapRef.current
    const f = live.current.focus
    if (!map || !f) return
    const canvas = map.getCanvasContainer()
    const move = (e) => {
      const r = canvas.getBoundingClientRect()
      const ll = map.unproject([e.clientX - r.left, e.clientY - r.top])
      const [lon, lat] = fromMap(ll.lng, ll.lat)
      const km = Math.max(25, haversineKm(f.lat, f.lon, lat, lon))
      setDragKm(km)
      live.current.onFocusChange?.({ ...live.current.focus, radiusKm: km })
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDragKm(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── Theme and graticule ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const c = themeColors()
    map.setPaintProperty('background', 'background-color', c.bg)
    map.setPaintProperty('land-fill', 'fill-color', c.land)
    map.setPaintProperty('coast', 'line-color', c.coast)
    map.setPaintProperty('adm0-lines', 'line-color', c.adm0)
    map.setPaintProperty('adm1-lines', 'line-color', c.adm1)
    map.setPaintProperty('graticule', 'line-color', c.grat)
    map.setPaintProperty('selected', 'line-color', c.select)
    map.setPaintProperty('focus-mask', 'fill-color', c.focusMask)
    map.setPaintProperty('focus-line', 'line-color', c.focusLine)
    map.setPaintProperty('draft-line', 'line-color', c.focusLine)
    map.setPaintProperty('draft-pts', 'circle-color', c.focusLine)
  }, [theme, ready])

  useEffect(() => { if (mapRef.current && ready) mapRef.current.setLayoutProperty('graticule', 'visibility', graticule ? 'visible' : 'none') }, [graticule, ready])

  return (
    <>
      <div ref={containerRef} className="map" />
      <div className="overlay-tr" style={{ top: isMobile ? 12 : 76 }}>
        <button type="button" className="map-btn" aria-pressed={graticule} title={graticule ? 'Hide latitude and longitude lines' : 'Show latitude and longitude lines'} onClick={() => setGraticule((g) => !g)}>
          <Grid3x3 size={16} strokeWidth={1.5} />
        </button>
        {onToggleTheme ? (
          <button type="button" className="map-btn" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
        ) : null}
      </div>
      {handle && !drawing ? (
        <div className="focus-handle" style={{ left: handle.x, top: handle.y }} onPointerDown={onHandleDown} title="Drag to resize">
          {dragKm != null ? <span className="focus-handle-label">{Math.round(dragKm * 2).toLocaleString()} km across</span> : null}
        </div>
      ) : null}
      {drawing ? (
        <div className="draw-bar">
          <span>Click to add corners{vertices.length >= 3 ? ', double-click or finish to close' : ` (${vertices.length} of at least 3)`}</span>
          <button type="button" className="btn" disabled={vertices.length < 3} onClick={() => onDrawFinish?.({ type: 'Polygon', coordinates: [[...vertices, vertices[0]]] })}><Check size={13} strokeWidth={1.5} /> Finish</button>
          <button type="button" className="btn" onClick={onDrawCancel}><X size={13} strokeWidth={1.5} /> Cancel</button>
        </div>
      ) : null}
      {/* Static attribution, as in the explorer: faint text, no control chrome. */}
      <div className="map-attrib">© <a href="https://maplibre.org" target="_blank" rel="noopener noreferrer">MapLibre</a> · Equal Earth · SPAM 2020 · SoilGrids · WorldClim · CRU TS · Natural Earth</div>
    </>
  )
}
