/**
 * What the planner asks for, and what a firm would actually fund.
 *
 * Deliberately NOT part of the Sankey. Ghosting planner ribbons behind actor
 * ones needs rerouted flows, which only a re-solve produces, and the
 * unachievable case has no flow solution at all — any Sankey drawn for it would
 * be a plausible-looking fabrication. Stage-resolved capacity needs neither.
 *
 * One COLUMN per stage, in chain order, so the panel reads left to right like
 * the chain above it. Each column is everything the plan relies on at that
 * stage, existing plus new, drawn to the same height:
 *
 *   GREY           already built — sunk, so the screen never judges it
 *   GREEN          new build a firm would fund at the stated hurdle
 *   RED            new build the plan depends on that no firm would fund
 *
 * The shared scale is PER CENT of that stage's capacity, because the stages are
 * not commensurate: mining is kt of concentrate, magnet is kt of finished
 * magnet, and on a common tonnage axis the small stages vanished beside
 * Mountain Pass. Each column carries its own tonnage on its right-hand side.
 * That is one measure read in two units, not two measures on one plot.
 *
 * The existing block is plain grey rather than textured: sunk capital reads as
 * "not a decision" simply by being uncoloured beside the green and red of things
 * that are. Gaps inside it separate the real plants, named where there is room,
 * because "MP Fort Worth is most of US magnet capacity" is the fact a reader
 * needs — the full name, capacity and note are on hover.
 */
import { Pickaxe, FlaskConical, Flame, Magnet, Recycle } from 'lucide-react';
import { screen, HAS_META, PLANNER_RATE, priceSensitive,
         priceAtSpread, MAGNET_CONVERSION_DEFAULT, LEGACY_CONVERSION,
         type Buildout, type Verdict } from './projectFinance';
import { stageBreakdown, stageBreakdownClass, riskColor, riskChip } from './tri';
import type { Scenario } from './interp';
import BankabilityFrontier from './BankabilityFrontier';
import HurdleComponents from './HurdleComponents';

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
  mining: 'concentrate', separation: 'Nd/Pr + Dy/Tb oxide', alloy: 'alloy',
  magnet: 'finished magnets', recycling: 'scrap processed',
};
/** Tonnage to DRAW for a build-out row. The model states separation in TREO fed;
 *  the plants a reader knows are rated in the Nd/Pr and Dy/Tb oxide they make, so
 *  a separation row is drawn as the magnet oxide in its feed. Every other stage
 *  is already in the unit its plants are rated in. */
const drawnKt = (b: Buildout): number =>
  b.s === 'separation' && b.basket
    ? b.kt * ((b.basket.NdPr ?? 0) + (b.basket.DyTb ?? 0)) : b.kt;
const GREEN = 'var(--brand-green)';
const RED = '#D53E4F';
// Column fills. The transparency is in the colour, not on the element, so a
// plant's name inside its block is drawn at full strength.
const GREY = 'color-mix(in srgb, var(--ink-3) 32%, transparent)';
const FUNDED = `color-mix(in srgb, ${GREEN} 80%, transparent)`;
const DECLINED = `color-mix(in srgb, ${RED} 80%, transparent)`;
/** Widest a column's bar is drawn: the slot's leftover is air. */
const BAR_W = 76;
/** One operating plant, for the hairlines inside the existing block. */
export type Incumbent = { stage: string; name: string; kt: number; note?: string };

/** Shorten a plant name for an inline label; the hover carries the full name,
 *  the capacity and the project note. "MP Fort Worth (magnets)" is 23 characters
 *  in a bar that is often 60px wide. */
const abbrev = (name: string): string => {
  const short = name
    .replace(/\s*\([^)]*\)/g, '')                       // drop "(magnets)", "(Indiana)"
    .replace(/\b(separation|recycling|mining|mine|magnets?|metal\/alloy|alloy)\b/ig, '')
    .replace(/\s{2,}/g, ' ').trim();
  return short.length > 11 ? `${short.slice(0, 10)}\u2026` : short;
};

/** Height of every capacity column, px. */
const COLUMN_H = 220;
/** Round tonnage ticks for one column: three to five marks inside its total. */
const ktTicks = (total: number): number[] => {
  if (total <= 0) return [];
  const raw = total / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((c) => total / c <= 5) ?? mag * 10;
  return Array.from({ length: Math.floor(total / step + 1e-9) }, (_, i) => (i + 1) * step);
};

const STAGES = ['mining', 'separation', 'alloy', 'magnet', 'recycling'] as const;
const LABEL: Record<string, string> = {
  mining: 'Mining', separation: 'Separation', alloy: 'Alloying',
  magnet: 'Magnet', recycling: 'Recycling',
};
/** For columns too narrow to carry the full word. */
const SHORT: Record<string, string> = {
  mining: 'Mine', separation: 'Separate', alloy: 'Alloy', magnet: 'Magnet', recycling: 'Recycle',
};
const ICON: Record<string, JSX.Element> = {
  mining: <Pickaxe size={14} strokeWidth={1.5} />,
  separation: <FlaskConical size={14} strokeWidth={1.5} />,
  alloy: <Flame size={14} strokeWidth={2.1} />,
  magnet: <Magnet size={14} strokeWidth={1.5} />,
  recycling: <Recycle size={14} strokeWidth={1.5} />,
};
export default function CapacityPanel({ buildout, incumbent, priceSpread, onPriceSpread,
                                        conversion, onConversion,
                                        rate, onRate, instruments, onInstruments,
                                        sc, alliedHHI, reClass, onReClass,
                                        costMult, onCostMult, foakMult, onFoakMult,
                                        provenancePremium, onProvenancePremium, floorLevel }: {
  buildout: Buildout[] | undefined;
  incumbent: Record<string, Incumbent[]>;
  /** Oxide prices as a multiple of today's ex-China spread. 0 = China parity. */
  priceSpread: number;
  onPriceSpread: (v: number) => void;
  /** Magnet conversion spread, $/kg. The number the bankability result hinges on. */
  conversion: number;
  onConversion: (v: number) => void;
  rate: number;
  onRate: (r: number) => void;
  instruments: Record<string, number>;
  onInstruments: (i: Record<string, number>) => void;
  /** How far the planner-side price floor is set (0-1). Scales the floor's relief. */
  floorLevel: number;
  sc: Scenario;
  alliedHHI?: Record<string, number>;
  reClass: ReClass;
  onReClass: (c: ReClass) => void;
  /** US cost disadvantage and provenance premium, one of each per stage: the
   *  positions of the markers on the frontiers below. */
  costMult: Record<string, number>;
  onCostMult: (v: Record<string, number>) => void;
  foakMult: number;
  onFoakMult: (v: number) => void;
  provenancePremium: Record<string, number>;
  onProvenancePremium: (v: Record<string, number>) => void;
}) {
  if (!buildout) {
    return (
      <section style={{ border: '1px dashed var(--rule-strong)', borderRadius: 10,
                        padding: '14px 18px', background: 'var(--paper)', marginTop: 22 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px' }}>
          Would it actually be built?
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

  // Committed construction is built whatever the screen says, so it is not judged.
  const us = buildout.filter((b) => b.r === 'USA' && !b.c);
  const cohorts: Verdict[] = screen(us, priceAtSpread(priceSpread, conversion), {
    rate,
    offtake: instruments.offtake,
    floorInterface: 'magnet', floorRelief: instruments.floor, floorLevel,
    creditSupport: instruments.guarantee,
    costMult, foakMult, provenancePremium,
  });
  // The planner's build-out arrives as COHORTS, one per facility per year it
  // expands, because each is its own investment decision. A reader thinks in
  // plants, so the cohorts of one facility are drawn and named together; the
  // tonnage that clears is still counted cohort by cohort.
  type Plant = Verdict & { fundedKt: number; cohorts: (Verdict & { year?: number })[] };
  const plants = new Map<string, Plant>();
  cohorts.forEach((v, i) => {
    const kt = drawnKt(us[i]);
    const c = { ...v, newKt: kt, year: us[i].y0 };
    const p = plants.get(`${v.stage}|${v.facility}`);
    if (!p) {
      plants.set(`${v.stage}|${v.facility}`,
        { ...c, fundedKt: v.funded ? kt : 0, cohorts: [c] });
    } else {
      p.newKt += kt; p.fundedKt += v.funded ? kt : 0;
      p.npv += v.npv; p.plannerNpv += v.plannerNpv;
      p.supportNeeded += v.supportNeeded;
      p.funded = p.funded && v.funded;
      p.leadYears = Math.max(p.leadYears, v.leadYears);
      p.cohorts.push(c);
    }
  });
  const verdicts: Plant[] = [...plants.values()];
  const byStage = (s: string) => verdicts.filter((v) => v.stage === s);
  const incKt = (s: string) => (incumbent[s] ?? []).reduce((a, f) => a + f.kt, 0);
  const shortfall = verdicts.filter((v) => !v.funded);
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
          Would it actually be built?
        </h2>
        <label title={anyPriceSensitive
            ? "How far oxide prices are bifurcated between China and everyone else. 0 means parity with the Chinese domestic benchmark; 1 is where the ex-China market actually sits after 2025; above 1 assumes the gap widens further. It decides whether US separation clears, so it is a control rather than a fixed assumption."
            : "Inert in this scenario: every screened project is a CONVERSION stage, whose output price is defined as its input price plus a fixed spread, so the oxide price cancels exactly. It bites for mining and separation."}
          style={{ display: 'flex', alignItems: 'center', gap: '2px 8px', fontSize: 11.5,
                   flexWrap: 'wrap', maxWidth: '100%', opacity: anyPriceSensitive ? 1 : 0.45 }}>
          <span style={{ whiteSpace: 'nowrap' }}>Ex-China oxide spread</span>
          <input type="range" min={0} max={2} step={0.05} value={priceSpread}
            onChange={(e) => onPriceSpread(parseFloat(e.target.value))}
            style={{ width: 120, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 96 }}>
            {priceSpread.toFixed(2)}×{' '}
            <span style={{ opacity: 0.55, fontWeight: 400 }}>
              {priceSpread === 0 ? 'China parity' : Math.abs(priceSpread - 1) < 0.03 ? "today's" : ''}
            </span>
          </span>
        </label>
        <label title={`What turning alloy into a finished magnet is worth, over and above the alloy consumed. Every region is paid the same spread, so this is the price a US plant must live on. The default is what the marginal CHINESE producer needs — its cost plus a normal return, $${MAGNET_CONVERSION_DEFAULT.toFixed(2)}/kg from the model's plant data — because in a market China dominates that is where the price settles. US conversion costs several times that all-in at its hurdle, so at the competitive spread no US plant clears unaided: the provenance premium below, or an offtake, is what has to make up the difference. $${LEGACY_CONVERSION.magnet} is the earlier asserted value, under which the plan looked bankable almost everywhere.`}
          style={{ display: 'flex', alignItems: 'center', gap: '2px 8px', fontSize: 11.5,
                   flexWrap: 'wrap', maxWidth: '100%' }}>
          <span style={{ whiteSpace: 'nowrap' }}>Conversion spread</span>
          <input type="range" min={2} max={40} step={0.25} value={conversion}
            onChange={(e) => onConversion(parseFloat(e.target.value))}
            style={{ width: 110, accentColor: 'var(--accent)' }} />
          <span style={{ font: '600 11px var(--font-mono)', minWidth: 118 }}>
            ${conversion.toFixed(2)}/kg{' '}
            <span style={{ opacity: 0.55, fontWeight: 400 }}>
              {Math.abs(conversion - MAGNET_CONVERSION_DEFAULT) < 0.13 ? 'China cost + return'
                : Math.abs(conversion - LEGACY_CONVERSION.magnet) < 0.13 ? 'former assertion'
                : conversion < 15 ? 'below US cost' : ''}
            </span>
          </span>
        </label>
      </div>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 12px', maxWidth: 640, lineHeight: 1.45 }}>
        US capacity the least-cost planner calls for, against what clears a private hurdle
        rate at these prices, stage by stage along the chain. Red is capacity the plan
        depends on that no firm would fund. Prices are set where the marginal Chinese
        producer needs them, so a US plant clears only if something pays for its provenance.
      </p>

      {/* Which RE class the columns and the risk figures describe. Dy/Tb is the
          real chokepoint; Nd/Pr is far more diversified, so a single "All" reading
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
      </div>
      {reClass !== 'all' && (
        // Worth stating: in class mode the columns are CONTAINED metal, not plant
        // throughput, and a magnet is only ~2% Dy/Tb by mass. Without this the
        // tonnages look like a bug rather than a change of unit.
        <p style={{ fontSize: 10.5, opacity: 0.5, margin: '-2px 0 8px', lineHeight: 1.4 }}>
          Columns show kt of contained {reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'} passing each
          stage, not total plant throughput — a finished magnet is about{' '}
          {reClass === 'heavy' ? '1.5% Dy/Tb' : '33% Nd/Pr'} by mass.
        </p>
      )}

      <style>{`
        .cap-plant, .cap-unit, .cap-long { display: none; }
        .cap-short { display: block; font-size: 9.5px; }
        .cap-head { flex-direction: column; gap: 2px; }
        @media (min-width: 720px) {
          .cap-plant, .cap-unit, .cap-long { display: block; }
          .cap-short { display: none; }
          .cap-head { flex-direction: row; gap: 5px; }
        }
        .cap-seg:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      `}</style>
      {(() => {
        const cols = STAGES.map((s) => {
          const vs = byStage(s);
          const cf = classFrac(s);
          const fac = (incumbent[s] ?? []).map((f) => ({ ...f, kt: f.kt * cf }))
            .filter((f) => f.kt > 0).sort((a, b) => b.kt - a.kt);
          const inc = fac.reduce((a, f) => a + f.kt, 0);
          const asked = vs.reduce((a, v) => a + v.newKt, 0) * cf;
          const funded = vs.reduce((a, v) => a + v.fundedKt, 0) * cf;
          return { s, vs, fac, inc, asked, funded, declined: asked - funded, total: inc + asked,
                   tri: triByStage[s] };
        }).filter((c) => c.total > 0);
        const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
        return (
          <div role="group" aria-label="US capacity by stage: existing, funded and declined"
            style={{ display: 'grid', gap: 6, alignItems: 'end',
                     gridTemplateColumns: `28px repeat(${cols.length}, minmax(0, 1fr))` }}>
            {/* column headers */}
            <span />
            {cols.map((c) => (
              <div key={`h${c.s}`} style={{ textAlign: 'center', minWidth: 0, alignSelf: 'start' }}>
                <div className="cap-head" style={{ display: 'flex', justifyContent: 'center',
                              alignItems: 'center', fontSize: 11.5 }}>
                  <span style={{ opacity: 0.7, display: 'flex' }}>{ICON[c.s]}</span>
                  <span className="cap-long">{LABEL[c.s]}</span>
                  <span className="cap-short">{SHORT[c.s]}</span>
                </div>
                {/* Columns at different stages measure DIFFERENT products, so the
                    unit is named on each. */}
                <div className="cap-unit" style={{ font: '400 9.5px var(--font-mono)', opacity: 0.45 }}>
                  kt/yr {PRODUCT[c.s]}
                </div>
              </div>
            ))}

            {/* shared per-cent scale */}
            <div style={{ position: 'relative', height: COLUMN_H }}>
              {[0, 25, 50, 75, 100].map((t) => (
                <span key={t} style={{ position: 'absolute', right: 2, bottom: `${t}%`,
                                       transform: 'translateY(50%)',
                                       font: '400 8.5px var(--font-mono)', opacity: 0.5 }}>
                  {t}%
                </span>
              ))}
            </div>
            {cols.map((c) => {
              const h = (v: number) => (v / c.total) * COLUMN_H;
              // Bottom-up: each existing plant, then what is funded, then what is declined.
              const segs = [
                ...c.fac.map((f) => ({ key: f.name, kt: f.kt, fill: GREY,
                  name: abbrev(f.name),
                  tip: `${f.name} — ${f.kt.toFixed(1)} kt/yr, already built${f.note ? `\n\n${f.note}` : ''}` })),
                { key: 'funded', kt: c.funded, fill: FUNDED, name: '',
                  tip: `${c.funded.toFixed(1)} kt/yr of new ${LABEL[c.s].toLowerCase()} capacity a firm would fund` },
                { key: 'declined', kt: c.declined, fill: DECLINED, name: '',
                  tip: `${c.declined.toFixed(1)} kt/yr the plan depends on that no firm would fund` },
              ].filter((g) => g.kt > 0.005);
              return (
                <div key={c.s} style={{ display: 'grid', gap: 4, minWidth: 0, justifyContent: 'center',
                                        gridTemplateColumns: `minmax(0, ${BAR_W}px) 26px` }}>
                  <div style={{ position: 'relative', height: COLUMN_H, display: 'flex',
                                flexDirection: 'column-reverse', gap: 2,
                                borderBottom: '1px solid var(--rule-strong)' }}>
                    {segs.map((g) => (
                      <div key={g.key} className="cap-seg" tabIndex={0} title={g.tip}
                        aria-label={g.tip.split('\n')[0]}
                        style={{ height: Math.max(1, h(g.kt) - 2), flexShrink: 0, position: 'relative',
                                 background: g.fill, borderRadius: 1, cursor: 'help' }}>
                        {g.name && h(g.kt) >= 18 && (
                          <span className="cap-plant" style={{ position: 'absolute', left: 4, top: 3,
                                         font: '500 9px var(--font-mono)', color: 'var(--ink-2)',
                                         whiteSpace: 'nowrap' }}>
                            {g.name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* this column's own tonnage, on the same height */}
                  <div style={{ position: 'relative', height: COLUMN_H }}>
                    {ktTicks(c.total).map((t) => (
                      <span key={t} style={{ position: 'absolute', left: 0, bottom: `${(t / c.total) * 100}%`,
                                             transform: 'translateY(50%)', display: 'flex',
                                             alignItems: 'center', gap: 2,
                                             font: '400 8.5px var(--font-mono)', opacity: 0.5 }}>
                        <span style={{ width: 3, height: 1, background: 'var(--ink)' }} />
                        {t % 1 === 0 ? t : t.toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* what each column adds up to */}
            <span />
            {cols.map((c) => (
              <div key={`f${c.s}`} style={{ textAlign: 'center', minWidth: 0, alignSelf: 'start',
                                           font: '400 10px var(--font-mono)', lineHeight: 1.5 }}>
                <div style={{ opacity: 0.75 }}>{fmt(c.total)} kt</div>
                {c.asked > 0.005 ? (
                  <div style={{ opacity: 0.75 }}>
                    <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 1,
                                   background: c.declined > 0.005 ? RED : GREEN, marginRight: 4 }} />
                    {c.declined > 0.005
                      ? `${fmt(c.declined)} declined` : `${fmt(c.funded)} funded`}
                  </div>
                ) : (
                  <div style={{ opacity: 0.45 }}>none asked</div>
                )}
                {c.tri == null ? (
                  <div style={{ opacity: 0.35 }}
                    title="Recycling is a domestic feedstock, not a sourcing stage — the index has no term for it.">
                    —
                  </div>
                ) : (
                  <div style={{ marginTop: 3, fontWeight: 600, fontSize: 11 }}
                    title={`Trade-risk index for ${LABEL[c.s].toLowerCase()}${reClass === 'all' ? '' : `, ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}`}: ${c.tri.toFixed(2)} — lower is secure`}>
                    <span style={riskChip(riskColor(c.tri))}>{c.tri.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 10,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: GREY }} /> already built (sunk, never screened)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: FUNDED }} /> new, funded</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: DECLINED }} /> new, not funded</span>
        <span style={{ opacity: 0.8 }}>
          · every column is 100% of its own stage; its tonnage is on its right; trade risk beneath
        </span>
      </div>

      {/* Name the projects, not just the tonnage: "Ucore does not clear" is
          actionable where "separation is short 12 kt" is not. */}
      {verdicts.length > 0 && (
        <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 10,
                      font: '400 10px var(--font-mono)', opacity: 0.7 }}>
          {verdicts.map((v) => (
            <span key={`${v.stage}|${v.facility}`} title={
              `${v.newKt.toFixed(1)} kt/yr in ${v.cohorts.length} step${v.cohorts.length > 1 ? 's' : ''}` +
              ` (${v.cohorts.map((c) => `${c.year ?? ''} +${c.newKt.toFixed(1)}`).join(', ')}) · ` +
              `NPV ${v.npv.toFixed(0)} $M at ${(v.effRate * 100).toFixed(1)}% · ` +
              `${v.plannerNpv.toFixed(0)} $M at the planner's ${(PLANNER_RATE * 100).toFixed(0)}% ` +
              `(financing wedge ${(v.plannerNpv - v.npv).toFixed(0)} $M) · ` +
              `${v.leadYears} yr build` +
              (v.funded ? '' : ` · needs ${v.supportNeeded.toFixed(0)} $M/yr to clear`)}>
              <span style={{ color: v.funded ? 'var(--accent)' : 'var(--ink-3)' }}>
                {v.funded ? '●' : v.fundedKt > 0.005 ? '◐' : '○'}
              </span>{' '}{v.facility.replace(/_/g, ' ')} +{v.newKt.toFixed(1)}
              {!v.funded && (
                <span style={{ opacity: 0.8 }}> · needs {v.supportNeeded.toFixed(0)} $M/yr</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* The verdict in one line, because the bars answer "how much" and a reader
          still has to be told "so is there a gap or not". */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)',
                    fontSize: 11.5, lineHeight: 1.5, maxWidth: 660 }}>
        {verdicts.length === 0 ? (
          <span>
            <strong>The plan asks for no new US capacity here.</strong> Least cost is met by
            imports, recycling and designing Dy/Tb out, so there is nothing for a firm to
            decline — the columns above are existing plant only. Raise the China restriction,
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
            a {(rate * 100).toFixed(1)}% hurdle: {shortfall.map((v) => v.facility.replace(/_/g, ' ')).join(', ')}.
            Closing that needs {shortfall.reduce((a, v) => a + v.supportNeeded, 0).toFixed(0)} $M/yr
            of support, or an instrument that removes enough risk to lower the rate itself.
          </span>
        )}
      </div>

      <HurdleComponents rate={rate} onRate={onRate}
        instruments={instruments} onInstruments={onInstruments} floorLevel={floorLevel}
        foakMult={foakMult} onFoakMult={onFoakMult}
        stages={STAGES.filter((s) => byStage(s).length > 0)} />

      <BankabilityFrontier rows={us} priceSpread={priceSpread} conversion={conversion}
        settings={{ rate, instruments, foakMult, floorLevel }}
        costMult={costMult} provenancePremium={provenancePremium}
        onMove={(stage, premium, cost) => {
          onProvenancePremium({ ...provenancePremium, [stage]: premium });
          onCostMult({ ...costMult, [stage]: cost });
        }} />

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: GREEN, opacity: 0.9 }} /> all of the stage clears</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: '#FDAE61', opacity: 0.9 }} /> part of it</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: RED, opacity: 0.75 }} /> none of it</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                             border: '2px solid var(--ink)', verticalAlign: '-1px' }} /> your assumptions, one marker per stage</span>
        {!HAS_META && <span style={{ opacity: 0.5 }}>· constants inline pending regrid</span>}
      </div>
    </section>
  );
}
