/**
 * The interactive refinery: one refinery's inputs, hardware and outputs as a
 * Sankey, with the real operating levers in the rail and the product slate,
 * margin and emissions recomputed on every move. The model is a forward mass
 * and money balance in the browser (model.ts); every constant is in data.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import ToolShell from '../_shell/ToolShell';
import {
  FCC_MODES, GRADES, GRADE_LABEL, H2_SOURCES, HCK_MODES, PRESETS, PRICES_2023, PRICES_NZ, UNITS, UNIT_IDS,
  type Grade, type PresetId, type Prices, type UnitId,
} from './data.ts';
import { compute, DEFAULT_STATE, unitsFromPreset, type Result, type State } from './model.ts';
import { Chips, Info, Section, Slider, Sub, followTouches } from './Controls.tsx';
import Sankey, { NodeCard } from './Sankey.tsx';
import { Changed, Emissions, Kpis, PanelBox, Slate, Warnings, Waterfall } from './Panels.tsx';
import Guided, { SCENARIOS } from './Guided.tsx';
import { ABOUT_NUMBERS, LEVER_INFO, UNIT_INFO } from './info.ts';

const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
const GRADE_SHADE: Record<Grade, string> = { ls: 'var(--ink-4)', ms: 'var(--ink-3)', hs: 'var(--ink-2)' };

function useMobile() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

const samePrices = (a: Prices, b: Prices) => JSON.stringify(a) === JSON.stringify(b);
const matchPreset = (u: State['units']): PresetId | null =>
  PRESET_IDS.find((id) => UNIT_IDS.every((k) => {
    const c = PRESETS[id].caps[k];
    return c > 0 ? u[k].on && u[k].cap === c : !u[k].on;
  })) ?? null;

export default function RefineryTool() {
  const mobile = useMobile();
  const [s, setS] = useState<State>(DEFAULT_STATE);
  const [scenario, setScenario] = useState<string | null>('gulf');
  const [responding, setResponding] = useState(false);
  const [chg, setChg] = useState<{ key: string; label: string; base: Result } | null>(null);
  /** The KPI cards compare with the start of the last story picked. */
  const [baseline, setBaseline] = useState<{ name: string; r: Result }>(() => ({ name: 'Gulf Coast refinery', r: compute(DEFAULT_STATE) }));
  const [selected, setSelected] = useState<string | null>(null);
  const r = useMemo(() => compute(s), [s]);

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => (rootRef.current ? followTouches(rootRef.current) : undefined), []);

  /** Every control goes through here: it records what the "what changed"
   *  line compares against (the state before this control was first moved)
   *  and drops the guided-scenario highlight. */
  const update = (key: string, label: string, fn: (s: State) => State) => {
    if (!chg || chg.key !== key) setChg({ key, label, base: r });
    setS(fn);
    setScenario(null);
    setResponding(false);
  };
  const pick = (id: string, respond: boolean) => {
    const sc = SCENARIOS.find((x) => x.id === id)!;
    const base = sc.apply();
    const next = respond && sc.response ? sc.response.apply(base) : base;
    const label = respond && sc.response ? sc.response.label.toLowerCase() : `the story to “${sc.name}”`;
    setChg({ key: `sc:${id}:${respond}`, label, base: r });
    setBaseline({ name: sc.name, r: compute(base) });
    setS(next);
    setScenario(id);
    setResponding(respond);
  };

  const preset = matchPreset(s.units);
  const pricePreset = samePrices(s.prices, PRICES_2023) ? '2023' : samePrices(s.prices, PRICES_NZ) ? 'nz' : null;
  const has = (u: UnitId) => s.units[u].on && s.units[u].cap > 0;
  const setPrice = <K extends keyof Prices>(k: K, label: string, v: Prices[K]) =>
    update(`price:${k}`, label, (x) => ({ ...x, prices: { ...x.prices, [k]: v } }));

  const setSlate = (g: Grade, v: number) => update('slate', 'crude slate', (x) => {
    const others = GRADES.filter((o) => o !== g);
    const rem = 1 - v;
    const sumO = others.reduce((a, o) => a + x.slate[o], 0);
    const slate = { ...x.slate, [g]: v };
    for (const o of others) slate[o] = sumO > 1e-9 ? (x.slate[o] * rem) / sumO : rem / 2;
    return { ...x, slate };
  });

  const NAME: Partial<Record<UnitId, string>> = { fcc: 'FCC', hck: 'hydrocracker', ref: 'reformer', arom: 'aromatics complex', scr: 'steam cracker', dht: 'diesel hydrotreater' };
  const missing = (u: UnitId, what: string) =>
    has(u) ? undefined : <>No {NAME[u]} in this configuration, so {what} has no effect. Add one under Hardware.</>;

  const rail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Section title="Crude" aside={`${Math.round(r.crudeKbd)} kb/d`}>
        <Slider label="Throughput" value={s.throughput} min={50} max={400} step={5} fmt={(v) => `${v} kb/d`}
          info={LEVER_INFO.throughput}
          onChange={(v) => update('throughput', 'throughput', (x) => ({ ...x, throughput: v }))}
          note={s.throughput > s.units.cdu.cap ? <>Above the crude unit’s {s.units.cdu.cap} kb/d capacity, so the run is held there. Raise it under Hardware.</> : undefined} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            Crude slate <Info label="Crude slate">{LEVER_INFO.slate}</Info>
          </div>
          <div aria-hidden style={{ display: 'flex', height: 8, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
            {GRADES.map((g) => <div key={g} style={{ width: `${s.slate[g] * 100}%`, background: GRADE_SHADE[g] }} />)}
          </div>
          {GRADES.map((g) => (
            <Slider key={g} label={GRADE_LABEL[g]} swatch={GRADE_SHADE[g]} value={Math.round(s.slate[g] * 100)} min={0} max={100} step={1}
              fmt={(v) => `${v}%`} ends={['0%', '100%']} onChange={(v) => setSlate(g, v / 100)} />
          ))}
        </div>
        <Sub title="Crude prices">
          {GRADES.map((g) => (
            <Slider key={g} label={GRADE_LABEL[g]} value={s.prices.crude[g]} min={20} max={140} step={1} fmt={(v) => `$${v}/bbl`}
              info={g === 'hs' ? LEVER_INFO.crudePrices : undefined}
              onChange={(v) => setPrice('crude', `${GRADE_LABEL[g].toLowerCase()} price`, { ...s.prices.crude, [g]: v })} />
          ))}
        </Sub>
      </Section>

      <Section title="Hardware" aside={preset ? PRESETS[preset].label : 'Custom'}>
        <Chips label="Configuration" value={preset} info={LEVER_INFO.presets}
          options={PRESET_IDS.map((id) => ({ id, label: PRESETS[id].label }))}
          onChange={(id) => update('preset', 'configuration', (x) => ({ ...x, units: unitsFromPreset(id) }))}
          note={preset ? PRESETS[preset].desc : 'Custom: you have edited the units below.'} />
        <Sub title="Units and capacities">
          {UNIT_IDS.map((u) => (
            <div key={u}>
              {u !== 'cdu' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.units[u].on} style={{ accentColor: 'var(--accent)', width: 15, height: 15, margin: 0 }}
                    onChange={(e) => update(`on:${u}`, UNITS[u].short, (x) => ({ ...x, units: { ...x.units, [u]: { ...x.units[u], on: e.target.checked } } }))} />
                  {UNITS[u].label}
                  <Info label={UNITS[u].label}>{UNIT_INFO[u]}</Info>
                </label>
              )}
              {s.units[u].on || u === 'cdu' ? (
                <Slider label={u === 'cdu' ? UNITS[u].label : 'Capacity'} value={s.units[u].cap} min={u === 'cdu' ? 50 : 5} max={UNITS[u].maxCap} step={u === 'cdu' ? 5 : 1}
                  info={u === 'cdu' ? UNIT_INFO.cdu : undefined}
                  fmt={(v) => `${v} kb/d · ${Math.round(r.units[u].util * 100)}% used`}
                  ends={[`${u === 'cdu' ? 50 : 5}`, `${UNITS[u].maxCap} kb/d`]}
                  onChange={(v) => update(`cap:${u}`, `${UNITS[u].short} capacity`, (x) => ({ ...x, units: { ...x.units, [u]: { ...x.units[u], cap: v } } }))} />
              ) : (
                <div style={{ fontSize: 11, color: 'var(--ink-2)', marginLeft: 21 }}>Not built. Tick to add it and set its size.</div>
              )}
            </div>
          ))}
        </Sub>
      </Section>

      <Section title="Operations">
        <Slider label="Naphtha / kerosene cut point" value={s.nkShift} min={-20} max={20} step={1}
          fmt={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} °C`} ends={['more kerosene', 'more naphtha']}
          info={LEVER_INFO.cuts} onChange={(v) => update('nk', 'the naphtha / kerosene cut point', (x) => ({ ...x, nkShift: v }))} />
        <Slider label="Kerosene / diesel cut point" value={s.kdShift} min={-20} max={20} step={1}
          fmt={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} °C`} ends={['more diesel', 'more kerosene']}
          info={LEVER_INFO.cuts} onChange={(v) => update('kd', 'the kerosene / diesel cut point', (x) => ({ ...x, kdShift: v }))} />
        <Chips label="FCC mode" value={s.fccMode} info={LEVER_INFO.fcc}
          options={(Object.keys(FCC_MODES) as (keyof typeof FCC_MODES)[]).map((id) => ({ id, label: FCC_MODES[id].label }))}
          onChange={(v) => update('fcc', 'FCC mode', (x) => ({ ...x, fccMode: v }))}
          note={missing('fcc', 'its mode')} />
        <Chips label="Hydrocracker mode" value={s.hckMode} info={LEVER_INFO.hck}
          options={(Object.keys(HCK_MODES) as (keyof typeof HCK_MODES)[]).map((id) => ({ id, label: HCK_MODES[id].label }))}
          onChange={(v) => update('hck', 'hydrocracker mode', (x) => ({ ...x, hckMode: v }))}
          note={missing('hck', 'its mode')} />
        <Slider label="Reformer severity" value={s.refSeverity} min={0} max={1} step={0.05}
          fmt={(v) => `reformate RON ${(94 + 8 * v).toFixed(0)}`} ends={['mild', 'severe']} info={LEVER_INFO.refSeverity}
          onChange={(v) => update('sev', 'reformer severity', (x) => ({ ...x, refSeverity: v }))}
          note={missing('ref', 'severity')} />
        <Slider label="Reformate to aromatics" value={s.refToArom} min={0} max={1} step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`} ends={['all to gasoline', 'all to BTX']} info={LEVER_INFO.refToArom}
          onChange={(v) => update('refarom', 'reformate routing', (x) => ({ ...x, refToArom: v }))}
          note={missing('arom', 'this routing')} />
        <Slider label="Naphtha to steam cracker" value={s.naphToCracker} min={0} max={1} step={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`} ends={['all to fuels', 'all to olefins']} info={LEVER_INFO.naphToCracker}
          onChange={(v) => update('naph', 'naphtha routing', (x) => ({ ...x, naphToCracker: v }))}
          note={missing('scr', 'this routing')} />
        <Chips label="Hydrogen source" value={s.h2Source} info={LEVER_INFO.h2}
          options={[{ id: 'smr', label: 'SMR' }, { id: 'ccs', label: 'SMR with CCS' }, { id: 'ely', label: 'Electrolytic' }]}
          onChange={(v) => update('h2', 'hydrogen source', (x) => ({ ...x, h2Source: v }))}
          note={r.h2.imported > 0
            ? <>{H2_SOURCES[s.h2Source].label}: {Math.round(r.h2.imported)} t/d to fill the gap.</>
            : <>The reformer and cracker make all the hydrogen this refinery needs, so the source has no effect.</>} />
        <Slider label="Plant-oil co-processing" value={s.coproc} min={0} max={0.1} step={0.005}
          fmt={(v) => `${(v * 100).toFixed(1)}% of feed`} ends={['0%', '10%']} info={LEVER_INFO.coproc}
          onChange={(v) => update('coproc', 'co-processing', (x) => ({ ...x, coproc: v }))}
          note={missing('dht', 'co-processing')} />
      </Section>

      <Section title="Prices and policy" aside={pricePreset === '2023' ? '2023-like' : pricePreset === 'nz' ? 'Net-zero world' : 'Custom'}>
        <Chips label="Price set" value={pricePreset} info={LEVER_INFO.pricePresets}
          options={[{ id: '2023', label: '2023-like' }, { id: 'nz', label: 'Net-zero world' }]}
          onChange={(v) => update('prices', 'prices', (x) => ({ ...x, prices: v === '2023' ? PRICES_2023 : PRICES_NZ }))} />
        <Slider label="Carbon price" value={s.prices.carbon} min={0} max={300} step={5} fmt={(v) => `$${v}/t CO₂`}
          info={LEVER_INFO.carbon} onChange={(v) => setPrice('carbon', 'carbon price', v)} />
        <Sub title="Fuel prices">
          {([['gasoline', 'Gasoline'], ['jet', 'Jet fuel'], ['diesel', 'Diesel'], ['lpg', 'LPG'], ['naphtha', 'Naphtha'], ['fuelOil', 'Fuel oil']] as const).map(([k, l]) => (
            <Slider key={k} label={l} value={s.prices[k]} min={10} max={180} step={1} fmt={(v) => `$${v}/bbl`}
              onChange={(v) => setPrice(k, `${l.toLowerCase()} price`, v)} />
          ))}
          <Slider label="Lube base oil" value={s.prices.baseOil} min={50} max={300} step={5} fmt={(v) => `$${v}/bbl`}
            onChange={(v) => setPrice('baseOil', 'base oil price', v)}
            note={!has('lube') ? 'Only a base oil plant makes it.' : undefined} />
          <Slider label="Asphalt and pitch" value={s.prices.asphalt} min={50} max={900} step={10} fmt={(v) => `$${v}/t`}
            onChange={(v) => setPrice('asphalt', 'asphalt price', v)}
            note={!has('sda') ? 'Only a deasphalter makes it.' : undefined} />
          <Slider label="Sulfur" value={s.prices.sulfur} min={0} max={400} step={5} fmt={(v) => `$${v}/t`}
            onChange={(v) => setPrice('sulfur', 'sulfur price', v)} />
          <Slider label="Petroleum coke" value={s.prices.coke} min={0} max={200} step={5} fmt={(v) => `$${v}/t`}
            onChange={(v) => setPrice('coke', 'coke price', v)} />
        </Sub>
        <Sub title="Chemical prices">
          {([['ethylene', 'Ethylene'], ['propylene', 'Propylene'], ['butadiene', 'Butadiene'], ['btx', 'Aromatics (BTX)']] as const).map(([k, l]) => (
            <Slider key={k} label={l} value={s.prices[k]} min={300} max={2000} step={10} fmt={(v) => `$${v}/t`}
              onChange={(v) => setPrice(k, `${l.toLowerCase()} price`, v)}
              note={k === 'ethylene' && !has('scr') ? 'Only a steam cracker makes ethylene here.' : undefined} />
          ))}
        </Sub>
        <Sub title="Energy and other inputs">
          <Slider label="Natural gas" value={s.prices.gas} min={1} max={20} step={0.1} fmt={(v) => `$${v.toFixed(1)}/MMBtu`}
            onChange={(v) => setPrice('gas', 'natural gas price', v)} />
          <Slider label="Electricity" value={s.prices.power} min={10} max={200} step={5} fmt={(v) => `$${v}/MWh`}
            onChange={(v) => setPrice('power', 'electricity price', v)} />
          <Slider label="Grid CO₂ intensity" value={s.prices.grid} min={0} max={0.9} step={0.05} fmt={(v) => `${v.toFixed(2)} t/MWh`}
            info={LEVER_INFO.grid} onChange={(v) => setPrice('grid', 'grid intensity', v)} />
          <Slider label="Plant oil" value={s.prices.plantOil} min={500} max={2500} step={25} fmt={(v) => `$${v}/t`}
            onChange={(v) => setPrice('plantOil', 'plant oil price', v)}
            note={s.coproc === 0 ? 'Used only when co-processing is above zero.' : undefined} />
        </Sub>
      </Section>
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
        <button type="button" onClick={() => pick('gulf', false)}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}>
          Reset to the Gulf Coast refinery
        </button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="refinery-tool" style={{ height: '100%' }}>
      <ToolShell
        eyebrow="Interactive model"
        title="Interactive refinery"
        summary="Pull a refinery’s real operating levers and see what it makes, what it earns and what it emits."
        rail={rail}
        railWidth={320}
        mainScroll
      >
        <div style={{ padding: mobile ? '10px 10px 40px' : '14px 18px 40px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 1400 }}>
          <Guided active={scenario} responding={responding} onPick={pick} r={r} s={s} mobile={mobile} />
          <div>
            <Kpis r={r} s={s} base={baseline.r} baseName={baseline.name} />
            <Changed label={chg?.label ?? null} base={chg?.base ?? null} r={r} />
            <Warnings r={r} />
          </div>
          <PanelBox title="Mass flows, t/day"
            info="Ribbon widths are tonnes per day. Colours follow the product each stream mostly becomes. Bars in the upgrading columns are process units, labelled with how full they are. Tap a bar for its throughput, capacity and where its streams go.">
            <Sankey r={r} selected={selected} onSelect={setSelected} mobile={mobile} />
            {selected && <NodeCard id={selected} r={r} onClose={() => setSelected(null)} />}
          </PanelBox>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
            <Slate r={r} />
            <Waterfall r={r} />
            <Emissions r={r} s={s} />
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-3)', maxWidth: 820 }}>
            <b style={{ color: 'var(--ink-2)' }}>About the numbers.</b> {ABOUT_NUMBERS}
          </p>
        </div>
      </ToolShell>
    </div>
  );
}
