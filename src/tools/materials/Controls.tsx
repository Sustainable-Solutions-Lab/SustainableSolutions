/**
 * The advanced panel: every assumption the three driver sliders summarise.
 *
 * It slides open under the first figure, the way the magnet explorer's facility
 * detail opens under its demand slider. The three sliders above are the whole
 * model at the level of the Kaya identity; everything here is one of the ways
 * the intensity term is actually made — by material, by end use, by what comes
 * back at end of life, by how long things last.
 *
 * The first version put these in a narrow rail as bare knobs. A knob with a
 * number on it is not an assumption anyone can judge, so every control here
 * carries three things: what it means in a sentence, where it starts from
 * today, and where each SSP would put it. Every group resets on its own, and
 * nothing is ever greyed out — a control that cannot bite says so in words.
 */
import type { ReactNode } from 'react';
import Slider, { type Tick } from '../magnets/Slider';
import {
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  LIFETIME_GROUP_LABEL,
  defaultLevers,
  leverDraw,
  leverSspValue,
  leverWorldValue,
  resolveSsp,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';

export type SspBlend = ReturnType<typeof resolveSsp>;

function Group({
  title,
  lede,
  onReset,
  children,
}: {
  title: string;
  lede: ReactNode;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h4 style={{ font: '600 11px var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', margin: 0 }}>
          {title}
        </h4>
        <button type="button" onClick={onReset} className="mat-reset">reset</button>
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-2)', margin: '0 0 2px' }}>{lede}</p>
      {children}
    </section>
  );
}

/** Where each SSP sits on an intensity rail, and the rail that holds them all. */
function IntensitySlider({
  lever,
  inputs,
  draw,
  blend,
  onChange,
}: {
  lever: IntensityLever;
  inputs: ModelInputs;
  draw: number;
  blend: SspBlend;
  onChange: (u: number) => void;
}) {
  const spec = INTENSITY_LEVERS[lever];
  const base = leverWorldValue(inputs, lever, 0, blend).base;
  const a = leverWorldValue(inputs, lever, 0, blend).value;
  const b = leverWorldValue(inputs, lever, 1, blend).value;
  const value = leverWorldValue(inputs, lever, draw, blend).value;

  const marks = inputs.sspSampled
    .map((ssp) => ({ ssp, v: leverSspValue(inputs, lever, ssp) }))
    .filter((m): m is { ssp: string; v: number } => m.v != null)
    .sort((x, y) => x.v - y.v);
  const ends = [a, b, ...marks.map((m) => m.v), value];
  const min = Math.min(...ends);
  const max = Math.max(...ends);
  const span = max - min || 1;
  const ticks: Tick[] = marks.map((m, i) => ({
    at: m.v,
    label: m.ssp,
    low: i > 0 && Math.abs(m.v - marks[i - 1].v) / span < 0.1,
  }));

  const digits = Math.max(a, b) >= 1 ? 2 : 3;
  const fmt = (v: number) => v.toFixed(digits);
  const change = base > 0 ? (100 * (value - base)) / base : null;

  return (
    <Slider
      label={spec.label}
      value={value}
      min={min}
      max={max}
      step={span / 200}
      onChange={(v) => onChange(leverDraw(inputs, lever, v, blend))}
      fmt={fmt}
      aside={spec.unit}
      ticks={ticks}
      note={
        change == null ? undefined : (
          <>
            <b>{fmt(base)}</b> today → <b>{fmt(value)}</b> by the target year
            {' '}({change >= 0 ? '+' : ''}{change.toFixed(0)}%). Sets the target for{' '}
            {spec.flows.length ? `${spec.flows.length} materials` : `${spec.stocks.length} end uses`};
            each region keeps its own range.
          </>
        )
      }
      desc={
        spec.flows.length
          ? 'Intensity of consumption: kilograms used per dollar of output. Left means a world that needs less of this material for the same output.'
          : 'Intensity of stock: kilograms held in use per dollar of output. Consumption follows from it, since stock has to be built and then replaced as it retires.'
      }
    />
  );
}

export default function Controls({
  inputs,
  levers,
  blend,
  intensityDraw,
  onChange,
}: {
  inputs: ModelInputs;
  levers: Levers;
  blend: SspBlend;
  /** The draw each intensity rail should show, scenario-aware. */
  intensityDraw: (lever: IntensityLever) => number;
  onChange: (change: (l: Levers) => void) => void;
}) {
  const d = defaultLevers(inputs);
  const p = (name: string) => inputs.mcParams[name];

  const resetIntensity = () =>
    onChange((l) => {
      l.flowEndpoint = undefined;
      l.stockEndpoint = undefined;
      l.flowIntensityU = {};
      l.stockIntensityU = {};
    });

  return (
    <div className="mat-controls">
      <Group
        title="Material efficiency"
        lede="How much material a dollar of output needs. Flows are consumed outright; stocks stay in use and have to be replaced as they retire."
        onReset={resetIntensity}
      >
        {INTENSITY_LEVER_KEYS.map((lever) => (
          <IntensitySlider
            key={lever}
            lever={lever}
            inputs={inputs}
            draw={intensityDraw(lever)}
            blend={blend}
            onChange={(u) =>
              onChange((l) => {
                const spec = INTENSITY_LEVERS[lever];
                l.flowEndpoint = undefined;
                l.stockEndpoint = undefined;
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

      <Group
        title="Circularity"
        lede="What comes back. Metal recycles without losing quality; concrete and aggregate come back as a lower grade of the same thing, and only where that grade can be used."
        onReset={() =>
          onChange((l) => {
            l.recyclingFe = d.recyclingFe;
            l.recyclingNonFe = d.recyclingNonFe;
            l.downcycling = d.downcycling;
          })
        }
      >
        <Slider
          label="Iron and steel recovered"
          value={levers.recyclingFe}
          min={p('RECYCLING_RATE_FE').min}
          max={p('RECYCLING_RATE_FE').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.recyclingFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          aside="of what retires"
          note={`Today: ${(100 * worldRate(inputs, 'fe')).toFixed(0)}% across regions, from 45% in Latin America to 75% in Europe. The SSPs do not differentiate recovery, so there are no SSP marks here.`}
          desc="Share of retiring iron and steel collected and used again, reached by the convergence year. Each region ramps from its own rate today."
        />
        <Slider
          label="Other metals recovered"
          value={levers.recyclingNonFe}
          min={p('RECYCLING_RATE_NONFE').min}
          max={p('RECYCLING_RATE_NONFE').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.recyclingNonFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          aside="of what retires"
          note={`Today: ${(100 * worldRate(inputs, 'nonfe')).toFixed(0)}%. A tonne of recycled metal displaces a tonne of mined metal, and far more than a tonne of ore, because the ore saved is the tonne divided by its grade.`}
          desc="Aluminium, copper and the rest, pooled."
        />
        <Slider
          label="Minerals reused after demolition"
          value={levers.downcycling}
          min={p('DOWNCYCLING').min}
          max={p('DOWNCYCLING').max}
          step={0.01}
          onChange={(v) => onChange((l) => (l.downcycling = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          aside="of what retires"
          note={`Today: ${(100 * worldDown(inputs)).toFixed(0)}%. Capped by what roads and new concrete can absorb, so the top of this rail buys less than the top of the others.`}
          desc="Concrete and aggregate recovered from demolition. It loses quality, so it can only re-enter buildings and civil works up to a capped share; the surplus has nowhere to go."
        />
      </Group>

      <Group
        title="Ore grade"
        lede="Metal per tonne of rock. This is the rock-to-metal ratio seen from the other side: as grade falls, the same metal takes more mining."
        onReset={() =>
          onChange((l) => {
            l.gradeOreFe = d.gradeOreFe;
            l.gradeOreNonFe = d.gradeOreNonFe;
          })
        }
      >
        <Slider
          label="Iron ore grade in 2060"
          value={levers.gradeOreFe}
          min={p('GRADE_ORE_FE').min}
          max={p('GRADE_ORE_FE').max}
          step={0.005}
          onChange={(v) => onChange((l) => (l.gradeOreFe = v))}
          fmt={(v) => `${(100 * v).toFixed(0)}%`}
          aside={`from ${(100 * inputs.gradeOre2024.fe).toFixed(0)}% today`}
          note="Left is depletion, right is better deposits or better recovery."
        />
        <Slider
          label="Other metal ore grade in 2060"
          value={levers.gradeOreNonFe}
          min={p('GRADE_ORE_NONFE').min}
          max={p('GRADE_ORE_NONFE').max}
          step={0.0005}
          onChange={(v) => onChange((l) => (l.gradeOreNonFe = v))}
          fmt={(v) => `${(100 * v).toFixed(1)}%`}
          aside={`from ${(100 * inputs.gradeOre2024.nonfe).toFixed(1)}% today`}
          note="At 1.6%, a tonne of copper or aluminium carries about 60 tonnes of ore. This is why most of the mass counted as metal ore is non-ferrous."
        />
      </Group>

      <Group
        title="Timing and lifetimes"
        lede="How long things stay in use, and how fast the rest of these assumptions arrive."
        onReset={() =>
          onChange((l) => {
            l.lifetimeU = {};
            l.targetYear = d.targetYear;
            l.convergenceYear = d.convergenceYear;
          })
        }
      >
        <Slider
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
          note={`Moves every product's mean lifetime inside its published range at once: ${Object.values(LIFETIME_GROUP_LABEL).join(', ').toLowerCase()}. Longer lifetimes slow replacement — and slow the scrap supply recycling depends on.`}
        />
        <Slider
          label="Efficiency targets reached by"
          value={levers.targetYear}
          min={p('TARGET_YEAR').min}
          max={p('TARGET_YEAR').max}
          step={1}
          onChange={(v) => onChange((l) => (l.targetYear = Math.round(v)))}
          fmt={(v) => String(Math.round(v))}
          note="Intensity eases from its 2024 value to the target by this year, then holds."
        />
        <Slider
          label="Recovery rates reached by"
          value={levers.convergenceYear}
          min={p('RECYC_CONVERGENCE_YR').min}
          max={p('RECYC_CONVERGENCE_YR').max}
          step={1}
          onChange={(v) => onChange((l) => (l.convergenceYear = Math.round(v)))}
          fmt={(v) => String(Math.round(v))}
          note="Recycling and reuse ease from today's regional rates to the chosen ones by this year."
        />
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
