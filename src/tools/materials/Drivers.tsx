/**
 * The three controls the first figure actually answers to.
 *
 * Material use is the product of three things and nothing else:
 *
 *     M  =  P  x  GDP/P  x  M/GDP
 *
 * so there are exactly three ways for it to fall. The headline pinned at the
 * top of the page is M; the three sliders are the terms, for whatever material and place the menus at
 * the top have put in focus. Measured over the model's own years they
 * multiply to the headline exactly.
 *
 * Each slider moves in annual percent to 2060, which is the unit the SSPs are
 * argued in, and carries each SSP's own value as a tick. Population and income
 * tilt the chosen pathway by a constant annual rate in every region. Intensity
 * moves the efficiency rails that act on the focus; the panel under it is
 * where they come apart.
 */
import { useMemo, type ReactNode } from 'react';
import Slider, { type Tick } from '../magnets/Slider';
import {
  INTENSITY_LEVERS,
  defaultLevers,
  runModel,
  sspLevers,
  tiltFor,
  type Levers,
  type ModelInputs,
  type ModelRun,
} from './model';
import { fmtMass, fmtPeople, fmtPerDollar, makeFocus, pick, setIntensity, type Focus } from './focus';

/** The three rates the current run produces for the focus, and the levels behind them. */
export interface DriverNow {
  pop: number;
  gdppc: number;
  intensity: number;
  material: number;
  /** Levels at the first and last modelled year. */
  pop0: number;
  pop1: number;
  gdppc0: number;
  gdppc1: number;
  /** Kilograms of primary material per 2015 dollar of output. */
  intensity0: number;
  intensity1: number;
  /** Primary material use, Mt. */
  material0: number;
  material1: number;
}

/** The same four terms, measured over the 36 years to 2024; null where the data has gaps. */
export interface DriverPast {
  pop: number;
  gdppc: number;
  intensity: number;
  material: number;
}

/** The four terms for a focus, measured over exactly the model's own years. */
export function measureNow(f: Focus, run: ModelRun): DriverNow {
  const { mass, pop, gdp } = pick(f, run);
  const n = run.years.length;
  const yrs = run.years[n - 1] - run.years[0];
  const g = (a: number, b: number) => (a > 0 && b > 0 ? Math.pow(b / a, 1 / yrs) - 1 : 0);
  return {
    pop: g(pop[0], pop[n - 1]),
    gdppc: g(gdp[0] / pop[0], gdp[n - 1] / pop[n - 1]),
    intensity: g(mass[0] / gdp[0], mass[n - 1] / gdp[n - 1]),
    material: g(mass[0], mass[n - 1]),
    pop0: pop[0],
    pop1: pop[n - 1],
    gdppc0: gdp[0] / pop[0],
    gdppc1: gdp[n - 1] / pop[n - 1],
    // Mt to kg is 1e9.
    intensity0: (mass[0] * 1e9) / gdp[0],
    intensity1: (mass[n - 1] * 1e9) / gdp[n - 1],
    material0: mass[0],
    material1: mass[n - 1],
  };
}

const pct = (v: number, digits = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(100 * v).toFixed(digits)}%`;

/** The measured window the reference tick and the second identity row use. */
export const PAST_FROM = 1988;
export const PAST_TO = 2024;
const PAST_LABEL = `${PAST_FROM}–${PAST_TO}`;

/**
 * Ticks for each SSP's value plus the measured past. Crowded labels fan out
 * on leader lines (the sliders' `leaders`). The past is drawn strong: it is a
 * reference to read the rail against, not a setting.
 */
function railTicks(values: Record<string, number>, past: number | null, lo: number, hi: number): Tick[] {
  const marks = [...Object.entries(values), ...(past == null ? [] : [[PAST_LABEL, past] as [string, number]])]
    .filter(([, v]) => v >= lo && v <= hi)
    .sort((a, b) => a[1] - b[1]);
  return marks.map(([label, v]) => ({ at: v, label, strong: label === PAST_LABEL }));
}

/**
 * Hotter for higher, cooler for lower: a value's place on its own rail, from
 * Spectral blue through the ink colour to Spectral red. Passing through ink
 * rather than Spectral's yellow keeps the middle legible on cream paper.
 */
export function heat(v: number, lo: number, hi: number): string {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  return t < 0.5
    ? `color-mix(in oklab, var(--mat-cool) ${Math.round((1 - 2 * t) * 100)}%, var(--ink))`
    : `color-mix(in oklab, var(--mat-hot) ${Math.round((2 * t - 1) * 100)}%, var(--ink))`;
}

/**
 * A number in the rail's heat colour, large, with a smaller line under it.
 * Shared by the three driver sliders, the material headline and the compact
 * sliders in the panel beneath, so they all read the same way.
 */
export function Readout({ main, unit, level, color, size = 'md' }: {
  main: ReactNode; unit?: string; level?: ReactNode; color: string; size?: 'lg' | 'md' | 'sm';
}) {
  return (
    <span className={`mat-readout ${size}`} style={{ color }}>
      <span className="mat-readout-main">{main}{unit && <small>{unit}</small>}</span>
      {level != null && <span className="mat-readout-level">{level}</span>}
    </span>
  );
}

/** How far a thumb is pulled onto a tick: three per cent of the rail either side. */
export const SNAP = 0.03;

export default function Drivers({
  inputs,
  levers,
  run,
  focus,
  past,
  advanced,
  onAdvanced,
  onReset,
  onChange,
  children,
}: {
  inputs: ModelInputs;
  levers: Levers;
  /** The run the figure above is drawing, so the headline is its numbers. */
  run: ModelRun;
  focus: Focus;
  past: DriverPast | null;
  advanced: boolean;
  onAdvanced: () => void;
  onReset: () => void;
  /** The panel of assumptions behind intensity, shown when `advanced`. */
  children?: ReactNode;
  onChange: (change: (l: Levers) => void) => void;
}) {
  const now = useMemo(() => measureNow(focus, run), [focus, run]);
  const where = focus.place === 'World' ? 'world' : focus.place;
  const what = focus.group === 'total' ? 'material' : focus.name.toLowerCase();

  // Each SSP run once, at its central draws; every tick on all three rails is
  // read off these four runs for whatever is in focus.
  const sspRuns = useMemo(
    () => Object.fromEntries(inputs.sspSampled.map((s) => [s, runModel(inputs, sspLevers(inputs, s))])),
    [inputs],
  );
  const ssp = useMemo(() => {
    const out = { pop: {} as Record<string, number>, gdppc: {} as Record<string, number>, intensity: {} as Record<string, number> };
    for (const [s, r] of Object.entries(sspRuns)) {
      const m = measureNow(focus, r);
      out.pop[s] = m.pop;
      out.gdppc[s] = m.gdppc;
      out.intensity[s] = m.intensity;
    }
    return out;
  }, [sspRuns, focus]);

  /**
   * Intensity is the one driver with no closed form: it is an endpoint for
   * every material in every region, and what that does to kilograms per
   * dollar depends on the mix. So the model is run across the draw and the
   * result inverted — seven runs, a few milliseconds, and the slider can then
   * move in percent a year like the other two. Only the rails that act on the
   * focus move; the rest stay where they were set.
   */
  const rateAt = (l: Levers, u: number, f: Focus = focus): number => {
    const trial: Levers = { ...l };
    setIntensity(trial, f.levers, u);
    return measureNow(f, runModel(inputs, trial)).intensity;
  };

  /** Piecewise-linear inverse of a monotone (u, rate) table. */
  const invert = (us: number[], gs: number[], target: number): number => {
    if (target <= gs[0]) return us[0];
    for (let i = 1; i < gs.length; i++) {
      if (target <= gs[i]) {
        const f = (target - gs[i - 1]) / Math.max(1e-12, gs[i] - gs[i - 1]);
        return us[i - 1] + f * (us[i] - us[i - 1]);
      }
    }
    return us[us.length - 1];
  };

  /**
   * How far the draw itself may travel. Bounding the DRAW rather than the rate
   * matters: the rate a draw produces moves when population or income move, so
   * a rail bounded in percent a year could be walked out of the sampled space
   * sideways — and outside it the stock model answers a step change in
   * intensity by not building at all. The top of the rail is the sampling box.
   *
   * With all four groups in focus the floor is the most improving of the
   * paper's 1,000 runs, found at the central drivers for the world: every
   * material at its fastest at once is further than any run went. One group
   * on its own can go to the edge of its own box, because the paper drew each
   * group independently.
   */
  const uBounds = useMemo(() => {
    if (focus.group !== 'total') return { lo: 0, hi: 1 };
    const ref = defaultLevers(inputs);
    const world = makeFocus('World', 'total', null);
    const us = [0, 0.25, 0.5, 0.75, 1];
    const gs = us.map((u) => rateAt(ref, u, world));
    const floor = inputs.intensityCagrRange?.min;
    const lo = floor == null ? 0 : Math.min(1, Math.max(0, invert(us, gs, floor)));
    return { lo, hi: 1 };
  }, [inputs, focus.group]);

  const map = useMemo(() => {
    const us = Array.from({ length: 7 }, (_, i) => uBounds.lo + (i * (uBounds.hi - uBounds.lo)) / 6);
    return { us, gs: us.map((u) => rateAt(levers, u)) };
  }, [inputs, levers, uBounds, focus]);

  /** Draw that lands on a given intensity growth rate, by interpolation. */
  const drawFor = (target: number): number => invert(map.us, map.gs, target);

  // The tilts multiply every region by the same factor, so the rate showing is
  // the pathway's own rate times the tilt, exactly, in any region.
  const pathwayPop = (1 + now.pop) / (1 + (levers.popTilt ?? 0)) - 1;
  const pathwayGdppc = (1 + now.gdppc) / (1 + (levers.gdppcTilt ?? 0)) - 1;

  // Both driver rails run four tenths of a point past the slowest and fastest
  // of the SSPs and the measured past, which is enough to ask what a stalled
  // population or a boom would do without leaving the territory they cover.
  const span = (vals: number[]) => [Math.min(...vals) - 0.004, Math.max(...vals) + 0.004];
  const [popLo, popHi] = span([...(past ? [past.pop] : []), ...Object.values(ssp.pop)]);
  const [gdppcLo, gdppcHi] = span([...(past ? [past.gdppc] : []), ...Object.values(ssp.gdppc)]);
  const intLo = map.gs[0];
  const intHi = map.gs[map.gs.length - 1];
  // A material the paper gives no intensity target (the "other" categories)
  // follows population and income alone, and its rail has nowhere to go.
  const intFixed = intHi - intLo < 1e-5;

  const popColor = heat(now.pop, popLo, popHi);
  const gdppcColor = heat(now.gdppc, gdppcLo, gdppcHi);
  const intColor = intFixed ? 'var(--ink)' : heat(now.intensity, intLo, intHi);
  const intensityLevel = `${fmtPerDollar(now.intensity1)} per $ in 2060`;
  const intensityLabel = focus.group === 'total' ? 'Material intensity' : `${focus.name} intensity`;

  return (
    <div className="mat-drivers">
      <div className="mat-kpi">
        <div>
          <p className="mat-kpi-label">{focus.name} · {focus.place}</p>
          <p className="mat-kpi-sub">
            {fmtMass(now.material0)} in 2025{past && <> · {PAST_LABEL} {pct(past.material)}/yr</>}
            {' · '}<button type="button" className="mat-reset-link" onClick={onReset}>reset all</button>
          </p>
        </div>
      </div>

      <Slider
        label="Population growth"
        value={Math.max(popLo, Math.min(popHi, now.pop))}
        min={popLo}
        max={popHi}
        step={0.0001}
        snap={SNAP}
        leaders
        onChange={(v) => onChange((l) => (l.popTilt = tiltFor(pathwayPop, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        readout={<Readout main={pct(now.pop)} unit="/yr" color={popColor}
          level={`${fmtPeople(now.pop1)} in 2060`} />}
        ticks={railTicks(ssp.pop, past?.pop ?? null, popLo, popHi)}
        desc={`Population growth in the ${where === 'world' ? 'world' : where}, 2025 to 2060, as an average annual rate; ${fmtPeople(now.pop0)} people in 2025. It bends the pathway by a constant rate in every region at once. Ticks: each SSP’s own rate, and the ${PAST_LABEL} average.`}
      />
      <Slider
        label="Income growth"
        value={Math.max(gdppcLo, Math.min(gdppcHi, now.gdppc))}
        min={gdppcLo}
        max={gdppcHi}
        step={0.0001}
        snap={SNAP}
        leaders
        onChange={(v) => onChange((l) => (l.gdppcTilt = tiltFor(pathwayGdppc, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        readout={<Readout main={pct(now.gdppc)} unit="/yr" color={gdppcColor}
          level={`$${Math.round(now.gdppc1).toLocaleString()} a person in 2060`} />}
        ticks={railTicks(ssp.gdppc, past?.gdppc ?? null, gdppcLo, gdppcHi)}
        desc={`GDP per person in the ${where === 'world' ? 'world' : where}, 2025 to 2060, as an average annual rate, in 2015 dollars: $${Math.round(now.gdppc0).toLocaleString()} in 2025. It bends the pathway by a constant rate in every region at once. Ticks: each SSP’s own rate, and the ${PAST_LABEL} average.`}
      />
      <div className="mat-intensity-col">
        {intFixed ? (
          <div className="mat-fixed">
            <div className="mat-fixed-head">
              <span className="mat-fixed-label">{intensityLabel}</span>
              <Readout main={pct(now.intensity)} unit="/yr" color={intColor} level={intensityLevel} />
            </div>
            <p>The paper sets no efficiency target for {what}: it follows population and income. Pick its group in the menu above to move the group’s efficiency.</p>
          </div>
        ) : (
          <Slider
            label={intensityLabel}
            value={Math.max(intLo, Math.min(intHi, now.intensity))}
            min={intLo}
            max={intHi}
            step={(intHi - intLo) / 300}
            snap={SNAP}
            leaders
            onChange={(v) => onChange((l) => setIntensity(l, focus.levers, drawFor(v)))}
            fmt={(v) => `${pct(v)}/yr`}
            readout={<Readout main={pct(now.intensity)} unit="/yr" color={intColor} level={intensityLevel} />}
            ticks={railTicks(ssp.intensity, past?.intensity ?? null, intLo, intHi)}
            desc={`Kilograms of ${what} per dollar of ${where === 'world' ? 'world' : where} output, as an average annual rate of change to 2060; ${fmtPerDollar(now.intensity0)} per 2015 dollar in 2025. ${focus.group === 'total' ? 'One knob over every efficiency assumption in the panel below. The rail stops where the paper’s 1,000 runs stop.' : `It moves the ${INTENSITY_LEVERS[focus.levers[0]].label.toLowerCase()} rail in the panel below, across the range the paper sampled.`} Ticks: each SSP at its central draw, and the ${PAST_LABEL} average.`}
          />
        )}
        <button type="button" className="mat-advanced-toggle" aria-expanded={advanced} onClick={onAdvanced}>
          <span aria-hidden="true">{advanced ? '▾' : '▸'}</span> What makes up intensity
        </button>
      </div>

      {advanced && <div className="mat-advanced-body">{children}</div>}
    </div>
  );
}
