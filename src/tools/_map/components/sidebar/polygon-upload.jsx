/**
 * components/sidebar/polygon-upload.jsx
 *
 * "Upload sourcing area" — lets a user drop a GeoJSON or KML polygon
 * (a sourcing area, supply shed, watershed...) into the Region Focus
 * machinery. All downstream behavior (map rendering, zoom-to-fit,
 * statistics, trends, emission factors) already handles arbitrary
 * Polygon/MultiPolygon geometry; this component only parses the file
 * and dispatches SET_DRAWN_POLYGON.
 */

import { useRef, useState } from 'react'
import { Actions } from '../../contracts/events.js'

const MAX_COORDS = 500000

/** Merge every Polygon/MultiPolygon in a GeoJSON object into one MultiPolygon. */
function polygonsFromGeojson(obj) {
  const polys = []
  const take = (geom) => {
    if (!geom) return
    if (geom.type === 'Polygon') polys.push(geom.coordinates)
    else if (geom.type === 'MultiPolygon') polys.push(...geom.coordinates)
    else if (geom.type === 'GeometryCollection') (geom.geometries ?? []).forEach(take)
  }
  if (obj.type === 'FeatureCollection') (obj.features ?? []).forEach((f) => take(f.geometry))
  else if (obj.type === 'Feature') take(obj.geometry)
  else take(obj)
  return polys
}

/** KML → MultiPolygon coordinate arrays (outer + inner boundaries). */
function polygonsFromKml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const ringCoords = (el) => {
    const raw = el?.getElementsByTagName('coordinates')[0]?.textContent ?? ''
    return raw.trim().split(/\s+/).map((triple) => {
      const [lng, lat] = triple.split(',').map(Number)
      return [lng, lat]
    }).filter(([a, b]) => isFinite(a) && isFinite(b))
  }
  const polys = []
  for (const poly of doc.getElementsByTagName('Polygon')) {
    const outer = ringCoords(poly.getElementsByTagName('outerBoundaryIs')[0])
    if (outer.length < 4) continue
    const rings = [outer]
    for (const inner of poly.getElementsByTagName('innerBoundaryIs')) {
      const hole = ringCoords(inner)
      if (hole.length >= 4) rings.push(hole)
    }
    polys.push(rings)
  }
  return polys
}

export function PolygonUpload({ state, dispatch, compact = false }) {
  const fileRef = useRef(null)
  const [error, setError] = useState(null)
  const loadedName = state.drawnPolygon?.uploadName ?? null

  async function handleFile(file) {
    setError(null)
    if (!file) return
    try {
      const text = await file.text()
      const polys = /\.(kml)$/i.test(file.name)
        ? polygonsFromKml(text)
        : polygonsFromGeojson(JSON.parse(text))
      if (!polys.length) throw new Error('no polygon found in file')
      const nCoords = polys.flat(2).length
      if (nCoords > MAX_COORDS) throw new Error('polygon too detailed — simplify it first')
      const geometry = polys.length === 1
        ? { type: 'Polygon', coordinates: polys[0] }
        : { type: 'MultiPolygon', coordinates: polys }
      if (!state.areaToolActive) dispatch({ type: Actions.TOGGLE_AREA_TOOL })
      dispatch({ type: Actions.SET_DRAWN_POLYGON, polygon: { geometry, uploadName: file.name } })
    } catch (e) {
      setError(e?.message?.slice(0, 80) || 'could not read file')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={compact ? 'mb-1' : 'mb-2'}>
      <input
        ref={fileRef}
        type="file"
        accept=".geojson,.json,.kml,application/geo+json,application/json"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={state.mapView === 'regional'}
        title={state.mapView === 'regional'
          ? 'Polygon upload works on the gridded view'
          : 'Upload a GeoJSON or KML polygon of a sourcing area, supply shed, or other custom boundary'}
        onClick={() => fileRef.current?.click()}
        className={[
          'block text-left bg-transparent border-0 p-0',
          'font-sans text-[11px]',
          state.mapView === 'regional'
            ? 'text-ink-4 cursor-not-allowed'
            : 'text-ink-3 cursor-pointer transition-colors hover:text-ink underline-offset-[3px] hover:underline',
        ].join(' ')}
      >
        or Upload sourcing area (GeoJSON/KML)
      </button>
      {loadedName && (
        <p className="font-mono text-ink-3 m-0" style={{ fontSize: 9, margin: '2px 0 0' }}>
          {loadedName} loaded — statistics and factors reflect it
        </p>
      )}
      {error && (
        <p className="font-sans m-0" style={{ fontSize: 10, color: 'var(--cardinal)', margin: '2px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  )
}
