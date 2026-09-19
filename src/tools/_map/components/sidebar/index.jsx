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
import { DimensionControl, SourceCategoryControls } from './dimension-control.jsx'
import { Legend } from './legend.jsx'
import { DistributionChart } from './distribution-chart.jsx'
import { ZipInput } from './zip-input.jsx'
import { PolygonUpload } from './polygon-upload.jsx'
import { categoricalLegend } from '../../lib/analysis-categorical.js'

export function Sidebar({ config, state, dispatch, allValues = [], companion = null, repoLinks = null, paleActive = false, setPaleActive = null, paleDriver = 'r_net', setPaleDriver = null, analysisEntries = [] }) {
  const [masksOpen, setMasksOpen] = useState(false)
  const activeVariable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  const activeLayerConfig = config.layers.find((l) => l.id === state.activeLayer)
  const activeDimensionIds = activeLayerConfig?.dimensionIds ?? []
  const visibleDimensions = config.dimensions.filter(
    (d) => activeDimensionIds.includes(d.id) && d.location !== 'map'
  )
  const multiLayer = config.layers.filter((l) => !l.hidden).length > 1
  const isDominance = state.analysis === 'dominance'
  const isPale = state.analysis === 'pale'
  // Main map select: what the map depicts. 'emissions' is the quantitative
  // map (with its LSRS/source/commodity refinements); the dominance ids and
  // 'pale' (Drivers) are the analysis views.
  const mainView = isPale ? 'pale' : isDominance ? (state.analysisDriver ?? 'dom_source') : 'emissions'
  const isEmissions = mainView === 'emissions'
  const setMainView = (v) => {
    if (v === mainView) return
    if (v === 'pale') { setPaleActive?.(true); return }
    if (v === 'emissions') { dispatch({ type: Actions.SET_ANALYSIS, analysis: null }); return }
    // Dominance views reset source/commodity to All: a 'top commodities'
    // map of one commodity is not a meaningful object.
    for (const d of visibleDimensions) {
      dispatch({ type: Actions.SET_DIMENSION, dimensionId: d.id, value: d.defaultValue })
    }
    dispatch({ type: Actions.SET_PERCENTILE, low: 0, high: 100 })
    dispatch({ type: Actions.SET_ANALYSIS_DRIVER, driver: v })
    dispatch({ type: Actions.SET_ANALYSIS, analysis: 'dominance' })
  }

  return (
    <aside
      className="relative h-full bg-paper border-r border-rule overflow-x-hidden flex flex-col shrink-0"
      style={{ width: 280, minWidth: 280 }}
    >
      {/* Header — eyebrow + project title (matches the lab's page-title pattern) */}
      <div className="px-3 pt-3 pb-0.5 shrink-0">
        {config.eyebrow && (
          <p
            style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              margin: 0,
            }}
          >
            {config.eyebrow}
          </p>
        )}
        <p
          className="font-serif text-ink"
          style={{ fontSize: '26px', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '2px 0 0' }}
        >
          {config.title}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 px-3 pt-0 pb-3 overflow-y-auto overflow-x-hidden">
        {config.summary && (
          <p
            className="text-ink-2"
            style={{ fontSize: '13px', lineHeight: 1.45, margin: '0 0 12px' }}
          >
            {config.summary}
          </p>
        )}

        {companion && (
          <div className="mb-2.5">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 leading-none" style={{ margin: '0 0 3px' }}>
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
                {companion.lead ? `${companion.lead} · ` : ''}<em className="not-italic">{companion.journal}</em> · {companion.year}
              </a>
            ) : (
              <span
                className="text-ink-2"
                style={{ fontSize: '13px', lineHeight: 1.4, display: 'block' }}
              >
                {companion.lead ? `${companion.lead} · ` : ''}<em className="not-italic">{companion.journal}</em> · {companion.year}
              </span>
            )}
          </div>
        )}

        {/* MAP VIEW — gridded cells vs regional (admin-1 × biome) averages.
            First control: it sets the geometry every other choice paints. */}
        {config.regionalView && (
          <div className="mb-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 leading-none" style={{ margin: '0 0 3px' }}>
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
                selection below. Click a unit for its statistics.
              </p>
            )}
          </div>
        )}

        {/* MAP — what the map depicts. Multi-layer projects use the layer
            select; single-layer projects with analysis views get a select
            over emissions / dominance maps / drivers. */}
        {multiLayer && (
          <>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 leading-none" style={{ margin: '0 0 3px' }}>
              Map
            </p>
            <LayerTabs config={config} state={state} dispatch={dispatch} />
          </>
        )}
        {(config.paleMap?.categorical ?? []).length > 0 && (
          <div className="mb-4">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-3 leading-none" style={{ margin: '0 0 3px' }}>
              Map
            </p>
            <select
              value={mainView}
              onChange={(e) => setMainView(e.target.value)}
              className="w-full bg-paper-2 text-ink border border-rule px-2 py-1 font-sans text-[13px] cursor-pointer focus:outline-none focus:border-ink"
              style={{ borderRadius: 'var(--radius-sm)' }}
            >
              <option value="emissions">Emissions</option>
              {config.paleMap.categorical.map((c) => (
                <option key={c.id} value={c.id}>{c.shortLabel ?? c.label}</option>
              ))}
              {(config.paleMap.drivers ?? []).length > 0 && setPaleActive && (
                <option value="pale">Drivers of change</option>
              )}
            </select>
          </div>
        )}

        {/* LSRS source-category + specific-source selects — Emissions view
            only (see SourceCategoryControls for the accounting terms). */}
        {config.lsrsCategories && isEmissions && (
          <SourceCategoryControls config={config} state={state} dispatch={dispatch} />
        )}

        {/* Dimension controls — Emissions view only; 'source' is rendered
            by the paired category/specific selects above when the project
            defines LSRS categories. */}
        {isEmissions && visibleDimensions
          .filter((dim) => !(config.lsrsCategories && dim.id === 'source'))
          .map((dim) => {
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

        {/* Enhanced-mask toggles: SPAM default, finer datasets opt-in.
            Gridded view only - unit tiles carry no overrides. */}
        {config.enhancedMasks?.length > 0 && (isEmissions || isDominance) && (
          <div className="mb-4">
            <div className="flex items-center" style={{ gap: 14, margin: '0 0 3px' }}>
              <button
                type="button"
                onClick={() => setMasksOpen((v) => !v)}
                aria-expanded={masksOpen}
                className="bg-transparent border-0 p-0 cursor-pointer font-mono text-xs uppercase tracking-wider text-ink-3 leading-none hover:text-ink inline-flex items-center"
                style={{ gap: 5 }}
              >
                <span style={{ fontSize: 8, transform: masksOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                Improved crop maps
                {!masksOpen && (state.activeDimensions?.masks ?? '') !== '' && (
                  <span className="text-ink-2 normal-case tracking-normal">
                    ({(state.activeDimensions.masks).split(',').filter(Boolean).length} on)
                  </span>
                )}
              </button>
              {(() => {
                const allSfx = config.enhancedMasks.map((m) => m.suffix)
                const cur = (state.activeDimensions?.masks ?? '').split(',').filter(Boolean)
                const allOn = allSfx.every((x) => cur.includes(x))
                const regional = state.mapView === 'regional'
                return (
                  <label className={['inline-flex items-center gap-1 font-sans text-[11px]',
                    regional ? 'text-ink-4 cursor-not-allowed' : 'text-ink-2 cursor-pointer'].join(' ')}>
                    <input
                      type="checkbox"
                      checked={allOn}
                      disabled={regional}
                      onChange={() => dispatch({ type: Actions.SET_DIMENSION, dimensionId: 'masks', value: allOn ? '' : allSfx.join(',') })}
                      className="accent-cardinal"
                    />
                    All
                  </label>
                )
              })()}
            </div>
            {masksOpen && (
            <p className="font-sans text-ink-3" style={{ fontSize: 10, lineHeight: 1.4, margin: '0 0 4px' }}>
              Puts these crops where satellites see them, replacing
              statistical downscaling. Totals unchanged.
            </p>
            )}
            {masksOpen && config.enhancedMasks.map((m) => {
              const cur = (state.activeDimensions?.masks ?? '').split(',').filter(Boolean)
              const on = cur.includes(m.suffix)
              const regional = state.mapView === 'regional'
              const next = on ? cur.filter((x) => x !== m.suffix) : [...cur, m.suffix]
              return (
                <label key={m.id} title={regional ? 'Enhanced masks apply to the gridded view' : m.note}
                  className={['flex items-start gap-2 font-sans text-[11px]',
                    regional ? 'text-ink-4 cursor-not-allowed' : 'text-ink-2 cursor-pointer'].join(' ')}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={regional}
                    onChange={() => dispatch({ type: Actions.SET_DIMENSION, dimensionId: 'masks', value: next.join(',') })}
                    className="accent-cardinal"
                    style={{ marginTop: 1 }}
                  />
                  <span>{m.label}{regional ? ' (gridded only)' : ''}</span>
                </label>
              )
            })}

          </div>
        )}

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
            <p className="font-sans text-ink-3 m-0" style={{ fontSize: 10, lineHeight: 1.4, marginTop: 10 }}>
              {(state.activeDimensions?.compare ?? 'off') === 'on'
                ? `Where the leader changed between ${state.activeDimensions?.yearB ?? 2000} and ${state.activeDimensions?.year ?? 2024}: color is the new leader, shade its emissions. Unchanged ${state.mapView === 'regional' ? 'units' : 'cells'} are blank.`
                : <>Largest contributor in each {state.mapView === 'regional' ? 'unit' : 'cell'};
                  shade shows how much it emits. Click for the full breakdown.</>}
            </p>
          </div>
        ) : isPale ? (
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
              {' '}Draw/select a region to explore the drivers of changes in
              emissions.
            </p>
          </div>
        ) : isEmissions && config.percentileFilter?.enabled && activeVariable && activeVariable.type !== 'categorical' && allValues.length > 0 ? (
          <DistributionChart
            variable={activeVariable}
            allValues={allValues}
            percentileRange={state.percentileRange}
            dispatch={dispatch}
            isDark={state.colorScheme === 'dark'}
          />
        ) : isEmissions ? (
          <Legend
            variable={activeVariable}
            allValues={allValues}
            isDark={state.colorScheme === 'dark'}
          />
        ) : null}

        {/* Variable caveat note (e.g. soil carbon asymmetry) */}
        {isEmissions && activeVariable?.note && (
          <p className="font-sans text-ink-3 m-0 mb-2" style={{ fontSize: 10, lineHeight: 1.4 }}>
            {activeVariable.note}
          </p>
        )}

        {/* Soil carbon — Tier 2 dSOC view (config.paleMap.soilCarbon) */}
        {config.paleMap?.soilCarbon && !isDominance && (
          <>
            <button
              type="button"
              onClick={() => dispatch({ type: Actions.SET_ANALYSIS,
                analysis: state.analysis === 'soc' ? null : 'soc' })}
              className={[
                'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-2 mb-1',
                'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
                'transition-colors hover:text-ink',
                state.analysis === 'soc' ? 'font-bold text-ink underline' : 'font-normal text-ink-3',
              ].join(' ')}
            >
              Soil Carbon
            </button>
            {state.analysis === 'soc' && (
              <div className="mb-2">
                <div style={{
                  height: 8, borderRadius: 2, marginTop: 4,
                  background: 'linear-gradient(to right, rgba(50,136,189,0.95), rgba(102,194,165,0.6), rgba(128,128,128,0.15), rgba(253,174,97,0.6), rgba(213,62,79,0.95))',
                }} />
                <div className="flex justify-between font-mono text-ink-3" style={{ fontSize: 9 }}>
                  <span>gain (sink)</span><span>0</span><span>loss (source)</span>
                </div>
                <p className="font-sans text-ink-3 m-0 mt-1" style={{ fontSize: 10, lineHeight: 1.4 }}>
                  Mean annual change in mineral-soil carbon on stable
                  cropland, 2000–2023 (IPCC Tier 2 model driven by our
                  residue, manure, tillage, and CRU climate data). Blue is
                  carbon accumulating in soil; red is soil carbon lost.
                  Separate from the emissions total above.
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
            disabled={state.mapView === 'regional'}
            title={state.mapView === 'regional'
              ? 'Region Focus draws a circle on the gridded view — in Regional view, click a unit for its statistics instead'
              : undefined}
            onClick={() => {
              if (state.methodsOpen) dispatch({ type: Actions.TOGGLE_METHODS })
              dispatch({ type: Actions.TOGGLE_AREA_TOOL })
            }}
            className={[
              'block w-full text-left bg-transparent border-0 p-0 mt-2 mb-1',
              'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
              state.mapView === 'regional'
                ? 'text-ink-4 cursor-not-allowed'
                : state.areaToolActive
                  ? 'font-bold text-ink underline cursor-pointer transition-colors hover:text-ink'
                  : 'font-normal text-ink-3 cursor-pointer transition-colors hover:text-ink',
            ].join(' ')}
          >
            Region Focus
          </button>
        )}

        {config.areaTool?.enabled && (
          <PolygonUpload state={state} dispatch={dispatch} />
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

        {/* Repo links — bottom of the panel, matching the magnets explorer's
            footer pattern (octicon + mono repo name). Standard placement for
            all map tools. */}
        {repoLinks && (repoLinks.github || repoLinks.zenodo) && (
          <div className="mt-6 pt-4 border-t border-rule flex flex-col gap-2">
            {repoLinks.github && (
              <a
                href={repoLinks.github}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0 inline-flex items-center"
                style={{ gap: 6, fontSize: 12 }}
              >
                <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span>Model code on GitHub <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.github.split('/').filter(Boolean).pop()} ↗</span></span>
              </a>
            )}
            {repoLinks.zenodo && (
              <a
                href={repoLinks.zenodo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-2 hover:text-ink border-b-0 inline-flex items-center"
                style={{ gap: 6, fontSize: 12 }}
              >
                <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                  <path d="M3 12a9 3 0 0 0 18 0" />
                </svg>
                <span>Data archive on Zenodo <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.zenodo.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')} ↗</span></span>
              </a>
            )}
          </div>
        )}
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
