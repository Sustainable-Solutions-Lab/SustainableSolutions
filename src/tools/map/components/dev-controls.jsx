/**
 * components/dev-controls.jsx
 *
 * Floating tuning panel for the map's paint parameters. Mounted by MapTool
 * only when the page is running on localhost (or the URL has `?devtools`),
 * so production users never see it. Each field updates the `tuning` state
 * in MapTool, which is forwarded to useJustAirLayers; the hook re-runs its
 * setPaintProperty pass on every change so the map repaints live.
 *
 * Values persist in localStorage so the same panel state survives reloads
 * during an iteration session.
 *
 * If a parameter needs tuning we add it here; if a parameter ends up at a
 * sensible setting, copy the value over to DEFAULT_TUNING (lib/use-just-
 * air-layers.js) and the panel will just confirm it on next reload.
 */

import { useEffect, useState } from 'react'
import { DEFAULT_TUNING } from '../lib/use-just-air-layers.js'

// v3: bumped after a session where `Radius ×` had been typed up to 17 (well
// past the slider max), persisting an effective 17× global multiplier on
// the entire radius curve. Storing under a fresh key drops those values
// on next load.
const STORAGE_KEY = 'just-air:devtuning-v3'

export function shouldShowDevControls() {
  if (typeof window === 'undefined') return false
  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const hasFlag = new URLSearchParams(window.location.search).has('devtools')
  return isLocal || hasFlag
}

export function readStoredTuning() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_TUNING, ...parsed }
  } catch {
    return null
  }
}

function persist(tuning) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning)) } catch {}
}

// The per-zoom radius stops (R3 / R4 / R6 / R9 / R12) live in code; the
// user iterates the panel until the look is right, reads the zoom off
// the readout, and tells us "at z=X the radius should be Y px" — we
// then bake the matching R-stop into DEFAULT_TUNING. The panel exposes
// just a global multiplier on the whole curve (`radiusScale`) plus the
// hard max-radius cap.
// Radius and per-zoom max are baked into RADIUS_STOPS in use-just-air-
// layers.js. The dev panel exposes a single global multiplier (radiusScale)
// and a single global cap override (maxRadiusPx, 0 = use baked curve) so
// you can still iterate without editing the source.
const FIELDS = [
  { key: 'alphaFloor',  label: 'Alpha floor',  min: 0,   max: 1,    step: 0.01,
    help: 'Below this t = |value − zero| / p99, alpha = 0. Higher = more rural cells drop out.' },
  { key: 'alphaPower',  label: 'Alpha power',  min: 0.5, max: 4,    step: 0.1,
    help: 'Exponent on the post-floor alpha ramp. Higher = steeper jump from translucent to opaque.' },
  { key: 'radiusScale', label: 'Radius ×',     min: 0.1, max: 5,    step: 0.05,
    help: 'Global multiplier on the per-zoom radius curve. 1.0 = baked iterations; 2.0 = every cell twice as big.' },
  { key: 'maxRadiusPx', label: 'Max radius (px, 0 = baked)', min: 0, max: 24, step: 0.1,
    help: '0 keeps the per-zoom cap baked into the curve. Set a positive value to globally override.' },
]

export function DevControls({ tuning, setTuning, mapInstance }) {
  const [open, setOpen] = useState(true)
  const [zoom, setZoom] = useState(() => mapInstance?.getZoom?.() ?? null)

  useEffect(() => { persist(tuning) }, [tuning])

  // Live zoom readout. Listens to MapLibre's `move` event because `zoom`
  // alone misses pan-only updates and `move` fires for every camera
  // change including continuous zoom; performance is fine because the
  // handler is a single setState of a number.
  useEffect(() => {
    if (!mapInstance) return
    const onMove = () => setZoom(mapInstance.getZoom())
    setZoom(mapInstance.getZoom())
    mapInstance.on('move', onMove)
    return () => mapInstance.off('move', onMove)
  }, [mapInstance])

  function update(key, value) {
    const next = { ...tuning, [key]: Number(value) }
    setTuning(next)
  }

  function reset() {
    setTuning({ ...DEFAULT_TUNING })
  }

  return (
    <div
      className='dev-controls'
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 50,
        background: 'rgba(248, 248, 232, 0.96)',
        color: 'var(--ink)',
        border: '1px solid var(--rule-strong)',
        borderRadius: 4,
        padding: '8px 10px',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
        minWidth: open ? 280 : undefined,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          type='button'
          onClick={() => setOpen((o) => !o)}
          style={{
            background: 'transparent',
            border: 0,
            color: 'var(--ink)',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {open ? '▾ Dev tuning' : '▸ Dev'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {zoom != null && (
            <label
              title='Current map zoom — type a value (e.g. 4.5) to jump there'
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontFamily: 'inherit', fontSize: 10, color: 'var(--ink-3)' }}>z</span>
              <input
                type='number'
                step={0.1}
                min={mapInstance?.getMinZoom?.() ?? 0}
                max={mapInstance?.getMaxZoom?.() ?? 22}
                value={Number(zoom.toFixed(2))}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!Number.isNaN(v) && mapInstance) mapInstance.jumpTo({ zoom: v })
                }}
                style={{
                  fontFamily: 'inherit',
                  fontSize: 10,
                  color: 'var(--ink)',
                  background: 'var(--paper)',
                  border: '1px solid var(--rule)',
                  padding: '2px 4px',
                  borderRadius: 2,
                  width: 56,
                }}
              />
            </label>
          )}
          {open && (
            <button
              type='button'
              onClick={reset}
              style={{
                background: 'transparent',
                border: '1px solid var(--rule)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 2,
              }}
              title='Restore DEFAULT_TUNING'
            >
              reset
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {FIELDS.map((f) => (
            <Field key={f.key} field={f} value={tuning[f.key] ?? DEFAULT_TUNING[f.key]} onChange={(v) => update(f.key, v)} />
          ))}
          <p style={{ margin: '8px 0 0', color: 'var(--ink-3)', fontSize: 10, lineHeight: 1.4 }}>
            Values persist in localStorage. When you find a setting you want
            permanent, copy it into DEFAULT_TUNING.
          </p>
        </div>
      )}
    </div>
  )
}

function Field({ field, value, onChange }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '110px 1fr 56px', alignItems: 'center', gap: 6 }} title={field.help}>
      <span style={{ color: 'var(--ink-2)' }}>{field.label}</span>
      <input
        type='range'
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
      <input
        type='number'
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          color: 'var(--ink)',
          padding: '1px 4px',
          font: 'inherit',
          width: '100%',
          borderRadius: 2,
        }}
      />
    </label>
  )
}
