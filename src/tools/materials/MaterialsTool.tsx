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
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { followTouches } from '../magnets/Slider';
import ProjectionChart, { spectral, type Band, type StackSeries } from './ProjectionChart';
import Methods from './Methods';
import Drivers, { PAST_FROM, PAST_TO, Readout, heat, measureNow, type DriverPast } from './Drivers';
import ContourPanel, { CONTOUR_AXES, axesFor, type ContourAxis, type ScatterData } from './ContourPanel';
import Controls from './Controls';
import { CEILING_NAME, LeverEffects, RecyclingCeiling, leverHeadline, useCeiling, useLeverEffects, type CeilingGroup } from './LeverEffects';
import { fmtMass, focusPhrase, makeFocus } from './focus';
import {
  GROUP_KEYS,
  GROUP_LABEL,
  GROUP_LEAVES,
  INTENSITY_LEVERS,
  INTENSITY_LEVER_KEYS,
  customLeversFromSsp,
  leverWorldValue,
  resolveSsp,
  runModel,
  sspLevers,
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
  const [scenario, setScenario] = useState<Scenario>(initial?.scenario ?? { kind: 'ssp', ssp: 'SSP1' });
  const [place, setPlace] = useState(initial?.place ?? 'World');
  const [group, setGroup] = useState<GroupKey | 'total'>(initial?.group ?? 'total');
  const [leaf, setLeaf] = useState<string | null>(initial?.leaf ?? null);
  const [measure, setMeasure] = useState<Measure>(initial?.measure ?? 'consumption');
  const [axis, setAxis] = useState<ContourAxis>(initial?.axis ?? 'mineralStock');
  const [advanced, setAdvanced] = useState(false);
  const [methods, setMethods] = useState(false);
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

  const edit = (change: (l: Levers) => void) => {
    setScenario((prev) => {
      const next = prev.kind === 'ssp' ? customLeversFromSsp(inputs, prev.ssp) : ({ ...prev.levers } as Levers);
      change(next);
      return { kind: 'custom', levers: next };
    });
  };

  const leaves = group === 'total' ? [] : GROUP_LEAVES[group];
  const activeLeaf = leaf && leaves.includes(leaf) ? leaf : null;

  // The menus at the top set what the whole page is about.
  const focus = useMemo(() => makeFocus(place, group, activeLeaf), [place, group, activeLeaf]);
  const effects = useLeverEffects(inputs, shown, focus);
  const ceilingGroups: CeilingGroup[] = group === 'total' ? ['metal_ores', 'nonmetallic_minerals']
    : group === 'metal_ores' || group === 'nonmetallic_minerals' ? [group] : [];
  const ceiling = useCeiling(inputs, shown, place, ceilingGroups);
  const axes = axesFor(group);
  const axisShown = axes.includes(axis) ? axis : axes[0];

  // ── Series ────────────────────────────────────────────────────────────────
  // The figure is stacked, so everything below is per component rather than
  // per total: one component for each material group, or for each material
  // inside the chosen group. `past` rather than `history`, because the latter
  // is window.history in this scope.
  interface Comp { key: string; label: string; group: GroupKey; leaf: string | null }
  const comps = useMemo<Comp[]>(() => {
    if (group === 'total') {
      return GROUP_KEYS.map((g) => ({ key: g, label: GROUP_LABEL[g], group: g, leaf: null }));
    }
    if (activeLeaf) return [{ key: activeLeaf, label: activeLeaf, group, leaf: activeLeaf }];
    if (leaves.length) return leaves.map((l) => ({ key: l, label: l, group, leaf: l }));
    return [{ key: group, label: GROUP_LABEL[group], group, leaf: null }];
  }, [group, activeLeaf, leaves.join('|')]);

  /** Measured mass for one component in the place showing, or nulls where the data has none. */
  const pastMass = useMemo(() => {
    const members = new Map(meta.groups.map((g) => [g.id, g.members]));
    const source = place === 'World' ? world.materials : regions.regions?.[place];
    const years = world.years;
    return (c: Comp): (number | null)[] => {
      const all = members.get(HISTORY_GROUP[c.group]) ?? [];
      const mass = years.map(() => 0);
      let any = false;
      const add = (key: string) => {
        const t = source?.[key];
        if (!t) return;
        any = true;
        for (let i = 0; i < years.length; i++) mass[i] += t[i] ?? 0;
      };
      if (!c.leaf) all.forEach(add);
      else if (c.leaf.startsWith('Other')) {
        // "Other X" is the model's bucket for whatever the data names separately.
        const named = new Set(GROUP_LEAVES[c.group].filter((l) => !l.startsWith('Other')));
        all.filter((m) => !named.has(m)).forEach(add);
      } else add(c.leaf);
      return any ? mass : years.map(() => null);
    };
  }, [meta, world, regions, place]);

  /**
   * Stacking order: largest at the bottom, "other" categories on top. The
   * spectral ramp follows the same order, bottom to top, so adjacent bands
   * never share a colour.
   */
  const rank = (cs: Comp[]): Comp[] => cs
    .map((c) => ({ c, last: pastMass(c).at(-1) ?? 0 }))
    .sort((a, b) => {
      const ao = a.c.label.startsWith('Other') ? 1 : 0;
      const bo = b.c.label.startsWith('Other') ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return b.last - a.last;
    })
    .map((r) => r.c);

  /**
   * One colour per material for the place showing, shared by the figure and
   * the material menu so the two can never disagree: groups are ranked against
   * each other (the "All four" stack), and each group's materials against each
   * other (that group's own stack).
   */
  const palette = useMemo(() => {
    const ramp = (cs: Comp[]) => new Map(rank(cs).map((c, k, all) => [c.key, spectral(k, all.length)]));
    const group = ramp(GROUP_KEYS.map((g) => ({ key: g, label: GROUP_LABEL[g], group: g, leaf: null })));
    const leaf = Object.fromEntries(GROUP_KEYS.map((g) => [
      g, ramp(GROUP_LEAVES[g].map((l) => ({ key: l, label: l, group: g, leaf: l }))),
    ])) as Record<GroupKey, Map<string, string>>;
    return { group, leaf };
  }, [pastMass]);
  const colourOf = (c: Comp): string =>
    (c.leaf ? palette.leaf[c.group].get(c.leaf) : palette.group.get(c.group)) ?? spectral(0, 1);

  const stack = useMemo(() => {
    const years = world.years;
    const hPop = gdpPop.population[place];
    const hGdp = gdpPop.gdp[place];
    const rPop = place === 'World' ? run.population : run.popByRegion[place];
    const rGdp = place === 'World' ? run.gdp : run.gdpByRegion[place];

    const futureMass = (c: Comp): Float64Array => {
      const n = run.years.length;
      const detail = place === 'World'
        ? run.primary.byGroupDetail[c.group]
        : run.primary.byRegionGroupDetail[place]?.[c.group];
      const whole = place === 'World'
        ? run.primary.byGroup[c.group]
        : run.primary.byRegionGroup[place]?.[c.group];
      const got = c.leaf ? detail?.[c.leaf] : whole;
      return got ?? new Float64Array(n);
    };

    // Per person and per dollar are linear in mass, so a stack stays a stack.
    const asMeasure = (v: number | null, i: number, measured: boolean): number | null => {
      if (v == null) return null;
      if (measure === 'consumption') return v;
      if (measure === 'perCapita') {
        const p = measured ? hPop?.[i] : rPop?.[i];
        return p ? (v * 1e6) / p : null;
      }
      const g = measured ? hGdp?.[i] : rGdp?.[i];
      return g ? (v * 1e9) / g : null;
    };

    const raw = comps.map((c) => {
      const pm = pastMass(c);
      const fm = futureMass(c);
      return {
        c,
        past: pm.map((v, i) => asMeasure(v, i, true)),
        future: Array.from(fm, (v, i) => asMeasure(v, i, false) ?? 0),
      };
    });

    const order = new Map(rank(comps).map((c, k) => [c.key, k]));
    const ordered = [...raw].sort((a, b) => (order.get(a.c.key) ?? 0) - (order.get(b.c.key) ?? 0));
    const series: StackSeries[] = ordered.map((r) => ({
      key: r.c.key,
      label: r.c.label,
      color: colourOf(r.c),
      past: r.past,
      future: r.future,
    }));
    const totalFuture = run.years.map((_, i) => series.reduce((a, t) => a + t.future[i], 0));
    const totalPast = years.map((_, i) =>
      series.some((t) => t.past[i] == null) ? null : series.reduce((a, t) => a + (t.past[i] as number), 0),
    );
    return { years, series, totalFuture, totalPast };
  }, [world, gdpPop, run, place, comps, measure, pastMass, palette]);

  // Bands exist per group, not per leaf: a leaf shows its own areas with none.
  const band = activeLeaf ? null : envelope.bands[place]?.[group]?.[measure] ?? null;

  const projection = stack.totalFuture;
  const peak = Math.max(
    ...projection,
    ...(band ? band.max : []),
    ...stack.totalPast.map((v) => v ?? 0),
  );
  const unit = measure === 'consumption' ? (peak >= 2000 ? 'Gt per year' : 'Mt per year')
    : measure === 'perCapita' ? 't per person per year'
    : 'kg per $ of GDP';
  const scale = measure === 'consumption' && peak >= 2000 ? 1 / 1000 : 1;
  const top = peak * scale;
  const digits = top >= 100 ? 0 : top >= 10 ? 1 : top >= 1 ? 2 : 3;
  const format = (x: number) => x.toFixed(digits);
  const scaled = useMemo<StackSeries[]>(
    () => (scale === 1 ? stack.series : stack.series.map((t) => ({
      ...t,
      past: t.past.map((v) => (v == null ? null : v * scale)),
      future: t.future.map((v) => v * scale),
    }))),
    [stack, scale],
  );

  const first = projection[0];
  const last = projection[projection.length - 1];
  const change = first > 0 && last > 0 ? Math.pow(last / first, 1 / 35) - 1 : null;

  const sliceName = group === 'total' ? 'all four groups' : (activeLeaf ?? GROUP_LABEL[group]).toLowerCase();

  // ── The four terms, measured, for whatever is in focus ─────────────────────
  // Over the 36 years to 2024: the strong reference tick on every rail.
  const kayaPast = useMemo<DriverPast | null>(() => {
    const years = world.years;
    const i0 = years.indexOf(PAST_FROM);
    const i1 = years.indexOf(PAST_TO);
    const gy = gdpPop.years;
    const j0 = gy.indexOf(PAST_FROM);
    const j1 = gy.indexOf(PAST_TO);
    const gdp = gdpPop.gdp[place];
    const pop = gdpPop.population[place];
    if (i0 < 0 || i1 < 0 || j0 < 0 || j1 < 0 || !gdp?.[j0] || !gdp?.[j1] || !pop?.[j0] || !pop?.[j1]) return null;
    // A category with no data at all in a region is one it does not report,
    // and counts as nothing; a gap inside one that does report is a gap.
    const series = comps.map(pastMass).filter((s) => s.some((v) => v != null));
    if (!series.length) return null;
    const mass = (i: number) => {
      let acc = 0;
      for (const s of series) {
        if (s[i] == null) return null;
        acc += s[i] as number;
      }
      return acc;
    };
    const m0 = mass(i0);
    const m1 = mass(i1);
    if (!m0 || !m1 || m0 <= 0 || m1 <= 0) return null;
    const k = years[i1] - years[i0];
    const g = (a: number, b: number) => Math.pow(b / a, 1 / k) - 1;
    return {
      pop: g(pop[j0], pop[j1]),
      gdppc: g(gdp[j0] / pop[j0], gdp[j1] / pop[j1]),
      intensity: g(m0 / gdp[j0], m1 / gdp[j1]),
      material: g(m0, m1),
    };
  }, [world, gdpPop, place, comps, pastMass]);

  /**
   * The headline, pinned to the top of the page: growth of the focus to 2060,
   * coloured against the spread of the paper's runs for it (its group's
   * spread, for a single material, which the runs are not summarised by).
   */
  const headline = useMemo(() => {
    const now = measureNow(focus, run);
    const b = envelope.bands[place]?.[group]?.consumption;
    const n = b?.p50.length ?? 0;
    const yrs = n ? envelope.years[n - 1] - envelope.years[0] : 1;
    const g = (a: number, z: number) => (a > 0 && z > 0 ? Math.pow(z / a, 1 / yrs) - 1 : 0);
    const [lo, hi] = b ? [g(b.p50[0], b.min[n - 1]), g(b.p50[0], b.max[n - 1])] : [-0.02, 0.04];
    return { rate: now.material, mass: now.material1, color: heat(now.material, lo, hi) };
  }, [focus, run, envelope, place, group]);

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

  const intensityDraw = (lever: IntensityLever): number => {
    const spec = INTENSITY_LEVERS[lever];
    return spec.flows.length
      ? (shown.flowIntensityU[spec.flows[0]] ?? 0.5)
      : (shown.stockIntensityU[spec.stocks[0][0]]?.[spec.stocks[0][1]] ?? 0.5);
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
            The world used about 110 billion tonnes of material in 2024, three times what it used
            in 1970. Efficiency and circularity are the usual answers to that. This tool runs the
            model behind Busch et al. in your browser so you can explore what it would take to
            reduce future demands for different materials in different regions.
          </p>
        </div>

        <div className="mat-bar">
          <Picker label="Material"
            value={group === 'total' ? 'total' : activeLeaf ? `${group}|${activeLeaf}` : group}
            options={[
              { id: 'total', label: 'All four', colors: GROUP_KEYS.map((g) => palette.group.get(g) ?? '') },
              ...GROUP_KEYS.flatMap((g) => [
                { id: g, label: GROUP_LABEL[g], colors: [palette.group.get(g) ?? ''] },
                ...GROUP_LEAVES[g].map((l) => ({
                  id: `${g}|${l}`, label: l, colors: [palette.leaf[g].get(l) ?? ''], depth: 1,
                })),
              ]),
            ]}
            onChange={(id) => {
              const [g, l] = id.split('|');
              setGroup(g as GroupKey | 'total');
              setLeaf(l ?? null);
            }} />
          <Picker label="Where" value={place}
            options={[{ id: 'World', label: 'World' }, ...meta.regions.map((r) => ({ id: r, label: r }))]}
            onChange={setPlace} />
          <div className="mat-pin" aria-live="polite">
            <span className="mat-pin-label">{focus.name}, {place}, 2025–2060</span>
            <Readout size="md" color={headline.color}
              main={`${headline.rate >= 0 ? '+' : '−'}${Math.abs(100 * headline.rate).toFixed(2)}%`} unit="/yr"
              level={`${fmtMass(headline.mass)} in 2060`} />
          </div>
        </div>

        {/* ── 1 ─────────────────────────────────────────────────────────── */}
        <section aria-label="Past and future consumption" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={kicker}>Past and future · {sliceName}{place === 'World' ? '' : `, ${place}`}</p>
          <h3 style={figTitle}>
            {change == null ? 'Consumption to 2060'
              : change > 0 ? 'Still rising in 2060'
              : 'Falling by 2060'}
          </h3>
          <Chips label="As" value={measure}
            options={(Object.keys(MEASURE_LABEL) as Measure[]).map((m) => ({ id: m, label: MEASURE_LABEL[m] }))}
            onChange={(id) => setMeasure(id as Measure)} />
          <div style={{ height: 'clamp(300px, 46vh, 460px)' }}>
            <ProjectionChart
              historyYears={stack.years}
              projectionYears={run.years}
              series={scaled}
              band={band ? {
                p05: band.p05.map((v) => v * scale), p25: band.p25.map((v) => v * scale),
                p50: band.p50.map((v) => v * scale), p75: band.p75.map((v) => v * scale),
                p95: band.p95.map((v) => v * scale), min: band.min.map((v) => v * scale),
                max: band.max.map((v) => v * scale),
              } : null}
              unit={unit}
              format={format}
            />
          </div>
          <p style={caption}>
            Historical and projected consumption of the selected material(s) in the selected region.
            {band && <> Dashed lines are the median, 5th and 95th percentiles of the paper’s 1,000
              projections for the same region and materials.</>}
            {' '}<button type="button" className="mat-methods-link" onClick={() => setMethods(true)}>Methods →</button>
          </p>

          <Drivers inputs={inputs} levers={shown} run={run} focus={focus} past={kayaPast}
            advanced={advanced} onAdvanced={() => setAdvanced((o) => !o)}
            onReset={() => setScenario({ kind: 'ssp', ssp: 'SSP1' })}
            onChange={edit}>
            <Controls inputs={inputs} levers={shown} blend={blend}
              intensityDraw={intensityDraw} group={group} leaf={activeLeaf} onChange={edit} />
          </Drivers>
        </section>

        {/* ── 2 ─────────────────────────────────────────────────────────── */}
        <section aria-label="What each assumption is worth" style={sectionRule}>
          <p style={kicker}>What each assumption is worth · {sliceName}{place === 'World' ? '' : `, ${place}`}</p>
          <h3 style={figTitle}>{leverHeadline(effects.bars)}</h3>
          <LeverEffects bars={effects.bars} now={effects.now} />
          <p style={caption}>
            Growth in {focusPhrase(focus)}, 2025–2060, from one end of each assumption’s range to
            the other. The dark line is your scenario; green is zero.
            {' '}<button type="button" className="mat-methods-link" onClick={() => setMethods(true)}>Methods →</button>
          </p>
        </section>

        {/* ── 3 ─────────────────────────────────────────────────────────── */}
        <section aria-label="Where consumption would fall" style={sectionRule}>
          <p style={kicker}>Where the line is · {sliceName}{place === 'World' ? '' : `, ${place}`}</p>
          <h3 style={figTitle}>What it would take for {group === 'total' ? 'material use' : focus.name.toLowerCase()} to stop growing</h3>
          <ContourPanel inputs={inputs} levers={shown} focus={focus} axis={axisShown} onAxis={setAxis}
            scatter={envelope.scatter} history={historyPoint} />
          <p style={caption}>
            Growth in {focusPhrase(focus)}, 2025–2060, across world income growth and{' '}
            {CONTOUR_AXES[axisShown].label.toLowerCase()}, with everything else as you set it.
            {' '}<button type="button" className="mat-methods-link" onClick={() => setMethods(true)}>Methods →</button>
          </p>
        </section>

        {/* ── 4 ─────────────────────────────────────────────────────────── */}
        <section aria-label="The recycling ceiling" style={sectionRule}>
          <p style={kicker}>The ceiling{ceilingGroups.length ? ` · ${ceilingGroups.map((g) => CEILING_NAME[g]).join(' and ')}, ${place}` : ''}</p>
          <h3 style={figTitle}>Why recycling runs out of road before the problem does</h3>
          {!ceilingGroups.length ? (
            <p style={caption}>
              {group === 'biomass' ? 'Biomass is' : 'Fossil fuels are'} used up rather than kept in
              use, so there is nothing to recycle. Choose metal ores or non-metallic minerals above to see this for them.
            </p>
          ) : (
            <>
              <RecyclingCeiling data={ceiling} />
              <p style={caption}>
                Each line ends where everything that retires in {ceiling.year} is recycled:{' '}
                {ceiling.lines.map((l, k) => (
                  <span key={l.group}>{k ? ' and ' : ''}<b>{(100 * l.ceiling).toFixed(0)}%</b> of {CEILING_NAME[l.group].replace(/s$/, '')} supply</span>
                ))}{place === 'World' ? '' : ` in ${place}`}, because so little of what is needed that year is retiring.
                Dots are yours.
                {' '}<button type="button" className="mat-methods-link" onClick={() => setMethods(true)}>Methods →</button>
              </p>
            </>
          )}
        </section>

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
            intensity gains and circularity</i>. <button type="button" className="mat-methods-link" onClick={() => setMethods(true)}>Methods</button>
            {' · '}<a href={`${BASE}/data`}>Full data explorer →</a>
          </p>
        </footer>
        {methods && <Methods targetYear={shown.targetYear} onClose={() => setMethods(false)} />}
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface PickOption { id: string; label: string; colors?: string[]; depth?: number }

/**
 * A dropdown that can carry colour. A native <select> cannot: iOS draws its
 * own menu and ignores option styling, and the material menu has to show the
 * same colours as the stack it controls.
 */
function Picker({ label, value, options, onChange }: {
  label: string; value: string; options: PickOption[]; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.id === value) ?? options[0];
  const id = `pick-${label.toLowerCase()}`;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    // Keep the menu inside the viewport on a phone.
    const r = wrap.current?.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 32);
    setShift(r ? Math.min(0, window.innerWidth - 16 - r.left - width) : 0);
    const i = Math.max(0, options.findIndex((o) => o.id === value));
    setFocus(i);
    requestAnimationFrame(() => (list.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' }));
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const choose = (i: number) => { onChange(options[i].id); setOpen(false); };
  const onKey = (e: KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, Math.min(options.length - 1, focus + (e.key === 'ArrowDown' ? 1 : -1)));
      setFocus(next);
      (list.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(focus); }
  };

  const swatch = (colors?: string[]) => colors?.length ? (
    <span className="mat-pick-swatch" aria-hidden="true">
      {colors.map((c, i) => <span key={i} style={{ background: c }} />)}
    </span>
  ) : null;

  return (
    <div className="mat-pick" ref={wrap}>
      <span className="mat-pick-label" id={`${id}-label`}>{label}</span>
      <button type="button" className="mat-pick-button" aria-haspopup="listbox" aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((o) => !o)} onKeyDown={onKey}
        aria-activedescendant={open ? `${id}-${focus}` : undefined} aria-controls={open ? `${id}-list` : undefined}>
        {swatch(current.colors)}
        <span id={`${id}-value`}>{current.label}</span>
        <span className="mat-pick-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="mat-pick-list" role="listbox" id={`${id}-list`} ref={list} aria-labelledby={`${id}-label`}
          style={{ left: shift }}>
          {options.map((o, i) => (
            <li key={o.id} id={`${id}-${i}`} role="option" aria-selected={o.id === value}
              className={`mat-pick-option${o.depth ? ' sub' : ''}${i === focus ? ' focus' : ''}`}
              onPointerEnter={() => setFocus(i)} onClick={() => choose(i)}>
              {swatch(o.colors)}
              <span>{o.label}</span>
            </li>
          ))}
        </ul>
      )}
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
