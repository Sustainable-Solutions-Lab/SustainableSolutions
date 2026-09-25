/**
 * What the planner asks for, and what a firm would actually fund.
 *
 * Deliberately NOT part of the Sankey. Ghosting planner ribbons behind actor
 * ones needs rerouted flows, which only a re-solve produces, and the
 * unachievable case has no flow solution at all — any Sankey drawn for it would
 * be a plausible-looking fabrication. Stage-resolved capacity needs neither.
 *
 * One SOLID bar per stage: everything the plan relies on, existing plus new.
 *
 *   GREY           already built — sunk, so the screen never judges it
 *   GREEN          new build a firm would fund at the stated hurdle
 *   RED            new build the plan depends on that no firm would fund
 *
 * The existing block is plain grey rather than textured: sunk capital reads as
 * "not a decision" simply by being uncoloured beside the green and red of things
 * that are. Hairlines inside it name the real plants, abbreviated, because "MP
 * Fort Worth is most of US magnet capacity" is the fact a reader needs, and
 * "10 kt exists" is not — the full name, capacity and note are on hover.
 *
 * Bars are NOT commensurate across stages — mining is kt of concentrate, magnet
 * is kt of finished magnet — so each row names its own unit.
 */
import { Pickaxe, FlaskConical, Flame, Magnet, Recycle } from 'lucide-react';
import { screen, PRICE_WORLDS, HAS_META, hurdleRate, PLANNER_RATE, priceSensitive,
         type Buildout, type Verdict } from './projectFinance';
import { stageBreakdown, stageBreakdownClass, riskColor, riskChip } from './tri';
import type { Scenario } from './interp';
import BankabilityFrontier from './BankabilityFrontier';

/** Stage -> the flow interface whose mass it produces. Used to express a stage's
 *  capacity in units of ONE rare-earth class, by the share of that interface's
 *  mass the class accounts for — the same fraction the Sankey scales by, so the
 *  two views cannot disagree. Recycling has no interface of its own. */
const STAGE_IFACE: Record<string, string> = {
  mining: 'concentrate', separation: 'oxide', alloy: 'alloy', magnet: 'magnet',
};
const CLASSES = [
  { key: 'all', label: 'All' },
  { key: 'heavy', label: 'Dy/Tb (heavy)' },
  { key: 'light', label: 'Nd/Pr (light)' },
] as const;
export type ReClass = 'all' | 'heavy' | 'light';
/** What each stage's kt actually measures. Named per row because the bars are
 *  NOT commensurate across stages — 42 kt of concentrate is not 42 kt of magnet. */
const PRODUCT: Record<string, string> = {
  mining: 'concentrate', separation: 'oxide', alloy: 'alloy',
  magnet: 'finished magnets', recycling: 'recovered oxide',
};
const GREEN = 'var(--brand-green)';
const RED = '#D53E4F';
/** One operating plant, for the hairlines inside the existing block. */
export type Incumbent = { stage: string; name: string; kt: number; note?: string };

/** The three instruments that reach the project screen. Quantity levers
 *  (domestic content, friendshoring) act on the PLANNER and live in the world
 *  controls above; putting them here would imply they change a firm's return,
 *  which is exactly the confusion the registry exists to prevent. */
const INSTRUMENTS = [
  { key: 'offtake', label: 'Offtake', relief: 0.70,
    hint: 'Binary switch, fixed quantity: removes 70% of the risk premium — volume risk is its largest single component. Costs nothing unless the buyer walks. Reliefs do NOT stack; the largest single one wins.' },
  { key: 'floor', label: 'Price floor', relief: 0.50,
    hint: 'Removes 50% of the risk premium, but ONLY for the stages the floor\u2019s trade interface covers: a floor on magnets does nothing for a separation plant. Reliefs do not stack.' },
  { key: 'guarantee', label: 'Loan guarantee', relief: 1.00,
    hint: 'Removes 100% of the risk premium — the project finances at the planner\u2019s rate outright. Reliefs do not stack.' },
] as const;
// A cost subsidy is deliberately absent: it earns ZERO relief, because it shifts
// the mean return without removing any state of the world. That asymmetry is the
// point of the registry, and a chip reading "0%" would invite clicking it.

/** Shorten a plant name for an inline label; the hover carries the full name,
 *  the capacity and the project note. "MP Fort Worth (magnets)" is 23 characters
 *  in a bar that is often 60px wide. */
const abbrev = (name: string): string => {
  const short = name
    .replace(/\s*\([^)]*\)/g, '')                       // drop "(magnets)", "(Indiana)"
    .replace(/\b(separation|recycling|mining|mine|magnets?|metal\/alloy|alloy)\b/ig, '')
    .replace(/\s{2,}/g, ' ').trim();
  return short.length > 15 ? `${short.slice(0, 14)}\u2026` : short;
};

const STAGES = ['mining', 'separation', 'alloy', 'magnet', 'recycling'] as const;
const LABEL: Record<string, string> = {
  mining: 'Mining', separation: 'Separation', alloy: 'Alloying',
  magnet: 'Magnet', recycling: 'Recycling',
};
const ICON: Record<string, JSX.Element> = {
  mining: <Pickaxe size={14} strokeWidth={1.5} />,
  separation: <FlaskConical size={14} strokeWidth={1.5} />,
  alloy: <Flame size={14} strokeWidth={2.1} />,
  magnet: <Magnet size={14} strokeWidth={1.5} />,
  recycling: <Recycle size={14} strokeWidth={1.5} />,
};
export default function CapacityPanel({ buildout, incumbent, priceWorld, onPriceWorld,
                                        rate, onRate, instruments, onInstruments,
                                        sc, alliedHHI, reClass, onReClass,
                                        costMult, onCostMult, foakMult, onFoakMult,
                                        provenancePremium, onProvenancePremium }: {
  buildout: Buildout[] | undefined;
  incumbent: Record<string, Incumbent[]>;
  priceWorld: string;
  onPriceWorld: (w: string) => void;
  rate: number;
  onRate: (r: number) => void;
  instruments: Record<string, boolean>;
  onInstruments: (i: Record<string, boolean>) => void;
  sc: Scenario;
  alliedHHI?: Record<string, number>;
  reClass: ReClass;
  onReClass: (c: ReClass) => void;
  costMult: number;
  onCostMult: (v: number) => void;
  foakMult: number;
  onFoakMult: (v: number) => void;
  provenancePremium: number;
  onProvenancePremium: (v: number) => void;
}) {
  if (!buildout) {
    return (
      <section style={{ border: '1px dashed var(--rule-strong)', borderRadius: 10,
                        padding: '14px 18px', background: 'var(--paper)', marginTop: 22 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px' }}>
          Would it actually be built
        </h2>
        <p style={{ fontSize: 11.5, opacity: 0.7, margin: 0, maxWidth: 620, lineHeight: 1.45 }}>
          Waiting on a grid that carries the planner build-out. The model emits it; this
          panel appears when a regrid carrying it is deployed.
        </p>
      </section>
    );
  }

  // Trade risk per stage, on the SAME row as the capacity it belongs to. Exposure
  // and build-out are two readings of one decision, and splitting them across two
  // stage-resolved charts made the reader hold mining's bar in one and mining's
  // risk in the other. The class toggle governs both, because "which stage is
  // exposed" has a different answer for Dy/Tb than for Nd/Pr.
  const triByStage: Record<string, number> = Object.fromEntries(
    (reClass === 'all' ? stageBreakdown(sc, alliedHHI)
                       : stageBreakdownClass(sc, reClass, alliedHHI))
      .map((st) => [st.key, st.tri]));
  // Share of an interface's mass that is this RE class, so a stage's capacity can
  // be read in class units. 1 for 'all', and for recycling, which has no interface.
  const classFrac = (stage: string): number => {
    if (reClass === 'all') return 1;
    const iface = STAGE_IFACE[stage];
    const re = sc.flows_re?.[reClass]?.[iface];
    if (!iface || !re) return 1;
    const sum = (rows?: { value: number }[]) => (rows ?? []).reduce((a, f) => a + f.value, 0);
    const agg = sum(sc.flows?.[iface]);
    return agg > 1e-9 ? sum(re) / agg : 1;
  };

  const us = buildout.filter((b) => b.r === 'USA');
  const verdicts: Verdict[] = screen(us, PRICE_WORLDS[priceWorld] ?? PRICE_WORLDS.neutral, {
    rate,
    offtake: instruments.offtake,
    floorInterface: instruments.floor ? 'magnet' : null,
    creditSupport: instruments.guarantee ? 1 : 0,
    costMult, foakMult, provenancePremium,
  });
  const byStage = (s: string) => verdicts.filter((v) => v.stage === s);
  const incKt = (s: string) => (incumbent[s] ?? []).reduce((a, f) => a + f.kt, 0);
  const maxKt = Math.max(0.001, ...STAGES.map((s) =>
    (incKt(s) + byStage(s).reduce((a, v) => a + v.newKt, 0)) * classFrac(s)));
  const shortfall = verdicts.filter((v) => !v.funded);
  // Minimal scale ticks. All bars share `maxKt`, so one step serves every row —
  // the PRODUCT differs by stage but the measure (kt/yr) does not, so a tick at
  // 20 means 20 kt on any row. Chosen to give 3-6 marks at a round tonnage.
  const tickStep = (() => {
    const raw = maxKt / 4;
    const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
    return [1, 2, 5, 10].map((m) => m * mag).find((c) => maxKt / c <= 6) ?? mag * 10;
  })();
  const ticks = Array.from({ length: Math.floor(maxKt / tickStep) + 1 }, (_, i) => i * tickStep)
    .filter((t) => t > 0);
  // Stages the US already operates but which the plan never expands. Worth
  // naming: a reader who sees only a magnet bar assumes the others were screened
  // and failed, when in fact the planner never asked. The distinction is the
  // whole point — a gap in the PLAN is a different problem from a gap in the
  // FINANCING, and only the second is what an offtake or a guarantee can fix.
  const unasked = STAGES.filter((s) => incKt(s) > 0 && byStage(s).length === 0);
  const anyPriceSensitive = verdicts.some((v) => priceSensitive(v.stage));

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20,
                      background: 'var(--paper)', marginTop: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
          Would it actually be built
        </h2>
        <div style={{ display: 'flex', gap: 5 }} title={anyPriceSensitive
            ? 'Prices are a free control here: the screen is arithmetic, not a solve'
            : 'No screened project is price-sensitive in this scenario — see the note below'}>
          {Object.keys(PRICE_WORLDS).map((w) => (
            <button key={w} onClick={() => onPriceWorld(w)}
              style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5,
                       cursor: 'pointer', opacity: anyPriceSensitive ? 1 : 0.4,
                       border: `1px solid ${priceWorld === w ? 'var(--accent)' : 'var(--rule-strong)'}`,
                       background: priceWorld === w ? 'var(--accent)' : 'transparent',
                       color: priceWorld === w ? 'var(--paper)' : 'var(--ink)' }}>
              {w.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 12px', maxWidth: 640, lineHeight: 1.45 }}>
        US capacity the least-cost planner calls for, against what clears a private hurdle
        rate at these prices. An outline with nothing in it is capacity the plan depends on
        that no firm would fund.
      </p>

      {/* The two knobs that actually move a verdict. The planner charges
          {PLANNER_RATE}; everything between that and the hurdle is the wedge an
          instrument is trying to close, which is why they sit side by side. */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
                    padding: '10px 12px', marginBottom: 14, borderRadius: 8,
                    background: 'var(--paper-2)', border: '1px solid var(--rule)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Hurdle rate</span>
          <input type="range" min={PLANNER_RATE} max={0.35} step={0.005} value={rate}
            onChange={(e) => onRate(parseFloat(e.target.value))}
            style={{ width: 150, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 38 }}>
            {(rate * 100).toFixed(1)}%
          </span>
        </label>
        <span style={{ fontSize: 10.5, opacity: 0.55 }}>
          planner {(PLANNER_RATE * 100).toFixed(0)}% · US default {(hurdleRate('USA') * 100).toFixed(0)}%
        </span>
        {/* The calibration the US conclusion turns on. Fixed values invite the
            reader to believe them; these are the numbers we are least sure of. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}
          title="Scales the US regional cost disadvantage (opex and fixed). 1x is as calibrated: 1.6x China at the magnet stage.">
          <span style={{ whiteSpace: 'nowrap' }}>US cost</span>
          <input type="range" min={0.5} max={2.5} step={0.05} value={costMult}
            onChange={(e) => onCostMult(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 34 }}>{costMult.toFixed(2)}×</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}
          title="Scales the first-of-a-kind premium ABOVE one. 0 = a US plant builds like an nth-of-a-kind; 1 = as calibrated (1.3x at the magnet stage); 2 = twice the penalty.">
          <span style={{ whiteSpace: 'nowrap' }}>FOAK</span>
          <input type="range" min={0} max={2.5} step={0.05} value={foakMult}
            onChange={(e) => onFoakMult(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 34 }}>{foakMult.toFixed(2)}×</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}
          title="What a buyer pays extra, per kg of finished magnet, for supply that never touched China. The model charges the ex-China premium to the US as a COST but never credits it as revenue to an ex-China producer; this is that missing side. No defensible default, so it starts at zero.">
          <span style={{ whiteSpace: 'nowrap' }}>Provenance premium</span>
          <input type="range" min={0} max={60} step={1} value={provenancePremium}
            onChange={(e) => onProvenancePremium(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 46 }}>${provenancePremium.toFixed(0)}/kg</span>
        </label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {INSTRUMENTS.map((i) => {
            const on = !!instruments[i.key];
            return (
              <button key={i.key} title={i.hint}
                onClick={() => onInstruments({ ...instruments, [i.key]: !on })}
                style={{ font: '600 10px var(--font-mono)', padding: '3px 8px', borderRadius: 5,
                         cursor: 'pointer',
                         border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                         background: on ? 'var(--accent)' : 'transparent',
                         color: on ? 'var(--paper)' : 'var(--ink)' }}>
                {i.label}
                <span style={{ opacity: on ? 0.75 : 0.45, fontWeight: 400, marginLeft: 4 }}>
                  &minus;{(i.relief * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Which RE class the bars and the risk column describe. Dy/Tb is the real
          chokepoint; Nd/Pr is far more diversified, so a single "All" reading
          averages the problem away. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    marginBottom: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.6 }}>By RE class:</span>
        {CLASSES.map((c) => {
          const on = reClass === c.key;
          return (
            <button key={c.key} onClick={() => onReClass(c.key)}
              style={{ font: '600 10.5px var(--font-mono)', padding: '3px 9px', borderRadius: 6,
                       cursor: 'pointer',
                       border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                       background: on ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
              {c.label}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', font: '600 9.5px var(--font-mono)',
                       letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.45 }}>
          trade risk
        </span>
      </div>
      {reClass !== 'all' && (
        // Worth stating: in class mode the bars are CONTAINED metal, not plant
        // throughput, and a magnet is only ~2% Dy/Tb by mass. Without this the
        // tonnages look like a bug rather than a change of unit.
        <p style={{ fontSize: 10.5, opacity: 0.5, margin: '-2px 0 8px', lineHeight: 1.4 }}>
          Bars show kt of contained {reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'} passing each
          stage, not total plant throughput — a finished magnet is about{' '}
          {reClass === 'heavy' ? '2% Dy/Tb' : '33% Nd/Pr'} by mass.
        </p>
      )}

      {STAGES.map((s) => {
        const vs = byStage(s);
        const cf = classFrac(s);
        const fac = (incumbent[s] ?? []).map((f) => ({ ...f, kt: f.kt * cf }))
          .filter((f) => f.kt > 0).sort((a, b) => b.kt - a.kt);
        const inc = fac.reduce((a, f) => a + f.kt, 0);
        const asked = vs.reduce((a, v) => a + v.newKt, 0) * cf;
        const funded = vs.filter((v) => v.funded).reduce((a, v) => a + v.newKt, 0) * cf;
        const declined = asked - funded;
        if (inc <= 0 && asked <= 0) return null;
        const pc = (v: number) => `${(v / maxKt) * 100}%`;
        const tri = triByStage[s];
        return (
          <div key={s} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ opacity: 0.7, display: 'flex', alignSelf: 'center' }}>{ICON[s]}</span>
              <span>{LABEL[s]}</span>
              {/* Bars at different stages measure DIFFERENT products, so the unit has
                  to be named per row. Without it the 42 kt mining bar reads as though
                  it were commensurate with the 22 kt magnet bar. */}
              <span style={{ font: '400 10px var(--font-mono)', opacity: 0.45 }}>
                kt/yr {PRODUCT[s]}
              </span>
              <span style={{ marginLeft: 'auto', font: '400 10.5px var(--font-mono)', opacity: 0.7 }}>
                {asked > 0 && (
                  <>
                    <span style={{ color: funded > 0.005 ? GREEN : 'inherit' }}>
                      +{funded.toFixed(1)} built
                    </span>
                    {declined > 0.005 && (
                      <span style={{ color: RED }}> · {declined.toFixed(1)} declined</span>
                    )}
                  </>
                )}
              </span>
            </div>
            {/* Bar is narrowed to leave the right-hand column for the stage's trade
                risk, so build-out and exposure are read on one line. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 62px', gap: 10,
                          alignItems: 'center' }}>
              <div>
              <div style={{ position: 'relative', height: 20, background: 'var(--paper-2)',
                            border: '1px solid var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
                {/* SOLID base: everything the plan relies on, existing plus new. The
                    new part is split by verdict — green is funded, red is capacity the
                    plan depends on that no firm would put money into. */}
                {/* Already built: flat grey, no texture. Sunk capital reads as
                    "not a decision" perfectly well by being uncoloured next to the
                    green and red of things that ARE decisions. */}
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pc(inc),
                              background: 'var(--ink-3)', opacity: 0.32 }} />
                <div style={{ position: 'absolute', left: pc(inc), top: 0, bottom: 0,
                              width: pc(funded), background: GREEN, opacity: 0.75 }} />
                <div style={{ position: 'absolute', left: pc(inc + funded), top: 0, bottom: 0,
                              width: pc(declined), background: RED, opacity: 0.75 }} />
                {/* Hairlines naming the real plants inside the existing block. */}
                {fac.map((f, i) => {
                  const left = fac.slice(0, i).reduce((a, x) => a + x.kt, 0);
                  const wide = (f.kt / maxKt) > 0.13;
                  return (
                    <div key={f.name} title={`${f.name} — ${f.kt.toFixed(1)} kt/yr${f.note ? `\n\n${f.note}` : ''}`}
                      style={{ position: 'absolute', left: pc(left), top: 0, bottom: 0, width: pc(f.kt),
                               borderLeft: i > 0 ? '1px solid var(--paper)' : 'none',
                               display: 'flex', alignItems: 'center', overflow: 'hidden', cursor: 'help' }}>
                      {wide && (
                        <span style={{ font: '500 9px var(--font-mono)', opacity: 0.75,
                                       paddingLeft: 4, whiteSpace: 'nowrap' }}>
                          {abbrev(f.name)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* ticks share the bar's grid CHILD, not just its column, so the
                  risk chip beside them stays level with the bar itself */}
              <div style={{ position: 'relative', height: 9, marginTop: 1 }}>
                {ticks.map((t) => (
                  <span key={t} style={{ position: 'absolute', left: `${(t / maxKt) * 100}%`,
                                         top: 0, width: 1, height: 3,
                                         background: 'var(--ink)', opacity: 0.28 }} />
                ))}
                {ticks.map((t) => (
                  <span key={`l${t}`} style={{ position: 'absolute', left: `${(t / maxKt) * 100}%`,
                                               top: 3, transform: 'translateX(-50%)',
                                               font: '400 8px var(--font-mono)', opacity: 0.4 }}>
                    {t % 1 === 0 ? t : t.toFixed(1)}
                  </span>
                ))}
              </div>
              </div>
              {tri == null ? (
                <span style={{ font: '400 10px var(--font-mono)', opacity: 0.35, textAlign: 'right' }}
                  title="Recycling is a domestic feedstock, not a sourcing stage — the index has no term for it.">
                  —
                </span>
              ) : (
                <span style={{ textAlign: 'right', font: '600 11px var(--font-mono)' }}
                  title={`Trade-risk index for ${LABEL[s].toLowerCase()}${reClass === 'all' ? '' : `, ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}`}: ${tri.toFixed(2)} — lower is secure`}>
                  <span style={riskChip(riskColor(tri))}>{tri.toFixed(2)}</span>
                </span>
              )}
            </div>
            {/* Name the projects, not just the tonnage: "Ucore does not clear" is
                actionable where "separation is short 12 kt" is not. */}
            {vs.length > 0 && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 3,
                            font: '400 9.5px var(--font-mono)', opacity: 0.65 }}>
                {vs.map((v) => (
                  <span key={v.facility} title={
                    `NPV ${v.npv.toFixed(0)} $M at ${(v.effRate * 100).toFixed(1)}% · ` +
                    `${v.plannerNpv.toFixed(0)} $M at the planner's ${(PLANNER_RATE * 100).toFixed(0)}% ` +
                    `(financing wedge ${(v.plannerNpv - v.npv).toFixed(0)} $M) · ` +
                    `${v.leadYears} yr build · breakeven ${v.breakeven.toFixed(1)} $/kg` +
                    (v.funded ? '' : ` · needs ${v.supportNeeded.toFixed(0)} $M/yr to clear`)}>
                    <span style={{ color: v.funded ? 'var(--accent)' : 'var(--ink-3)' }}>
                      {v.funded ? '●' : '○'}
                    </span>{' '}{v.facility}
                    {!v.funded && (
                      <span style={{ opacity: 0.8 }}> · needs {v.supportNeeded.toFixed(0)} $M/yr</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* The verdict in one line, because the bars answer "how much" and a reader
          still has to be told "so is there a gap or not". */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)',
                    fontSize: 11.5, lineHeight: 1.5, maxWidth: 660 }}>
        {verdicts.length === 0 ? (
          <span>
            <strong>The plan asks for no new US capacity here.</strong> Least cost is met by
            imports, recycling and designing Dy/Tb out, so there is nothing for a firm to
            decline — the bars above are existing plant only. Raise the China restriction,
            or require domestic content, to give the planner a reason to build.
          </span>
        ) : shortfall.length === 0 ? (
          <span>
            <strong>No financing gap here.</strong> Every expansion the planner asks for clears
            a {(rate * 100).toFixed(1)}% hurdle unaided
            {unasked.length > 0 && (
              <> — but the plan only ever asks for {STAGES.filter((s) => byStage(s).length > 0)
                .map((s) => LABEL[s].toLowerCase()).join(' and ')} capacity.
                It requests no new {unasked.map((s) => LABEL[s].toLowerCase()).join(', ')} at all,
                so the exposure at those stages is a gap in the <em>plan</em>, not one an offtake
                or a guarantee could close.</>
            )}
          </span>
        ) : (
          <span>
            <strong>{shortfall.length} of {verdicts.length} expansions do not clear</strong> at
            a {(rate * 100).toFixed(1)}% hurdle: {shortfall.map((v) => v.facility).join(', ')}.
            Closing that needs {shortfall.reduce((a, v) => a + v.supportNeeded, 0).toFixed(0)} $M/yr
            of support, or an instrument that removes enough risk to lower the rate itself.
          </span>
        )}
      </div>

      <BankabilityFrontier rows={us} priceWorld={priceWorld} rate={rate}
        instruments={instruments} costMult={costMult} foakMult={foakMult}
        provenancePremium={provenancePremium} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: 'var(--ink-3)', opacity: 0.32 }} /> already built (sunk, never screened)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: GREEN, opacity: 0.75 }} /> new build a firm would fund</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: RED, opacity: 0.75 }} /> asked for, but declined</span>
        {!anyPriceSensitive && (
          <span style={{ opacity: 0.75 }}>
            · price world is inert here: conversion stages earn an asserted spread, so the
            oxide price cancels between revenue and feedstock
          </span>
        )}
        {!HAS_META && <span style={{ opacity: 0.5 }}>· constants inline pending regrid</span>}
      </div>
    </section>
  );
}
