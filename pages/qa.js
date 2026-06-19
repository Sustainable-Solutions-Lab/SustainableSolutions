/**
 * pages/qa.js
 *
 * Visual QA page — navigate to /qa in the dev server.
 * Shows all components in isolation with mock data so each agent's work
 * can be evaluated independently before full integration.
 *
 * Organized in sections, one per agent. Each section has a status badge.
 */

import { useState } from 'react'
import Head from 'next/head'
import { buildColorScale, buildLegendStops } from '../lib/colormap.js'
import { formatValue, formatCoord } from '../lib/format.js'
import { getActiveVariable } from '../lib/get-active-variable.js'
import config from '../projects/fuel-treatment/config.js'
import { initialState, Actions } from '../contracts/events.js'

// ─── Mock data ───────────────────────────────────────────────────────────────

const MOCK_CELL = {
  lat: 38.52,
  lng: -120.48,
  values: {
    cost_rx_burn: 87000,
    cost_mechanical: 165000,
    cost_hand: 238000,
    min_cost: 87000,
    cheapest: 'rx_burn',
    fire_prob: 0.61,
    veg_density: 0.74,
    slope: 22.3,
    elevation: 980,
    wui_dist: 12.4,
    prop_benefit_current: 196000,
    health_benefit_current: 103000,
    total_benefit_current: 299000,
    net_rx_current: 212000,
    net_mech_current: 134000,
    net_hand_current: 61000,
    bcr_rx_current: 3.44,
  },
}

const MOCK_STATE = {
  ...initialState,
  activeLayer: 'net_benefits',
  activeDimensions: {
    treatment: 'rx_burn',
    climate: 'current',
    benefit_component: 'total',
    input_var: 'fire_prob',
  },
  selectedCell: MOCK_CELL,
}

// ─── Inline styles (no Theme UI dependency — QA page works standalone) ───────

const S = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    background: '#1a1a1a',
    color: '#f0ede8',
    minHeight: '100vh',
    padding: '24px',
  },
  h1: { fontSize: 22, fontWeight: 600, marginBottom: 4 },
  h2: { fontSize: 16, fontWeight: 600, marginTop: 32, marginBottom: 12,
        borderBottom: '1px solid #333', paddingBottom: 6 },
  h3: { fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' },
  section: { marginBottom: 40 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  card: { background: '#242424', border: '1px solid #333', borderRadius: 6, padding: 14 },
  badge: (color) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px',
    borderRadius: 999, background: color, color: '#fff', marginLeft: 8, verticalAlign: 'middle',
  }),
  mono: { fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  row: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #2a2a2a' },
  gradientBar: (stops) => {
    const css = stops.map(s => s.color).join(', ')
    return { height: 16, borderRadius: 3, background: `linear-gradient(to right, ${css})` }
  },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = { done: '#5B8A4E', stub: '#E55C2F', 'in progress': '#d4a017' }
  return <span style={S.badge(colors[status] || '#555')}>{status}</span>
}

function VariableLegendCard({ variable }) {
  if (!variable || variable.type === 'categorical') {
    if (variable?.type === 'categorical') {
      return (
        <div style={S.card}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{variable.label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {variable.categories.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: c.color }} />
                <span style={{ fontSize: 11 }}>{c.label}</span>
              </div>
            ))}
          </div>
          <div style={{ ...S.mono, color: '#666', marginTop: 4 }}>categorical</div>
        </div>
      )
    }
    return null
  }

  const stops = buildLegendStops(variable, 30)
  const { min, max, zero } = variable.domain

  return (
    <div style={S.card}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        {variable.label}
        {variable.unit ? <span style={{ color: '#888', marginLeft: 4 }}>({variable.unit})</span> : null}
      </div>
      <div style={S.gradientBar(stops)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ ...S.mono, color: '#aaa' }}>{formatValue(min, variable.unit)}</span>
        {variable.diverging && zero !== undefined
          ? <span style={{ ...S.mono, color: '#aaa' }}>{formatValue(zero, variable.unit)}</span>
          : null}
        <span style={{ ...S.mono, color: '#aaa' }}>{formatValue(max, variable.unit)}</span>
      </div>
      <div style={{ ...S.mono, color: '#555', marginTop: 2, fontSize: 10 }}>
        {variable.colormap}{variable.diverging ? ' · diverging' : ''}
      </div>
    </div>
  )
}

function MockDetailPanel({ cell, config }) {
  if (!cell) return <div style={{ color: '#666' }}>No cell selected (cell is null)</div>

  return (
    <div style={{ ...S.card, maxWidth: 300 }}>
      <div style={{ ...S.mono, color: '#888', marginBottom: 8 }}>
        {formatCoord(cell.lat, cell.lng)}
      </div>
      {config.variables.filter(v => v.type !== 'categorical').slice(0, 8).map(v => (
        <div key={v.id} style={S.row}>
          <span style={{ fontSize: 12, color: '#aaa' }}>{v.label}</span>
          <span style={S.mono}>
            {cell.values[v.id] != null
              ? formatValue(cell.values[v.id], v.unit)
              : <span style={{ color: '#555' }}>—</span>}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 10, color: '#555', marginTop: 8 }}>
        (Agent F will render BenefitCostChart here)
      </div>
    </div>
  )
}

function ActiveVariableDemo({ config, state }) {
  const variable = getActiveVariable(config, state.activeLayer, state.activeDimensions)
  return (
    <div style={S.card}>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Layer: <strong>{state.activeLayer}</strong> · Treatment: <strong>{state.activeDimensions.treatment}</strong> · Climate: <strong>{state.activeDimensions.climate}</strong>
      </div>
      {variable
        ? <div style={{ color: '#5B8A4E' }}>✓ Resolved → <strong>{variable.id}</strong></div>
        : <div style={{ color: '#E55C2F' }}>✗ No variable found for this combination</div>}
      <div style={{ marginTop: 12 }}>
        {variable && <VariableLegendCard variable={variable} />}
      </div>
    </div>
  )
}

function FormatDemo() {
  const examples = [
    { value: 220000, unit: '$/km²' },
    { value: -85000, unit: '$/km²' },
    { value: 3.44,   unit: '' },
    { value: 0.0012, unit: '' },
    { value: 1500000, unit: '$/km²' },
  ]
  return (
    <div style={S.card}>
      {examples.map(({ value, unit }, i) => (
        <div key={i} style={S.row}>
          <span style={{ ...S.mono, color: '#888' }}>{value}</span>
          <span style={S.mono}>{formatValue(value, unit)}</span>
        </div>
      ))}
      <div style={{ ...S.row, marginTop: 8 }}>
        <span style={{ ...S.mono, color: '#888' }}>38.52, -120.48</span>
        <span style={S.mono}>{formatCoord(38.52, -120.48)}</span>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QAPage() {
  const [activeLayer, setActiveLayer] = useState('net_benefits')
  const [dims, setDims] = useState(MOCK_STATE.activeDimensions)

  const state = { ...MOCK_STATE, activeLayer, activeDimensions: dims }

  return (
    <>
      <Head><title>QA — Firemap</title></Head>
      <div style={S.page}>
        <div style={S.h1}>
          Firemap QA
          <span style={{ fontSize: 13, color: '#888', marginLeft: 12 }}>
            /qa — visual component inspection
          </span>
        </div>
        <p style={{ color: '#888', marginBottom: 0, fontSize: 13 }}>
          Each section corresponds to an agent. Status badges show implementation progress.
          See <code>qa/README.md</code> for what to check in each section.
        </p>

        {/* ── Agent B: Theme ───────────────────────────────────────────── */}
        <h2 style={S.h2}>Agent B — Theme <StatusBadge status="done" /></h2>
        <div style={S.grid}>
          {['background','text','primary','secondary','muted','border','surface'].map(k => (
            <div key={k} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 4, background: `var(--theme-ui-colors-${k}, #888)`, border: '1px solid #333' }} />
              <div>
                <div style={{ fontSize: 12 }}>{k}</div>
                <div style={{ ...S.mono, color: '#666', fontSize: 10 }}>--theme-ui-colors-{k}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Agent A: Config ──────────────────────────────────────────── */}
        <h2 style={S.h2}>Agent A — Config <StatusBadge status="done" /></h2>
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.h3}>Project</h3>
            <div style={S.row}><span>ID</span><span style={S.mono}>{config.id}</span></div>
            <div style={S.row}><span>Layers</span><span style={S.mono}>{config.layers.length}</span></div>
            <div style={S.row}><span>Variables</span><span style={S.mono}>{config.variables.length}</span></div>
            <div style={S.row}><span>Dimensions</span><span style={S.mono}>{config.dimensions.length}</span></div>
          </div>
          <div style={S.card}>
            <h3 style={S.h3}>Layers</h3>
            {config.layers.map(l => (
              <div key={l.id} style={S.row}>
                <span style={{ fontSize: 12 }}>{l.label}</span>
                <span style={{ ...S.mono, color: '#888' }}>{l.dimensionIds.join(', ')}</span>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <h3 style={S.h3}>Variable Count by Layer</h3>
            {config.layers.map(l => {
              const count = config.variables.filter(v => v.layer === l.id).length
              return (
                <div key={l.id} style={S.row}>
                  <span style={{ fontSize: 12 }}>{l.label}</span>
                  <span style={S.mono}>{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Agent C: Utilities ───────────────────────────────────────── */}
        <h2 style={S.h2}>Agent C — Utilities (lib/) <StatusBadge status="done" /></h2>

        <h3 style={S.h3}>get-active-variable — resolves (layer, dimensions) → variable</h3>
        <ActiveVariableDemo config={config} state={state} />

        <h3 style={{ ...S.h3, marginTop: 16 }}>format.js — value formatting</h3>
        <FormatDemo />

        <h3 style={{ ...S.h3, marginTop: 16 }}>colormap.js — color scales (one per variable)</h3>
        <div style={S.grid}>
          {config.variables.map(v => <VariableLegendCard key={v.id} variable={v} />)}
        </div>

        {/* ── Agent D: Map ─────────────────────────────────────────────── */}
        <h2 style={S.h2}>Agent D — Map <StatusBadge status="stub" /></h2>
        <div style={{ ...S.card, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          Map component placeholder — Agent D will replace this with MapLibre GL
        </div>

        {/* ── Agent E: Sidebar ─────────────────────────────────────────── */}
        <h2 style={S.h2}>Agent E — Sidebar <StatusBadge status="stub" /></h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={S.card}>
            <h3 style={S.h3}>Layer Tabs</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {config.layers.map(l => (
                <button
                  key={l.id}
                  onClick={() => setActiveLayer(l.id)}
                  style={{
                    padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
                    border: '1px solid', background: 'transparent',
                    borderColor: activeLayer === l.id ? '#E55C2F' : '#444',
                    color: activeLayer === l.id ? '#f0ede8' : '#888',
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <h3 style={S.h3}>Dimension: treatment</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {config.dimensions.find(d => d.id === 'treatment').options.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setDims(d => ({ ...d, treatment: o.id }))}
                    style={{
                      padding: '3px 8px', borderRadius: 999, cursor: 'pointer', fontSize: 11,
                      border: '1px solid', background: 'transparent',
                      borderColor: dims.treatment === o.id ? '#5B8A4E' : '#444',
                      color: dims.treatment === o.id ? '#f0ede8' : '#888',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...S.mono, color: '#555', marginTop: 12, fontSize: 10 }}>
              Agent E will render the full sidebar with percentile filter
            </div>
          </div>
          <div style={{ ...S.card, maxWidth: 320 }}>
            <h3 style={S.h3}>Percentile Filter (stub)</h3>
            <div style={{ color: '#666', fontSize: 12 }}>
              [ ●————————————————● ]<br />
              Bottom 0% — Top 100%<br />
              <span style={{ fontSize: 10, color: '#555', marginTop: 4, display: 'block' }}>
                Agent E: dual-handle range slider here.<br />
                Shows mean/median of filtered features.
              </span>
            </div>
          </div>
        </div>

        {/* ── Agent F: Detail Panel ─────────────────────────────────────── */}
        <h2 style={S.h2}>Agent F — Detail Panel <StatusBadge status="stub" /></h2>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Rendered with mock cell at {formatCoord(MOCK_CELL.lat, MOCK_CELL.lng)}
        </p>
        <MockDetailPanel cell={MOCK_CELL} config={config} />

        {/* ── Agent H: Data Pipeline ────────────────────────────────────── */}
        <h2 style={S.h2}>Agent H — Data Pipeline <StatusBadge status="done" /></h2>
        <div style={S.grid}>
          <div style={S.card}>
            <h3 style={S.h3}>Run to generate synthetic data</h3>
            <pre style={{ ...S.mono, color: '#aaa', fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
{`cd firemap/
python scripts/generate_synthetic.py

# Outputs:
#   data/synthetic_ca.csv  (~40k rows)
#   data/synthetic_dev.csv (2k rows)

python qa/inspect_data.py
# Outputs: qa/output/*.png`}
            </pre>
          </div>
          <div style={S.card}>
            <h3 style={S.h3}>Column checklist</h3>
            {[
              'lat, lon',
              'elevation, slope, veg_density',
              'fire_prob, wui_dist',
              'cost_rx_burn, cost_mechanical, cost_hand',
              'min_cost, cheapest',
              'total_benefit_current/2050/2100',
              'net_rx/mech/hand/min_current/2050/2100',
              'bcr_rx/mech/hand_current',
            ].map((line, i) => (
              <div key={i} style={{ ...S.mono, fontSize: 11, color: '#aaa', padding: '2px 0' }}>
                ✓ {line}
              </div>
            ))}
          </div>
        </div>

        {/* ── Integration status ────────────────────────────────────────── */}
        <h2 style={S.h2}>Integration Checklist</h2>
        <div style={{ ...S.card, maxWidth: 500 }}>
          {[
            ['Map loads with California centered', false],
            ['Layer tabs switch map variable', false],
            ['Dimension toggles update map paint', false],
            ['Cell click opens detail panel', false],
            ['Percentile filter shows top N% cells', false],
            ['Mean/median update on filter change', false],
            ['Area tool: draw circle on map', false],
            ['Area stats panel shows aggregate values', false],
            ['Color scheme toggle dark ↔ light', false],
            ['Methods panel opens', false],
          ].map(([label, done], i) => (
            <div key={i} style={{ ...S.row, fontSize: 12 }}>
              <span>{label}</span>
              <span style={{ color: done ? '#5B8A4E' : '#E55C2F' }}>{done ? '✓' : '○'}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
