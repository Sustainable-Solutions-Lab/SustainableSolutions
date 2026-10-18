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
  /** Levels at the first and last modelled year, for the notes. */
  pop0: number;
  pop1: number;
  gdppc0: number;
  gdppc1: number;
}

/** The same four terms, measured over 1970-2024. */
export interface DriverPast {
  pop: number;
  gdppc: number;
  intensity: number;
  material: number;
}

const pct = (v: number, digits = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(100 * v).toFixed(digits)}%`;

/** Ticks for a set of SSP values, dropping labels that would collide. */
function sspTicks(values: Record<string, number>, span: number): Tick[] {
  const marks = Object.entries(values).sort((a, b) => a[1] - b[1]);
  return marks.map(([ssp, v], i) => ({
    at: v,
    label: ssp,
    low: i > 0 && Math.abs(v - marks[i - 1][1]) / (span || 1) < 0.1,
  }));
}

export default function Drivers({
  inputs,
  levers,
  now,
  past,
  warming,
  onChange,
}: {
  inputs: ModelInputs;
  levers: Levers;
  now: DriverNow;
  past: DriverPast;
  warming: Record<string, { min: number; median: number; max: number }> | null;
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
  const map = useMemo(() => {
    const us = [-0.25, 0, 0.25, 0.5, 0.75, 1, 1.25];
    const gs = us.map((u) => {
      const trial: Levers = { ...levers };
      setAllIntensity(trial, u);
      const r = runModel(inputs, trial);
      const n = r.years.length;
      const yrs = r.years[n - 1] - r.years[0];
      return Math.pow(
        (r.primary.total[n - 1] / r.gdp[n - 1]) / (r.primary.total[0] / r.gdp[0]),
        1 / yrs,
      ) - 1;
    });
    return { us, gs };
  }, [inputs, levers]);

  /** Draw that lands on a given intensity growth rate, by interpolation. */
  const drawFor = (target: number): number => {
    const { us, gs } = map;
    if (target <= gs[0]) return us[0];
    for (let i = 1; i < gs.length; i++) {
      if (target <= gs[i]) {
        const f = (target - gs[i - 1]) / Math.max(1e-12, gs[i] - gs[i - 1]);
        return us[i - 1] + f * (us[i] - us[i - 1]);
      }
    }
    return us[us.length - 1];
  };

  const popValues = Object.fromEntries(Object.entries(drivers).map(([s, d]) => [s, d.pop]));
  const gdppcValues = Object.fromEntries(Object.entries(drivers).map(([s, d]) => [s, d.gdppc]));
  const popLo = Math.min(-0.002, ...Object.values(popValues)) - 0.001;
  const popHi = Math.max(...Object.values(popValues)) + 0.002;
  const gdppcLo = Math.max(0, Math.min(...Object.values(gdppcValues)) - 0.004);
  const gdppcHi = Math.max(...Object.values(gdppcValues)) + 0.004;
  const intLo = map.gs[0];
  const intHi = map.gs[map.gs.length - 1];

  const warmingNote = () => {
    if (!warming) return null;
    const parts = inputs.sspSampled
      .map((s) => (warming[s] ? `${s} ${warming[s].min.toFixed(1)}–${warming[s].max.toFixed(1)}°C` : null))
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  };

  const intensityFall = 1 - Math.pow(1 + now.intensity, 36);

  return (
    <div className="mat-drivers">
      <Slider
        label="Population growth"
        value={Math.max(popLo, Math.min(popHi, now.pop))}
        min={popLo}
        max={popHi}
        step={0.0001}
        onChange={(v) => onChange((l) => (l.popTilt = tiltFor(pathway.pop, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        aside="to 2060"
        ticks={sspTicks(popValues, popHi - popLo)}
        desc="World population growth, 2024 to 2060, as an average annual rate. The regional spread of the chosen pathway is kept; this bends the whole of it by a constant rate."
        note={
          <>
            {(now.pop1 / 1e9).toFixed(1)} billion people in 2060, against{' '}
            {(now.pop0 / 1e9).toFixed(1)} billion today. The ticks are each SSP’s own
            population path; all of them are slower than the {pct(past.pop, 1)} a year of
            1970–2024.
          </>
        }
      />
      <Slider
        label="Income growth"
        value={Math.max(gdppcLo, Math.min(gdppcHi, now.gdppc))}
        min={gdppcLo}
        max={gdppcHi}
        step={0.0001}
        onChange={(v) => onChange((l) => (l.gdppcTilt = tiltFor(pathway.gdppc, v)))}
        fmt={(v) => `${pct(v)}/yr`}
        aside="per person, to 2060"
        ticks={sspTicks(gdppcValues, gdppcHi - gdppcLo)}
        desc="World GDP per person, 2024 to 2060, as an average annual rate. This is the axis Figure 3 of the paper puts income on."
        note={
          <>
            ${Math.round(now.gdppc0).toLocaleString()} per person today →{' '}
            ${Math.round(now.gdppc1).toLocaleString()} in 2060, in 2015 dollars.
          </>
        }
      />
      <Slider
        label="Material intensity"
        value={Math.max(intLo, Math.min(intHi, now.intensity))}
        min={intLo}
        max={intHi}
        step={(intHi - intLo) / 300}
        onChange={(v) => onChange((l) => setAllIntensity(l, drawFor(v)))}
        fmt={(v) => `${pct(v)}/yr`}
        aside="per $ of output, to 2060"
        ticks={sspTicks(sspIntensity, intHi - intLo)}
        desc="Kilograms of material per dollar of world output, as an average annual rate of change to 2060. One knob over all four efficiency rails; the advanced panel sets them apart, and is also where recycling, ore grade and lifetimes live — all of which show up here, since they change the kilograms a dollar of output needs."
        note={
          <>
            {now.intensity < 0
              ? <>A <b>{(100 * intensityFall).toFixed(0)}% fall</b> by 2060.</>
              : <>Rising: material per dollar does not improve at all here.</>}{' '}
            Over 1970–2024 it fell {(100 * Math.abs(past.intensity)).toFixed(2)}% a year, and
            material use still rose {Math.pow(1 + past.material, 54).toFixed(1)}-fold: the other
            two terms rose faster. This rail runs a quarter past each end of the range the paper
            sampled, so it can be asked for more than anyone has proposed.
          </>
        }
      />

      <p className="mat-identity">
        <span>Population {pct(now.pop)}</span>
        <b>×</b>
        <span>income {pct(now.gdppc)}</span>
        <b>×</b>
        <span>intensity {pct(now.intensity)}</span>
        <b>=</b>
        <span className={now.material < 0 ? 'good' : undefined}>
          <b>material {pct(now.material)} a year</b>
        </span>
      </p>
      <p className="mat-identity mat-identity-past">
        <span>1970–2024: population {pct(past.pop)}</span>
        <b>×</b>
        <span>income {pct(past.gdppc)}</span>
        <b>×</b>
        <span>intensity {pct(past.intensity)}</span>
        <b>=</b>
        <span><b>material {pct(past.material)} a year</b></span>
      </p>
      <p className="mat-drivers-note">
        Exactly, not approximately: the three terms are defined so that they multiply to the
        fourth. Nothing else in the model can move world material use except through one of them.
        {warmingNote() && (
          <>
            {' '}The SSP sets the economy, not the energy policy, so each spans a wide range of
            2100 warming: {warmingNote()}.
          </>
        )}
      </p>
    </div>
  );
}
