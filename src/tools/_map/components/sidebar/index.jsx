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
import { categoricalLegend } from '../../lib/analysis-categorical.js'

export function Sidebar({ config, state, dispatch, allValues = [], companion = null, repoLinks = null, paleActive = false, setPaleActive = null, paleDriver = 'r_net', setPaleDriver = null, analysisEntries = [] }) {
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const activeDimensionIds = activeLayerConfig?.dimensionIds ?? []
  const visibleDimensions = config.dimensions.filter(
    (d) => activeDimensionIds.includes(d.id) && d.location !== 'map'
  )
  const multiLayer = config.layers.filter((l) => !l.hidden).length > 1
  const isDominance = state.analysis === 'dominance'

  return (
    <aside
      className="relative h-full bg-paper border-r border-rule overflow-x-hidden flex flex-col shrink-0"
      style={{ width: 280, minWidth: 280 }}
    >
      {/* Header — eyebrow + project title (matches the lab's page-title pattern) */}
      <div className="px-3 pt-3 pb-1.5 shrink-0">
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
          <div className="mb-2.5">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 m-0 mb-0.5">
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

        {repoLinks && (repoLinks.github || repoLinks.zenodo || repoLinks.website) && (
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wider">
            {repoLinks.website && (
              <a
                href={repoLinks.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0"
              >
                Website ↗
              </a>
            )}
            {repoLinks.github && (
              <a
                href={repoLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0"
              >
                GitHub ↗
              </a>
            )}
            {repoLinks.zenodo && (
              <a
                href={repoLinks.zenodo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0"
              >
                Zenodo ↗
              </a>
            )}
          </div>
        )}

        {/* MAP section header — matches publications-page filter labels.
            Single-layer projects skip the layer select entirely. */}
        {multiLayer && (
          <>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
              Map
            </p>
            <LayerTabs config={config} state={state} dispatch={dispatch} />
          </>
        )}

        {/* Primary view — the emissions map (with its source/commodity
            refinements, percentiles, and analysis) or one of the dominance
            maps. A dominance view resets source/commodity to All: a 'top
            commodities' map of one commodity is not a meaningful object. */}
        {(config.paleMap?.categorical ?? []).length > 0 && (
          <div className="mb-3">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
              View
            </p>
            <div className="flex gap-4 flex-wrap">
              {[{ id: null, label: 'Emissions' }, ...config.paleMap.categorical.map((c) => ({ id: c.id, label: c.shortLabel ?? c.label }))].map((v) => {
                const on = v.id ? (isDominance && state.analysisDriver === v.id) : !isDominance
                return (
                  <button
                    key={v.id ?? 'emissions'}
                    type="button"
                    onClick={() => {
                      if (on) return
                      if (!v.id) { dispatch({ type: Actions.SET_ANALYSIS, analysis: null }); return }
                      for (const d of visibleDimensions) {
                        dispatch({ type: Actions.SET_DIMENSION, dimensionId: d.id, value: d.defaultValue })
                      }
                      dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
                      dispatch({ type: Actions.SET_ANALYSIS_DRIVER, driver: v.id })
                      dispatch({ type: Actions.SET_ANALYSIS, analysis: 'dominance' })
                    }}
                    className={[
                      'bg-transparent border-0 cursor-pointer p-0',
                      'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
                      'transition-colors hover:text-ink',
                      on ? 'font-bold text-ink underline' : 'font-normal text-ink-3',
                    ].join(' ')}
                  >
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Dimension controls — Emissions view only */}
        {!isDominance && visibleDimensions.map((dim) => {
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
              animatingDimension={state.animatingDimension}
            />
          )
        })}

        {/* Distribution chart serves as the colorbar (Firefuels-style). The
            standalone gradient legend below it is only rendered when the
            distribution chart is suppressed — i.e. for categorical variables
            or projects that turn the percentile filter off — so the user
            isn't presented with both. */}
        {isDominance && analysisEntries.length > 0 ? (
          <div className="mb-2">
            <div className="flex flex-wrap" style={{ gap: '2px 10px' }}>
              {categoricalLegend(analysisEntries).map((e) => (
                <span key={e.color} className="font-mono text-ink-2 inline-flex items-center"
                  style={{ fontSize: 9, gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: e.color,
                    display: 'inline-block', flexShrink: 0 }} />
                  {e.label}
                </span>
              ))}
            </div>
            <p className="font-sans text-ink-3 m-0 mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
              Largest contributor in each {state.mapView === 'regional' ? 'unit' : 'cell'};
              shade shows how much it emits. Click for the full breakdown.
            </p>
          </div>
        ) : config.percentileFilter?.enabled && activeVariable && activeVariable.type !== 'categorical' && allValues.length > 0 ? (
          <DistributionChart
            variable={activeVariable}
            allValues={allValues}
            percentileRange={state.percentileRange}
            dispatch={dispatch}
            isDark={state.colorScheme === 'dark'}
          />
        ) : (
          <Legend
            variable={activeVariable}
            allValues={allValues}
            isDark={state.colorScheme === 'dark'}
          />
        )}

        {/* MAP VIEW — gridded cells vs regional (admin-1 x biome) averages */}
        {config.regionalView && (
          <div className="mt-2 mb-2">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 mb-1 m-0">
              Map view
            </p>
            <div className="flex gap-4">
              {[['gridded', 'Gridded'], ['regional', 'Regional']].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => dispatch({ type: Actions.SET_MAP_VIEW, view: v })}
                  className={[
                    'bg-transparent border-0 cursor-pointer p-0',
                    'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
                    'transition-colors hover:text-ink',
                    (state.mapView ?? 'gridded') === v
                      ? 'font-bold text-ink underline'
                      : 'font-normal text-ink-3',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            {state.mapView === 'regional' && (
              <p className="font-sans text-ink-3 m-0 mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
                Units are admin-1 × biome; color is per-km² intensity of the
                selection above. Click a unit for its statistics.
              </p>
            )}
          </div>
        )}

        {/* ANALYSIS — regional decompositions (PALE); population and
            production factors only exist for regions. */}
        {config.paleMap && setPaleActive && !isDominance && (
          <>
            <button
              type="button"
              onClick={() => setPaleActive(!paleActive)}
              className={[
                'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-2 mb-1',
                'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
                'transition-colors hover:text-ink',
                paleActive ? 'font-bold text-ink underline' : 'font-normal text-ink-3',
              ].join(' ')}
            >
              Analysis
            </button>
            {paleActive && (
              <div className="mb-2">
                <div style={{
                  height: 8, borderRadius: 2, marginTop: 4,
                  background: 'linear-gradient(to right, rgba(50,136,189,0.9), rgba(102,194,165,0.6), rgba(128,128,128,0.15), rgba(253,174,97,0.6), rgba(213,62,79,0.9))',
                }} />
                <div className="flex justify-between font-mono text-ink-3" style={{ fontSize: 9 }}>
                  <span>−50%</span><span>0</span><span>+50%</span>
                </div>
                <p className="font-sans text-ink-3 m-0 mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
                  Change in emissions 2000–2023, as a share of each
                  {state.mapView === 'regional' ? ' unit' : ' cell'}'s 2000 total.
                  {state.mapView === 'regional'
                    ? ' Click a unit for the drivers behind it.'
                    : ' Draw a region below for the drivers behind it.'}
                </p>
              </div>
            )}
          </>
        )}

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
          src={state.colorScheme === 'dark' ? '/logos/sdss/logo-sdss-light.png' : '/logos/sdss/logo-sdss-dark.png'}
          alt="Sustainable Solutions Lab"
          style={{ width: '100%', maxWidth: 220, height: 'auto', objectFit: 'contain' }}
        />
      </a>
    </aside>
  )
}
