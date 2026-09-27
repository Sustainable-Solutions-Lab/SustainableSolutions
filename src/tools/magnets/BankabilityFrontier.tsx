/**
 * Where does US capacity stop being bankable?
 *
 * A single verdict at one calibration invites the reader to believe the
 * calibration. The honest object is the FRONTIER: sweep the two assumptions the
 * US conclusion actually turns on and show the line they cross.
 *
 *   x  provenance premium — what a buyer pays extra for non-China supply. The
 *      hedging demand that motivates the whole program, and the one thing the
 *      model charges the US as a cost while never crediting it as revenue.
 *   y  US cost disadvantage — the regional cost factor, as a multiple of the
 *      calibrated value.
 *
 * ONE FRONTIER PER STAGE, each with its own marker. Both axes are per-stage
 * quantities: $10 a kilogram is a different claim about alloy than about
 * finished magnets, and the US pays a different penalty to separate than to
 * sinter. Pooled into one matrix, a marker said "the same premium per kilogram
 * of everything", which no buyer pays. The marker is the control: drag it, or
 * focus it and use the arrow keys, and the capacity stacks above re-screen.
 *
 * Cheap because the screen is arithmetic: every cell is a closed-form NPV, so a
 * 13x13 sweep is 169 multiplications, not 169 solves. Nothing is precomputed and
 * no grid is loaded. That is worth saying explicitly, because the instinct is
 * that a two-dimensional sweep must be expensive — for the PLANNER it would be.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { screen, priceAtSpread, type Buildout } from './projectFinance';

// Thirteen by thirteen, so that $5 steps and quarter steps of cost fall on cell
// centres and the calibrated 1.00x is a row of its own.
const NX = 13, NY = 13;
const COST_MIN = 0.5, COST_MAX = 3.5;   // multiple of the calibrated US disadvantage
const COST_STEP = 0.05;
/** Top of the premium axis, $/kg of the stage's product. */
const PREM_MAX: Record<string, number> = {
  mining: 20, separation: 120, alloy: 60, magnet: 60, recycling: 60,
};
/** What the premium is paid on. */
const PER: Record<string, string> = {
  mining: 'concentrate', separation: 'oxide', alloy: 'alloy',
  magnet: 'magnet', recycling: 'scrap',
};
const LABEL: Record<string, string> = {
  mining: 'Mining', separation: 'Separation', alloy: 'Alloying',
  magnet: 'Magnet', recycling: 'Recycling',
};
const ORDER = ['mining', 'separation', 'alloy', 'magnet', 'recycling'];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** A value's position along an axis of n cells whose CENTRES carry the values
 *  0..max, as a fraction of the axis length. The marker then sits on the cell
 *  that represents it rather than drifting half a cell off at the ends. */
const toFrac = (t: number, n: number) => (t * (n - 1) + 0.5) / n;
const fromFrac = (f: number, n: number) => clamp((f * n - 0.5) / (n - 1), 0, 1);

export type ScreenSettings = {
  rate: number;
  instruments: Record<string, number>;
  foakMult: number;
  /** How far the planner-side price floor is set, so its de-risking matches the stacks. */
  floorLevel: number;
};

function StageFrontier({ stage, rows, prices, settings, premium, costMult, onMove }: {
  stage: string;
  rows: Buildout[];
  prices: Record<string, number>;
  settings: ScreenSettings;
  premium: number;
  costMult: number;
  onMove: (premium: number, costMult: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const max = PREM_MAX[stage] ?? 60;
  const asked = rows.reduce((a, b) => a + b.kt, 0) || 1;

  /** Share of this stage's requested capacity that clears, at one pair. */
  const fundedShare = (prem: number, cm: number): number => {
    const v = screen(rows, prices, {
      rate: settings.rate,
      offtake: settings.instruments.offtake,
      floorInterface: 'magnet', floorRelief: settings.instruments.floor,
      floorLevel: settings.floorLevel,
      creditSupport: settings.instruments.guarantee,
      costMult: cm, foakMult: settings.foakMult, provenancePremium: prem,
    });
    return v.filter((x) => x.funded).reduce((a, x) => a + x.newKt, 0) / asked;
  };

  const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * max);
  const ys = Array.from({ length: NY }, (_, j) => COST_MIN + (j / (NY - 1)) * (COST_MAX - COST_MIN));
  const cell = (s: number) =>
    s >= 0.999 ? 'var(--brand-green)' : s <= 0.001 ? '#D53E4F' : '#FDAE61';

  const here = fundedShare(premium, costMult);
  // The premium that funds the whole stage at this cost, to the dollar.
  const needed = (() => {
    for (let p = 0; p <= max; p += 1) if (fundedShare(p, costMult) >= 0.999) return p;
    return null;
  })();

  const px = toFrac(clamp(premium / max, 0, 1), NX) * 100;
  const py = (1 - toFrac(clamp((costMult - COST_MIN) / (COST_MAX - COST_MIN), 0, 1), NY)) * 100;

  const moveTo = (e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const fx = fromFrac((e.clientX - r.left) / r.width, NX);
    const fy = fromFrac(1 - (e.clientY - r.top) / r.height, NY);
    onMove(Math.round(fx * max),
           Math.round((COST_MIN + fy * (COST_MAX - COST_MIN)) / COST_STEP) * COST_STEP);
  };
  const onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 5 : 1;
    const step: Record<string, [number, number]> = {
      ArrowRight: [big, 0], ArrowLeft: [-big, 0],
      ArrowUp: [0, COST_STEP * big], ArrowDown: [0, -COST_STEP * big],
    };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(clamp(premium + d[0], 0, max),
           clamp(Math.round((costMult + d[1]) / COST_STEP) * COST_STEP, COST_MIN, COST_MAX));
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{LABEL[stage]}</span>
        <span style={{ font: '400 10px var(--font-mono)', opacity: 0.55 }}>
          {asked.toFixed(1)} kt/yr asked
        </span>
      </div>
      <div style={{ font: '400 10.5px var(--font-mono)', opacity: 0.8, marginBottom: 6,
                    lineHeight: 1.45 }}>
        <b>${premium.toFixed(0)}/kg</b> premium · <b>{costMult.toFixed(2)}×</b> cost
        <br />
        {here >= 0.999 ? 'all of it clears'
          : here <= 0.001 ? 'none of it clears' : `${(here * 100).toFixed(0)}% clears`}
        {here < 0.999 && (needed == null
          ? ` · no premium to $${max} funds it`
          : ` · $${needed}/kg would fund it`)}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        {/* value ticks, so the vertical axis is as readable as the horizontal */}
        <div style={{ display: 'grid', gridTemplateRows: `repeat(${NY}, 16px)`, gap: 1,
                      font: '400 8.5px var(--font-mono)', opacity: 0.5, textAlign: 'right' }}>
          {ys.slice().reverse().map((cm, j) => (
            <span key={cm} style={{ lineHeight: '16px' }}>
              {j % 2 === 0 ? `${cm.toFixed(1)}×` : ''}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div ref={box}
            onPointerDown={(e) => {
              // A mouse drags from anywhere in the matrix. A finger only moves the
              // marker by tapping, so a swipe across the matrix still scrolls the page.
              moveTo(e);
              if (e.pointerType === 'mouse') {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(true);
              }
            }}
            onPointerMove={(e) => { if (dragging) moveTo(e); }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            style={{ position: 'relative', display: 'grid', gap: 1,
                     gridTemplateColumns: `repeat(${NX}, 1fr)`,
                     gridTemplateRows: `repeat(${NY}, 16px)`,
                     cursor: dragging ? 'grabbing' : 'crosshair', userSelect: 'none' }}>
            {ys.slice().reverse().map((cm) => xs.map((prem) => {
              const s = fundedShare(prem, cm);
              return (
                <div key={`${cm}-${prem}`}
                  title={`$${prem.toFixed(0)}/kg of ${PER[stage]} · US cost ${cm.toFixed(2)}× → `
                    + `${(s * 100).toFixed(0)}% of requested capacity funded`}
                  style={{ background: cell(s), opacity: 0.55 + 0.45 * s, borderRadius: 1 }} />
              );
            }))}
            {/* The reader's assumptions, and the handle that moves them. The hit
                target is larger than the mark. */}
            <div role="slider" tabIndex={0}
              aria-label={`${LABEL[stage]}: provenance premium and US cost disadvantage`}
              aria-valuemin={0} aria-valuemax={max} aria-valuenow={premium}
              aria-valuetext={`$${premium.toFixed(0)} per kilogram premium, ${costMult.toFixed(2)} times cost, `
                + `${(here * 100).toFixed(0)}% of capacity clears`}
              onKeyDown={onKey}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragging(true);
              }}
              onPointerMove={(e) => { if (dragging) moveTo(e); }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              className="frontier-marker"
              style={{ position: 'absolute', left: `${px}%`, top: `${py}%`,
                       width: 32, height: 32, marginLeft: -16, marginTop: -16,
                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                       cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none',
                       borderRadius: '50%' }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box',
                             background: 'var(--paper)', border: '2.5px solid var(--ink)',
                             boxShadow: '0 0 0 2px var(--paper)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
                        font: '400 9px var(--font-mono)', opacity: 0.55, marginTop: 3 }}>
            <span>$0</span>
            <span>premium, $/kg of {PER[stage]} →</span>
            <span>${max}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BankabilityFrontier({ rows, priceSpread, conversion, settings,
                                              costMult, provenancePremium, onMove }: {
  rows: Buildout[];
  priceSpread: number;
  conversion: number;
  settings: ScreenSettings;
  costMult: Record<string, number>;
  provenancePremium: Record<string, number>;
  onMove: (stage: string, premium: number, costMult: number) => void;
}) {
  const prices = priceAtSpread(priceSpread, conversion);
  const stages = ORDER.filter((s) => rows.some((b) => b.s === s));

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
      <style>{`
        .frontier-marker:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
        .frontier-grid { display: grid; gap: 20px 24px; grid-template-columns: 1fr; }
        @media (min-width: 720px) { .frontier-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1040px) { .frontier-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <span style={{ font: '600 10px var(--font-mono)', letterSpacing: '0.06em',
                       textTransform: 'uppercase', opacity: 0.55 }}>
          Bankability frontier
        </span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>
          {stages.length === 0
            ? 'the plan asks for no US capacity here — nothing to screen'
            : 'drag a marker, or focus it and use the arrow keys'}
        </span>
      </div>
      {stages.length === 0 ? (
        <p style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.4, margin: '8px 0 0', maxWidth: 560 }}>
          Blank because the plan asks for no new US capacity here, so there is nothing to
          screen. Add a mandate or raise the restriction and a frontier appears for each
          stage the plan wants built.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.45, margin: '0 0 12px', maxWidth: 640 }}>
            One frontier for each stage the plan asks the United States to build. Across:
            what a buyer pays extra for supply that never touched China. Up: how much
            more it costs to build and run the plant here than the model assumes.
          </p>
          <div className="frontier-grid">
            {stages.map((s) => (
              <StageFrontier key={s} stage={s} rows={rows.filter((b) => b.s === s)}
                prices={prices} settings={settings}
                premium={provenancePremium[s] ?? 0} costMult={costMult[s] ?? 1}
                onMove={(p, c) => onMove(s, p, c)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
