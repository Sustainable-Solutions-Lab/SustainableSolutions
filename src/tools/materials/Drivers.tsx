/**
 * The three controls the first figure actually answers to.
 *
 * Material use is the product of three things and nothing else:
 *
 *     M  =  P  x  GDP/P  x  M/GDP
 *
 * so there are exactly three ways for it to fall. That identity is printed
 * under the sliders with the current numbers in it, because the whole argument
 * of the paper is an arithmetic claim about those three terms: the third one
 * has to fall faster than the first two rise, and it has never done so.
 *
 * Each slider moves in annual percent to 2060, which is the unit the SSPs are
 * argued in, and carries each SSP's own value as a tick. Population and income
 * tilt the chosen pathway by a constant annual rate. Material intensity moves
 * all four efficiency rails at once; the advanced panel below the figure is
 * where they come apart.
 */
import { useMemo } from 'react';
import Slider, { type Tick } from '../magnets/Slider';
import {
  defaultLevers,
  driverGrowth,
  resolveSsp,
  runModel,
  setAllIntensity,
  sspDrivers,
  sspLevers,
  tiltFor,
  type Levers,
  type ModelInputs,
} from './model';

/** The three rates the current run produces, and the levels behind them. */
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
  /** World kilograms of primary material per 2015 dollar of output. */
  intensity0: number;
  intensity1: number;
  /** World primary material use, Mt. */
  material0: number;
  material1: number;
}

/** The same four terms, measured over the 36 years to 2024 (1988-2024). */
export interface DriverPast {
  pop: number;
  gdppc: number;
  intensity: number;
  material: number;
}

const pct = (v: number, digits = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(100 * v).toFixed(digits)}%`;

/** The measured window the reference tick and the second identity row use. */
export const PAST_FROM = 1988;
export const PAST_TO = 2024;
const PAST_LABEL = `${PAST_FROM}–${PAST_TO}`;

/**
 * Ticks for each SSP's value plus the measured past, dropping a label to a
 * second row when it would collide with its neighbour. The past is drawn
 * strong: it is a reference to read the rail against, not a setting.
 */
function railTicks(values: Record<string, number>, past: number, lo: number, hi: number): Tick[] {
  const marks = [...Object.entries(values), [PAST_LABEL, past] as [string, number]]
    .filter(([, v]) => v >= lo && v <= hi)
    .sort((a, b) => a[1] - b[1]);
  const span = hi - lo || 1;
  return marks.map(([label, v], i) => ({
    at: v,
    label,
    strong: label === PAST_LABEL,
    low: i > 0 && Math.abs(v - marks[i - 1][1]) / span < 0.1,
  }));
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

/** The big rate and the 2060 level under it, both in the rail's heat colour. */
function Readout({ rate, level, color }: { rate: number; level: string; color: string }) {
  return (
    <span className="mat-readout" style={{ color }}>
      <span className="mat-readout-rate">{pct(rate)}<small>/yr</small></span>
      <span className="mat-readout-level">{level}</span>
    </span>
  );
}

export default function Drivers({
  inputs,
  levers,
  now,
  past,
  materialRange,
  onChange,
}: {
  inputs: ModelInputs;
  levers: Levers;
  now: DriverNow;
  past: DriverPast;
  /** The spread of world material growth across the paper's runs, to colour the result on. */
  materialRange: [number, number];
  onChange: (change: (l: Levers) => void) => void;
}) {
  const blend = useMemo(() => resolveSsp(inputs, levers.sspU), [inputs, levers.sspU]);
  const pathway = useMemo(() => driverGrowth(inputs, { ...levers, popTilt: 0, gdppcTilt: 0 }), [inputs, levers]);
  const drivers = useMemo(() => sspDrivers(inputs), [inputs]);

  // Where each SSP's own intensity path lands, in percent a year. Four runs,
  // and they only depend on the data, so this is computed once.
  const sspIntensity = useMemo(() => {
    const out: Record<string, number> = {};
    for (const ssp of inputs.sspSampled) {
      const r = runModel(inputs, sspLevers(inputs, ssp));
      const n = r.years.length;
      const yrs = r.years[n - 1] - r.years[0];
      out[ssp] = Math.pow(
        (r.primary.total[n - 1] / r.gdp[n - 1]) / (r.primary.total[0] / r.gdp[0]),
        1 / yrs,
      ) - 1;
    }
    return out;
  }, [inputs]);

  /**
   * Intensity is the one driver with no closed form: it is an endpoint for
   * every material in every region, and what that does to world kilograms per
   * dollar depends on the mix. So the model is run across the draw and the
   * result inverted — seven runs, a few milliseconds, and the slider can then
   * move in percent a year like the other two.
   */
  const rateAt = (l: Levers, u: number): number => {
    const trial: Levers = { ...l };
    setAllIntensity(trial, u);
    const r = runModel(inputs, trial);
    const n = r.years.length;
    const yrs = r.years[n - 1] - r.years[0];
    return Math.pow((r.primary.total[n - 1] / r.gdp[n - 1]) / (r.primary.total[0] / r.gdp[0]), 1 / yrs) - 1;
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
   * How far the draw itself may travel, fixed once from the paper's ensemble
   * at the central drivers. Bounding the DRAW rather than the rate matters:
   * the rate a draw produces moves when population or income move, so a rail
   * bounded in percent a year could be walked out of the sampled space
   * sideways — and outside it the stock model answers a step change in
   * intensity by not building at all, which is a corner nobody has proposed.
   * The top of the rail is the sampling box itself.
   */
  const uBounds = useMemo(() => {
    const ref = defaultLevers(inputs);
    const us = [0, 0.25, 0.5, 0.75, 1];
    const gs = us.map((u) => rateAt(ref, u));
    const floor = inputs.intensityCagrRange?.min;
    const lo = floor == null ? 0 : Math.min(1, Math.max(0, invert(us, gs, floor)));
    return { lo, hi: 1 };
  }, [inputs]);

  const map = useMemo(() => {
    const us = Array.from({ length: 7 }, (_, i) => uBounds.lo + (i * (uBounds.hi - uBounds.lo)) / 6);
    return { us, gs: us.map((u) => rateAt(levers, u)) };
  }, [inputs, levers, uBounds]);

  /** Draw that lands on a given intensity growth rate, by interpolation. */
  const drawFor = (target: number): number => invert(map.us, map.gs, target);

  const popValues = Object.fromEntries(Object.entries(drivers).map(([s, d]) => [s, d.pop]));
  const gdppcValues = Object.fromEntries(Object.entries(drivers).map(([s, d]) => [s, d.gdppc]));
  // Both driver rails run four tenths of a point past the slowest and fastest
  // of the SSPs and the measured past, which is enough to ask what a stalled
  // population or a boom would do without leaving the territory they cover.
  const popLo = Math.min(past.pop, ...Object.values(popValues)) - 0.004;
  const popHi = Math.max(past.pop, ...Object.values(popValues)) + 0.004;
  const gdppcLo = Math.max(0, Math.min(past.gdppc, ...Object.values(gdppcValues)) - 0.004);
  const gdppcHi = Math.max(past.gdppc, ...Object.values(gdppcValues)) + 0.004;
  const intLo = map.gs[0];
  const intHi = map.gs[map.gs.length - 1];

  const popColor = heat(now.pop, popLo, popHi);
  const gdppcColor = heat(now.gdppc, gdppcLo, gdppcHi);
  const intColor = heat(now.intensity, intLo, intHi);
  const matColor = heat(now.material, materialRange[0], materialRange[1]);

  return (
    <div className="mat-drivers">
      <p className="mat-identity">
        <span>Population <b style={{ color: popColor }}>{pct(now.pop)}</b></span>
        <i>×</i>
        <span>income <b style={{ color: gdppcColor }}>{pct(now.gdppc)}</b></span>
        <i>×</i>
        <span>intensity <b style={{ color: intColor }}>{pct(now.intensity)}</b></span>
        <i>=</i>
        <span>material <b style={{ color: matColor }}>{pct(now.material)}</b> a year,{' '}
          <b style={{ color: matColor }}>{Math.round(now.material1 / 1000)} Gt</b> in 2060</span>
      </p>
      <p className="mat-identity mat-identity-past">
        <span>{PAST_LABEL}: population {pct(past.pop)}</span>
        <i>×</i>
        <span>income {pct(past.gdppc)}</span>
        <i>×</i>
        <span>intensity {pct(past.intensity)}</span>
        <i>=</i>
        <span>material {pct(past.material)} a year</span>
      </p>

      <Slider
        label="Population growth"
        value={Math.max(popLo, Math.min(popHi, now.pop))}
        min={popLo}
        max={popHi}
        step={0.0001}
        onChange={(v) => onChange((l) => (l.popTilt = tiltFor(pathway.pop, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        readout={<Readout rate={now.pop} color={popColor}
          level={`${(now.pop1 / 1e9).toFixed(1)} billion in 2060`} />}
        ticks={railTicks(popValues, past.pop, popLo, popHi)}
        desc={`World population growth, 2025 to 2060, as an average annual rate; ${(now.pop0 / 1e9).toFixed(1)} billion people in 2025. It bends the pathway by a constant rate in every region, so the regional spread is kept. Ticks: each SSP’s own rate, and the ${PAST_LABEL} average.`}
      />
      <Slider
        label="Income growth"
        value={Math.max(gdppcLo, Math.min(gdppcHi, now.gdppc))}
        min={gdppcLo}
        max={gdppcHi}
        step={0.0001}
        onChange={(v) => onChange((l) => (l.gdppcTilt = tiltFor(pathway.gdppc, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        readout={<Readout rate={now.gdppc} color={gdppcColor}
          level={`$${Math.round(now.gdppc1).toLocaleString()} a person in 2060`} />}
        ticks={railTicks(gdppcValues, past.gdppc, gdppcLo, gdppcHi)}
        desc={`World GDP per person, 2025 to 2060, as an average annual rate, in 2015 dollars: $${Math.round(now.gdppc0).toLocaleString()} in 2025. This is the axis Figure 3 of the paper puts income on. Ticks: each SSP’s own rate, and the ${PAST_LABEL} average.`}
      />
      <Slider
        label="Material intensity"
        value={Math.max(intLo, Math.min(intHi, now.intensity))}
        min={intLo}
        max={intHi}
        step={(intHi - intLo) / 300}
        onChange={(v) => onChange((l) => setAllIntensity(l, drawFor(v)))}
        fmt={(v) => `${pct(v)}/yr`}
        readout={<Readout rate={now.intensity} color={intColor}
          level={`${now.intensity1.toFixed(2)} kg per $ in 2060`} />}
        ticks={railTicks(sspIntensity, past.intensity, intLo, intHi)}
        desc={`Kilograms of material per dollar of world output, as an average annual rate of change to 2060; ${now.intensity0.toFixed(2)} kg per 2015 dollar in 2025. One knob over all four efficiency rails; the panel below sets them apart, along with recycling, ore grade and lifetimes, all of which move this. The rail stops where the paper’s 1,000 runs stop: its fast end is the most improving of them. Ticks: what each SSP’s own range gives at the central draw, and the ${PAST_LABEL} average.`}
      />
    </div>
  );
}
