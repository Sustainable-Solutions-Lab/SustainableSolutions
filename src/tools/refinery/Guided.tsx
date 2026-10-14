/**
 * Guided scenarios: short stories for a reader who wants the main points
 * before the controls. Picking one sets the levers; some offer a follow-up
 * ("try the levers"). Moving any control afterwards drops the highlight.
 *
 * The figures in each story are computed live from the model.
 */
import type { ReactNode } from 'react';
import { PRICES_2023, PRICES_NZ, CHEMICALS } from './data.ts';
import { compute, DEFAULT_STATE, unitsFromPreset, type Result, type State } from './model.ts';
import { perBbl } from './Panels.tsx';

export type Scenario = {
  id: string;
  name: string;
  /** One line: what is set up. */
  setup: string;
  apply: () => State;
  response?: { label: string; undo: string; apply: (s: State) => State };
  story: (r: Result, s: State, responding: boolean) => ReactNode;
};

const GULF: State = DEFAULT_STATE;
const share = (r: Result, t: number) => (100 * t) / (r.crudeT || 1);
const m = (r: Result) => perBbl(r, r.econ.cash);
const kg = (r: Result, t = r.scope1) => (1000 * t) / (r.crudeBbl || 1);
const $ = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => v.toFixed(0);
const chem = (r: Result) => CHEMICALS.reduce((a, p) => a + r.products[p], 0);

const MAXJET = { nkShift: -20, kdShift: 20, hckMode: 'jet' as const };
const NZ_GULF: State = { ...GULF, prices: PRICES_NZ };

/** A stylized Bay Area-style refinery, not a model of any real site: like
 *  Chevron Richmond it has no coker but a solvent deasphalter (56 kb/d, the
 *  size EIA reports for Richmond) and a base oil plant, running mostly
 *  medium and heavy sour crude (Alaska North Slope, imports); a big hydrocracker runs for
 *  jet; California prices: product premiums from an isolated market with its
 *  own gasoline spec, dearer gas and power, and a cap-and-trade carbon price
 *  near $30/t. */
const WC_CAPS = { cdu: 260, coker: 0, sda: 56, hck: 45, lube: 22, fcc: 40, ref: 45, isom: 36, alky: 10, kht: 45, dht: 75, scr: 0, arom: 0 };
const WEST: State = {
  ...GULF, throughput: 245, slate: { ls: 0.10, ms: 0.50, hs: 0.40 }, hckMode: 'jet',
  units: Object.fromEntries(Object.entries(WC_CAPS).map(([u, c]) => [u, { on: c > 0, cap: c || GULF.units[u as keyof State['units']].cap }])) as State['units'],
  prices: { ...PRICES_2023, gasoline: 118, jet: 110, diesel: 120, gas: 5.5, power: 110, carbon: 30, grid: 0.2 },
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'gulf', name: 'Gulf Coast refinery',
    setup: 'A 250 kb/d deep-conversion refinery (FCC, hydrocracker, coker) running mostly sour crude at 2023-like prices.',
    apply: () => GULF,
    story: (r) => (
      <>It turns crude into {f0(share(r, r.products.gasoline))}% gasoline, {f0(share(r, r.products.diesel))}% diesel and
        {' '}{f0(share(r, r.products.jet))}% jet by mass, and almost no fuel oil, because the coker and crackers upgrade the heavy end.
        {' '}Cash margin is {$(m(r))}/bbl. Direct emissions are {f1(kg(r))} kg CO₂/bbl, {f0((100 * r.co2.heaters) / (r.scope1 || 1))}% of it from process heaters.
        {' '}Tap any bar in the diagram to see what a unit takes in and sends out.</>
    ),
  },
  {
    id: 'west', name: 'West Coast refinery',
    setup: 'A stylized Bay Area-style refinery: 245 kb/d, no coker but a solvent deasphalter and a base oil plant for lubricants (as at Chevron Richmond), a hydrocracker run for jet, and California prices with a $30/t cap-and-trade carbon price.',
    apply: () => WEST,
    response: {
      label: 'Co-process 10% plant oil', undo: 'Back to all crude',
      apply: (s) => ({ ...s, coproc: 0.10 }),
    },
    story: (r, s, responding) => {
      const base = compute(GULF), wc = compute(WEST);
      return responding ? (
        <>Plant oil in the diesel hydrotreater lifts diesel from {f1(share(wc, wc.products.diesel))}% to {f1(share(r, r.products.diesel))}% of crude,
          {' '}but at these prices it costs {$(m(r) - m(wc))}/bbl, about ${f0((wc.econ.cash - r.econ.cash) / (r.plantOil || 1))} per tonne of oil.
          {' '}California’s Low Carbon Fuel Standard and federal credits, not counted here, are what close that gap; two Bay Area refineries
          {' '}(Rodeo and Martinez) went further and converted entirely to renewable diesel.</>
      ) : (
        <>Jet is {f0(share(r, r.products.jet))}% of the crude, against {f0(share(base, base.products.jet))}% at the Gulf Coast refinery,
          {' '}because the hydrocracker serves the region’s airports, and {f1(share(r, r.products.baseOil))}% becomes lubricant base oil.
          {' '}With no coker, the deasphalter turns most of the residue into more cracker feed plus {f1(share(r, r.products.asphalt))}% asphalt and pitch,
          {' '}and the sulfur plant recovers {f0(r.products.sulfur)} t of sulfur a day from the sour crude.
          {' '}California’s isolated market and its own gasoline spec keep product prices high, so cash margin is {$(m(r))}/bbl against
          {' '}{$(m(base))}, even after dearer gas and a carbon cost of {$(perBbl(r, r.econ.carbon))}/bbl. Emissions are {f1(kg(r))} kg CO₂/bbl.
          {' '}The risk is gasoline demand, which California policy is pushing down; try setting gasoline to $85/bbl under “Prices and policy”.</>
      );
    },
  },
  {
    id: 'jet', name: 'Max jet',
    setup: 'Same refinery and prices. Cut points move to widen the kerosene cut and the hydrocracker switches to max jet.',
    apply: () => ({ ...GULF, ...MAXJET }),
    response: {
      label: 'Add jet hydrotreating', undo: 'Without the new hydrotreater',
      apply: (s) => ({ ...s, units: { ...s.units, kht: { on: true, cap: 55 } } }),
    },
    story: (r, s, responding) => {
      const base = compute(GULF);
      const ops = compute({ ...GULF, ...MAXJET });
      return responding ? (
        <>With 55 kb/d of jet hydrotreating instead of 35, jet reaches {f1(share(r, r.products.jet))}% of crude,
          {' '}against {f1(share(base, base.products.jet))}% at the start. That last step is hardware, not operations: a new or
          {' '}converted unit, years and real money.</>
      ) : (
        <>Operations alone raise jet from {f1(share(base, base.products.jet))}% to {f1(share(ops, ops.products.jet))}% of crude,
          {' '}about what US refiners managed when they swung yields in 2020. Margin moves by {$(m(ops) - m(base))}/bbl.
          {' '}{ops.units.kht.util >= 0.995 ? 'The jet hydrotreater is now full, so the extra kerosene goes to diesel.' : ''}</>
      );
    },
  },
  {
    id: 'collapse', name: 'Gasoline demand collapses',
    setup: 'Same refinery in a made-up net-zero world: gasoline and diesel prices collapse, chemicals hold up, carbon costs $150/t.',
    apply: () => NZ_GULF,
    response: {
      label: 'Try the levers', undo: 'Without the levers',
      apply: (s) => ({ ...s, ...MAXJET, fccMode: 'propylene' }),
    },
    story: (r, s, responding) => {
      const base = compute(GULF), nz = compute(NZ_GULF);
      return responding ? (
        <>Max jet and an FCC run for propylene lift cash margin from {$(m(nz))} to {$(m(r))}/bbl. Operations soften the
          {' '}blow but do not undo it; the hardware still makes mostly gasoline and diesel. See “Turn toward chemicals” for what new hardware does.</>
      ) : (
        <>Cash margin falls from {$(m(base))}/bbl at 2023-like prices to {$(m(r))}/bbl, and the carbon price alone costs
          {' '}{$(perBbl(r, r.econ.carbon))}/bbl. Net of fixed costs the refinery makes {$(perBbl(r, r.econ.net))}/bbl.
          {' '}Simple refineries do worse: try the hydroskimming preset.</>
      );
    },
  },
  {
    id: 'chem', name: 'Turn toward chemicals',
    setup: 'The same site in the net-zero world, with a naphtha steam cracker and an aromatics complex. All naphtha and reformate go to chemicals; the FCC runs for propylene.',
    apply: () => ({ ...NZ_GULF, units: unitsFromPreset('petchem'), naphToCracker: 1, refToArom: 1, fccMode: 'propylene' }),
    story: (r) => {
      const nz = compute(NZ_GULF);
      return (
        <>{f0(share(r, chem(r)))}% of the crude now leaves as chemicals, against {f0(share(nz, chem(nz)))}% for the fuels
          {' '}refinery, and cash margin is {$(m(r))}/bbl against {$(m(nz))}. The cost is CO₂: the cracker furnaces add
          {' '}{f1(kg(r, r.co2.cracker))} kg/bbl, for {f1(kg(r))} in all. {r.spills.some((x) => x.unit === 'scr') ? 'The cracker is full; more naphtha would need a bigger one.' : ''}</>
      );
    },
  },
  {
    id: 'h2', name: 'Decarbonize hydrogen',
    setup: 'The Gulf Coast refinery at 2023-like prices plus a $100/t carbon price, with carbon capture added to its steam methane reformer.',
    apply: () => ({ ...GULF, prices: { ...PRICES_2023, carbon: 100 }, h2Source: 'ccs' }),
    response: {
      label: 'Switch to electrolysis', undo: 'Back to carbon capture',
      apply: (s) => ({ ...s, h2Source: 'ely' }),
    },
    story: (r, s) => {
      const v = (h: State['h2Source']) => compute({ ...s, h2Source: h });
      const smr = v('smr'), ccs = v('ccs'), ely = v('ely');
      const rest = kg(smr, smr.co2.heaters + smr.co2.fccRegen + smr.co2.cracker);
      return (
        <>Steam reforming emits {f1(kg(smr, smr.co2.h2Plant))} of this refinery’s {f1(kg(smr))} kg CO₂/bbl.
          {' '}Carbon capture cuts the total to {f1(kg(ccs))} and changes margin by {$(m(ccs) - m(smr))}/bbl;
          {' '}electrolysis on ${s.prices.power}/MWh clean power cuts it to {f1(kg(ely))} at {$(m(ely) - m(smr))}/bbl.
          {' '}Either way {f1(rest)} kg/bbl from heaters and the FCC regenerator is untouched: hydrogen is the easy part.</>
      );
    },
  },
];

export default function Guided({ active, responding, onPick, r, s, mobile }: {
  active: string | null; responding: boolean;
  onPick: (id: string, respond: boolean) => void;
  r: Result; s: State; mobile: boolean;
}) {
  const cur = SCENARIOS.find((g) => g.id === active);
  const chip = (on: boolean) => ({
    font: `500 ${mobile ? 12.5 : 12}px var(--font-sans)`, padding: mobile ? '6px 10px' : '4px 9px',
    borderRadius: 4, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
    background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink)',
  });
  return (
    <section aria-label="Guided scenarios" style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: '8px 12px', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <span style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)', marginRight: 4 }}>
          Start with a story
        </span>
        {SCENARIOS.map((g) => (
          <button key={g.id} type="button" onClick={() => onPick(g.id, false)} aria-pressed={active === g.id} style={chip(active === g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      {cur ? (
        <div style={{ marginTop: 6, fontSize: mobile ? 13.5 : 13, lineHeight: 1.5 }}>
          <div style={{ color: 'var(--ink-2)' }}>
            {cur.setup}
            {cur.response && (
              <>{' '}
                <button type="button" onClick={() => onPick(cur.id, !responding)}
                  style={{ font: 'inherit', color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                  {responding ? cur.response.undo : cur.response.label}
                </button>
              </>
            )}
          </div>
          <div style={{ marginTop: 3 }}>{cur.story(r, s, responding)}</div>
        </div>
      ) : (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)' }}>
          You have moved the controls. Pick a story to start again from a known refinery.
        </div>
      )}
    </section>
  );
}

