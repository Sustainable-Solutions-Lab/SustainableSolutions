/**
 * components/sidebar/zip-input.jsx
 *
 * Five-digit ZIP input that fetches the per-ZIP polygon GeoJSON from R2 and
 * dispatches SET_DRAWN_POLYGON. A 404 (ZIP outside California) flashes a
 * red border. Sits below "Regional Data" in the sidebar; visible only when
 * the area tool is active.
 */

import { useEffect, useState } from 'react'
import { X, CornerDownLeft } from 'lucide-react'
import { Actions } from '../../contracts/events.js'

export function ZipInput({ baseUrl, dispatch, currentZip }) {
  const [value, setValue] = useState(currentZip ?? '')
  const [status, setStatus] = useState('idle') // idle | loading | error

  // Keep the input in sync if the polygon changes elsewhere (e.g. cleared
  // by toggling the area tool off, then back on with a circle drag).
  useEffect(() => {
    if (currentZip == null) setValue('')
  }, [currentZip])

  async function submit() {
    const z = value.trim()
    if (!/^\d{5}$/.test(z)) {
      setStatus('error')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(`${baseUrl}${z}.geojson`)
      if (!res.ok) {
        setStatus('error')
        return
      }
      const feature = await res.json()
      if (!feature?.geometry) {
        setStatus('error')
        return
      }
      dispatch({
        type: Actions.SET_DRAWN_POLYGON,
        polygon: { zip: z, geometry: feature.geometry },
      })
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  function clear() {
    setValue('')
    setStatus('idle')
    if (currentZip) dispatch({ type: Actions.SET_DRAWN_POLYGON, polygon: null })
  }

  const isError = status === 'error'
  const isLoading = status === 'loading'
  const hasActive = currentZip != null

  return (
    <div className="mt-2 mb-1">
      <label
        className="block font-mono text-xs uppercase tracking-wider text-ink-3 mb-1"
        htmlFor="firefuels-zip-input"
      >
        Or by ZIP
      </label>
      <div className="relative">
        <input
          id="firefuels-zip-input"
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, '').slice(0, 5))
            if (status === 'error') setStatus('idle')
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="94305"
          disabled={isLoading}
          className={[
            'block w-full bg-paper-2 text-ink pl-2 pr-8 py-1 font-mono text-[13px]',
            'focus:outline-none focus:border-ink',
            'border',
            isError ? 'border-[var(--negative)]' : 'border-rule',
          ].join(' ')}
          style={{ borderRadius: 'var(--radius-sm)' }}
          aria-invalid={isError}
        />
        {/* Right-edge icon: clear (X) when a ZIP is active, return-key arrow
            otherwise to cue that pressing Enter / clicking submits. */}
        {hasActive ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear ZIP and return to circle mode"
            className="absolute top-1/2 -translate-y-1/2 right-1 text-ink-3 hover:text-ink bg-transparent border-0 cursor-pointer p-1 leading-none"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={isLoading}
            aria-label="Look up ZIP"
            title="Press Return"
            className="absolute top-1/2 -translate-y-1/2 right-1 text-ink-3 hover:text-ink bg-transparent border-0 cursor-pointer p-1 leading-none disabled:opacity-50"
          >
            <CornerDownLeft size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  )
}
