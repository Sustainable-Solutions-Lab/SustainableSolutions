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
            : config.id === 'food-emissions'
              ? <FoodEmissionsMethods />
              : <FuelTreatmentMethods />}
        </section>
      </div>
    </div>
  )
}


function FoodEmissionsMethods() {
  return (
    <>
      <h2 style={h2Style}>About this map</h2>
      <p style={pStyle}>
        This map shows greenhouse-gas emissions from global food
        production on a quarter-degree grid (reference year 2020): cropland
        management — fertilizer and manure N₂O, rice paddy CH₄, drained
        peatland CO₂, crop residues, residue burning, urea and liming CO₂ —
        for 46 crops, together with direct livestock emissions from enteric
        fermentation, manure management, and manure on pasture. Draw a
        circle, or switch to the regional view and click a jurisdiction, to
        see the enclosed total, the source and commodity mix, and a
        2000–2024 trend composed from national series. The
        companion paper (<strong>DeAngelo, Seifried, Steffen &amp; Davis, in
        preparation</strong>) will extend the dataset annually and merge it
        with jurisdictional land-use-change emissions being developed by
        the{' '}
        <a
          href="https://cornerstonedata.org"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >Cornerstone Open Sustainability Data Initiative</a>.
      </p>

      <h2 style={h2Style}>Where the numbers come from</h2>
      <p style={pStyle}>
        Emissions follow the model of <strong>Cao et al., <em>Spatially
        explicit global assessment of cropland greenhouse gas emissions
        circa 2020</em>, Nature Climate Change (2026)</strong>, which applies
        IPCC 2019 Refinement methods to crop-specific gridded inputs (SPAM
        harvested areas, IFA fertilizer rates, gridded livestock, RiceAtlas
        seasons, hybrid peatland maps). We reimplemented the model
        independently and validated it module-by-module against the
        published grids: the deterministic pathways reproduce the original
        bit-for-bit, and the Monte Carlo pathways match within sampling
        tolerance.
      </p>

      <h2 style={h2Style}>Updates to the published model</h2>
      <p style={pStyle}>
        This map incorporates updates we developed in the course of the
        replication, in coordination with the original authors. The rice CH₄
        scaling factors for organic amendments and pre-season water regimes
        are parameterized with the IPCC 2019 reference values, which lowers
        rice CH₄ relative to the published figures by roughly a fifth.
        Drained-peatland emissions follow the <strong>Cornerstone
        steady-state model</strong> — a persistent occupation emission per
        hectare of cultivated drained peat, grounded in process-model decay
        curves — in place of flat climate-zone factors, whose calibration
        mixes sites of very different drainage ages. The associated
        land-use-change pulse at drainage joins the dataset with the
        Cornerstone integration. We also extend the boundary with CO₂ from
        agricultural liming — a source outside the original model — using
        EDGAR national estimates (IPCC category 3.C.2) distributed across
        each country's cropland.
      </p>

      <h2 style={h2Style}>Livestock (provisional)</h2>
      <p style={pStyle}>
        The reference for global livestock emissions is <strong>Herrero et
        al., <em>Biomass use, production, feed efficiencies, and greenhouse
        gas emissions from global livestock systems</em>, PNAS
        (2013)</strong>, which resolves enteric fermentation and manure
        emissions by species, production system, and region for a period
        centered on 2000. Two things have to change for that framework to
        sit alongside the cropland maps here: it has to run annually rather
        than as one snapshot, and it has to resolve individual animal
        commodities rather than species aggregates.
      </p>
      <p style={pStyle}>
        This version takes an interim route to both. Enteric fermentation
        CH₄, manure-management CH₄ and N₂O, and N₂O from manure deposited on
        pasture are taken from FAO's national Tier 1 series by species and
        year, then distributed within each country by gridded animal
        densities (Gridded Livestock of the World, interpolated between
        census years). National totals therefore match FAOSTAT exactly for
        every year 2000–2023, and each species group carries its own
        primary product — raw milk, carcass meat, eggs — so emissions per
        kilogram can be reported per commodity. What it does not yet carry
        is Herrero's Tier 2 detail: feed baskets, digestibility, and
        manure-management shares that vary by production system. An update
        of the Herrero assessment to circa 2020 is in preparation by its
        original authors; when those grids are available they replace the
        intensity layer used here, leaving the annual and commodity
        structure intact.
      </p>
      <p style={pStyle}>
        Manure applied to cropland is counted once, on the cropland side.
        Livestock factors are direct emissions only — the emissions of
        growing feed stay with the feed crop, so animal and crop figures
        can be added without double counting, but a livestock emission
        factor here is not a full life-cycle footprint.
      </p>

      <h2 style={h2Style}>Area statistics and trends</h2>
      <p style={pStyle}>
        Statistics for a drawn circle aggregate the quarter-degree cells
        whose centers fall inside it. The trend chart composes each
        country's national per-source series (2000–2024, from our annual
        extension driven by FAOSTAT activity data) weighted by that
        country's emissions inside the circle — exact for areas that
        contain whole countries, and a proportional approximation
        otherwise.
      </p>

      <h2 style={h2Style}>Feed</h2>
      <p style={pStyle}>
        Choosing <em>Crops grown for feed</em> shows the share of cropland
        emissions grown to feed animals, on the land where the crop grows.
        For each country and crop, FAO Food Balance Sheets give the quantity
        used as feed against domestic supply; that ratio is applied to the
        crop's gridded emissions. Oilseeds count a share of processing as
        well, since they are crushed before the cake is fed — taking
        reported feed alone would put US soy at 2.5%. About 7% of the
        emissions on this map are attributable to feed.
      </p>
      <p style={pStyle}>
        The downloadable factors add a feed column for each livestock
        commodity, splitting a country's feed pool across animal groups in
        proportion to concentrate demand (production times a feed-conversion
        ratio). The effect is largest where it should be: US poultry rises
        from 0.14 to 0.65 kg CO₂e per kg and pigs from 2.1 to 2.9, while
        beef moves from 13.0 to 13.7 because its emissions are dominated by
        enteric fermentation rather than feed. Two caveats: feed is located
        where it is grown, so exported feed stays with the exporting
        country rather than the herd that eats it, and the split between
        animal groups uses literature feed-conversion ratios rather than a
        calibrated feed-basket model.
      </p>

      <h2 style={h2Style}>Drivers of change</h2>
      <p style={pStyle}>
        The Analysis views decompose change over time with the identity used
        by <strong>Hong et al., <em>Global and regional drivers of land-use
        emissions in 1961–2017</em>, Nature (2021)</strong>: emissions are
        the product of population, production per person, land used per unit
        of production, and emissions per unit of land. Written that way, a
        region's change separates into how many people it feeds, how much
        each of them consumes, how efficiently land delivers that
        production, and how much each hectare emits.
      </p>
      <p style={pStyle}>
        We evaluate the four terms for every admin-1 × biome unit and split
        the 2000–2023 change between them with a log-mean Divisia (LMDI)
        decomposition, so the contributions sum exactly to the net change.
        The same decomposition runs on the gridded cells, where population
        has no per-cell series: the identity drops it and works with total
        production instead, giving three terms. There, production and
        agricultural land follow national trajectories, so those two terms
        vary between countries but not within them, while the emissions
        term and the net change carry the within-country detail.
        Population is gridded (HYDE 3.3 annual population), as is
        the 2020 emissions pattern; production and agricultural land are
        national series apportioned to units by their share of national
        emissions, so those two terms are proportional attributions rather
        than independent subnational observations. Production is measured
        in calories, using per-commodity factors checked against FAO Food
        Balance Sheets. Where Hong et al. worked at the national scale and
        over six decades, the aim here is to carry the same decomposition
        to subnational units on spatially explicit data — the analysis the
        companion paper develops.
      </p>

      <h2 style={h2Style}>Caveats</h2>
      <p style={pStyle}>
        Cells are ~28 km and should be read at landscape scale, not field
        scale. Commodity views cover the twelve largest crops and eight
        livestock groups; the remaining crops appear only in the all-
        commodity totals. Dominance maps rank contributors on 2020 values
        rather than the displayed year. Land-use-change emissions
        (deforestation, grassland conversion, the peat-drainage pulse) are
        not yet included; they join via the Cornerstone jurisdictional
        framework.
        Emission factors (kg CO₂e per kg of commodity, 2020, by cropland
        source):{' '}
        <a href="/tools/food-emissions/ef_country_2020.csv" style={linkStyle} download>
          country CSV</a>{' · '}
        <a href="/tools/food-emissions/ef_admin1_2020.csv" style={linkStyle} download>
          admin-1 CSV</a>; regional factors for any drawn circle download
        from the Region Focus panel.
        Replication code and tests:{' '}
        <a
          href="https://github.com/Sustainable-Solutions-Lab/gridded-land-management"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >gridded-land-management</a>.
      </p>
    </>
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

      <h2 style={h2Style}>Feed</h2>
      <p style={pStyle}>
        Choosing <em>Crops grown for feed</em> shows the share of cropland
        emissions grown to feed animals, on the land where the crop grows.
        For each country and crop, FAO Food Balance Sheets give the quantity
        used as feed against domestic supply; that ratio is applied to the
        crop's gridded emissions. Oilseeds count a share of processing as
        well, since they are crushed before the cake is fed — taking
        reported feed alone would put US soy at 2.5%. About 7% of the
        emissions on this map are attributable to feed.
      </p>
      <p style={pStyle}>
        The downloadable factors add a feed column for each livestock
        commodity, splitting a country's feed pool across animal groups in
        proportion to concentrate demand (production times a feed-conversion
        ratio). The effect is largest where it should be: US poultry rises
        from 0.14 to 0.65 kg CO₂e per kg and pigs from 2.1 to 2.9, while
        beef moves from 13.0 to 13.7 because its emissions are dominated by
        enteric fermentation rather than feed. Two caveats: feed is located
        where it is grown, so exported feed stays with the exporting
        country rather than the herd that eats it, and the split between
        animal groups uses literature feed-conversion ratios rather than a
        calibrated feed-basket model.
      </p>

      <h2 style={h2Style}>Drivers of change</h2>
      <p style={pStyle}>
        The Analysis views decompose change over time with the identity used
        by <strong>Hong et al., <em>Global and regional drivers of land-use
        emissions in 1961–2017</em>, Nature (2021)</strong>: emissions are
        the product of population, production per person, land used per unit
        of production, and emissions per unit of land. Written that way, a
        region's change separates into how many people it feeds, how much
        each of them consumes, how efficiently land delivers that
        production, and how much each hectare emits.
      </p>
      <p style={pStyle}>
        We evaluate the four terms for every admin-1 × biome unit and split
        the 2000–2023 change between them with a log-mean Divisia (LMDI)
        decomposition, so the contributions sum exactly to the net change.
        The same decomposition runs on the gridded cells, where population
        has no per-cell series: the identity drops it and works with total
        production instead, giving three terms. There, production and
        agricultural land follow national trajectories, so those two terms
        vary between countries but not within them, while the emissions
        term and the net change carry the within-country detail.
        Population is gridded (HYDE 3.3 annual population), as is
        the 2020 emissions pattern; production and agricultural land are
        national series apportioned to units by their share of national
        emissions, so those two terms are proportional attributions rather
        than independent subnational observations. Production is measured
        in calories, using per-commodity factors checked against FAO Food
        Balance Sheets. Where Hong et al. worked at the national scale and
        over six decades, the aim here is to carry the same decomposition
        to subnational units on spatially explicit data — the analysis the
        companion paper develops.
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
        <a
          href="https://www.nature.com/articles/s41558-026-02675-0"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        ><strong>Bergero et al. (2026), <em>Nature Climate Change</em></strong></a>.
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
        the active variable, which stays fixed as you pan or zoom —
        a constant reference for the whole CONUS. Use the region-focus tool when you want the
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
  // Sections can run to several paragraphs; the h2's own top margin still
  // separates sections cleanly with this in place.
  margin: '0 0 12px',
  color: 'var(--ink)',
}

const linkStyle = {
  color: 'var(--ink-2)',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
}
