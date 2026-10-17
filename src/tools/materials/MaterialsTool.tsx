/**
 * Material use to 2060 — the companion tool to Busch et al.
 *
 * The question the paper asks is whether anything we might plausibly do bends
 * material use down. So the tool puts the paper's own levers in reach and
 * reprojects while you move them: the model runs here, in the browser, not as
 * a lookup over precomputed cases.
 *
 * The paper's 1,000 Monte Carlo runs sit behind your line as a band. That is
 * the whole argument in one picture — the band stays above today's level
 * however the levers are set, and you can go looking for the corner where it
 * does not.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Slider, { followTouches, type Tick } from '../magnets/Slider';
import ProjectionChart, { type Band } from './ProjectionChart';
import {
  GROUP_KEYS,
  GROUP_LABEL,
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  LIFETIME_GROUP_LABEL,
  customLeversFromSsp,
  defaultLevers,
  leverDraw,
  leverSspValue,
  leverWorldValue,
  resolveSsp,
  runModel,
  sspLevers,
  sspPositions,
  type GroupKey,
  type IntensityLever,
  type Levers,
  type ModelInputs,
} from './model';

const BASE = '/tools/materials';

type Measure = 'consumption' | 'perCapita' | 'intensity';
type MaterialChoice = 'total' | GroupKey;
type Scenario = { kind: 'ssp'; ssp: string } | { kind: 'custom'; levers: Levers };

const MEASURE_LABEL: Record<Measure, string> = {
  consumption: 'Consumption',
  perCapita: 'Per person',
  intensity: 'Per dollar of GDP',
};

/** Projection group -> the group id the historical layer uses. */
const HISTORY_GROUP: Record<GroupKey, string> = {
  biomass: 'biomass',
  fossil_fuels: 'fossil',
  metal_ores: 'metal',
  nonmetallic_minerals: 'nonmetallic',
};

interface Meta {
  years: number[];
  regions: string[];
  groups: { id: string; label: string; members: string[] }[];
  source: { paper: string; repo: string; built: string };
}
interface Envelope {
  years: number[];
  runs: number;
  bands: Record<string, Record<string, Record<Measure, Band>>>;
  worldGrowth: number[];
  growthShareAbove: number;
}
interface FlowsWorld {
  years: number[];
  materials: Record<string, number[]>;
}
interface FlowsRegions {
  years: number[];
  regions: Record<string, Record<string, number[]>>;
}
interface GdpPop {
  years: number[];
  gdp: Record<string, number[]>;
  population: Record<string, number[]>;
}

const fetchJson = async <T,>(name: string): Promise<T> => {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
};

// ── Shareable state ─────────────────────────────────────────────────────────
// The whole view — scenario, place, material, measure — rides in the URL hash,
// so a link carries exactly what someone was looking at, custom sliders and all.

interface ViewState {
  scenario: Scenario;
  place: string;
  material: MaterialChoice;
  measure: Measure;
}

const encodeState = (v: ViewState): string => {
  const json = JSON.stringify(v);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decodeState = (hash: string): ViewState | null => {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes)) as ViewState;
    return v && v.scenario && v.place ? v : null;
  } catch {
    return null;
  }
};

export default function MaterialsTool() {
  const [data, setData] = useState<{
    meta: Meta;
    inputs: ModelInputs;
    envelope: Envelope;
    world: FlowsWorld;
    regions: FlowsRegions;
    gdpPop: GdpPop;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<Meta>('meta.json'),
      fetchJson<ModelInputs>('model-inputs.json'),
      fetchJson<Envelope>('envelope.json'),
      fetchJson<FlowsWorld>('flows-world.json'),
      fetchJson<FlowsRegions>('flows-regions.json'),
      fetchJson<GdpPop>('gdp-pop.json'),
    ])
      .then(([meta, inputs, envelope, world, regions, gdpPop]) =>
        setData({ meta, inputs, envelope, world, regions, gdpPop }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontSize: 13 }}>
        Could not load the model data ({error}).
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-3)' }}>Loading the model…</div>
    );
  }
  return <Tool {...data} />;
}

function Tool({
  meta,
  inputs,
  envelope,
  world,
  regions,
  gdpPop,
}: {
  meta: Meta;
  inputs: ModelInputs;
  envelope: Envelope;
  world: FlowsWorld;
  regions: FlowsRegions;
  gdpPop: GdpPop;
}) {
  const initial = useMemo(
    () => (typeof location === 'undefined' ? null : decodeState(location.hash.slice(1))),
    [],
  );
  const [scenario, setScenario] = useState<Scenario>(initial?.scenario ?? { kind: 'ssp', ssp: 'SSP2' });
  const [place, setPlace] = useState(initial?.place ?? 'World');
  const [material, setMaterial] = useState<MaterialChoice>(initial?.material ?? 'total');
  const [measure, setMeasure] = useState<Measure>(initial?.measure ?? 'consumption');
  const [advanced, setAdvanced] = useState(false);
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = `#${encodeState({ scenario, place, material, measure })}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  }, [scenario, place, material, measure]);

  // Touch handling for every slider in the rail, as in the magnet explorer.
  useEffect(() => {
    const el = rail.current;
    return el ? followTouches(el) : undefined;
  }, []);

  const levers = useMemo<Levers>(
    () => (scenario.kind === 'ssp' ? sspLevers(inputs, scenario.ssp) : scenario.levers),
    [scenario, inputs],
  );
  // Running the model is a few tens of milliseconds, so the slider keeps its
  // own value immediately and the projection catches up a frame later.
  const shown = useDeferredValue(levers);
  const run = useMemo(() => runModel(inputs, shown), [inputs, shown]);
  const blend = useMemo(() => resolveSsp(inputs, shown.sspU), [inputs, shown.sspU]);
  const sspAt = useMemo(() => sspPositions(inputs), [inputs]);

  /** Edits always land in custom mode, seeded so nothing jumps on the first drag. */
  const edit = (change: (l: Levers) => void) => {
    setScenario((prev) => {
      const next =
        prev.kind === 'ssp'
          ? customLeversFromSsp(inputs, prev.ssp)
          : ({ ...prev.levers } as Levers);
      change(next);
      return { kind: 'custom', levers: next };
    });
  };

  // ── Series ────────────────────────────────────────────────────────────────
  const groupsForChoice: GroupKey[] = material === 'total' ? GROUP_KEYS : [material];

  const historySeries = useMemo(() => {
    const byId = new Map(meta.groups.map((g) => [g.id, g.members]));
    const source = place === 'World' ? world.materials : regions.regions[place];
    const years = world.years;
    const mass = years.map(() => 0);
    let any = false;
    for (const group of groupsForChoice) {
      for (const member of byId.get(HISTORY_GROUP[group]) ?? []) {
        const series = source?.[member];
        if (!series) continue;
        any = true;
        for (let i = 0; i < years.length; i++) mass[i] += series[i] ?? 0;
      }
    }
    if (!any) return { years, values: years.map(() => null as number | null) };
    const pop = gdpPop.population[place];
    const gdp = gdpPop.gdp[place];
    const values = years.map((_, i) => {
      if (measure === 'consumption') return mass[i];
      if (measure === 'perCapita') return pop?.[i] ? (mass[i] * 1e6) / pop[i] : null;
      return gdp?.[i] ? (mass[i] * 1e9) / gdp[i] : null;
    });
    return { years, values };
  }, [meta, world, regions, gdpPop, place, material, measure]);

  const scenarioSeries = useMemo(() => {
    const n = run.years.length;
    const mass = new Float64Array(n);
    for (const group of groupsForChoice) {
      const series =
        place === 'World' ? run.primary.byGroup[group] : run.primary.byRegionGroup[place]?.[group];
      if (series) for (let i = 0; i < n; i++) mass[i] += series[i];
    }
    const pop = place === 'World' ? run.population : run.popByRegion[place];
    const gdp = place === 'World' ? run.gdp : run.gdpByRegion[place];
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      out[i] =
        measure === 'consumption'
          ? mass[i]
          : measure === 'perCapita'
            ? (mass[i] * 1e6) / pop[i]
            : (mass[i] * 1e9) / gdp[i];
    }
    return out;
  }, [run, place, material, measure]);

  const band = envelope.bands[place]?.[material === 'total' ? 'total' : material]?.[measure] ?? null;

  // ── Units ─────────────────────────────────────────────────────────────────
  const peak = Math.max(
    ...scenarioSeries,
    ...(band ? band.max : []),
    ...historySeries.values.map((v) => v ?? 0),
  );
  const unit =
    measure === 'consumption'
      ? peak >= 2000
        ? 'Gt per year'
        : 'Mt per year'
      : measure === 'perCapita'
        ? 't per person per year'
        : 'kg per $ of GDP';
  const scaleOut = measure === 'consumption' && peak >= 2000 ? 1 / 1000 : 1;
  // Everything handed to the chart is already in display units, so the
  // formatter must not scale again. Decimals come from the size of the axis,
  // not of each value, or a zero prints as 0.00 beside a bare 300.
  const top = peak * scaleOut;
  const digits = top >= 100 ? 0 : top >= 10 ? 1 : top >= 1 ? 2 : 3;
  const format = (x: number) => x.toFixed(digits);

  // ── Verdict ───────────────────────────────────────────────────────────────
  const first = scenarioSeries[0];
  const last = scenarioSeries[scenarioSeries.length - 1];
  const growth = first > 0 && last > 0 ? Math.pow(last / first, 1 / 35) - 1 : null;
  const ratio = first > 0 ? last / first : null;

  const worldFirst = run.primary.total[0];
  const worldLast = run.primary.total[run.primary.total.length - 1];
  const worldGrowth =
    worldFirst > 0 && worldLast > 0 ? Math.pow(worldLast / worldFirst, 1 / 35) - 1 : null;
  const percentile =
    worldGrowth == null
      ? null
      : envelope.worldGrowth.filter((g) => g < worldGrowth).length / envelope.worldGrowth.length;

  const scenarioLabel =
    scenario.kind === 'ssp' ? `${scenario.ssp} as the paper sets it` : 'Your assumptions';

  return (
    <div className="materials-tool" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <header style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px' }}>
          <h1 style={{ font: '600 17px/1.2 var(--font-sans, inherit)', margin: 0 }}>
            Will material use keep growing?
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', maxWidth: 'none' }}>
            Set the assumptions yourself and see what the model does. In the paper’s{' '}
            {envelope.runs.toLocaleString()} runs,{' '}
            <b>{Math.round(envelope.runs * envelope.growthShareAbove).toLocaleString()} still grow</b>.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 10 }}>
          <ChipGroup
            label="Material"
            value={material}
            options={[
              { id: 'total', label: 'All four groups' },
              ...GROUP_KEYS.map((g) => ({ id: g, label: GROUP_LABEL[g] })),
            ]}
            onChange={(v) => setMaterial(v as MaterialChoice)}
          />
          <ChipGroup
            label="Where"
            value={place}
            options={[{ id: 'World', label: 'World' }, ...meta.regions.map((r) => ({ id: r, label: r }))]}
            onChange={setPlace}
          />
          <ChipGroup
            label="Measured as"
            value={measure}
            options={(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => ({
              id: m,
              label: MEASURE_LABEL[m],
            }))}
            onChange={(v) => setMeasure(v as Measure)}
          />
        </div>
      </header>

      <div className="mat-body">
        <div className="mat-chart-pane">
          <ProjectionChart
            historyYears={historySeries.years}
            history={historySeries.values.map((v) => (v == null ? null : v * scaleOut))}
            projectionYears={run.years}
            scenario={scenarioSeries.map((v) => v * scaleOut)}
            band={
              band
                ? {
                    p05: band.p05.map((v) => v * scaleOut),
                    p25: band.p25.map((v) => v * scaleOut),
                    p50: band.p50.map((v) => v * scaleOut),
                    p75: band.p75.map((v) => v * scaleOut),
                    p95: band.p95.map((v) => v * scaleOut),
                    min: band.min.map((v) => v * scaleOut),
                    max: band.max.map((v) => v * scaleOut),
                  }
                : null
            }
            unit={unit}
            scenarioLabel={scenarioLabel}
            format={format}
            caption={
              <>
                Measured domestic material consumption to 2024 (UNEP IRP), then the model from 2025.
                {material === 'total' || material === 'metal_ores' ? (
                  <>
                    {' '}
                    Metal ores step up at the seam: history reports ore as consumed, while the
                    projection reports the ore that has to be mined at the modelled grade.
                  </>
                ) : null}
                {scenario.kind === 'ssp' ? (
                  <>
                    {' '}
                    An SSP sets every assumption to that narrative at once, which the band’s runs
                    almost never do, so an SSP line can sit outside the band.
                  </>
                ) : null}
              </>
            }
          />
        </div>

        <div className="mat-rail" ref={rail}>
          <section className="mat-card">
            <h2 className="mat-card-title">Scenario</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {inputs.sspSampled.map((s) => (
                <button
                  key={s}
                  onClick={() => setScenario({ kind: 'ssp', ssp: s })}
                  className={`mat-chip${scenario.kind === 'ssp' && scenario.ssp === s ? ' on' : ''}`}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => setScenario({ kind: 'custom', levers: defaultLevers(inputs) })}
                className={`mat-chip${scenario.kind === 'custom' ? ' on' : ''}`}
              >
                Yours
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-2)', margin: 0, lineHeight: 1.45 }}>
              {scenario.kind === 'ssp'
                ? 'Each SSP uses that pathway’s population and income, and its own material-intensity target in every region. Move any control to take it from there.'
                : 'Your own assumptions. The marks under each control show where the SSPs sit.'}
              {' '}SSP4 is not here: the scenario database has a single run for it, so it has no
              range for the model to sample.
            </p>
          </section>

          <section className="mat-card">
            <h2 className="mat-card-title">What this scenario does</h2>
            <dl className="mat-readout">
              <dt>
                {material === 'total' ? 'All four groups' : GROUP_LABEL[material as GroupKey]}
                {place === 'World' ? '' : `, ${place}`}, {MEASURE_LABEL[measure].toLowerCase()}, in 2060
              </dt>
              <dd>
                {ratio == null ? '—' : `${ratio.toFixed(2)}×`} <span>2025</span>
              </dd>
              <dt>{measure === 'consumption' ? 'Growth' : 'Change'}, 2025–2060</dt>
              <dd className={growth != null && growth < 0 ? 'good' : undefined}>
                {growth == null ? '—' : `${growth >= 0 ? '+' : ''}${(100 * growth).toFixed(2)}%`}{' '}
                <span>per year</span>
              </dd>
              <dt>World GDP per person</dt>
              <dd>
                +{(100 * blend.gdppcGrowth).toFixed(2)}% <span>per year</span>
              </dd>
              <dt>World population</dt>
              <dd>
                {blend.popGrowth >= 0 ? '+' : ''}
                {(100 * blend.popGrowth).toFixed(2)}% <span>per year</span>
              </dd>
            </dl>
            <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: '8px 0 0', color: 'var(--ink-2)' }}>
              {worldGrowth == null ? null : worldGrowth > 0 ? (
                <>
                  Whatever the view above shows, world use of all four groups{' '}
                  <b>still grows, at +{(100 * worldGrowth).toFixed(2)}% a year</b>
                  {percentile != null && <> — {rank(percentile, envelope.runs)}</>}.
                </>
              ) : (
                <>
                  World use of all four groups <b>falls</b>, at {(100 * worldGrowth).toFixed(2)}% a
                  year. Only {Math.round(100 * (1 - envelope.growthShareAbove))}% of the paper’s{' '}
                  {envelope.runs.toLocaleString()} runs manage that.
                </>
              )}
            </p>
          </section>

          <section className="mat-card">
            <h2 className="mat-card-title">Growth and incomes</h2>
            <Slider
              label="Population and income pathway"
              value={shown.sspU}
              min={0}
              max={1}
              step={0.005}
              onChange={(v) => edit((l) => (l.sspU = v))}
              fmt={() => `${(100 * blend.gdppcGrowth).toFixed(2)}%/yr`}
              aside="GDP per person"
              ticks={sspTicks(sspAt)}
              desc="One control for both drivers. It slides between the slowest- and fastest-growing SSP, blending the two it falls between so that world income per person grows at the rate shown. Population follows the same blend."
              note={`World population ${blend.popGrowth >= 0 ? 'grows' : 'shrinks'} ${(100 * Math.abs(blend.popGrowth)).toFixed(2)}% a year on this pathway.`}
            />
          </section>

          <section className="mat-card">
            <h2 className="mat-card-title">Material efficiency</h2>
            <p className="mat-card-note">
              How much material each dollar of output needs by {shown.targetYear}. Flows are what gets
              consumed; stocks are what stays in use and has to be replaced.
            </p>
            {INTENSITY_LEVER_KEYS.map((lever) => (
              <IntensitySlider
                key={lever}
                lever={lever}
                inputs={inputs}
                draw={leverDrawFor(inputs, lever, scenario, shown, blend)}
                blend={blend}
                onChange={(u) =>
                  edit((l) => {
                    const spec = INTENSITY_LEVERS[lever];
                    l.flowEndpoint = undefined;
                    l.stockEndpoint = undefined;
                    for (const key of spec.flows) l.flowIntensityU = { ...l.flowIntensityU, [key]: u };
                    for (const [group, superUse] of spec.stocks) {
                      l.stockIntensityU = {
                        ...l.stockIntensityU,
                        [group]: { ...l.stockIntensityU[group], [superUse]: u },
                      };
                    }
                  })
                }
              />
            ))}
          </section>

          <section className="mat-card">
            <h2 className="mat-card-title">Circularity</h2>
            <Slider
              label="Iron and steel recovered at end of life"
              value={shown.recyclingFe}
              min={0.05}
              max={0.98}
              step={0.01}
              onChange={(v) => edit((l) => (l.recyclingFe = v))}
              fmt={(v) => `${(100 * v).toFixed(0)}%`}
              desc="Share of retired iron and steel recovered and used again, reached by the convergence year. Each region ramps from its own rate today."
              note="The SSPs do not differentiate recovery rates, so there are no marks for them here."
            />
            <Slider
              label="Other metals recovered at end of life"
              value={shown.recyclingNonFe}
              min={0.05}
              max={0.98}
              step={0.01}
              onChange={(v) => edit((l) => (l.recyclingNonFe = v))}
              fmt={(v) => `${(100 * v).toFixed(0)}%`}
              desc="Aluminium, copper and the rest. Recycled metal displaces mined ore one tonne for one tonne, so a tonne recovered is a tonne of ore not dug — divided by the grade, which is why the ore saving is larger than the metal."
            />
            <Slider
              label="Minerals reused after demolition"
              value={shown.downcycling}
              min={0.05}
              max={0.98}
              step={0.01}
              onChange={(v) => edit((l) => (l.downcycling = v))}
              fmt={(v) => `${(100 * v).toFixed(0)}%`}
              desc="Concrete and aggregate recovered from demolition. It loses quality, so it can only go back into buildings and civil works up to a capped share, and the surplus has nowhere to go."
              note="Capped at what roads and new concrete can absorb, so pushing this to the top does less than it looks."
            />
          </section>

          <section className="mat-card">
            <h2 className="mat-card-title">Ore grade</h2>
            <p className="mat-card-note">
              Metal per tonne of rock. Falling grade means more ore for the same metal, which is why
              metal ores grow even where metal demand does not.
            </p>
            <Slider
              label="Iron ore grade in 2060"
              value={shown.gradeOreFe}
              min={0.2}
              max={0.55}
              step={0.005}
              onChange={(v) => edit((l) => (l.gradeOreFe = v))}
              fmt={(v) => `${(100 * v).toFixed(0)}%`}
              aside="from 40% today"
            />
            <Slider
              label="Other metal ore grade in 2060"
              value={shown.gradeOreNonFe}
              min={0.008}
              max={0.02}
              step={0.0005}
              onChange={(v) => edit((l) => (l.gradeOreNonFe = v))}
              fmt={(v) => `${(100 * v).toFixed(1)}%`}
              aside="from 1.6% today"
            />
          </section>

          <section className="mat-card">
            <button className="mat-more" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
              {advanced ? 'Fewer controls' : 'Lifetimes and timing'}
            </button>
            {advanced && (
              <div style={{ marginTop: 10 }}>
                <Slider
                  label="How long things last"
                  value={shown.lifetimeU.buildings?.mean ?? 0.5}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) =>
                    edit((l) => {
                      l.lifetimeU = {
                        buildings: { mean: v, k: 0.5 },
                        civil_infrastructure: { mean: v, k: 0.5 },
                        machinery: { mean: v, k: 0.5 },
                        short_lived: { mean: v, k: 0.5 },
                      };
                    })
                  }
                  fmt={(v) => (v < 0.5 ? 'shorter' : v > 0.5 ? 'longer' : 'as published')}
                  desc={`Moves every product's mean lifetime within its published range at once: ${Object.values(
                    LIFETIME_GROUP_LABEL,
                  )
                    .join(', ')
                    .toLowerCase()}. Longer lifetimes slow replacement, but they also slow the scrap supply that recycling depends on.`}
                />
                <Slider
                  label="Intensity targets reached by"
                  value={shown.targetYear}
                  min={2040}
                  max={2060}
                  step={1}
                  onChange={(v) => edit((l) => (l.targetYear = Math.round(v)))}
                  fmt={(v) => String(Math.round(v))}
                  desc="Intensity eases from its 2024 value to the target by this year, then holds."
                />
                <Slider
                  label="Recovery rates reached by"
                  value={shown.convergenceYear}
                  min={2035}
                  max={2055}
                  step={1}
                  onChange={(v) => edit((l) => (l.convergenceYear = Math.round(v)))}
                  fmt={(v) => String(Math.round(v))}
                  desc="Recycling and reuse rates ease from today's regional rates to the chosen ones by this year."
                />
              </div>
            )}
          </section>
        </div>
      </div>

      <footer className="mat-footer">
        <a
          href={meta.source.repo}
          target="_blank"
          rel="noopener noreferrer"
          className="mat-footer-link"
        >
          <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>
            Model code on GitHub{' '}
            <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)' }}>material-intensity ↗</span>
          </span>
        </a>
        <p className="mat-footer-note">
          Companion to Busch, Caldeira and Davis, <i>Global material consumption persists despite
          intensity gains and circularity</i>. The model runs in your browser and reproduces the
          paper’s published runs: biomass and fossil fuels exactly, metal ores about 4% low because
          electricity generation and storage are carried inside civil infrastructure here rather than
          modelled as their own stock.
        </p>
        <a
          href="https://steer-stanford.webflow.io/"
          target="_blank"
          rel="noopener noreferrer"
          title="STEER — Stanford"
          aria-label="STEER at Stanford (opens in new tab)"
          className="mat-footer-steer"
        >
          <img className="steer-light-bg" src="/logos/steer/STEER-forweb-light.png" alt="STEER — Stanford" height={18} />
          <img className="steer-dark-bg" src="/logos/steer/STEER-forweb-dark.png" alt="STEER — Stanford" height={18} />
          <span aria-hidden="true" style={{ fontSize: 11 }}>↗</span>
        </a>
        <p className="mat-footer-note dim">
          Developed by{' '}
          <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer">
            STEER
          </a>{' '}
          at Stanford. <a href={`${BASE}/data`}>Full data explorer →</a>
        </p>
      </footer>
    </div>
  );
}

/** Where a scenario's growth sits among the paper's runs, said the short way. */
function rank(percentile: number, runs: number): string {
  const n = runs.toLocaleString();
  return percentile >= 0.5
    ? `faster than ${Math.round(100 * percentile)}% of the paper’s ${n} runs`
    : `slower than ${Math.round(100 * (1 - percentile))}% of them`;
}

/** Marks under the socioeconomic slider: where each SSP's own growth lands. */
function sspTicks(positions: Record<string, number>): Tick[] {
  const entries = Object.entries(positions).sort((a, b) => a[1] - b[1]);
  return entries.map(([ssp, at], i) => ({
    at,
    label: ssp,
    // Neighbours closer than a tenth of the rail would print over each other.
    low: i > 0 && at - entries[i - 1][1] < 0.1,
  }));
}

/** The draw an intensity slider should sit at, whichever kind of scenario is on. */
function leverDrawFor(
  inputs: ModelInputs,
  lever: IntensityLever,
  scenario: Scenario,
  levers: Levers,
  blend: ReturnType<typeof resolveSsp>,
): number {
  if (scenario.kind === 'ssp') {
    const target = leverSspValue(inputs, lever, scenario.ssp);
    return target == null ? 0.5 : leverDraw(inputs, lever, target, blend);
  }
  const spec = INTENSITY_LEVERS[lever];
  return spec.flows.length
    ? (levers.flowIntensityU[spec.flows[0]] ?? 0.5)
    : (levers.stockIntensityU[spec.stocks[0][0]]?.[spec.stocks[0][1]] ?? 0.5);
}

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
  blend: ReturnType<typeof resolveSsp>;
  onChange: (u: number) => void;
}) {
  const spec = INTENSITY_LEVERS[lever];
  const lo = leverWorldValue(inputs, lever, 0, blend);
  const hi = leverWorldValue(inputs, lever, 1, blend).value;

  // The slider moves in kg/$, not in the model's draw space, so the number
  // beside it is the assumption itself rather than a position on a rail.
  const value = leverWorldValue(inputs, lever, draw, blend).value;

  // The rail spans the sampled range AND every SSP target, so an SSP preset
  // lands on its own mark instead of stopping short at the sampled edge.
  const marks = inputs.sspSampled
    .map((ssp) => ({ ssp, v: leverSspValue(inputs, lever, ssp) }))
    .filter((m): m is { ssp: string; v: number } => m.v != null)
    .sort((a, b) => a.v - b.v);
  const ends = [lo.value, hi, ...marks.map((m) => m.v), value];
  const min = Math.min(...ends);
  const max = Math.max(...ends);
  const span = max - min || 1;
  const ticks: Tick[] = marks.map((m, i) => ({
    at: m.v,
    label: m.ssp,
    low: i > 0 && Math.abs(m.v - marks[i - 1].v) / span < 0.1,
  }));

  const digits = Math.max(lo.value, hi) >= 1 ? 2 : 3;
  const fmt = (v: number) => v.toFixed(digits);
  const changePct = lo.base > 0 ? (100 * (value - lo.base)) / lo.base : null;

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
        changePct == null
          ? undefined
          : `${fmt(lo.base)} today → ${fmt(value)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(0)}%). One move sets the target for ${
              spec.flows.length ? spec.flows.length : spec.stocks.length
            } ${spec.flows.length ? 'materials' : 'end uses'}; each region keeps its own range.`
      }
      desc={
        spec.flows.length
          ? 'The intensity of consumption: kilograms used per dollar of output. Dragging left means a world that needs less of this material per dollar by the target year.'
          : 'The intensity of stock: kilograms held in use per dollar of output. Consumption follows from it, because stock has to be built and then replaced as it retires.'
      }
    />
  );
}

function ChipGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ font: '600 10.5px var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`mat-chip${value === o.id ? ' on' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
