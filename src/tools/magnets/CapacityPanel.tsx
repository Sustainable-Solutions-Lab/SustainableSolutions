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
 * The bar sits in the CENTRE of its slot, with plant names to its left and the
 * tonnage scale to its right, so the heading above and the figures below are
 * centred on the bar itself. New capacity is labelled on the column, where it
 * is, rather than in a line beneath that pushed the risk figures out of row.
 *
 * The existing block is plain grey rather than textured: sunk capital reads as
 * "not a decision" simply by being uncoloured beside the green and red of things
 * that are. Gaps inside it separate the real plants, named where there is room,
 * because "MP Fort Worth is most of US magnet capacity" is the fact a reader
 * needs — the full name, capacity and note are on hover.
 */
import { Pickaxe, FlaskConical, Flame, Magnet, Recycle } from 'lucide-react';
import { useState } from 'react';
import { screen, PLANNER_RATE, priceSensitive, groupProjects, judgedRows,
         priceAtSpread, MAGNET_CONVERSION_DEFAULT, ALLOY_CONVERSION_DEFAULT,
         type Buildout, type Project } from './projectFinance';
import { stageBreakdown, stageBreakdownClass, riskColor, riskChip } from './tri';
import type { Scenario } from './interp';
import { HEAVY_YIELD, LIGHT_MINE_YIELD, LIGHT_MINE_HEAVY_TRACE } from './projects';
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
export type Incumbent = { stage: string; name: string; kt: number; note?: string;
                         /** a heavy-enriched deposit or a plant with a heavy circuit */
                         heavy?: boolean };

/** Shorten a plant name for a label; the hover carries the full name, the
 *  capacity and the project note. The label's box truncates what is left. */
const abbrev = (name: string): string => name
  .replace(/\s*\([^)]*\)/g, '')                       // drop "(magnets)", "(Indiana)"
  .replace(/\b(separation|recycling|mining|mine|magnets?|metal\/alloy|alloy)\b/ig, '')
  .replace(/\s{2,}/g, ' ').trim();

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
/** Why the plan never asks the United States for upstream capacity: in all
 *  cells of the solved grid it adds no US mine and no US separation plant. It
 *  does not even fill the ones that exist (in 2035 the mine runs at about a
 *  third and separation at about a fifth of capacity, the floors the model
 *  imposes), so it has nothing to expand. Diagnosed 2026-09-26; the causes,
 *  two of them artefacts of how the model costs separation and scopes the export
 *  restriction, are in rare-magnets-cem docs/15 section 11. Printed under the
 *  verdict whenever a stage the US operates is left unexpanded. */
const UNASKED_NOTE = 'The plan runs the mine and the separation plants the United States already has well below capacity, so it has no reason to add to them: allied and Chinese supply is cheaper per kilogram, and no rule in the scenario requires oxide to be made here. The one US heavy deposit, Round Top, costs about three times what expanding allied heavy mining does. How the model prices US separation is under review, so read this as a feature of the model before a finding about the world.';
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

  // An EXISTING mine or separation plant in a class view is counted by what it
  // itself contains, not by the class's share of world flow: Mountain Pass is a
  // light deposit, and scaling it by the world's heavy share drew it as a heavy
  // mine of 1.6 kt when it holds about 0.03. Alloy and magnet plants handle both
  // classes in the proportion the product carries them.
  const plantFrac = (stage: string, f: Incumbent): number => {
    if (reClass === 'all') return 1;
    const heavy = reClass === 'heavy';
    if (stage === 'mining') {
      return heavy ? (f.heavy ? HEAVY_YIELD : LIGHT_MINE_HEAVY_TRACE)
        : f.heavy ? LIGHT_MINE_YIELD - HEAVY_YIELD : LIGHT_MINE_YIELD;
    }
    if (stage === 'separation') return heavy ? (f.heavy ? HEAVY_YIELD : 0) : f.heavy ? 1 - HEAVY_YIELD : 1;
    return classFrac(stage);
  };
  const us = judgedRows(buildout);
  const verdicts: Project[] = groupProjects(us, screen(us, priceAtSpread(priceSpread, conversion), {
    rate,
    offtake: instruments.offtake,
    floorInterface: 'magnet', floorRelief: instruments.floor, floorLevel,
    creditSupport: instruments.guarantee,
    costMult, foakMult, provenancePremium,
  }));
  const byStage = (s: string) => verdicts.filter((v) => v.stage === s);
  const incKt = (s: string) => (incumbent[s] ?? []).reduce((a, f) => a + f.kt, 0);
  const shortfall = verdicts.filter((v) => !v.funded);
  // Stages the US already operates but which the plan never expands. Worth
  // naming: a reader who sees only a magnet bar assumes the others were screened
  // and failed, when in fact the planner never asked. The distinction is the
  // whole point — a gap in the PLAN is a different problem from a gap in the
  // FINANCING, and only the second is what an offtake or a guarantee can fix.
  const unasked = STAGES.filter((s) => s !== 'recycling' && incKt(s) > 0 && byStage(s).length === 0);
  const asked = STAGES.filter((s) => byStage(s).length > 0);
  const anyPriceSensitive = verdicts.some((v) => priceSensitive(v.stage));
  const names = (list: readonly string[]) => {
    const l = list.map((s) => LABEL[s].toLowerCase());
    return l.length > 1 ? `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}` : l[0];
  };
  // What a tapped block says. A phone has no hover, so the text a mouse gets
  // from the tooltip is printed under the columns instead.
  const [note, setNote] = useState<string | null>(null);

  const control = (label: string, slider: JSX.Element, read: JSX.Element, text: JSX.Element,
                   dim = false) => (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: 11.5, opacity: dim ? 0.55 : 1 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ font: '600 11px var(--font-mono)' }}>{read}</span>
        </span>
        {slider}
      </label>
      <p style={{ fontSize: 10.5, opacity: 0.65, lineHeight: 1.45, margin: '3px 0 0' }}>{text}</p>
    </div>
  );

  return (
    <section style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: 20,
                      background: 'var(--paper)', marginTop: 22 }}>
      <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                   textTransform: 'uppercase', opacity: 0.6, margin: '0 0 4px' }}>
        Would it actually be built?
      </h2>
      <p style={{ fontSize: 11.5, opacity: 0.7, margin: '0 0 14px', maxWidth: 640, lineHeight: 1.45 }}>
        US capacity the least-cost planner calls for, against what clears a private hurdle
        rate at these prices, stage by stage along the chain. Red is capacity the plan
        depends on that no firm would fund.
      </p>

      <style>{`
        .cap-controls { display: grid; gap: 14px 24px; grid-template-columns: 1fr; margin-bottom: 16px; }
        @media (min-width: 720px) { .cap-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      `}</style>
      {/* THE PRICES A US PLANT IS PAID. Both were sliders with their meaning in a
          tooltip, which a phone never shows and a desktop reader never finds.
          They decide the verdicts below, so what each is, and whose revenue it
          is, is printed. */}
      <div className="cap-controls">
        {control('Ex-China oxide spread',
          <input type="range" min={0} max={2} step={0.05} value={priceSpread}
            onChange={(e) => onPriceSpread(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', margin: '4px 0 0' }} />,
          <>{priceSpread.toFixed(2)}×{' '}
            <span style={{ opacity: 0.55, fontWeight: 400 }}>
              {priceSpread === 0 ? 'China parity' : Math.abs(priceSpread - 1) < 0.03 ? 'today’s' : ''}
            </span></>,
          <>
            Since the 2025 export controls, rare-earth oxide sold outside China has cost
            more than the same oxide inside it. This sets how much of that gap a producer
            here is paid: none at 0, today&rsquo;s at 1, twice today&rsquo;s at 2. It is the
            revenue of a mine, a separation plant or a recycler, so it decides whether
            they clear.{' '}
            {anyPriceSensitive
              ? 'Alloy and magnet makers buy oxide and sell it on inside their product, so for them it cancels.'
              : 'Nothing the plan asks for here sells oxide: alloy and magnet makers buy it and sell it on inside their product, so moving this changes no verdict below.'}
          </>, !anyPriceSensitive)}
        {control('Magnet conversion spread',
          <input type="range" min={2} max={40} step={0.25} value={conversion}
            onChange={(e) => onConversion(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)', margin: '4px 0 0' }} />,
          <>${conversion.toFixed(2)}/kg{' '}
            <span style={{ opacity: 0.55, fontWeight: 400 }}>
              {Math.abs(conversion - MAGNET_CONVERSION_DEFAULT) < 0.13 ? 'China cost + return' : ''}
            </span></>,
          <>
            What a magnet maker is paid for turning alloy into finished magnets, over the
            price of the alloy: the whole margin its plant lives on. The default is what
            the marginal Chinese producer needs, ${MAGNET_CONVERSION_DEFAULT.toFixed(2)} a
            kilogram, because in a market China dominates that is where the price
            settles. A US plant needs several times that, and the difference is what a
            provenance premium or an offtake has to cover. Alloy makers are paid
            ${ALLOY_CONVERSION_DEFAULT.toFixed(2)} on the same reasoning.
          </>)}
        {/* Which RE class the columns and the risk figures describe. Dy/Tb is the
            real chokepoint; Nd/Pr is far more diversified, so a single "All"
            reading averages the problem away. */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 5 }}>Rare-earth class shown</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CLASSES.map((c) => {
              const on = reClass === c.key;
              return (
                <button key={c.key} onClick={() => onReClass(c.key)} aria-pressed={on}
                  style={{ font: '600 10.5px var(--font-mono)', padding: '3px 9px', borderRadius: 6,
                           cursor: 'pointer',
                           border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                           background: on ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 10.5, opacity: 0.65, lineHeight: 1.45, margin: '6px 0 0' }}>
            Columns and risk figures for everything a stage handles, or for the heavy
            or light rare earths it contains. Heavy is where the exposure is.
          </p>
        </div>
      </div>

      <style>{`
        .cap-unit, .cap-long, .cap-side, .cap-out { display: none !important; }
        .cap-short { display: block; font-size: 9.5px; }
        .cap-head { flex-direction: column; gap: 2px; }
        .cap-col { display: grid; min-width: 0; justify-content: center;
                   grid-template-columns: minmax(0, ${BAR_W}px); }
        .cap-in { font-size: 8px; }
        .cap-note { display: block; }
        @media (min-width: 720px) {
          .cap-unit, .cap-long, .cap-side { display: block !important; }
          span.cap-long[style] { display: inline !important; }
          .cap-short { display: none; }
          .cap-head { flex-direction: row; gap: 5px; }
          .cap-col { grid-template-columns: minmax(0, 1fr) ${BAR_W}px minmax(0, 1fr); }
          .cap-in { font-size: 9px; }
          .cap-note { display: none; }
        }
        @media (min-width: 1000px) { .cap-out { display: block !important; } }
        .cap-seg:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      `}</style>
      {(() => {
        const cols = STAGES.map((s) => {
          const vs = byStage(s);
          const cf = classFrac(s);
          const fac = (incumbent[s] ?? []).map((f) => ({ ...f, kt: f.kt * plantFrac(s, f) }))
            .filter((f) => f.kt > 0).sort((a, b) => b.kt - a.kt);
          const inc = fac.reduce((a, f) => a + f.kt, 0);
          const askedKt = vs.reduce((a, v) => a + v.newKt, 0) * cf;
          const funded = vs.reduce((a, v) => a + v.fundedKt, 0) * cf;
          return { s, vs, fac, inc, asked: askedKt, funded, declined: askedKt - funded,
                   total: inc + askedKt, tri: triByStage[s] };
        }).filter((c) => c.total > 0);
        const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2));
        return (
          <div role="group" aria-label="US capacity by stage: existing, funded and declined"
            style={{ display: 'grid', gap: 6, alignItems: 'end',
                     gridTemplateColumns: `28px repeat(${cols.length}, minmax(0, 1fr))` }}>
            {/* column headers, centred on the bar beneath them */}
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
                ...c.fac.map((f) => ({ key: f.name, kt: f.kt, fill: GREY, word: '',
                  name: abbrev(f.name),
                  tip: `${f.name}: ${fmt(f.kt)} kt/yr, already built${f.note ? `\n\n${f.note}` : ''}` })),
                { key: 'funded', kt: c.funded, fill: FUNDED, word: 'funded', name: '',
                  tip: `${c.funded.toFixed(1)} kt/yr of new ${LABEL[c.s].toLowerCase()} capacity a firm would fund` },
                { key: 'declined', kt: c.declined, fill: DECLINED, word: 'declined', name: '',
                  tip: `${c.declined.toFixed(1)} kt/yr of new ${LABEL[c.s].toLowerCase()} capacity the plan depends on that no firm would fund` },
              ].filter((g) => g.kt > 0.005);
              // Where each block sits, and where the label of one too short to
              // hold its own name goes: beside the bar, nudged up off the one below.
              let base = 0, last = -Infinity;
              const placed = segs.map((g) => {
                const px = h(g.kt);
                const fits = px >= 13;
                let at = base + px / 2;
                if (!fits) { at = Math.max(at, last + 11); last = at; }
                const out = { ...g, px, fits, mid: base + px / 2, at };
                base += px;
                return out;
              });
              return (
                <div key={c.s} className="cap-col">
                  {/* names of the blocks too short to carry them */}
                  <div className="cap-side" style={{ position: 'relative', height: COLUMN_H }}>
                    {placed.filter((g) => !g.fits).map((g) => (
                      <span key={g.key} className="cap-out" style={{ position: 'absolute', right: 13,
                                    left: 0, bottom: g.at, transform: 'translateY(50%)',
                                    textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden',
                                    textOverflow: 'ellipsis', font: '500 9px var(--font-mono)',
                                    color: 'var(--ink-2)' }}>
                        {g.name || `${fmt(g.kt)} ${g.word}`}
                      </span>
                    ))}
                    <svg className="cap-out" width={11} height={COLUMN_H} aria-hidden="true"
                      style={{ position: 'absolute', right: 0, top: 0, overflow: 'visible' }}>
                      {placed.filter((g) => !g.fits).map((g) => (
                        <line key={g.key} x1={0} y1={COLUMN_H - g.at} x2={11} y2={COLUMN_H - g.mid}
                          stroke="var(--ink-3)" strokeWidth={1} opacity={0.6} />
                      ))}
                    </svg>
                  </div>
                  <div style={{ position: 'relative', height: COLUMN_H, display: 'flex',
                                flexDirection: 'column-reverse', gap: 2,
                                borderBottom: '1px solid var(--rule-strong)' }}>
                    {placed.map((g) => (
                      <div key={g.key} className="cap-seg" tabIndex={0} title={g.tip}
                        aria-label={g.tip.split('\n')[0]}
                        onClick={() => setNote(g.tip.split('\n')[0])}
                        style={{ height: Math.max(1, g.px - 2), flexShrink: 0, position: 'relative',
                                 background: g.fill, borderRadius: 1, cursor: 'help',
                                 overflow: 'hidden' }}>
                        {g.fits && g.name && (
                          <span className="cap-in" style={{ position: 'absolute', left: 3, right: 2, top: 2,
                                         fontFamily: 'var(--font-mono)', fontWeight: 500,
                                         color: 'var(--ink-2)', whiteSpace: 'nowrap',
                                         overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {g.name}
                          </span>
                        )}
                        {/* new capacity, labelled where it is */}
                        {g.fits && g.word && (
                          <span className="cap-in" style={{ position: 'absolute', left: 0, right: 0, top: '50%',
                                         transform: 'translateY(-50%)', textAlign: 'center',
                                         fontFamily: 'var(--font-mono)', color: 'var(--ink)',
                                         lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                            <b>{fmt(g.kt)} kt</b>
                            {g.px >= 28 ? <><br />{g.word}</>
                              : <span className="cap-long" style={{ display: 'inline' }}> {g.word}</span>}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* this column's own tonnage, on the same height */}
                  <div className="cap-side" style={{ position: 'relative', height: COLUMN_H }}>
                    {ktTicks(c.total).map((t) => (
                      <span key={t} style={{ position: 'absolute', left: 4, bottom: `${(t / c.total) * 100}%`,
                                             transform: 'translateY(50%)', display: 'flex',
                                             alignItems: 'center', gap: 2,
                                             font: '400 8.5px var(--font-mono)', opacity: 0.5 }}>
                        <span style={{ width: 3, height: 1, background: 'var(--ink)' }} />
                        {+t.toPrecision(2)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* what each column adds up to, and how exposed the stage is */}
            <span />
            {cols.map((c) => (
              <div key={`f${c.s}`} style={{ textAlign: 'center', minWidth: 0, alignSelf: 'start',
                                           font: '400 10px var(--font-mono)', lineHeight: 1.5 }}>
                <div style={{ opacity: 0.75 }}>{fmt(c.total)} kt</div>
                {c.tri == null ? (
                  <div style={{ marginTop: 3, fontSize: 11, opacity: 0.35 }}
                    title="Recycling is a domestic feedstock, not a sourcing stage, so the index has no term for it.">
                    n/a
                  </div>
                ) : (
                  <div style={{ marginTop: 3, fontWeight: 600, fontSize: 11 }}
                    title={`Trade-risk index for ${LABEL[c.s].toLowerCase()}${reClass === 'all' ? '' : `, ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}`}: ${c.tri.toFixed(2)}. Lower is secure.`}>
                    <span style={riskChip(riskColor(c.tri))}>{c.tri.toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}
      <p className="cap-note" aria-live="polite"
        style={{ font: '400 10px var(--font-mono)', opacity: 0.7, margin: '8px 0 0',
                 minHeight: 28, lineHeight: 1.4 }}>
        {note ?? 'Tap a block to see the plant or the tonnage behind it.'}
      </p>
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 10,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: GREY }} /> already built</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: FUNDED }} /> new, funded</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: DECLINED }} /> new, declined</span>
        <span style={{ opacity: 0.8 }}>
          · each column is 100% of its own stage, in {reClass === 'all' ? 'the product named above it'
            : `contained ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}`}; total and trade risk beneath
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
            decline, and the columns above are existing plant only. Raise the China
            restriction, or require domestic content, to give the planner a reason to build.
          </span>
        ) : shortfall.length === 0 ? (
          <span>
            <strong>No financing gap here.</strong> All {verdicts.length} project
            {verdicts.length > 1 ? 's' : ''} the planner asks for clear
            a {(rate * 100).toFixed(1)}% hurdle unaided.
          </span>
        ) : (
          <span>
            <strong>{shortfall.length} of {verdicts.length} project
            {verdicts.length > 1 ? 's' : ''} do not clear</strong> at
            a {(rate * 100).toFixed(1)}% hurdle: {shortfall.map((v) => v.facility.replace(/_/g, ' ')).join(', ')}.
            Closing that needs {shortfall.reduce((a, v) => a + v.supportNeeded, 0).toFixed(0)} $M/yr
            of support, or an instrument that removes enough risk to lower the rate itself.
          </span>
        )}
        {UNASKED_NOTE && verdicts.length > 0 && unasked.length > 0 && (
          <p style={{ margin: '8px 0 0', opacity: 0.8 }}>
            <strong>No new US {names(unasked)} is asked for</strong>, so
            {asked.length > 0 ? <> the plan builds only {names(asked).replace(' or ', ' and ')} capacity and</> : null}
            {' '}the exposure at {unasked.length > 1 ? 'those stages' : 'that stage'} is a gap in
            the <em>plan</em>, not one an offtake or a guarantee could close. {UNASKED_NOTE}
          </p>
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
    </section>
  );
}
