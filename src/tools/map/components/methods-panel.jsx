/**
 * components/methods-panel.jsx
 *
 * Full-screen overlay that renders the project's methods documentation.
 * Opened by the "Read Methods" button in both the desktop sidebar and the
 * mobile controls panel. The opening section ("About this map") is the
 * description content that previously expanded under the sidebar's About
 * toggle — now consolidated here.
 *
 * Content lives in projects/<id>/methods.mdx in the source tree as a
 * reference, but is duplicated as JSX here so it renders inside the React
 * client tree without dragging in an MDX runtime.
 */

import { X } from 'lucide-react'

export function MethodsPanel({ config, isDark, onClose }) {
  const panelBg = isDark ? 'var(--paper-2)' : 'var(--paper)'
  const ruleColor = 'var(--rule)'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Methods"
      className="absolute z-30 overflow-y-auto"
      style={{
        // Cover everything except the site nav (56 px) and the in-tool
        // mobile header (another 56 px on small screens).
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: panelBg,
        borderTop: `1px solid ${ruleColor}`,
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 720, padding: '24px 24px 96px' }}>
        <div className="flex items-start justify-between mb-6">
          <p
            className="font-mono m-0"
            style={{
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Methods
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close methods"
            className="bg-transparent border-0 cursor-pointer text-ink-3 hover:text-ink p-1 -m-1"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <h1 className="font-serif text-ink m-0 mb-6" style={{ fontSize: '32px', lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {config.title}
        </h1>

        <section className="prose prose-sm" style={{ color: 'var(--ink)' }}>
          <h2 style={h2Style}>About this map</h2>
          <p style={pStyle}>
            We've analyzed the costs and benefits of treating (i.e., removing)
            wildfire fuels under a range of scenarios. These maps show the net
            benefits, benefits, and costs in different locations across
            California depending on the type of treatment and assumed climate
            (current, or 2100 under midrange or high warming). You can also see
            the breakdown of benefits across avoided property damage and
            avoided health impacts (the latter related to transported smoke).
            For details, see <strong>Cheng et al., <em>Prioritizing wildfire
            fuel management in California</em>, in review</strong>{' '}
            (<a
              href="https://eartharxiv.org/repository/view/9858/"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >preprint</a>).
          </p>

          <h2 style={h2Style}>Overview</h2>
          <p style={pStyle}>
            This tool visualizes results from an integrated cost-benefit
            analysis of wildfire fuel treatment across California at 1 km²
            spatial resolution. For each grid cell, the model estimates the
            expected costs and benefits of treating the vegetation to reduce
            wildfire risk, accounting for both property damage and human
            health impacts from smoke.
          </p>

          <h2 style={h2Style}>Study area</h2>
          <p style={pStyle}>
            The analysis covers the state of California. Grid cells are defined
            on a 1 km × 1 km grid aligned to the WGS84 coordinate system.
            The map shows all cells for which model estimates are available.
          </p>

          <h2 style={h2Style}>Treatment cost model</h2>
          <p style={pStyle}>
            Treatment costs represent the annualized per-km² expense of
            implementing fuel treatment (prescribed burning, mechanical
            thinning, hand crews, herbicide / grazing). Costs vary by terrain
            slope and accessibility, and by treatment type.
          </p>

          <h2 style={h2Style}>Benefit estimation</h2>
          <p style={pStyle}>
            Benefits are split into <strong>property</strong> (avoided damage
            to structures via reduced wildfire intensity in the wildland-urban
            interface) and <strong>health</strong> (avoided premature mortality
            and morbidity from PM₂.₅ smoke transport). Both are valued in
            US dollars and annualized over the lifetime of a single treatment.
          </p>

          <h2 style={h2Style}>Climate scenarios</h2>
          <p style={pStyle}>
            Three climate states are presented: <em>Current</em> (2000–2020
            conditions), <em>SSP2-4.5</em> (mid-century, ~2050, midrange
            warming), and <em>SSP5-8.5</em> (end-century, ~2100, high
            warming). Climate change shifts both fire probability and fuel
            condition, raising expected benefits in many locations.
          </p>

          <h2 style={h2Style}>Net benefit</h2>
          <p style={pStyle}>
            Net benefit per km² is benefit minus cost. Positive values
            (blue) indicate locations where treatment is cost-effective at
            today's prices; negative values (red) indicate locations where
            the cost of treatment exceeds the expected damages avoided.
          </p>

          <h2 style={h2Style}>Caveats</h2>
          <p style={pStyle}>
            Spatial estimates are noisy at the 1 km grid scale. Treat these
            maps as a guide to <em>relative</em> cost-effectiveness rather
            than precise per-cell predictions. The model does not include
            biodiversity, recreation, or watershed services.
          </p>
        </section>
      </div>
    </div>
  )
}

const h2Style = {
  fontFamily: 'Source Serif 4, Georgia, serif',
  fontSize: '19px',
  fontWeight: 600,
  marginTop: '24px',
  marginBottom: '8px',
}

const pStyle = {
  fontSize: '15px',
  lineHeight: 1.55,
  margin: 0,
  color: 'var(--ink)',
}

const linkStyle = {
  color: 'var(--ink-2)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
}
