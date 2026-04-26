/**
 * components/sidebar/index.jsx
 *
 * Left sidebar: project title, layer tabs, dimension controls,
 * legend, percentile filter, area tool toggle, methods link, lab logo.
 */

import { useState } from 'react'
import { Actions } from '../../contracts/events.js'
import { getActiveVariable } from '../../lib/get-active-variable.js'
import { LayerTabs } from './layer-tabs.jsx'
import { DimensionControl } from './dimension-control.jsx'
import { Legend } from './legend.jsx'
import { DistributionChart } from './distribution-chart.jsx'

export function Sidebar({ config, state, dispatch, allValues = [] }) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const activeDimensionIds = activeLayerConfig?.dimensionIds ?? []
  const visibleDimensions = config.dimensions.filter((d) =>
    activeDimensionIds.includes(d.id)
  )

  return (
    <aside
      className="relative h-full bg-paper border-r border-rule overflow-x-hidden flex flex-col shrink-0"
      style={{ width: 280, minWidth: 280 }}
    >
      {/* Header — back link only */}
      <div className="px-3 pt-3 pb-3 shrink-0">
        <a
          href="/"
          className="bare"
          style={{
            display: 'inline-block',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          ← Sustainable Solutions Lab
        </a>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 px-3 pt-1 pb-2 overflow-y-auto overflow-x-hidden">
        {/* Project title */}
        <p
          className="font-serif text-ink mb-1 m-0"
          style={{ fontSize: '22px', fontWeight: 600, lineHeight: 1.28 }}
        >
          {config.title}
        </p>

        {/* About toggle */}
        <button
          type="button"
          onClick={() => setAboutOpen((o) => !o)}
          className={[
            'block w-full text-left bg-transparent border-0 cursor-pointer p-0',
            'font-sans text-[13px] font-bold uppercase tracking-[0.12em] transition-colors',
            aboutOpen ? 'mb-2 text-ink' : 'mb-3 text-ink-3',
            'hover:text-ink',
          ].join(' ')}
        >
          About
        </button>

        {aboutOpen && (
          <div
            dangerouslySetInnerHTML={{ __html: config.description }}
            className="font-sans text-[13px] text-ink mb-3"
            style={{ lineHeight: 1.5 }}
          />
        )}

        {/* MAP section header */}
        <p className="font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink mb-2 m-0">
          Map
        </p>

        {/* Layer tabs */}
        <LayerTabs config={config} state={state} dispatch={dispatch} />

        {/* Dimension controls */}
        {visibleDimensions.map((dim) => {
          const filteredDim = {
            ...dim,
            options: dim.options?.filter(
              (opt) => !opt.visibleForLayers || opt.visibleForLayers.includes(state.activeLayer),
            ),
          }
          return (
            <DimensionControl
              key={dim.id}
              dimension={filteredDim}
              value={state.activeDimensions[dim.id] ?? dim.defaultValue}
              dispatch={dispatch}
            />
          )
        })}

        {/* Distribution chart — above colorbar */}
        {config.percentileFilter?.enabled && (
          <DistributionChart
            variable={activeVariable}
            allValues={allValues}
            percentileRange={state.percentileRange}
            dispatch={dispatch}
            isDark={state.colorScheme === 'dark'}
          />
        )}

        {/* Legend / colorbar */}
        <Legend
          variable={activeVariable}
          allValues={allValues}
          isDark={state.colorScheme === 'dark'}
        />

        {/* Regional Data toggle */}
        {config.areaTool?.enabled && (
          <button
            type="button"
            onClick={() => {
              if (state.methodsOpen) dispatch({ type: Actions.TOGGLE_METHODS })
              dispatch({ type: Actions.TOGGLE_AREA_TOOL })
            }}
            className={[
              'block w-full text-left bg-transparent border-0 cursor-pointer py-1 px-0 mb-1 mt-2',
              'font-sans text-[13px] font-bold uppercase tracking-[0.12em] transition-colors',
              state.areaToolActive ? 'text-ink' : 'text-ink-3',
              'hover:text-ink',
            ].join(' ')}
          >
            Regional Data
          </button>
        )}

        {/* Read Methods */}
        <button
          type="button"
          onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
          className="block w-full text-left bg-transparent border-0 cursor-pointer py-1 px-0 mt-1 font-sans text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3 hover:text-ink transition-colors"
        >
          Read Methods
        </button>
      </div>

      {/* Footer — SDSS wordmark, pinned to the bottom */}
      <div className="shrink-0 px-3 py-3 border-t border-rule">
        <a href="/" className="bare" style={{ lineHeight: 0, display: 'inline-block' }}>
          <img
            src={state.colorScheme === 'dark' ? '/SDSS_brand_white.png' : '/SDSS_brand.png'}
            alt="Stanford Doerr School of Sustainability"
            style={{ width: '100%', maxWidth: 200, height: 'auto', objectFit: 'contain' }}
          />
        </a>
      </div>
    </aside>
  )
}
