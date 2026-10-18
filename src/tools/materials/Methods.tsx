/**
 * The methods panel for the materials tool.
 *
 * Same shape as the gridded land-emissions explorer's Methods overlay
 * (src/tools/_map/components/methods-panel.jsx): a full-screen sheet with a
 * mono kicker, a serif title and plain sections. The figure captions on the
 * page say what is drawn; everything about how it was made lives here.
 *
 * Keep this in step with model.ts and Drivers.tsx. Every number below was
 * checked against the port or the paper's published files when written.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const h2 = { font: '600 19px/1.3 var(--font-serif)', color: 'var(--ink)', margin: '28px 0 8px' };
const p = { fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', margin: '0 0 12px' };

export default function Methods({ targetYear, onClose }: { targetYear: number; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Methods" className="mat-methods">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ font: '500 11px var(--font-mono)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0 }}>
            Methods
          </p>
          <button ref={close} type="button" onClick={onClose} aria-label="Close methods" className="mat-methods-close">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <h1 style={{ font: '600 32px/1.15 var(--font-serif)', letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 8px' }}>
          Will material use keep growing?
        </h1>

        <h2 style={h2}>What the first figure shows</h2>
        <p style={p}>
          Domestic material consumption from the UNEP International Resource Panel’s global
          material flows database, 1970–2024, drawn at full strength; the model from 2025 to
          2060, drawn in the same colours and lightened. Areas are stacked with the largest at
          the bottom and any “other” category on top, coloured along a spectral ramp from bottom
          to top. Choose a group and it opens into its own materials; the colours in the material
          menu are the colours in the figure.
        </p>
        <p style={p}>
          Per person and per dollar of GDP divide by measured population and GDP (2015 US
          dollars) in the measured years and by the model’s own in the projected ones. Both are
          linear in mass, so the stack stays a stack.
        </p>

        <h2 style={h2}>The model</h2>
        <p style={p}>
          This is the model behind Busch, Caldeira and Davis, ported from the paper’s R pipeline
          (<code>02-RunSimulations.R</code> and <code>dsm_functions.R</code>) and run in your
          browser. Material use in every region is the product of three terms: population,
          income per person, and material per dollar of output.
        </p>
        <p style={p}>
          Biomass and fossil fuels are flows: each region’s 2024 consumption is carried forward by
          its population and income path and by an intensity that eases from its 2024 value to an
          endpoint it reaches at the target year and then holds. Metals and non-metallic minerals are stocks: the same three terms set a
          target in-use stock for each end use, and a dynamic stock model, starting from each
          region’s 2024 cohort age profile and a lifetime distribution per end use, turns that
          stock into the material that has to be added each year, for growth and for
          replacement. Recycled metal and reused minerals meet part of that; the rest is primary
          consumption. Metals are counted as ore, at the modelled ore grade.
        </p>
        <p style={p}>
          The intensity endpoints are drawn, material by material, inside ranges the paper takes
          from ScenarioMIP’s 2060-to-2025 ratios, with each region keeping its own range. Recovery
          rates, ore grade and lifetimes are drawn inside the paper’s published bounds.
        </p>
        <p style={p}>
          Checked against the paper’s published runs: world growth matches its 1,000 runs to a
          median of 0.007 percentage points a year; biomass and fossil fuels match exactly; metal
          ores sit 3.7% low, because the port omits the explicit power-sector stock. Run on the
          central assumptions, each SSP’s population and income path tracks the paper’s
          deterministic run for that SSP to within a few percent.
        </p>

        <h2 style={h2}>Why the projection is not smooth</h2>
        <p style={p}>
          Consumption follows the slope of the stock path rather than its level, so a bend in an
          assumption shows up as a dip. Two bends are built in. Stock-heavy materials carry 2024’s
          own building rate for three years before the modelled path takes over, so 2025 does not
          open with a step. And intensity leaves 2024 at the slope it was already on, steepens
          through the 2030s and flattens at the target year ({targetYear} unless you move it), with
          zero slope at both ends.
        </p>
        <p style={p}>
          Ask for a fast enough fall in material per dollar and the dip becomes a trough. What is
          already standing is then more than the new intensity calls for, so new material is
          barely needed until the ramp has done its work, and demand returns after it. About a
          quarter of the paper’s 1,000 runs fall more than 5% below their 2025 level at some
          point before recovering.
        </p>
        <p style={p}>
          Metal ores step up between 2024 and 2025. The measured series reports ore as consumed;
          the model reports the ore that has to be mined at the modelled grade.
        </p>

        <h2 style={h2}>The dashed lines</h2>
        <p style={p}>
          The paper’s 1,000 runs, each re-run through this model, summarised year by year for the
          region, material group and measure showing: the median and the 5th and 95th
          percentiles of the runs in each year. Each line is a statistic of the year, not one
          run followed through time. They do not move with the sliders. No band is drawn for a
          single material, because the runs are summarised by group.
        </p>

        <h2 style={h2}>The three sliders</h2>
        <p style={p}>
          Population growth, income growth and the change in material intensity, each as an
          average annual rate from 2025 to 2060. Measured over the same years, the three
          multiply exactly to the growth in world material use shown above them; nothing else in
          the model can move world material use except through one of them.
        </p>
        <p style={p}>
          Population and income bend the SSP pathway by a constant annual rate, every region by
          the same factor, so the regional spread is kept. The ticks are each SSP’s own rate and,
          drawn strong, the measured average over 1988–2024: 36 years, the same span as the
          projection. The rails run four tenths of a point past the slowest and fastest of those.
          Each number is coloured by its place on its own rail, cooler for lower and hotter for
          higher; the material total is coloured against the spread of the paper’s runs.
        </p>
        <p style={p}>
          Intensity has no closed form, because it is an endpoint for every material in every
          region and what that does to world kilograms per dollar depends on the mix. The tool
          runs the model across the draw and inverts it. The rail is bounded by the draw rather
          than by the rate: its fast end is the most improving of the paper’s 1,000 runs, its
          slow end the top of the paper’s sampling range. Because more income builds more stock,
          moving population or income also moves the intensity readout.
        </p>
        <p style={p}>
          The panel that opens under the intensity slider sets efficiency for each material
          group, recycling, ore grade and lifetimes separately. All of them change the kilograms
          a dollar of output needs, so moving any of them moves the intensity slider too. Each
          efficiency slider carries a tick where its own 1988–2024 rate of change would put it by
          the target year: consumption per dollar for biomass and fossil fuels, in-use stock per
          dollar (MISO2) for metals and minerals. Thumbs snap onto ticks when dragged close.
        </p>

        <h2 style={h2}>Sources</h2>
        <p style={p}>
          History: UNEP IRP global material flows database. Population and income: IIASA SSP
          basic drivers. Intensity ranges: ScenarioMIP. In-use stocks and end uses: MISO2. Model
          code: <a href="https://github.com/pmbusch/material-intensity" target="_blank" rel="noopener noreferrer">github.com/pmbusch/material-intensity</a>.
        </p>
      </div>
    </div>
  );
}
