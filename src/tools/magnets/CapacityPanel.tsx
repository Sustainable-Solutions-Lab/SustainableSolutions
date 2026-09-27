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
 *
 * NEW CAPACITY IS NOT ALL PROJECTS. The plan expands model rows, and only some
 * of them stand for a plant someone has announced (facilities.ts). What the
 * plan asks for is reported as capacity, split between expansions at named
 * plants and capacity with no announced project behind it.
 *
 * Breakpoints are on the PANEL's width, not the window's: on a desktop the
 * panel shares the window with the controls rail.
 */
import { Pickaxe, FlaskConical, Flame, Magnet, Recycle } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from 'react';
import { screen, groupProjects, judgedRows, type Buildout, type Project } from './projectFinance';
import { splitByKind, type Part } from './facilities';
import { stageBreakdown, stageBreakdownClass, riskColor, riskChip } from './tri';
import type { Scenario } from './interp';
import { HEAVY_YIELD, LIGHT_MINE_YIELD, LIGHT_MINE_HEAVY_TRACE } from './projects';
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
  mining: 'concentrate', separation: 'Nd/Pr + Dy/Tb oxide', alloy: 'alloy',
  magnet: 'finished magnets', recycling: 'scrap processed',
};
/** kg of rare-earth oxide in a kg of NdFeB alloy (the model's config/units.py:
 *  31% rare earth by mass, 1.16 kg of oxide per kg of metal). */
const OXIDE_PER_KG_ALLOY = 0.3596;
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

/** Height of every capacity column, px: on a phone, and in the desktop's
 *  results column, where the chain above has to stay in view with it. */
const COLUMN_H_FULL = 220, COLUMN_H_COMPACT = 172;
/** Round tonnage ticks for one column: three to five marks inside its total. */
const ktTicks = (total: number): number[] => {
  if (total <= 0) return [];
  const raw = total / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((c) => total / c <= 5) ?? mag * 10;
  return Array.from({ length: Math.floor(total / step + 1e-9) }, (_, i) => (i + 1) * step);
};

const STAGES = ['mining', 'separation', 'alloy', 'magnet', 'recycling'] as const;
/** Why the plan asks the United States for so little upstream. Diagnosed
 *  2026-09-26 and re-run on the corrected model (rare-magnets-cem docs/15,
 *  sections 11, 13 and 14): the plan adds no US mine at any cost, and runs the
 *  mine and the light separation the US has below capacity. Printed under the
 *  verdict whenever a stage the US operates is left unexpanded. */
const UNASKED_NOTE = 'The plan runs what the United States already has at that stage below capacity: allied and Chinese supply is cheaper per kilogram, and no rule in the scenario requires it to be produced here.';
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
/** What a block of a column says when it is pointed at. */
type Card = { head: string; lines: { text: string; sub?: string }[]; note?: string };

export default function CapacityPanel({ buildout, incumbent, rate, instruments,
                                        sc, alliedHHI, reClass, onReClass,
                                        costMult, onCostMult, foakMult,
                                        premium, onPremium, floorLevel, compact = false,
                                        controls }: {
  buildout: Buildout[] | undefined;
  incumbent: Record<string, Incumbent[]>;
  /** The firm's hurdle rate and the instruments acting on it: set in the rail. */
  rate: number;
  instruments: Record<string, number>;
  /** How far the planner-side price floor is set (0-1). Scales the floor's relief. */
  floorLevel: number;
  sc: Scenario;
  alliedHHI?: Record<string, number>;
  reClass: ReClass;
  onReClass: (c: ReClass) => void;
  /** US cost disadvantage and the premium, one of each per stage: the positions
   *  of the markers on the frontier below. */
  costMult: Record<string, number>;
  onCostMult: (v: Record<string, number>) => void;
  foakMult: number;
  premium: Record<string, number>;
  onPremium: (v: Record<string, number>) => void;
  /** The desktop's results column: shorter columns, tighter padding. */
  compact?: boolean;
  /** The hurdle-rate controls, where the page has no rail to hold them (a
   *  phone): shown between the columns and the frontier. */
  controls?: ReactNode;
}) {
  const COLUMN_H = compact ? COLUMN_H_COMPACT : COLUMN_H_FULL;
  // THE CARD a block shows when pointed at, and keeps when clicked or tapped,
  // until a click or tap anywhere else. Declared before the early return below:
  // hooks cannot come after it.
  const root = useRef<HTMLElement>(null);
  const [card, setCard] = useState<(Card & { x: number; y: number; pinned: boolean; key: string }) | null>(null);
  useEffect(() => {
    if (!card?.pinned) return;
    const away = (e: Event) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.cap-seg')) setCard(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [card?.pinned]);
  if (!buildout) {
    return (
      <section style={{ border: '1px dashed var(--rule-strong)', borderRadius: 10,
                        padding: '14px 18px', background: 'var(--paper)', marginTop: compact ? 12 : 22 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px' }}>
          Would it actually be built?
        </h2>
        <p style={{ fontSize: 11.5, opacity: 0.7, margin: 0, lineHeight: 1.45 }}>
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
    // The model's alloy flows are in the oxide the alloy is made from, while an
    // alloy plant is rated in alloy, so a class share of those flows is a share
    // of the OXIDE in the alloy and needs the oxide in a kilogram of alloy with
    // it. Without that the Dy/Tb and Nd/Pr columns for alloy were 2.8 times
    // too tall: 18 kt of alloy was drawn as holding 18 kt of Nd/Pr.
    const basis = stage === 'alloy' ? OXIDE_PER_KG_ALLOY : 1;
    return agg > 1e-9 ? basis * sum(re) / agg : 1;
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
  const verdicts: Project[] = groupProjects(us, screen(us, {
    rate,
    offtake: instruments.offtake,
    floorInterface: 'magnet', floorRelief: instruments.floor, floorLevel,
    creditSupport: instruments.guarantee,
    costMult, foakMult, premium,
  }));
  // The same capacity, by what stands behind it.
  const parts: Part[] = verdicts.flatMap(splitByKind);
  const kt = (list: Part[], what: 'kt' | 'short' = 'kt') =>
    list.reduce((a, x) => a + (what === 'kt' ? x.kt : x.kt - x.fundedKt), 0);
  const named = parts.filter((x) => x.kind === 'named');
  const generic = parts.filter((x) => x.kind === 'generic');
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
  const names = (list: readonly string[]) => {
    const l = list.map((s) => LABEL[s].toLowerCase());
    return l.length > 1 ? `${l.slice(0, -1).join(', ')} or ${l[l.length - 1]}` : l[0];
  };
  const n1 = (v: number) => (v >= 10 ? v.toFixed(0) : v.toFixed(1));
  /** A plant's name without the stage in brackets, which the column already says. */
  const plant = (name: string) => name.replace(/\s*\((alloy|recycling)\)$/, '');
  // The chips under the columns: each named plant, then ONE entry a stage for
  // the capacity with no project behind it. The planner books that capacity on
  // several rows (more of an existing plant, or a new one); to a reader it is
  // one thing, tonnage nobody has announced, and may end up as several plants.
  type Chip = { key: string; kind: 'named' | 'generic'; label: string; kt: number; fundedKt: number;
                support: number; title: string };
  const chips: Chip[] = STAGES.flatMap((st) => {
    const mine = parts.filter((x) => x.stage === st);
    const out: Chip[] = mine.filter((x) => x.kind === 'named').map((x) => ({
      key: `${st}|${x.facility}`, kind: 'named' as const, label: x.label, kt: x.kt, fundedKt: x.fundedKt,
      support: x.support, title: x.basis ? `Announced: ${x.basis}` : '' }));
    const gen = mine.filter((x) => x.kind === 'generic');
    if (gen.length) {
      out.push({ key: `${st}|generic`, kind: 'generic', label: gen[0].label,
        kt: kt(gen), fundedKt: gen.reduce((a, x) => a + x.fundedKt, 0),
        support: gen.reduce((a, x) => a + x.support, 0),
        title: 'No announced project stands behind this, and it may end up as more than one plant. The plan costs it as: '
          + gen.map((x) => `${n1(x.kt)} kt ${x.at ? `more of ${plant(x.at)}, beyond anything announced there` : 'of new plant'}`).join('; ') + '.' });
    }
    return out;
  });
  const show = (e: RMouseEvent, key: string, c: Card, pin: boolean) => {
    if (card?.pinned && !pin) return;
    if (pin && card?.pinned && card.key === key) { setCard(null); return; }
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    setCard({ ...c, key, pinned: pin, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <section ref={root} className="cap-root"
      style={{ border: '1px solid var(--rule)', borderRadius: 10, padding: compact ? '12px 16px 14px' : 20,
               background: 'var(--paper)', marginTop: compact ? 12 : 22, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    gap: '4px 16px', flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ font: '600 13px var(--font-mono)', letterSpacing: '0.06em',
                     textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
          Would it actually be built?
        </h2>
        {/* Which RE class the columns and the risk figures describe. Dy/Tb is the
            real chokepoint; Nd/Pr is far more diversified, so a single "All"
            reading averages the problem away. */}
        <div role="group" aria-label="Rare-earth class shown"
          style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ font: '400 10px var(--font-mono)', opacity: 0.55 }}>class shown</span>
          {CLASSES.map((c) => {
            const on = reClass === c.key;
            return (
              <button key={c.key} onClick={() => onReClass(c.key)} aria-pressed={on}
                style={{ font: '600 10px var(--font-mono)', padding: '2px 8px', borderRadius: 6,
                         cursor: 'pointer',
                         border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
                         background: on ? 'var(--paper-2)' : 'transparent', color: 'var(--ink)' }}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <p style={{ fontSize: 11, opacity: 0.7, margin: '0 0 10px', lineHeight: 1.45 }}>
        US capacity the least-cost plan calls for, against what clears a private hurdle
        rate, stage by stage along the chain. Red is capacity the plan depends on that no
        firm would fund. All counts each stage in its own product (ore with its lanthanum
        and cerium, magnets with their iron); Dy/Tb and Nd/Pr count only that
        class&rsquo;s contained oxide, so the two do not add up to All.
      </p>

      <style>{`
        .cap-root { container-type: inline-size; }
        .cap-unit, .cap-long, .cap-side, .cap-out { display: none !important; }
        .cap-short { display: block; font-size: 9.5px; }
        .cap-head { flex-direction: column; gap: 2px; }
        .cap-col { display: grid; min-width: 0; justify-content: center;
                   grid-template-columns: minmax(0, ${BAR_W}px); }
        .cap-in { font-size: 8px; }
        @container (min-width: 600px) {
          .cap-unit, .cap-long, .cap-side { display: block !important; }
          span.cap-long[style] { display: inline !important; }
          .cap-short { display: none; }
          .cap-head { flex-direction: row; gap: 5px; }
          .cap-col { grid-template-columns: minmax(0, 1fr) ${BAR_W}px minmax(0, 1fr); }
          .cap-in { font-size: 9px; }
        }
        @container (min-width: 860px) { .cap-out { display: block !important; } }
        .cap-seg { cursor: pointer; }
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
          return { s, vs, cf, fac, inc, asked: askedKt, funded, declined: askedKt - funded,
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
                  kt/yr {reClass === 'all' || c.s === 'recycling' ? PRODUCT[c.s]
                    : `contained ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'}`}
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
              const mine = parts.filter((x) => x.stage === c.s);
              const lines = (what: 'funded' | 'declined') => mine
                .map((x) => ({ x, v: (what === 'funded' ? x.fundedKt : x.kt - x.fundedKt) * c.cf }))
                .filter(({ v }) => v > 0.005)
                .map(({ x, v }) => ({
                  text: `${x.label}${x.at ? `, costed as more of ${plant(x.at)}` : ''}: ${fmt(v)} kt`,
                  sub: what === 'declined' && x.support > 0.5
                    ? `needs $${x.support.toFixed(0)}M a year to clear` : x.basis,
                }));
              const segs: { key: string; kt: number; fill: string; word: string; name: string;
                            card: Card }[] = [
                ...c.fac.map((f) => ({ key: f.name, kt: f.kt, fill: GREY, word: '',
                  name: abbrev(f.name),
                  card: { head: f.name, lines: [{ text: `${fmt(f.kt)} kt/yr, already built` }],
                          note: f.note } })),
                { key: 'funded', kt: c.funded, fill: FUNDED, word: 'funded', name: '',
                  card: { head: `${fmt(c.funded)} kt/yr of new ${LABEL[c.s].toLowerCase()} capacity a firm would fund`,
                          lines: lines('funded') } },
                { key: 'declined', kt: c.declined, fill: DECLINED, word: 'declined', name: '',
                  card: { head: `${fmt(c.declined)} kt/yr of new ${LABEL[c.s].toLowerCase()} capacity no firm would fund`,
                          lines: lines('declined') } },
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
                      <div key={g.key} className="cap-seg" tabIndex={0} role="button"
                        aria-label={`${g.card.head}. ${g.card.lines.map((l) => l.text).join('; ')}`}
                        onMouseMove={(e) => show(e, `${c.s}|${g.key}`, g.card, false)}
                        onMouseLeave={() => { if (!card?.pinned) setCard(null); }}
                        onClick={(e) => show(e, `${c.s}|${g.key}`, g.card, true)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          e.preventDefault();
                          const r = e.currentTarget.getBoundingClientRect();
                          show({ clientX: r.right, clientY: r.top + r.height / 2 } as RMouseEvent,
                               `${c.s}|${g.key}`, g.card, true);
                        }}
                        style={{ height: Math.max(1, g.px - 2), flexShrink: 0, position: 'relative',
                                 background: g.fill, borderRadius: 1, overflow: 'hidden' }}>
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
      {card && (
        <div role="status" style={{
          position: 'absolute', top: card.y + 12, zIndex: 20, pointerEvents: 'none',
          ...(card.x > (root.current?.clientWidth ?? 0) * 0.6
            ? { right: Math.max(8, (root.current?.clientWidth ?? 0) - card.x + 10) }
            : { left: Math.max(8, card.x + 10) }),
          maxWidth: 'min(300px, calc(100% - 16px))',
          background: 'var(--paper)', border: `1px solid ${card.pinned ? 'var(--accent)' : 'var(--rule-strong)'}`,
          borderRadius: 8, padding: '7px 10px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ font: '600 11px var(--font-mono)', lineHeight: 1.3 }}>{card.head}</div>
          {card.lines.map((l) => (
            <div key={l.text} style={{ fontSize: 11, lineHeight: 1.35, marginTop: 3 }}>
              {l.text}
              {l.sub && <span style={{ display: 'block', fontSize: 10, opacity: 0.6 }}>{l.sub}</span>}
            </div>
          ))}
          {card.note && <div style={{ fontSize: 10.5, opacity: 0.65, lineHeight: 1.4, marginTop: 4 }}>{card.note}</div>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', marginTop: 8,
                    font: '400 10px var(--font-mono)', opacity: 0.65 }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: GREY }} /> already built</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: FUNDED }} /> new, funded</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 8,
                             background: DECLINED }} /> new, declined</span>
        <span style={{ opacity: 0.8 }}>
          · each column is 100% of its own stage, in {reClass === 'all' ? 'its own product'
            : `contained ${reClass === 'heavy' ? 'Dy/Tb' : 'Nd/Pr'} (recycling in scrap)`}; total and trade risk beneath
        </span>
      </div>

      {/* What the new capacity IS, not just how much: a named plant's expansion
          is actionable, and capacity with no project behind it is a different
          kind of ask, so the two are marked and worded differently. */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: '3px 14px', flexWrap: 'wrap', marginTop: 8,
                      font: '400 10px var(--font-mono)', opacity: 0.75 }}>
          {chips.map((x) => {
            const all = x.fundedKt >= x.kt - 0.005, none = x.fundedKt <= 0.005;
            return (
              <span key={x.key} title={x.title}>
                <span aria-hidden="true" style={{ color: all ? 'var(--brand-green)' : 'var(--ink-3)' }}>
                  {x.kind === 'named' ? (all ? '●' : none ? '○' : '◐') : (all ? '◆' : '◇')}
                </span>{' '}
                {x.label} +{n1(x.kt)} kt
                {!all && x.support > 0.5 && (
                  <span style={{ opacity: 0.8 }}> · needs ${x.support.toFixed(0)}M/yr</span>
                )}
              </span>
            );
          })}
          <span style={{ opacity: 0.7 }}>· ● a named plant &nbsp;◆ no announced project &nbsp;filled: it clears</span>
        </div>
      )}

      {/* The verdict in one line, because the bars answer "how much" and a reader
          still has to be told "so is there a gap or not". */}
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid var(--rule)',
                    fontSize: 11.5, lineHeight: 1.5 }}>
        {verdicts.length === 0 ? (
          <span>
            <strong>The plan asks for no new US capacity here.</strong> Least cost is met by
            imports, recycling and designing Dy/Tb out, so there is nothing for a firm to
            decline, and the columns above are existing plant only. Raise the China
            restriction, or require domestic content, to give the planner a reason to build.
          </span>
        ) : shortfall.length === 0 ? (
          <span>
            <strong>No financing gap here.</strong> All {n1(kt(parts))} kt the plan asks
            for clears a {(rate * 100).toFixed(1)}% hurdle unaided: {n1(kt(named))} kt at
            named plants, {n1(kt(generic))} kt of new capacity with no announced project.
          </span>
        ) : (
          <span>
            <strong>
              {kt(parts, 'short') >= kt(parts) - 0.05 ? 'None' : `${n1(kt(parts) - kt(parts, 'short'))} kt`} of
              the {n1(kt(parts))} kt the plan asks for clears
            </strong> a {(rate * 100).toFixed(1)}% hurdle. What does not:{' '}
            {n1(kt(named, 'short'))} kt at named plants
            {named.some((x) => x.kt - x.fundedKt > 0.005) && (
              <> ({named.filter((x) => x.kt - x.fundedKt > 0.005)
                .map((x) => x.label.replace(', expansion', '')).join(', ')})</>
            )}
            , {n1(kt(generic, 'short'))} kt of new capacity with no announced project.
            Closing that needs ${shortfall.reduce((a, v) => a + v.supportNeeded, 0).toFixed(0)}M
            a year of support, or an instrument that removes enough risk to lower the rate itself.
          </span>
        )}
        {verdicts.length > 0 && unasked.length > 0 && (
          <p style={{ margin: '6px 0 0', opacity: 0.8 }}>
            <strong>No new US {names(unasked)} is asked for</strong>, so
            {asked.length > 0 ? <> the plan builds only {names(asked).replace(' or ', ' and ')} capacity and</> : null}
            {' '}the exposure at {unasked.length > 1 ? 'those stages' : 'that stage'} is a gap in
            the <em>plan</em>, not one an offtake or a guarantee could close. {UNASKED_NOTE}
          </p>
        )}
      </div>

      {controls}

      <BankabilityFrontier rows={us} compact={compact}
        settings={{ rate, instruments, foakMult, floorLevel }}
        costMult={costMult} premium={premium}
        onMove={(stage, p, cost) => {
          onPremium({ ...premium, [stage]: p });
          onCostMult({ ...costMult, [stage]: cost });
        }} />
    </section>
  );
}
