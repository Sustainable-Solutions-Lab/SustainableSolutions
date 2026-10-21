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

// A single bordered callout, used for the schematic link. Deliberately not a
// card: it is a pointer out of the panel, not another section of it.
const calloutStyle = {
  margin: '18px 0 24px',
  padding: '12px 14px',
  border: '1px solid var(--rule-strong)',
  borderRadius: 4,
  background: 'var(--paper-2)',
  fontSize: 13,
  lineHeight: 1.5,
}

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
        This map shows greenhouse-gas emissions from global food production
        on a quarter-degree grid, reference year 2020. It covers cropland
        management for 46 crops (fertilizer and manure N₂O, rice CH₄,
        drained peatland CO₂, crop residues, residue burning, urea and
        liming CO₂) and direct livestock emissions from enteric
        fermentation, manure management and manure on pasture. Draw a
        circle, or switch to the regional view and click a jurisdiction, to
        see the enclosed total, the source and commodity mix, and a
        2000–2024 trend. A companion paper in preparation will evaluate
        trends and drivers in the combined and gridded land-use change and
        land management dataset.
      </p>

      {/* Orientation before detail: the sections below are a long list of
          sources, and the schematic is what makes them legible as a system -
          chiefly which inputs set national totals and which only set the
          within-country pattern. Placed here rather than at the foot so it is
          read before the list, not after it.

          LIVING DOCUMENT: every section below, and the schematic page this
          links to, must be updated whenever the model changes - new layer,
          new data vintage, changed method. The schematic footer carries the
          status date; move it when you touch either surface. Rule recorded
          in Gridded LM docs/decisions.md.

          Keep paragraphs to three or four sentences (Steve, 2026-10-20). */}
      <p style={calloutStyle}>
        <a href="/tools/food-emissions-methods" style={linkStyle}>
          <strong>Schematic: what we are building, and what it rests on</strong>
        </a>
        <span style={{ display: 'block', marginTop: 4, color: 'inherit', opacity: 0.8 }}>
          One page showing the outputs, which raw data sets totals versus
          spatial pattern, and what is built, waiting on collaborators, or
          still aspirational.
        </span>
      </p>

      <h2 style={h2Style}>Where the numbers come from</h2>
      <p style={pStyle}>
        Emissions follow the model of <a href="https://doi.org/10.1038/s41558-026-02558-4" target="_blank" rel="noopener noreferrer" style={linkStyle}><strong>Cao et al., <em>Spatially
        explicit global assessment of cropland greenhouse gas emissions
        circa 2020</em>, Nature Climate Change (2026)</strong></a>, which applies
        IPCC 2019 Refinement methods to crop-specific gridded inputs (SPAM
        harvested areas, IFA fertilizer rates, gridded livestock, RiceAtlas
        seasons, hybrid peatland maps). We reimplemented the model
        independently and validated it module-by-module against the
        published grids.
      </p>

      <h2 style={h2Style}>Updates to the published model</h2>
      <p style={pStyle}>
        We made several updates in the course of the replication, in
        coordination with the original authors. The rice CH₄ scaling factors
        for organic amendments and pre-season water regimes use the IPCC
        2019 reference values, which lowers rice CH₄ by roughly a fifth
        relative to the published figures. We also extend the boundary with
        CO₂ from agricultural liming, a source outside the original model,
        using EDGAR national estimates (IPCC category 3.C.2) spread across
        each country&rsquo;s cropland.
      </p>

      <h2 style={h2Style}>Drained peat</h2>
      <p style={pStyle}>
        Drained-peatland emissions keep the <strong>Cornerstone two-part
        structure</strong>: a one-off pulse when peat is first drained,
        booked as land-use change, then a steady emission for as long as it
        stays drained. The steady rate is the IPCC 2013 Wetlands Supplement
        Tier 1 factor by land use and climate zone, all gases: 37.25 t
        CO₂e/ha/yr on temperate and boreal cropland and, in the tropics, 45
        for oil palm, 60 for tree crops such as rubber and coconut, 39 for
        paddy rice and 58 for other cropland. IPCC&rsquo;s tropical factors
        come only from sites drained for more than six years, and
        subsidence records show the rate is steady after about five
        (Hooijer et al., 2012), so they pair with the pulse without counting
        it twice. Cropland peat totals 951 Mt CO₂e a year, against 802 at
        the single 37.3 rate the model used before (IPCC&rsquo;s temperate
        cropland value), which stays on the map as a comparison view.
      </p>
      <p style={pStyle}>
        The upstream drained-peat map carries no peat in Malaysia, so we
        fill it from PEATMAP peat extent overlaid on our crop maps. That
        places 1.5 Mha of crops on peat, 1.05 Mha of it oil palm, and adds
        about 73 Mt CO₂e a year to Malaysia. The pulse at drainage joins the
        dataset with land-use change.
      </p>
      <p style={pStyle}>
        Two checks are in progress and not yet in the totals. Drained peat
        is a finite stock: with the PEATGRIDS v2.0.1 peat carbon map
        (Widyastuti et al.), letting emissions stop where the peat runs out,
        and moving that land, still cropland, to the same IPCC Tier 2
        cropland soil model used everywhere else, lowers 2020 cropland peat
        by 0 to 4% (less than 1% in the tropics), depending on whether the
        map shows peat as it is today or before drainage. It replaces the
        steady rate once validated against measured depths on drained
        farmland.
      </p>
      <p style={pStyle}>
        Our drained area also matches national inventories across most of
        Annex I, but not Canada. There the upstream map has 1.07 Mha of
        drained cropland peat against 0.016 Mha reported (about 40 Mt CO₂e
        a year), and a fix is being decided.
      </p>

      <h2 style={h2Style}>Livestock (provisional)</h2>
      <p style={pStyle}>
        The reference for global livestock emissions is <a href="https://doi.org/10.1073/pnas.1308149110" target="_blank" rel="noopener noreferrer" style={linkStyle}><strong>Herrero et
        al., <em>Biomass use, production, feed efficiencies, and greenhouse
        gas emissions from global livestock systems</em>, PNAS
        (2013)</strong></a>, which resolves enteric fermentation and manure
        emissions by species, production system and region for a period
        centred on 2000. To sit alongside the cropland maps here, that
        framework has to run annually rather than as one snapshot, and
        resolve individual animal commodities rather than species
        aggregates.
      </p>
      <p style={pStyle}>
        This version takes an interim route to both. Enteric CH₄,
        manure-management CH₄ and N₂O, and N₂O from manure on pasture come
        from FAO&rsquo;s national Tier 1 series by species and year,
        distributed within each country by gridded animal densities: Global
        Pasture Watch&rsquo;s annual 1 km maps (Parente et al., 2026) for
        cattle, sheep, goats and horses, with buffalo following its cattle
        pattern, and Gridded Livestock of the World, interpolated between
        its 2010, 2015 and 2020 editions, for pigs and poultry. Both are
        census downscalings rather than observations of animals. National
        totals match FAOSTAT for every year 2000–2023, and each species
        group carries its own primary product (raw milk, carcass meat,
        eggs), so emissions per kilogram are reported per commodity.
      </p>
      <p style={pStyle}>
        What this does not yet carry is Herrero&rsquo;s Tier 2 detail: feed
        baskets, digestibility, and manure-management shares that vary by
        production system. An update of the Herrero assessment to circa 2020
        is in preparation by its original authors, and its grids will
        replace the intensity layer used here, leaving the annual and
        commodity structure intact.
      </p>
      <p style={pStyle}>
        Manure applied to cropland is counted once, on the cropland side.
        Livestock factors are direct emissions only: the emissions of
        growing feed stay with the feed crop, so animal and crop figures
        can be added without double counting, but a livestock factor here
        is not a full life-cycle footprint.
      </p>

      <h2 style={h2Style}>Production and yields</h2>
      <p style={pStyle}>
        Per-cell production, behind the calorie totals, the land-intensity
        views and every per-kilogram factor, distributes FAOSTAT national
        totals within each country by SPAM 2020&rsquo;s gridded production.
        SPAM carries the yield differences between irrigated and rainfed
        systems and between prime and marginal land, so a tonne of grain is
        placed where it is grown while totals still match the national
        statistics. Crops without a SPAM production layer fall back to
        harvested area, which assumes the national average yield. That
        pattern is SPAM&rsquo;s modelled 2020 snapshot; a spatially explicit
        crop-yield layer in development in the lab would make it observed
        and annual.
      </p>

      <h2 style={h2Style}>Crop maps and masks</h2>
      <p style={pStyle}>
        Crop locations and allocation rest on SPAM 2020, the standard global
        crop-distribution model. Where finer public maps exist we add them
        through a total-preserving refinement: within each jurisdiction the
        finer map redistributes that jurisdiction&rsquo;s emissions and
        production, so country, admin-1 and per-source totals are conserved
        exactly while placement sharpens. Candidates include the USDA
        Cropland Data Layer (US, 30 m annual), MapBiomas (Brazil, 30 m
        annual), Agriculture Canada&rsquo;s Annual Crop Inventory, JRC&rsquo;s
        EUCROPMAP (EU, 10 m), ESA WorldCereal, and commodity maps such as
        the oil-palm extent and planting-year layers of <a href="https://doi.org/10.5194/essd-16-5111-2024" target="_blank" rel="noopener noreferrer" style={linkStyle}>Descals et al.
        (2024)</a>.
      </p>
      <p style={pStyle}>
        Two tracks are kept strictly separate: a reproducible core built
        only from open, versioned, redistributable data, and an enhanced
        track that may add restrictively licensed or model-derived masks,
        always with a frozen copy and provenance. SPAM stays the default
        everywhere, and finer masks arrive one by one as opt-in toggles
        under <em>Improved crop maps</em> in the sidebar. The first is the
        Descals et al. oil-palm extent, which reallocates each
        country&rsquo;s palm emissions and production to the mapped 10 m
        extent. Where SPAM misplaces a crop entirely, as with
        Cameroon&rsquo;s oil palm, scattered into the northern savanna
        rather than the coastal estates, the toggle is the difference
        between a blank map and the right one.
      </p>
      <p style={pStyle}>
        The enhanced track&rsquo;s first entries are the cocoa and coffee
        presence models produced by Google for the{' '}
        <a href="https://www.forestdatapartnership.org" target="_blank" rel="noopener noreferrer" style={linkStyle}>Forest Data
        Partnership</a> (2026a release, CC-BY). Mean 10 m model probability
        is read as fractional cover at 1 km, with a per-crop probability
        floor calibrated so global expected area matches FAOSTAT harvested
        area. They are model-derived rather than observed, which is why they
        sit on the enhanced track; a re-export that keeps partial-cover
        cells is in progress, and a rubber layer follows.
      </p>
      <p style={pStyle}>
        For Ghana and Côte d&rsquo;Ivoire a further toggle constrains cocoa
        to the district totals that Trase derives from the peer-reviewed
        10 m map of Kalischek et al. (<em>Nature Food</em>, 2023), using the
        Forest Data Partnership layer only within districts. It also sets
        Ghana&rsquo;s national cocoa area to Kalischek&rsquo;s 2.71 Mha in
        place of FAOSTAT&rsquo;s 1.49 Mha, the one place where a mask
        changes a national total rather than only placement. Production
        stays at FAOSTAT, so per-tonne intensities rise accordingly.
      </p>

      <h2 style={h2Style}>Download the emission factors</h2>
      <p style={pStyle}>
        The full factor tables are downloadable as CSV: kilograms of CO₂e
        per kilogram of primary product for 2024, the most recent year the
        inputs support, as a total and by source. Livestock rows also carry
        the feed-crop emissions attributed to each animal group and a
        with-feed factor.
      </p>
      <div style={{
        border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)',
        padding: '12px 14px', margin: '0 0 14px',
      }}>
        <p style={{ ...pStyle, margin: '0 0 8px' }}>
          <a href="/tools/food-emissions/emission_factors_2024.xlsx" style={linkStyle} download>
            <strong>Emission factors workbook (XLSX)</strong></a>{' '}
          — the whole set in one file: admin-1 and country tables, plus
          sheets defining every column and every source and commodity
          abbreviation. Start here.
        </p>
        <p style={{ ...pStyle, margin: 0, fontSize: 13 }}>
          Same data as CSV for scripting:{' '}
          <a href="/tools/food-emissions/ef_admin1_2024.csv" style={linkStyle} download>
            admin-1</a>{' · '}
          <a href="/tools/food-emissions/ef_country_2024.csv" style={linkStyle} download>
            country</a>
        </p>
      </div>
      <p style={pStyle}>
        The two tables share a column layout, so they concatenate or join
        without reshaping, and cover 18 crops and 8 livestock commodities.
        Factors for any other area, including an uploaded sourcing polygon,
        download from the Region Focus panel and follow the year selected on
        the map. Emissions and production are both moved from the 2020
        reference to 2024 on the same national trajectories, so numerator
        and denominator share a vintage. Admin-1 units are assigned at cell
        centres, so they are approximate at borders, and rows below one
        kilotonne of production are omitted because the ratio is unstable
        there.
      </p>

      <h2 style={h2Style}>Area statistics and trends</h2>
      <p style={pStyle}>
        The gridded data supports aggregation over <em>any</em> polygon: a
        company&rsquo;s sourcing area, a supply shed, a watershed. The
        Region Focus tool offers drawn circles, ZIP-code polygons (US tools)
        and, via <em>Upload sourcing area</em>, your own GeoJSON or KML;
        statistics, trends and emission factors are computed the same way
        for any boundary, from the quarter-degree cells whose centres fall
        inside it.
      </p>
      <p style={pStyle}>
        The trend chart composes each country&rsquo;s national per-source
        series (2000–2024, from our annual extension driven by FAOSTAT
        activity data), weighted by that country&rsquo;s emissions inside
        the area. That is exact for areas containing whole countries and a
        proportional approximation otherwise.
      </p>

      <h2 style={h2Style}>Feed</h2>
      <p style={pStyle}>
        Choosing <em>Crops grown for feed</em> shows the share of cropland
        emissions grown to feed animals, on the land where the crop grows.
        For each country and crop, FAO Food Balance Sheets give feed use
        against domestic supply, and that ratio is applied to the
        crop&rsquo;s gridded emissions. Oilseeds also count a share of
        processing, since they are crushed before the cake is fed; reported
        feed alone would put US soy at 2.5%. About 7% of the emissions on
        this map are attributable to feed.
      </p>
      <p style={pStyle}>
        The downloadable factors add a feed column for each livestock
        commodity, splitting a country&rsquo;s feed pool across animal
        groups in proportion to concentrate demand (production times a
        feed-conversion ratio). The effect is largest where it should be: US
        poultry rises from 0.14 to 0.65 kg CO₂e per kg and pigs from 2.1 to
        2.9, while beef moves only from 13.0 to 13.7 because enteric
        fermentation dominates it.
      </p>
      <p style={pStyle}>
        Two caveats. Feed is located where it is grown, so exported feed
        stays with the exporting country rather than the herd that eats it.
        And the split between animal groups uses literature feed-conversion
        ratios rather than a calibrated feed-basket model.
      </p>

      <h2 style={h2Style}>GHG Protocol land-sector categories</h2>
      <p style={pStyle}>
        The <a href="https://ghgprotocol.org/land-sector-and-removals-guidance" target="_blank" rel="noopener noreferrer" style={linkStyle}>GHG Protocol Land Sector and Removals Standard (2026)</a> requires
        emissions to be reported by subcategory, and its Requirement 32
        obliges emission-factor providers to keep the subcategories
        separable. In the standard&rsquo;s own terms, <em>land management
        production emissions</em> here are fertilizer and manure N₂O,
        residue N₂O, rice CH₄, residue burning, enteric CH₄, manure
        management, pasture manure, and the non-biogenic CO₂ from urea and
        liming. <em>Land management net biogenic CO₂ emissions</em> are
        carbon stock changes on managed land: drained peatland CO₂ and
        soil-carbon losses on stable cropland and grazed rangeland.{' '}
        <em>Land use change emissions</em> are not yet shown; they will come
        from our next-generation jurisdictional land-use-change product, now
        in development and pending final release.
      </p>
      <p style={pStyle}>
        The LSRS category selector in the sidebar renders each grouping
        directly. The downloads keep every source in its own column so any
        grouping can be rebuilt, and a companion table
        (ef_lsrs_categories.csv) maps each source to its subcategory.
        Removals are out of scope: the standard requires field-measured
        evidence, uncertainty deductions and reversal buffers before
        soil-carbon gains may be claimed, which no map-based dataset can
        provide.
      </p>

      <h2 style={h2Style}>Forest land</h2>
      <p style={pStyle}>
        The LSRS defers carbon stock changes in forestry and non-productive
        land to future versions, but structurally they belong in categories
        1 and 2, so that is where they surface here, with soil carbon split
        by land use. Forest soil is on the map under category 2 but in no
        total. Mineral forest soil follows the IPCC default of steady state,
        which Annex I inventories (a net +0.03 t C/ha/yr across 1,665 Mha)
        and European woodland re-measurements (LUCAS) support, so the layer
        is drained forest organic soil: CO₂, CH₄ and N₂O as 22 Annex I
        parties report it, about 38 Mt CO₂e/yr on 10.4 Mha in 2020, placed
        on forest over PEATMAP peat.
      </p>
      <p style={pStyle}>
        Non-Annex I parties report no drained forest area, so for Sumatra,
        Borneo and Peninsular Malaysia we add an IPCC Tier 1 estimate (2013
        Wetlands Supplement) from the 2015 areas of degraded peat-swamp
        forest, secondary forest and acacia pulpwood on peat in Miettinen et
        al. (2017), placed with the Lesiv et al. (2022) forest-management
        map. That adds about 170 Mt CO₂e/yr on 6.2 Mha (about 215 Mt if all
        degraded peat-swamp forest is drained), more than four times the
        Annex I total and about half of it from acacia. Papua and other
        tropical peat, largely undrained, are not included.
      </p>
      <p style={pStyle}>
        Three further views split the layer by who would own it under the
        LSRS. CH₄ and N₂O from drained peat under wood-producing forest
        (Annex I managed forest and acacia, about 11 Mt CO₂e/yr) are
        production emissions that v1 already assigns to the timber, pulp
        and paper sourced. The CO₂ from the same forest (about 116 Mt) would
        go to those products too, but that is pending: v1 does not apply to
        forestry, and the Independent Standards Board has yet to decide how
        companies account for forest-land CO₂. The remaining 83 Mt, under
        degraded peat-swamp and secondary forest in Southeast Asia, has no
        product and so no owner under any LSRS rule.
      </p>
      <p style={pStyle}>
        We are piloting forest methods with two research-preview layers
        under category 2: forest biomass carbon flux for 44 US states,
        France and Spain from about 334,000 paired national forest inventory
        re-measurements (USDA FIA; France&rsquo;s IGN, whose revisits record
        each stem&rsquo;s fate and re-measured girth; Spain&rsquo;s IFN,
        which re-measures diameter and height). One layer follows each
        accounting option the GHG Protocol is weighing: the managed-land
        proxy (net stock change, including regrowth) and activity-based
        accounting (harvest-attributed flux only). They disagree in sign in
        all three (about −490 vs +401 Mt CO₂e/yr across the US states, −42
        vs +65 in France, −56 vs +23 in Spain), which is the crux of the
        deferral debate, and the US interior West is a net source even
        under the managed-land proxy, where beetle kill and fire dominate.
        These layers are never counted in any total and will become sources
        when the Standard&rsquo;s forestry language is final.
      </p>

      <h2 style={h2Style}>Soil carbon: cropland</h2>
      <p style={pStyle}>
        Selecting Soil carbon CO₂ as the source shows the mean annual change
        in mineral-soil organic carbon on stable cropland over 2000–2023,
        from the IPCC 2019 Refinement&rsquo;s Tier 2 steady-state model
        (three carbon pools, globally calibrated parameters). It is driven
        by the same activity data as the rest of the map: gridded residue
        and manure carbon inputs scaled by national trajectories, tillage
        systems from{' '}
        <a href="https://doi.org/10.5194/essd-11-823-2019" target="_blank" rel="noopener noreferrer" style={linkStyle}>Porwollik et al. (2019)</a>,
        soil texture, and monthly CRU TS climate. Blue cells are
        accumulating soil carbon and red cells losing it; globally the model
        finds a small net sink, about 15 Tg C a year, robust to the climate
        treatment.
      </p>
      <p style={pStyle}>
        The treatment is deliberately asymmetric. Cells losing soil carbon
        count in the emissions totals and factors, since losses are
        inventory-grade emissions, while gaining cells are shown for context
        but never netted or credited, since the GHG Protocol land standard
        requires multi-year field evidence for removals. Commodity-filtered
        views show only the counted losses, because gains are not
        attributable to individual crops. The estimate covers management
        effects under IPCC scope; erosion and land-use conversion are
        excluded.
      </p>
      <p style={pStyle}>
        Over time the layer carries three period rates (2000–08, 2008–16,
        2016–23): the year slider shows the selected year&rsquo;s period
        rate, and compare mode integrates the rates into the cumulative
        change between the selected years. Period boundaries are exact;
        years within a period are a piecewise approximation of the
        model&rsquo;s annual series (median deviation 23% of a cell&rsquo;s
        final cumulative change, larger where that change is near zero).
      </p>
      <p style={pStyle}>
        The Tier 2 sink may overstate. Observation-side products put net
        change on stable cropland at or below zero: about −15 Tg C a year
        for 1990–2010 in the soil-carbon debt reconstruction of{' '}
        <a href="https://doi.org/10.1073/pnas.1706103114" target="_blank" rel="noopener noreferrer" style={linkStyle}>Sanderman et al. (2017)</a>,
        about −42 in OpenLandMap-soildb (Hengl et al., 2026), and near
        neutral in repeated European measurements, where 45% of 5,952
        re-sampled LUCAS cropland points lost carbon between 2009 and 2018.
        Adding Sanderman&rsquo;s rate as a legacy-decay term would cancel
        the sink, but across 15 LUCAS countries the observed changes follow
        the management term (r = 0.51) and not the legacy term (r = −0.05),
        so we do not use it. About 9 Mt CO₂e a year of cropland soil loss
        is counted in the totals.
      </p>

      <h2 style={h2Style}>Soil carbon: rangeland (preliminary)</h2>
      <p style={pStyle}>
        A separate layer (Soil carbon CO₂ — rangeland) gives first
        historical estimates of soil-carbon change from changing grazing
        intensity along the observed 2000–2022 trajectory. The primary model
        is a meta-analysis model refit from Ren et al., <em>Nature Climate
        Change</em> (2024); the response functions and random-forest
        ensemble of{' '}
        <a href="https://doi.org/10.1126/science.adz4320" target="_blank" rel="noopener noreferrer" style={linkStyle}><strong>Powell et al., <em>Assessing the net-climate benefits of
        improved grazing intensity in global rangelands</em>, Science
        (2026)</strong></a> are a cross-check where that response is well
        conditioned. The map shows the Ren response refit on 78 of its 84
        covariates, all but elevation from the authors&rsquo; own gridded
        layers, as a 100-member bootstrap ensemble scaled to its median:
        about 2.3 Gt CO₂e over 2000–2022 (range 1.7–3.2), or roughly 0.2 Gt
        a year of gross loss by 2020.
      </p>
      <p style={pStyle}>
        It follows the cropland rule: losing cells count in the totals and
        gaining cells are shown but not credited. The year slider shows
        period-mean rates (2001–05, 2006–10, 2011–15, 2016–22) for the
        signed view and national gross-loss trajectories for the totals.
        Rangeland losses are not yet attributed to livestock commodities, so
        they appear only in all-commodity views.
      </p>
      <p style={pStyle}>
        The estimate is more sensitive to the present-day level of grazing
        intensity, which two independent global products place quite
        differently (about 2.7 Gt on the other product), than to how herds
        changed. Refitting with every covariate the authors supplied does
        not close that gap, so it lies in the grazing-intensity map, not
        the model inputs. Herd trends follow FAOSTAT national stocks rather
        than the gridded livestock products, whose 2010 release assigned the
        whole former-Sudan herd to both successor states.
      </p>
      <p style={pStyle}>
        Which grazing land counts is left to the reader, because the
        Standard treats any land used for livestock as productive while the
        Guidance leaves natural grassland out of version 1 &ldquo;as long as
        animal stocking rates are not intensively managed&rdquo;. The
        Rangeland scope control counts all grazing land, cultivated
        grassland only, or cultivated grassland plus natural grassland and
        shrubland where 2020 grazing intensity reaches a threshold the
        reader sets, using each cell&rsquo;s Global Pasture Watch grassland
        classes (2018–2022 mean). It applies to the gridded view; national
        trend charts and regional units count all grazing land.
      </p>

      <h2 style={h2Style}>Drivers of change</h2>
      <p style={pStyle}>
        The Analysis views decompose change over time with the identity used
        by <a href="https://doi.org/10.1038/s41586-020-03138-y" target="_blank" rel="noopener noreferrer" style={linkStyle}><strong>Hong et al., <em>Global and regional drivers of land-use
        emissions in 1961–2017</em>, Nature (2021)</strong></a>: emissions are
        the product of population, production per person, land used per unit
        of production, and emissions per unit of land. Written that way, a
        region&rsquo;s change separates into how many people it feeds, how
        much each of them consumes, how efficiently land delivers that
        production, and how much each hectare emits.
      </p>
      <p style={pStyle}>
        We evaluate the four terms for every admin-1 × biome unit and split
        the 2000–2023 change between them with a log-mean Divisia (LMDI)
        decomposition, so the contributions sum exactly to the net change.
        On the gridded cells, where population has no per-cell series, the
        identity works with total production instead, giving three terms.
        Production is measured in calories, using per-commodity factors
        checked against FAO Food Balance Sheets.
      </p>
      <p style={pStyle}>
        Population (HYDE 3.3) and the 2020 emissions pattern are gridded,
        but production and agricultural land are national series
        apportioned to units by their share of national cropland. Those two
        terms are therefore proportional attributions that vary between
        countries but not within them, while the emissions term and the net
        change carry the within-country detail. A spatially explicit
        crop-yield layer, in development in the lab, would make the
        production term subnational, and the companion paper carries the
        decomposition from Hong et al.&rsquo;s national, six-decade scale to
        subnational units on spatially explicit data.
      </p>

      <h2 style={h2Style}>Caveats</h2>
      <p style={pStyle}>
        Cells are ~28 km and should be read at landscape scale, not field
        scale. Commodity views cover eighteen crops (the twelve largest
        emitters plus cocoa, arabica and robusta coffee, rubber, cassava and
        beans) and eight livestock groups; the other SPAM crop classes are
        counted in every all-commodity total and available as data on
        request. Dominance maps rank contributors on 2020 values; in compare
        mode they show where the leader changed between the two selected
        years, with each contributor scaled by its national source
        trajectory (enteric CH₄ for livestock groups, fertilizer for crops).
      </p>
      <p style={pStyle}>
        Land-use-change emissions (deforestation, grassland conversion, the
        peat-drainage pulse) are not yet shown; they are in development and
        pending final release. Replication code and tests:{' '}
        <a
          href="https://github.com/Sustainable-Solutions-Lab/gridded-land-sector-emissions"
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >gridded-land-sector-emissions</a>.
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
