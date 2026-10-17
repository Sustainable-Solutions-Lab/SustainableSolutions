/**
 * Material use to 2060 — the companion tool to Busch et al.
 *
 * A page you read downward rather than a dashboard you stare at. The first
 * figure is the paper's Figure 2 question: what has happened and what happens
 * next. Below it the assumptions, then three readings that the assumptions on
 * their own cannot give — what each one is worth, where consumption would have
 * to fall, and why recycling runs into a ceiling.
 *
 * The model runs here, in the browser, so every figure answers for whatever
 * has been set rather than for one precomputed case.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { followTouches, type Tick } from '../magnets/Slider';
import ProjectionChart, { type Band } from './ProjectionChart';
import ContourPanel, { CONTOUR_AXES, type ContourAxis, type ScatterData } from './ContourPanel';
import Controls from './Controls';
import { LeverEffects, RecyclingCeiling, leverVerdict, useLeverEffects } from './LeverEffects';
import {
  GROUP_KEYS,
  GROUP_LABEL,
  GROUP_LEAVES,
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
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
type Scenario = { kind: 'ssp'; ssp: string } | { kind: 'custom'; levers: Levers };

const MEASURE_LABEL: Record<Measure, string> = {
  consumption: 'Consumption',
  perCapita: 'Per person',
  intensity: 'Per dollar of GDP',
};
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
  scatter: ScatterData;
}
interface Flows {
  years: number[];
  materials?: Record<string, number[]>;
  regions?: Record<string, Record<string, number[]>>;
}
interface GdpPop {
  years: number[];
  gdp: Record<string, number[]>;
  population: Record<string, number[]>;
}
type Warming = Record<string, { min: number; median: number; max: number; runs: number }>;

interface ViewState {
  scenario: Scenario;
  place: string;
  group: GroupKey | 'total';
  leaf: string | null;
  measure: Measure;
  axis: ContourAxis;
}

const encodeState = (v: ViewState): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decodeState = (hash: string): ViewState | null => {
  try {
    const bin = atob(hash.replace(/-/g, '+').replace(/_/g, '/'));
    const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as ViewState;
    return v && v.scenario && v.place ? v : null;
  } catch {
    return null;
  }
};

const fetchJson = async <T,>(name: string): Promise<T> => {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return (await res.json()) as T;
};

export default function MaterialsTool() {
  const [data, setData] = useState<{
    meta: Meta;
    inputs: ModelInputs;
    envelope: Envelope;
    world: Flows;
    regions: Flows;
    gdpPop: GdpPop;
    warming: Warming | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<Meta>('meta.json'),
      fetchJson<ModelInputs>('model-inputs.json'),
      fetchJson<Envelope>('envelope.json'),
      fetchJson<Flows>('flows-world.json'),
      fetchJson<Flows>('flows-regions.json'),
      fetchJson<GdpPop>('gdp-pop.json'),
      fetchJson<Warming>('ssp-warming.json').catch(() => null),
    ])
      .then(([meta, inputs, envelope, world, regions, gdpPop, warming]) =>
        setData({ meta, inputs, envelope, world, regions, gdpPop, warming }),
      )
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 24, fontSize: 13 }}>Could not load the model data ({error}).</div>;
  if (!data) return <div style={{ padding: 24, fontSize: 13, color: 'var(--ink-3)' }}>Loading the model…</div>;
  return <Tool {...data} />;
}

function Tool({ meta, inputs, envelope, world, regions, gdpPop, warming }: {
  meta: Meta; inputs: ModelInputs; envelope: Envelope; world: Flows; regions: Flows; gdpPop: GdpPop; warming: Warming | null;
}) {
  const initial = useMemo(
    () => (typeof location === 'undefined' ? null : decodeState(location.hash.slice(1))),
    [],
  );
  const [scenario, setScenario] = useState<Scenario>(initial?.scenario ?? { kind: 'ssp', ssp: 'SSP2' });
  const [place, setPlace] = useState(initial?.place ?? 'World');
  const [group, setGroup] = useState<GroupKey | 'total'>(initial?.group ?? 'total');
  const [leaf, setLeaf] = useState<string | null>(initial?.leaf ?? null);
  const [measure, setMeasure] = useState<Measure>(initial?.measure ?? 'consumption');
  const [axis, setAxis] = useState<ContourAxis>(initial?.axis ?? 'mineralStock');
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = page.current;
    return el ? followTouches(el) : undefined;
  }, []);
  useEffect(() => {
    const next = `#${encodeState({ scenario, place, group, leaf, measure, axis })}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  }, [scenario, place, group, leaf, measure, axis]);

  const levers = useMemo<Levers>(
    () => (scenario.kind === 'ssp' ? sspLevers(inputs, scenario.ssp) : scenario.levers),
    [scenario, inputs],
  );
  const shown = useDeferredValue(levers);
  const run = useMemo(() => runModel(inputs, shown), [inputs, shown]);
  const blend = useMemo(() => resolveSsp(inputs, shown.sspU), [inputs, shown.sspU]);
  const sspAt = useMemo(() => sspPositions(inputs), [inputs]);
  const effects = useLeverEffects(inputs, shown);

  const edit = (change: (l: Levers) => void) => {
    setScenario((prev) => {
      const next = prev.kind === 'ssp' ? customLeversFromSsp(inputs, prev.ssp) : ({ ...prev.levers } as Levers);
      change(next);
      return { kind: 'custom', levers: next };
    });
  };

  const groups: GroupKey[] = group === 'total' ? GROUP_KEYS : [group];
  const leaves = group === 'total' ? [] : GROUP_LEAVES[group];
  const activeLeaf = leaf && leaves.includes(leaf) ? leaf : null;

  // ── Series ────────────────────────────────────────────────────────────────
  // `past` rather than `history`: the latter is window.history in this scope.
  const past = useMemo(() => {
    const members = new Map(meta.groups.map((g) => [g.id, g.members]));
    const source = place === 'World' ? world.materials : regions.regions?.[place];
    const years = world.years;
    const mass = years.map(() => 0);
    let any = false;
    const add = (key: string) => {
      const s = source?.[key];
      if (!s) return;
      any = true;
      for (let i = 0; i < years.length; i++) mass[i] += s[i] ?? 0;
    };
    for (const g of groups) {
      const all = members.get(HISTORY_GROUP[g]) ?? [];
      if (!activeLeaf) all.forEach(add);
      else if (activeLeaf.startsWith('Other')) {
        const named = new Set(GROUP_LEAVES[g].filter((l) => !l.startsWith('Other')));
        all.filter((m) => !named.has(m)).forEach(add);
      } else add(activeLeaf);
    }
    if (!any) return { years, values: years.map(() => null as number | null) };
    const pop = gdpPop.population[place];
    const gdp = gdpPop.gdp[place];
    const values = years.map((_, i) =>
      measure === 'consumption' ? mass[i]
        : measure === 'perCapita' ? (pop?.[i] ? (mass[i] * 1e6) / pop[i] : null)
        : (gdp?.[i] ? (mass[i] * 1e9) / gdp[i] : null),
    );
    return { years, values };
  }, [meta, world, regions, gdpPop, place, group, activeLeaf, measure]);

  const projection = useMemo(() => {
    const n = run.years.length;
    const mass = new Float64Array(n);
    for (const g of groups) {
      const detail = place === 'World' ? run.primary.byGroupDetail[g] : run.primary.byRegionGroupDetail[place]?.[g];
      const whole = place === 'World' ? run.primary.byGroup[g] : run.primary.byRegionGroup[place]?.[g];
      const s = activeLeaf ? detail?.[activeLeaf] : whole;
      if (s) for (let i = 0; i < n; i++) mass[i] += s[i];
    }
    const pop = place === 'World' ? run.population : run.popByRegion[place];
    const gdp = place === 'World' ? run.gdp : run.gdpByRegion[place];
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      out[i] = measure === 'consumption' ? mass[i]
        : measure === 'perCapita' ? (mass[i] * 1e6) / pop[i]
        : (mass[i] * 1e9) / gdp[i];
    }
    return out;
  }, [run, place, group, activeLeaf, measure]);

  // Bands exist per group, not per leaf: a leaf shows its own line with no band.
  const band = activeLeaf ? null : envelope.bands[place]?.[group]?.[measure] ?? null;

  const peak = Math.max(...projection, ...(band ? band.max : []), ...past.values.map((v) => v ?? 0));
  const unit = measure === 'consumption' ? (peak >= 2000 ? 'Gt per year' : 'Mt per year')
    : measure === 'perCapita' ? 't per person per year'
    : 'kg per $ of GDP';
  const scale = measure === 'consumption' && peak >= 2000 ? 1 / 1000 : 1;
  const top = peak * scale;
  const digits = top >= 100 ? 0 : top >= 10 ? 1 : top >= 1 ? 2 : 3;
  const format = (x: number) => x.toFixed(digits);

  const first = projection[0];
  const last = projection[projection.length - 1];
  const change = first > 0 && last > 0 ? Math.pow(last / first, 1 / 35) - 1 : null;
  const ratio = first > 0 ? last / first : null;
  const worldGrowth = effects.now;
  const percentile = envelope.worldGrowth.filter((g) => g < worldGrowth).length / envelope.worldGrowth.length;

  const sliceName = group === 'total' ? 'all four groups' : (activeLeaf ?? GROUP_LABEL[group]).toLowerCase();

  // Recent conditions, for the contour's star: 2019–2024 income growth and
  // today's level of each lever.
  const historyPoint = useMemo(() => {
    const years = gdpPop.years;
    const i0 = years.indexOf(2019);
    const i1 = years.indexOf(2024);
    const g = gdpPop.gdp.World;
    const p = gdpPop.population.World;
    const gdpGrowth = i0 >= 0 && i1 > i0 && g && p
      ? Math.pow((g[i1] / p[i1]) / (g[i0] / p[i0]), 1 / (years[i1] - years[i0])) - 1
      : 0.02;
    const lever: Record<string, number> = {};
    for (const k of INTENSITY_LEVER_KEYS) lever[k] = leverWorldValue(inputs, k, 0, blend).base;
    let feNum = 0, downNum = 0, den = 0;
    for (const r of inputs.regions) {
      const w = inputs.gdp2024[r] ?? 0;
      feNum += w * ((inputs.recyclingNow.fe[r] ?? 0) + (inputs.recyclingNow.nonfe[r] ?? 0)) / 2;
      downNum += w * (inputs.downcyclingNow[r] ?? 0);
      den += w;
    }
    lever.metalRecycling = den > 0 ? feNum / den : 0;
    lever.mineralDowncycling = den > 0 ? downNum / den : 0;
    return { gdpGrowth, lever };
  }, [gdpPop, inputs, blend]);

  const sspTicks: Tick[] = useMemo(() => {
    const entries = Object.entries(sspAt).sort((a, b) => a[1] - b[1]);
    return entries.map(([ssp, at], i) => ({
      at, label: ssp, low: i > 0 && at - entries[i - 1][1] < 0.1,
    }));
  }, [sspAt]);

  const intensityDraw = (lever: IntensityLever): number => {
    if (scenario.kind === 'ssp') {
      const t = leverSspValue(inputs, lever, scenario.ssp);
      return t == null ? 0.5 : leverDraw(inputs, lever, t, blend);
    }
    const spec = INTENSITY_LEVERS[lever];
    return spec.flows.length
      ? (shown.flowIntensityU[spec.flows[0]] ?? 0.5)
      : (shown.stockIntensityU[spec.stocks[0][0]]?.[spec.stocks[0][1]] ?? 0.5);
  };

  const warmingLabel = (ssp: string) => {
    const w = warming?.[ssp];
    return w ? `${w.min.toFixed(1)}–${w.max.toFixed(1)}°C` : null;
  };

  const kicker = { font: '500 11px var(--font-mono)', letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--ink-3)', margin: 0 };
  const figTitle = { font: '600 clamp(17px, 2.1vw, 21px)/1.25 var(--font-serif)', color: 'var(--ink)', margin: 0 };
  const caption = { fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 };
  const sectionRule = { borderTop: '1px solid var(--rule-strong)', paddingTop: 16, display: 'flex', flexDirection: 'column' as const, gap: 10 };

  return (
    <div className="mat-tool" ref={page} style={{ height: '100%', overflowY: 'auto', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 940, margin: '0 auto', padding: 'clamp(16px, 3vw, 28px)', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <p style={kicker}>Interactive model · material use to 2060</p>
          <h2 style={{ font: '600 clamp(24px, 3.4vw, 32px)/1.15 var(--font-serif)', margin: '4px 0 8px', color: 'var(--ink)' }}>
            Will material use keep growing?
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.55 }}>
            The world used about 110 billion tonnes of material last year, three times what it used
            in 1970. Efficiency and circularity are the usual answers to that. This tool runs the
            model behind Busch et al. in your browser so you can set those answers as high as you
            like and watch what happens. In the paper’s{' '}
            {envelope.runs.toLocaleString()} runs, <b>{Math.round(envelope.runs * envelope.growthShareAbove).toLocaleString()} still grow</b>;
            the rest of this page is about why, and what it would take to be one of the other six.
          </p>
        </div>

        <div className="mat-bar">
          <Chips label="Scenario" value={scenario.kind === 'ssp' ? scenario.ssp : 'custom'}
            options={[
              ...inputs.sspSampled.map((s) => ({ id: s, label: warmingLabel(s) ? `${s} · ${warmingLabel(s)}` : s })),
              { id: 'custom', label: 'Yours' },
            ]}
            onChange={(id) => setScenario(id === 'custom'
              ? { kind: 'custom', levers: scenario.kind === 'ssp' ? customLeversFromSsp(inputs, scenario.ssp) : scenario.levers }
              : { kind: 'ssp', ssp: id })} />
          <Chips label="Material" value={group}
            options={[{ id: 'total', label: 'All four' }, ...GROUP_KEYS.map((g) => ({ id: g, label: GROUP_LABEL[g] }))]}
            onChange={(id) => { setGroup(id as GroupKey | 'total'); setLeaf(null); }} />
          {leaves.length > 0 && (
            <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
              which
              <select value={activeLeaf ?? ''} onChange={(e) => setLeaf(e.target.value || null)}
                aria-label={`Which ${GROUP_LABEL[group as GroupKey]}`}
                style={{ font: '400 12.5px/1.3 var(--font-sans)', color: 'var(--ink)', background: 'var(--paper)', border: '1px solid var(--rule-strong)', borderRadius: 2, padding: '2px 5px' }}>
                <option value="">All {GROUP_LABEL[group as GroupKey].toLowerCase()}</option>
                {leaves.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          )}
          <Chips label="Where" value={place}
            options={[{ id: 'World', label: 'World' }, ...meta.regions.map((r) => ({ id: r, label: r }))]}
            onChange={setPlace} />
          <Chips label="As" value={measure}
            options={(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => ({ id: m, label: MEASURE_LABEL[m] }))}
            onChange={(id) => setMeasure(id as Measure)} />
        </div>

        {/* ── 1 ─────────────────────────────────────────────────────────── */}
        <section aria-label="Past and future consumption" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={kicker}>Past and future · {sliceName}{place === 'World' ? '' : `, ${place}`}</p>
          <h3 style={figTitle}>
            {change == null ? 'Consumption to 2060'
              : change > 0 ? 'Still rising in 2060'
              : 'Falling by 2060'}
          </h3>
          <div style={{ height: 'clamp(300px, 46vh, 460px)' }}>
            <ProjectionChart
              historyYears={past.years}
              history={past.values.map((v) => (v == null ? null : v * scale))}
              projectionYears={run.years}
              scenario={projection.map((v) => v * scale)}
              band={band ? {
                p05: band.p05.map((v) => v * scale), p25: band.p25.map((v) => v * scale),
                p50: band.p50.map((v) => v * scale), p75: band.p75.map((v) => v * scale),
                p95: band.p95.map((v) => v * scale), min: band.min.map((v) => v * scale),
                max: band.max.map((v) => v * scale),
              } : null}
              unit={unit}
              scenarioLabel={scenario.kind === 'ssp' ? `${scenario.ssp} as the paper sets it` : 'Your assumptions'}
              format={format}
            />
          </div>
          <p style={caption}>
            Measured domestic material consumption to 2024 (UNEP IRP), then the model from 2025.
            {ratio != null && (
              <> Your scenario ends {ratio.toFixed(2)}× its 2025 level, {change != null && `${change >= 0 ? '+' : ''}${(100 * change).toFixed(2)}% a year`}.</>
            )}
            {(group === 'total' || group === 'metal_ores') && (
              <> Metal ores step up at the seam: history reports ore as consumed, the projection
                reports the ore that has to be mined at the modelled grade.</>
            )}
            {activeLeaf && <> No band is drawn for a single material: the paper’s runs are summarised by group.</>}
            {scenario.kind === 'ssp' && (
              <> An SSP sets every assumption to that narrative at once, which the band’s runs almost
                never do, so an SSP line can sit outside the band.</>
            )}
          </p>
        </section>

        {/* ── 2 ─────────────────────────────────────────────────────────── */}
        <section aria-label="The assumptions" style={sectionRule}>
          <p style={kicker}>The assumptions</p>
          <h3 style={figTitle}>Set them yourself</h3>
          <div className="mat-verdict">
            <Readout label={`${cap(sliceName)}${place === 'World' ? '' : `, ${place}`} in 2060`}
              value={ratio == null ? '—' : `${ratio.toFixed(2)}×`} sub="2025" />
            <Readout label="World material growth" value={`${worldGrowth >= 0 ? '+' : ''}${(100 * worldGrowth).toFixed(2)}%`} sub="per year" good={worldGrowth < 0} />
            <Readout label="World GDP per person" value={`+${(100 * blend.gdppcGrowth).toFixed(2)}%`} sub="per year" />
            <Readout label="World population" value={`${blend.popGrowth >= 0 ? '+' : ''}${(100 * blend.popGrowth).toFixed(2)}%`} sub="per year" />
          </div>
          <p style={caption}>
            {worldGrowth > 0 ? (
              <>World use of all four groups <b>still grows, at +{(100 * worldGrowth).toFixed(2)}% a year</b> —{' '}
                {percentile >= 0.5 ? 'faster' : 'slower'} than{' '}
                {Math.round(100 * (percentile >= 0.5 ? percentile : 1 - percentile))}% of the paper’s{' '}
                {envelope.runs.toLocaleString()} runs.</>
            ) : (
              <>World use of all four groups <b>falls</b>, at {(100 * worldGrowth).toFixed(2)}% a year. Only{' '}
                {Math.round(100 * (1 - envelope.growthShareAbove))}% of the paper’s{' '}
                {envelope.runs.toLocaleString()} runs manage that.</>
            )}
          </p>
          <Controls inputs={inputs} levers={shown} blend={blend} sspTicks={sspTicks}
            intensityDraw={intensityDraw} warming={warming} onChange={edit} />
          <div>
            <button type="button" className="mat-reset-all"
              onClick={() => setScenario({ kind: 'custom', levers: defaultLevers(inputs) })}>
              Reset everything to the paper’s central values
            </button>
          </div>
        </section>

        {/* ── 3 ─────────────────────────────────────────────────────────── */}
        <section aria-label="What each assumption is worth" style={sectionRule}>
          <p style={kicker}>Efficiency against circularity</p>
          <h3 style={figTitle}>What each assumption is actually worth</h3>
          <LeverEffects bars={effects.bars} now={effects.now} />
          <p style={caption}>{leverVerdict(effects.bars)}</p>
          <p style={caption}>
            Ranges are the ones the paper sampled, so a bar is what that assumption could buy or
            cost inside the published spread, not what is physically conceivable. The bars are read
            one at a time: moving two levers does not add their widths, because they act on the same
            tonnes.
          </p>
        </section>

        {/* ── 4 ─────────────────────────────────────────────────────────── */}
        <section aria-label="Where consumption would fall" style={sectionRule}>
          <p style={kicker}>Where the line is</p>
          <h3 style={figTitle}>What it would take for a material to stop growing</h3>
          <ContourPanel inputs={inputs} levers={shown} axis={axis} onAxis={setAxis}
            scatter={envelope.scatter} history={historyPoint} />
          <p style={caption}>
            Figure 3 of the paper, recomputed for your settings. Growth in{' '}
            {GROUP_LABEL[CONTOUR_AXES[axis].group].toLowerCase()} consumption, 2025–2060, across world
            income growth and {CONTOUR_AXES[axis].label.toLowerCase()}, with every other assumption
            where you left it. Green is where that material falls; the heavy green line is zero.
            Grey dots are the paper’s published runs, the star is where the world sits now, and the
            ring is your scenario. Panels where no green line appears are materials that grow
            anywhere inside the range anyone has proposed.
          </p>
        </section>

        {/* ── 5 ─────────────────────────────────────────────────────────── */}
        <section aria-label="The recycling ceiling" style={sectionRule}>
          <p style={kicker}>The ceiling</p>
          <h3 style={figTitle}>Why recycling runs out of road before the problem does</h3>
          <RecyclingCeiling inputs={inputs} levers={shown} />
          <p style={caption}>
            Secondary supply is the collection rate multiplied by the share of this year’s demand
            that happens to be retiring. The second term is set by how fast demand has grown and how
            long things last — not by policy, technology or effort. This is why a 40% recycled share
            for a particular metal and a paper saying material use keeps growing are not in
            disagreement: they are the two terms of the same product.
          </p>
        </section>

        <div className="mat-endnotes">
          <div>
            <h3 style={{ ...kicker, marginBottom: 6 }}>What to try</h3>
            <p style={caption}>
              Put recycling and reuse to the top and watch the growth figure barely move; then do
              the same with the four efficiency rails and watch it fall. On the contour, choose
              mineral stock intensity: there is a zero line, but only at low income growth. Choose
              metal recovery instead: there is no zero line anywhere. Switch the material chip to
              metal ores and the dropdown to non-ferrous, where falling grade, not demand, carries
              the mass.
            </p>
          </div>
          <div>
            <h3 style={{ ...kicker, marginBottom: 6 }}>Honest caveats</h3>
            <p style={caption}>
              This is a top-down model: no prices, no trade response, no rebound from cheaper
              material. Intensity paths are assumptions, not forecasts. Electricity generation and
              storage are carried inside civil infrastructure rather than modelled as their own
              stock, which leaves metal ores about 4% below the paper’s published runs; biomass and
              fossil fuels reproduce them exactly. Ore grade is modelled as metal per tonne of ore
              and excludes overburden, so it is not the full rock-to-metal ratio.
            </p>
          </div>
        </div>

        <footer className="mat-footer">
          <a href={meta.source.repo} target="_blank" rel="noopener noreferrer" className="mat-footer-link">
            <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>Model code on GitHub <span style={{ opacity: 0.6, fontFamily: 'var(--font-mono)' }}>material-intensity ↗</span></span>
          </a>
          <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer"
            title="STEER — Stanford" aria-label="STEER at Stanford (opens in new tab)" className="mat-footer-steer">
            <img className="steer-light-bg" src="/logos/steer/STEER-forweb-light.png" alt="STEER — Stanford" height={18} />
            <img className="steer-dark-bg" src="/logos/steer/STEER-forweb-dark.png" alt="STEER — Stanford" height={18} />
            <span aria-hidden="true" style={{ fontSize: 11 }}>↗</span>
          </a>
          <p style={{ ...caption, fontSize: 12 }}>
            Companion to Busch, Caldeira and Davis, <i>Global material consumption persists despite
            intensity gains and circularity</i>. History from the UNEP IRP global material flows
            database; drivers from the IIASA SSP basic drivers and ScenarioMIP; stocks and end uses
            from MISO2. Warming ranges are the ScenarioMIP climate assessment’s 2100 median GSAT
            across the runs that use each SSP. Developed by{' '}
            <a href="https://steer-stanford.webflow.io/" target="_blank" rel="noopener noreferrer">STEER</a>{' '}
            at Stanford. <a href={`${BASE}/data`}>Full data explorer →</a>
          </p>
        </footer>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Readout({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.3 }}>{label}</div>
      <div style={{ font: '600 17px var(--font-mono)', color: good ? '#1B7837' : 'var(--ink)' }}>
        {value} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--ink-3)' }}>{sub}</span>
      </div>
    </div>
  );
}

function Chips({ label, value, options, onChange }: {
  label: string; value: string; options: { id: string; label: string }[]; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      <span style={{ font: '500 10px var(--font-mono)', color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`mat-chip${value === o.id ? ' on' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
