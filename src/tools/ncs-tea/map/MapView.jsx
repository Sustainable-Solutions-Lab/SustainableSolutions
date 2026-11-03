/**
 * map/MapView.jsx
 *
 * The map: MapLibre over a flat paper background, world land and borders
 * from Natural Earth (world-atlas 1:110m), a 15° graticule on demand, and
 * the evaluated field painted as one Equal Earth raster (raster.js). Mirrors
 * the lab site's food-emissions explorer: pre-projected Equal Earth layers,
 * theme-matched colours, borders drawn over the data.
 */
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { feature, mesh } from 'topojson-client'
import land110 from 'world-atlas/land-110m.json'
import countries110 from 'world-atlas/countries-110m.json'
import { Grid3x3, Sun, Moon } from 'lucide-react'
import { setEqualEarth, toMap, fromMap, geometryToMap, projectLines } from './equal-earth.js'
import { buildLookup, paint, canvasCorners } from './raster.js'
import { cutPolygon, cutLines } from './antimeridian.js'
import { buildLut } from './colormap.js'

const CANVAS_W = 2880
const CANVAS_H = 1402

setEqualEarth(true)

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
function withAlpha(hex, a) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a})`
}
function themeColors() {
  const paper = cssVar('--paper') || '#F8F8E8'
  const paper2 = cssVar('--paper-2') || '#F1F1DF'
  const ink = cssVar('--ink') || '#181838'
  return { bg: paper, land: paper2, coast: withAlpha(ink, 0.25), border: withAlpha(ink, 0.3), grat: withAlpha(ink, 0.18), select: cssVar('--cardinal') || '#8C1515' }
}

// Natural Earth geometries, projected once to the Equal Earth plane.
function densifyMultiLine(geom) {
  const fc = { type: 'FeatureCollection', features: geom.coordinates.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) }
  return projectLines(fc, 1)
}
let staticGeo = null
function getStaticGeo() {
  if (staticGeo) return staticGeo
  const land = feature(land110, land110.objects.land)
  // Rings that jump across the antimeridian are cut first, or each jump
  // projects to a line across the whole map.
  land.features = land.features.map((f) => ({ ...f, geometry: geometryToMap(cutPolygon(f.geometry)) }))
  const borders = densifyMultiLine(cutLines(mesh(countries110, countries110.objects.countries, (a, b) => a !== b)))
  const gratLines = []
  for (let lon = -180; lon <= 180; lon += 15) gratLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, -89.9], [lon, 89.9]] } })
  for (let lat = -75; lat <= 75; lat += 15) gratLines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] } })
  const graticule = projectLines({ type: 'FeatureCollection', features: gratLines }, 1)
  staticGeo = { land, borders, graticule }
  return staticGeo
}

function cellOutline(grid, i) {
  if (i == null || i < 0) return { type: 'FeatureCollection', features: [] }
  const [lon, lat] = grid.lonLatOf(i)
  const h = grid.res / 2
  const ring = [[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geometryToMap({ type: 'Polygon', coordinates: [ring] }) }] }
}

export default function MapView({ grid, field, domain, colormap, selected, onSelect, theme, onToggleTheme }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const canvasRef = useRef(null)
  const lookupRef = useRef(null)
  const imageRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [graticule, setGraticule] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ── Create the map once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const c = themeColors()
    const corners = canvasCorners()
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W; canvas.height = CANVAS_H
    canvasRef.current = canvas
    imageRef.current = canvas.getContext('2d').createImageData(CANVAS_W, CANVAS_H)
    lookupRef.current = buildLookup(grid, CANVAS_W, CANVAS_H)
    const { land, borders, graticule: grat } = getStaticGeo()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          land: { type: 'geojson', data: land },
          borders: { type: 'geojson', data: borders },
          graticule: { type: 'geojson', data: grat },
          cells: { type: 'canvas', canvas, coordinates: corners, animate: false },
          selected: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': c.bg } },
          { id: 'land-fill', type: 'fill', source: 'land', paint: { 'fill-color': c.land } },
          { id: 'cells', type: 'raster', source: 'cells', paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
          { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': c.coast, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5, 0.9] } },
          { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': c.border, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 5, 0.9] } },
          { id: 'graticule', type: 'line', source: 'graticule', layout: { visibility: 'none' }, paint: { 'line-color': c.grat, 'line-width': 0.6 } },
          { id: 'selected', type: 'line', source: 'selected', paint: { 'line-color': c.select, 'line-width': 2 } },
        ],
      },
      center: [10, 10], zoom: 1.2, minZoom: 0.6, maxZoom: 7,
      renderWorldCopies: false, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Equal Earth projection · SPAM 2020 · SoilGrids · WorldClim · CRU TS · Natural Earth' }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    // Fit the globe to the container, and keep fitting while the container
    // is still settling (an island mounted inside a page frame can change
    // size after load) until the user moves the map themselves.
    const latN = corners[0][1]
    const fit = () => map.fitBounds([[-180, -latN], [180, latN]], { padding: 6, animate: false })
    let userMoved = false
    map.on('movestart', (e) => { if (e.originalEvent) userMoved = true })
    const ro = new ResizeObserver(() => { if (!userMoved && map.loaded()) { map.resize(); fit() } })
    ro.observe(containerRef.current)
    map.on('load', () => { fit(); setReady(true) })
    map.on('click', (e) => {
      const [lon, lat] = fromMap(e.lngLat.lng, e.lngLat.lat)
      onSelectRef.current?.(grid.cellAt(lon, lat), [lon, lat])
    })
    mapRef.current = map
    return () => { ro.disconnect(); map.remove(); mapRef.current = null }
  }, [grid])

  // ── Repaint when the field, domain or ramp changes ─────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !field) return
    const img = imageRef.current
    paint(img, lookupRef.current, field, domain, buildLut(colormap))
    canvasRef.current.getContext('2d').putImageData(img, 0, 0)
    const src = map.getSource('cells')
    if (src) { src.play(); map.once('render', () => src.pause()) }
  }, [field, domain, colormap, ready])

  // ── Selection outline ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getSource('selected')?.setData(cellOutline(grid, selected))
  }, [selected, ready, grid])

  // ── Theme: recolour the static layers ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const c = themeColors()
    map.setPaintProperty('background', 'background-color', c.bg)
    map.setPaintProperty('land-fill', 'fill-color', c.land)
    map.setPaintProperty('coast', 'line-color', c.coast)
    map.setPaintProperty('borders', 'line-color', c.border)
    map.setPaintProperty('graticule', 'line-color', c.grat)
    map.setPaintProperty('selected', 'line-color', c.select)
  }, [theme, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty('graticule', 'visibility', graticule ? 'visible' : 'none')
  }, [graticule, ready])

  return (
    <>
      <div ref={containerRef} className="map" />
      <div className="overlay-tr" style={{ top: 76 }}>
        <button type="button" className="map-btn" aria-pressed={graticule} title={graticule ? 'Hide latitude and longitude lines' : 'Show latitude and longitude lines'} onClick={() => setGraticule((g) => !g)}>
          <Grid3x3 size={16} strokeWidth={1.5} />
        </button>
        {onToggleTheme ? (
          <button type="button" className="map-btn" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
          </button>
        ) : null}
      </div>
    </>
  )
}

export { toMap, fromMap }
