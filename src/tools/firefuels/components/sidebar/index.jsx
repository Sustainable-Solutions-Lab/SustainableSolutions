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
import { ZipInput } from './zip-input.jsx'

export function Sidebar({ config, state, dispatch, allValues = [], companion = null }) {
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
      {/* Header — eyebrow + project title (matches the lab's page-title pattern) */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        {config.eyebrow && (
          <p
            className="m-0"
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {config.eyebrow}
          </p>
        )}
        <p
          className="font-serif text-ink mt-1 mb-0"
          style={{ fontSize: '32px', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em' }}
        >
          {config.title}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 px-3 pt-0 pb-3 overflow-y-auto overflow-x-hidden">
        {config.summary && (
          <p
            className="text-ink-2 m-0 mb-4"
            style={{ fontSize: '13px', lineHeight: 1.45 }}
          >
            {config.summary}
          </p>
        )}

        {companion && (
          <div className="mb-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 m-0 mb-1">
              Companion paper
            </p>
            {companion.url ? (
              <a
                href={companion.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0"
                style={{ fontSize: '13px', lineHeight: 1.4, display: 'block' }}
              >
                <em className="not-italic">{companion.journal}</em> · {companion.year}
              </a>
            ) : (
              <span
                className="text-ink-2"
                style={{ fontSize: '13px', lineHeight: 1.4, display: 'block' }}
              >
                <em className="not-italic">{companion.journal}</em> · {companion.year}
              </span>
            )}
          </div>
        )}

        {/* MAP section header — matches publications-page filter labels */}
        <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
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

        {/* Regional Data + Read Methods — styled like the people-page filter
            chips: small uppercase sans, ink-3 inactive, ink + bold + underline
            when active. */}
        {config.areaTool?.enabled && (
          <button
            type="button"
            onClick={() => {
              if (state.methodsOpen) dispatch({ type: Actions.TOGGLE_METHODS })
              dispatch({ type: Actions.TOGGLE_AREA_TOOL })
            }}
            className={[
              'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-2 mb-1',
              'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
              'transition-colors hover:text-ink',
              state.areaToolActive
                ? 'font-bold text-ink underline'
                : 'font-normal text-ink-3',
            ].join(' ')}
          >
            Region Focus
          </button>
        )}

        {state.areaToolActive && config.areaTool?.zipsBaseUrl && (
          <ZipInput
            baseUrl={config.areaTool.zipsBaseUrl}
            dispatch={dispatch}
            currentZip={state.drawnPolygon?.zip ?? null}
          />
        )}

        <button
          type="button"
          onClick={() => dispatch({ type: Actions.TOGGLE_METHODS })}
          className={[
            'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-4',
            'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
            'transition-colors hover:text-ink',
            state.methodsOpen
              ? 'font-bold text-ink underline'
              : 'font-normal text-ink-3',
          ].join(' ')}
        >
          Read Methods
        </button>
      </div>

      {/* Lab wordmark — pinned at the bottom of the sidebar (outside the
          scrollable content) so it stays visible at the bottom of the
          screen regardless of scroll position. */}
      <a href="/" className="bare block shrink-0 px-3 py-4 border-t border-rule" style={{ lineHeight: 0 }}>
        <img
          src={state.colorScheme === 'dark' ? '/logo-sdss-light.png' : '/logo-sdss-dark.png'}
          alt="Sustainable Solutions Lab"
          style={{ width: '100%', maxWidth: 220, height: 'auto', objectFit: 'contain' }}
        />
      </a>
    </aside>
  )
}
