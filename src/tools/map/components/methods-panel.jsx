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
          {config.id === 'just-air'
            ? <JustAirMethods />
            : <FuelTreatmentMethods />}
        </section>
      </div>
    </div>
  )
}

function FuelTreatmentMethods() {
  return (
    <>
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
    </>
  )
}

function JustAirMethods() {
  return (
    <>
      <h2 style={h2Style}>About this map</h2>
      <p style={pStyle}>
        This map shows projected annual PM₂.₅ concentrations and
        PM₂.₅-related mortality in 2050 across the contiguous United States
        and 15 major U.S. metros under two net-zero scenarios —{' '}
        <em>Low CDR</em>, which reaches net zero with limited carbon-dioxide
        removal, and <em>High CDR</em>, which leans more heavily on CDR.
        For details, see{' '}
        <strong>Bergero et al., <em>Nature Climate Change</em>, in press</strong>{' '}
        (<a
          href="https://assets-eu.researchsquare.com/files/rs-7359464/v1/e95da285-43f3-4f1b-b892-d899d3335dda.pdf"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >preprint</a>).
      </p>

      <h2 style={h2Style}>Scenarios</h2>
      <p style={pStyle}>
        Both scenarios reach net-zero CO₂ in the United States by 2050 but
        differ in how much they rely on carbon-dioxide removal (CDR). The
        Low-CDR scenario reduces residual fossil combustion further to meet
        the same net target; the High-CDR scenario tolerates more fossil
        combustion and offsets it with engineered or land-based removals.
        Because PM₂.₅ co-pollutants ride along with fossil combustion, the
        two scenarios produce different air-quality outcomes in the same
        year. The map defaults to the High-CDR view; switch via the
        scenario toggle in the sidebar.
      </p>

      <h2 style={h2Style}>Layers</h2>
      <p style={pStyle}>
        <strong>PM₂.₅</strong> shows annual mean concentration (µg/m³) on a
        diverging blue → red ramp pivoting at the WHO 5 µg/m³ safe-air
        threshold; cells right at the threshold render transparent.{' '}
        <strong>Mortality</strong> shows the PM₂.₅-attributable death rate
        (deaths/km²) on a cream → orange → wine → black ramp (inverted to
        wine → orange → cream in dark mode for contrast).{' '}
        <strong>Δ PM₂.₅</strong> and <strong>Δ Mortality</strong> show the
        High − Low CDR difference on a sequential red ramp, transparent
        where the difference is near zero.{' '}
        <strong>Population density</strong> (people/km²) and the
        <strong> demographic layers</strong> — household income (USD/household)
        and race/ethnicity (% non-Hispanic white) — read off the city pixel
        grid only; the national surface lacks those columns.
      </p>

      <h2 style={h2Style}>Spatial resolution</h2>
      <p style={pStyle}>
        Air-quality and mortality data come from a CONUS-wide 9 km grid
        plus native 1 km pixel grids for each of the 15 metros, sourced from
        the Bergero et al. modeling pipeline. The map tiles between five
        scales as you zoom: 36 km supercells at the national view
        (z ≲ 4), 18 km at z 4, 9 km at z 5–7, 3 km city bins at z 6, and
        native 1 km city pixels from z 7. The 9 km grid is dropped where
        it would otherwise overlap city pixels, so the city tiers own the
        intra-metro view.
      </p>

      <h2 style={h2Style}>Mortality estimation</h2>
      <p style={pStyle}>
        PM₂.₅-attributable mortality per pixel is computed using a
        concentration-response function applied to local PM₂.₅ exposure
        and baseline mortality rates from the source paper. Values are
        reported as deaths/km² (per-pixel counts divided by cell area so
        the national 9 km grid and the 1 km city pixels share a common
        unit). Use the <strong>region focus</strong> tool to sum cells
        within a drawn circle or polygon and compute area-level totals.
      </p>

      <h2 style={h2Style}>Equity chart</h2>
      <p style={pStyle}>
        When a region drawn with the region-focus tool overlaps any of the
        15 metros, the panel under the histogram bins city pixels by income
        tertile (left) and by % non-Hispanic white into the source paper's
        three categorical bins (right), then plots the
        population-weighted mean PM₂.₅ (or mortality) of each bin as
        percent deviation from the region-wide mean. The lighter rectangle
        behind each bar is a 95 % bootstrap confidence interval (200
        resamples). The chart hides itself outside the metros, since the
        national 9 km surface doesn't carry the demographic columns.
      </p>

      <h2 style={h2Style}>Difference layer</h2>
      <p style={pStyle}>
        Difference = High CDR − Low CDR. Darker red indicates locations
        where the High-CDR scenario produces more PM₂.₅ or more deaths
        than the Low-CDR scenario; cells with near-zero difference fade
        to transparent.
      </p>

      <h2 style={h2Style}>Distribution chart</h2>
      <p style={pStyle}>
        The sidebar histogram shows the nationwide value distribution for
        the active variable, baked into a static JSON at build time so it
        stays fixed as you pan or zoom — a constant reference for the
        whole CONUS. Use the region-focus tool when you want the
        distribution to follow your drawn area instead.
      </p>
    </>
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
