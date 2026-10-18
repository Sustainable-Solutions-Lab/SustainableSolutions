/**
 * The panel behind the intensity slider: every assumption it summarises.
 *
 * It opens under the intensity slider, the way the magnet explorer's facility
 * detail opens under its demand slider. The sliders here are the main ones in
 * small: a heat-coloured number with what it was in 2024 beneath it, and the
 * explanation behind the (i). Two to a row on a phone, so the panel stays
 * short. Every group resets on its own, and nothing is ever greyed out.
 *
 * It holds only what acts on the material in focus: biomass has no recycling
 * rate and fossil fuels no ore grade, so with either chosen those groups are
 * left out rather than shown doing nothing.
 */
import type { ReactNode } from 'react';
import Slider, { type Tick } from '../magnets/Slider';
import { Readout, SNAP, heat } from './Drivers';
import {
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  LIFETIME_GROUP_LABEL,
  defaultLevers,
  leverDraw,
  leverWorldValue,
  resolveSsp,
  type GroupKey,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';
import { GROUP_LEVER } from './focus';

export type SspBlend = ReturnType<typeof resolveSsp>;

function Group({ title, onReset, children }: { title: string; onReset: () => void; children: ReactNode }) {
  return (
    <section className="mat-group">
      <div className="mat-group-head">
        <h4>{title}</h4>
        <button type="button" onClick={onReset} className="mat-reset">reset</button>
      </div>
      <div className="mat-group-grid">{children}</div>
    </section>
  );
}

/** A compact slider in the main ones' style: heat-coloured value, a line under it. */
function Small({ label, value, min, max, step, onChange, fmt, unit, level, desc, ticks }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string; unit?: string; level?: ReactNode; desc?: string;
  ticks?: Tick[];
}) {
  return (
    <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange}
      fmt={fmt} desc={desc} ticks={ticks} snap={ticks?.length ? SNAP : undefined}
      readout={<Readout size="sm" main={fmt(value)} unit={unit} level={level} color={heat(value, min, max)} />} />
  );
}

/** Where each SSP sits on an intensity rail, and the rail that holds them all. */
function IntensitySlider({
  lever,
  inputs,
  draw,
  blend,
  targetYear,
  onChange,
}: {
  lever: IntensityLever;
  inputs: ModelInputs;
  draw: number;
  blend: SspBlend;
  targetYear: number;
  onChange: (u: number) => void;
}) {
  const spec = INTENSITY_LEVERS[lever];
  const base = leverWorldValue(inputs, lever, 0, blend).base;
  const a = leverWorldValue(inputs, lever, 0, blend).value;
  const b = leverWorldValue(inputs, lever, 1, blend).value;
  const value = leverWorldValue(inputs, lever, draw, blend).value;

  // The rail is the sampled range for the SSP blend showing, and nothing
  // else: the SSPs carry no intensity endpoint of their own in this model.
  const ends = [a, b, value];
  const min = Math.min(...ends);
  const max = Math.max(...ends);
  const span = max - min || 1;

  const digits = Math.max(a, b) >= 1 ? 2 : 3;
  const fmt = (v: number) => v.toFixed(digits);
  const change = base > 0 ? (100 * (value - base)) / base : null;

  // Where the measured trend would carry this intensity by the target year:
  // the same 1988-2024 reference the main sliders tick, in this rail's units.
  const hist = inputs.intensityHistRate;
  const r = hist?.[lever];
  const trend = r == null || !hist ? null : base * Math.pow(1 + r, targetYear - 2024);
  const ticks: Tick[] = trend != null && trend >= min && trend <= max
    ? [{ at: trend, label: `${hist!.from}–${hist!.to} trend`, strong: true }]
    : [];

  return (
    <Small
      label={spec.label}
      value={value}
      min={min}
      max={max}
      step={span / 200}
      onChange={(v) => onChange(leverDraw(inputs, lever, v, blend))}
      fmt={fmt}
      ticks={ticks}
      unit={` ${spec.unit.replace(/ of GDP$/, '')}`}
      level={change == null ? undefined : `from ${fmt(base)} (${change >= 0 ? '+' : ''}${change.toFixed(0)}%)`}
      desc={
        (spec.flows.length
          ? 'Intensity of consumption: kilograms used per dollar of output. Left means a world that needs less of this material for the same output.'
          : 'Intensity of stock: kilograms held in use per dollar of output. Consumption follows from it, since stock has to be built and then replaced as it retires.')
        + ` Reached by the target year from ${fmt(base)} in 2024. The strong tick is where the ${hist ? `${hist.from}–${hist.to}` : 'measured'} rate of change (${r == null ? 'n/a' : `${r >= 0 ? '+' : '−'}${Math.abs(100 * r).toFixed(2)}% a year`}) would carry it by then. Sets the target for ${spec.flows.length ? `${spec.flows.length} materials` : `${spec.stocks.length} end uses`}; each region keeps its own range.`
      }
    />
  );
}

export default function Controls({
  inputs,
  levers,
  blend,
  intensityDraw,
  group,
  leaf,
  onChange,
}: {
  inputs: ModelInputs;
  levers: Levers;
  blend: SspBlend;
  /** The material in focus: only what acts on it is shown. */
  group: GroupKey | 'total';
  leaf: string | null;
  /** The draw each intensity rail should show, scenario-aware. */
  intensityDraw: (lever: IntensityLever) => number;
  onChange: (change: (l: Levers) => void) => void;
}) {
  const d = defaultLevers(inputs);
  const p = (name: string) => inputs.mcParams[name];

  const all = group === 'total';
  const metals = all || group === 'metal_ores';
  const minerals = all || group === 'nonmetallic_minerals';
  const ferrous = metals && leaf !== 'Non-ferrous ores';
  const nonFerrous = metals && leaf !== 'Ferrous ores';
  const stocks = metals || minerals;
  const efficiency = all ? INTENSITY_LEVER_KEYS : [GROUP_LEVER[group]];

  const resetIntensity = () =>
    onChange((l) => {
      l.flowIntensityU = {};
      l.stockIntensityU = {};
    });

  return (
    <div className="mat-controls">
      <Group
        title="Material efficiency"
        onReset={resetIntensity}
      >
        {efficiency.map((lever) => (
          <IntensitySlider
            key={lever}
            lever={lever}
            inputs={inputs}
            draw={intensityDraw(lever)}
            blend={blend}
            targetYear={levers.targetYear}
            onChange={(u) =>
              onChange((l) => {
                const spec = INTENSITY_LEVERS[lever];
                l.flowIntensityU = { ...l.flowIntensityU };
                l.stockIntensityU = { ...l.stockIntensityU };
                for (const k of spec.flows) l.flowIntensityU[k] = u;
                for (const [g, su] of spec.stocks) {
                  l.stockIntensityU[g] = { ...l.stockIntensityU[g], [su]: u };
                }
              })
            }
          />
        ))}
      </Group>

      {stocks && <Group
        title="Circularity"
        onReset={() =>
          onChange((l) => {
            l.recyclingFe = d.recyclingFe;
            l.recyclingNonFe = d.recyclingNonFe;
            l.downcycling = d.downcycling;
          })
        }
      >
        {ferrous && <Small
          label="Iron and steel recovered"
          value={levers.recyclingFe}
          min={p('RECYCLING_RATE_FE').min}
          max={p('RECYCLING_RATE_FE').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.recyclingFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          level={`from ${(100 * worldRate(inputs, 'fe')).toFixed(0)}% today`}
          desc="Share of retiring iron and steel collected and used again, reached by the convergence year. Each region ramps from its own rate today, from 45% in Latin America to 75% in Europe."
        />}
        {nonFerrous && <Small
          label="Other metals recovered"
          value={levers.recyclingNonFe}
          min={p('RECYCLING_RATE_NONFE').min}
          max={p('RECYCLING_RATE_NONFE').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.recyclingNonFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          level={`from ${(100 * worldRate(inputs, 'nonfe')).toFixed(0)}% today`}
          desc="Aluminium, copper and the rest, pooled. A tonne of recycled metal displaces a tonne of mined metal, and far more than a tonne of ore, because the ore saved is the tonne divided by its grade."
        />}
        {minerals && <Small
          label="Minerals reused"
          value={levers.downcycling}
          min={p('DOWNCYCLING').min}
          max={p('DOWNCYCLING').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.downcycling = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          level={`from ${(100 * worldDown(inputs)).toFixed(0)}% today`}
          desc="Concrete and aggregate recovered from demolition. It loses quality, so it can only re-enter buildings and civil works up to a capped share; the top of this rail buys less than the top of the others."
        />}
      </Group>}

      {metals && <Group
        title="Ore grade in 2060"
        onReset={() =>
          onChange((l) => {
            l.gradeOreFe = d.gradeOreFe;
            l.gradeOreNonFe = d.gradeOreNonFe;
          })
        }
      >
        {ferrous && <Small
          label="Iron ore"
          value={levers.gradeOreFe}
          min={p('GRADE_ORE_FE').min}
          max={p('GRADE_ORE_FE').max}
          step={0.005}
          onChange={(v) => onChange((l) => (l.gradeOreFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          level={`from ${(100 * inputs.gradeOre2024.fe).toFixed(0)}% today`}
          desc="Metal per tonne of rock. Left is depletion, right is better deposits or better recovery: as grade falls, the same metal takes more mining."
        />}
        {nonFerrous && <Small
          label="Other metal ores"
          value={levers.gradeOreNonFe}
          min={p('GRADE_ORE_NONFE').min}
          max={p('GRADE_ORE_NONFE').max}
          step={0.0005}
          onChange={(v) => onChange((l) => (l.gradeOreNonFe = v))}
          fmt={(v) => `${(100 * v).toFixed(1)}%`}
          level={`from ${(100 * inputs.gradeOre2024.nonfe).toFixed(1)}% today`}
          desc="At 1.6%, a tonne of copper or aluminium carries about 60 tonnes of ore. This is why most of the mass counted as metal ore is non-ferrous."
        />}
      </Group>}

      <Group
        title={stocks ? 'Timing and lifetimes' : 'Timing'}
        onReset={() =>
          onChange((l) => {
            l.lifetimeU = {};
            l.targetYear = d.targetYear;
            l.convergenceYear = d.convergenceYear;
          })
        }
      >
        {stocks && <Small
          label="How long things last"
          value={levers.lifetimeU.buildings?.mean ?? 0.5}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) =>
            onChange((l) => {
              l.lifetimeU = {
                buildings: { mean: v, k: 0.5 },
                civil_infrastructure: { mean: v, k: 0.5 },
                machinery: { mean: v, k: 0.5 },
                short_lived: { mean: v, k: 0.5 },
              };
            })
          }
          fmt={(v) => (v < 0.49 ? 'shorter' : v > 0.51 ? 'longer' : 'as published')}
          desc={`Moves every product's mean lifetime inside its published range at once: ${Object.values(LIFETIME_GROUP_LABEL).join(', ').toLowerCase()}. Longer lifetimes slow replacement, and slow the scrap supply recycling depends on.`}
        />}
        <Small
          label="Efficiency reached by"
          value={levers.targetYear}
          min={p('TARGET_YEAR').min}
          max={p('TARGET_YEAR').max}
          step={1}
          onChange={(v) => onChange((l) => (l.targetYear = Math.round(v)))}
          fmt={(v) => String(Math.round(v))}
          desc="Intensity eases from its 2024 value to the target by this year, then holds."
        />
        {stocks && <Small
          label="Recovery reached by"
          value={levers.convergenceYear}
          min={p('RECYC_CONVERGENCE_YR').min}
          max={p('RECYC_CONVERGENCE_YR').max}
          step={1}
          onChange={(v) => onChange((l) => (l.convergenceYear = Math.round(v)))}
          fmt={(v) => String(Math.round(v))}
          desc="Recycling and reuse ease from today's regional rates to the chosen ones by this year."
        />}
      </Group>
    </div>
  );
}

/** GDP-weighted present-day recovery rate, for the "today" note. */
function worldRate(inputs: ModelInputs, which: 'fe' | 'nonfe'): number {
  let num = 0;
  let den = 0;
  for (const r of inputs.regions) {
    const w = inputs.gdp2024[r] ?? 0;
    num += w * (inputs.recyclingNow[which][r] ?? 0);
    den += w;
  }
  return den > 0 ? num / den : 0;
}

function worldDown(inputs: ModelInputs): number {
  let num = 0;
  let den = 0;
  for (const r of inputs.regions) {
    const w = inputs.gdp2024[r] ?? 0;
    num += w * (inputs.downcyclingNow[r] ?? 0);
    den += w;
  }
  return den > 0 ? num / den : 0;
}
