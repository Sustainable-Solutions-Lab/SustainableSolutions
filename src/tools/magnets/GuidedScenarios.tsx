/**
 * Three guided scenarios, for a reader who wants the main findings before the
 * controls. Each is a move by China (no export control, partial controls, a
 * full ban) and, beside it, the response the United States is most likely to
 * make. Picking one sets the sliders; the reader can then move any of them, at
 * which point the scenario is no longer highlighted.
 *
 * The figures in each card are read live from the page, so they follow the
 * grid that is deployed and whatever demand the reader has chosen.
 */
import type { ReactNode } from 'react';

export type Setting = {
  china: number; reach: number; source: number; make: number; pfloor: number;
  /** $/kg of magnet collected; the planner collects end-of-life magnets when this is low. */
  collectCost: number;
};

export type Guided = {
  id: 'open' | 'partial' | 'ban';
  name: string;
  china: string;
  /** What China does. */
  move: Omit<Setting, 'source' | 'make' | 'pfloor' | 'collectCost'>;
  /** The likely US response, as settings; absent where there is none to make. */
  response?: Pick<Setting, 'source' | 'make' | 'pfloor' | 'collectCost'>;
  responseText?: string;
  story: (m: Metrics, responding: boolean) => ReactNode;
};

/** unmetKt is what the chain leaves short, before any stockpile; stockKt what a stockpile covers. */
export type Metrics = { tri: number; costB: number; exposedPct: number; unmetKt: number; stockKt: number };

const stock = (m: Metrics) => (m.stockKt > 0.05
  ? <> A strategic stockpile, deployed on this page when it pays, covers {m.stockKt.toFixed(0)} kt of it.</>
  : null);

/** Settings nobody has asked for: no mandate, no floor, collection at its default cost. */
export const NO_RESPONSE = { source: 0, make: 0, pfloor: 0, collectCost: 25 };

const f0 = (v: number) => v.toFixed(0);

export const GUIDED = (reachMax: number): Guided[] => [
  {
    id: 'open', name: 'Open trade', china: 'China exports freely',
    move: { china: 0, reach: 0 },
    story: (m) => (
      <>The cheapest world, ${m.costB.toFixed(1)}B for the decade, and the most exposed:
        {' '}{f0(m.exposedPct)}% of US demand touches China, because Chinese material is
        {' '}cheapest at every stage and nothing asks for anything else.</>
    ),
  },
  {
    id: 'partial', name: 'Partial controls', china: 'China restricts half its exports and enforces its October 2025 rules abroad',
    move: { china: 0.5, reach: reachMax },
    response: { source: 1, make: 0, pfloor: 0.5, collectCost: 25 },
    responseText: 'a price floor on Chinese imports and a rule that US rare earths be verified clean',
    story: (m, responding) => responding ? (
      <>With the response, exposure falls to {f0(m.exposedPct)}% and the trade-risk index to
        {' '}{m.tri.toFixed(2)}, for ${m.costB.toFixed(1)}B. Almost all of it arrives from 2032,
        {' '}when allied mines and US heavy separation come online. The {f0(m.unmetKt)} kt of magnets
        {' '}the chain leaves short in 2026–28 comes before any new plant can.{stock(m)}</>
    ) : (
      <>The US bill rises to ${m.costB.toFixed(1)}B and the chain leaves {f0(m.unmetKt)} kt of
        {' '}magnet demand short before new plants arrive. Exposure is still {f0(m.exposedPct)}%:
        {' '}what the US still receives is Chinese.{stock(m)}</>
    ),
  },
  {
    id: 'ban', name: 'Full ban', china: 'China exports nothing, from ore to magnets',
    move: { china: 1, reach: reachMax },
    response: { source: 1, make: 1, pfloor: 0, collectCost: 8 },
    responseText: 'US-made magnets, clean sourcing and paid collection of old magnets',
    story: (m, responding) => responding ? (
      <>The response builds what it can, for ${m.costB.toFixed(1)}B, but the chain still leaves
        {' '}{f0(m.unmetKt)} kt of US magnet demand short, almost all before 2031: plants outside
        {' '}China cannot be built faster, and allied mines cover light rare earths far better
        {' '}than heavy.{stock(m)}</>
    ) : (
      <>Exposure is zero by construction, since nothing Chinese arrives, but the chain leaves
        {' '}{f0(m.unmetKt)} kt of US magnet demand short over the decade and the bill is
        {' '}${m.costB.toFixed(1)}B. The binding shortage is plants first, heavy rare earths
        {' '}second.{stock(m)}</>
    ),
  },
];

export default function GuidedScenarios({ items, active, responding, onPick, metrics, mobile }: {
  items: Guided[];
  active: Guided['id'] | null;
  responding: boolean;
  onPick: (id: Guided['id'], respond: boolean) => void;
  metrics: Metrics;
  mobile: boolean;
}) {
  const cur = items.find((g) => g.id === active);
  const chip = (on: boolean) => ({
    font: `600 ${mobile ? 12 : 11}px var(--font-mono)`, padding: mobile ? '7px 12px' : '4px 10px',
    borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--rule-strong)'}`,
    background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink)',
  });
  return (
    <section aria-label="Guided scenarios"
      style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: mobile ? '12px 12px' : '10px 14px',
               marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ font: '600 11px var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
                       opacity: 0.6, marginRight: 4 }}>Start with a scenario</span>
        {items.map((g) => (
          <button key={g.id} type="button" onClick={() => onPick(g.id, !!g.response)}
            aria-pressed={active === g.id} style={chip(active === g.id)}>{g.name}</button>
        ))}
      </div>
      {cur && (
        <div style={{ marginTop: 8, fontSize: mobile ? 14 : 12.5, lineHeight: 1.5 }}>
          <div style={{ opacity: 0.75 }}>
            <b>{cur.china}.</b>
            {cur.response && (
              <> Likely US response: {cur.responseText}.{' '}
                <button type="button" onClick={() => onPick(cur.id, !responding)}
                  style={{ font: 'inherit', color: 'var(--accent)', background: 'none', border: 'none',
                           padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
                  {responding ? 'See it without the response' : 'Add the response'}
                </button>
              </>
            )}
          </div>
          <div style={{ marginTop: 4 }}>{cur.story(metrics, responding)}</div>
        </div>
      )}
    </section>
  );
}
