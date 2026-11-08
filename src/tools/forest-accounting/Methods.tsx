/**
 * The methods sheet for the forest accounting tool: what the model is, how
 * each rule is written, what the four growth terms mean, and the caveats.
 * The companion page at /tools/forest-accounting-methods carries the full
 * rule-by-rule table and sources; keep the two in step with model.ts.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const h2: React.CSSProperties = { font: '600 19px/1.3 var(--font-serif)', color: 'var(--ink)', margin: '28px 0 8px' };
const p: React.CSSProperties = { fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', margin: '0 0 12px' };

export default function Methods({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Methods" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--paper)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ font: '500 11px var(--font-mono)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0 }}>Methods</p>
          <button ref={close} type="button" onClick={onClose} aria-label="Close methods"
            style={{ background: 'none', border: '1px solid var(--rule-strong)', borderRadius: 4, color: 'var(--ink-2)', padding: 6, cursor: 'pointer', display: 'inline-flex' }}>
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <h1 style={{ font: '600 32px/1.15 var(--font-serif)', letterSpacing: '-0.01em', color: 'var(--ink)', margin: '0 0 8px' }}>Forest carbon accounting</h1>
        <p style={p}>
          A stylised company with a forest in its inventory boundary, run through four accounting rules at once. The forest is the same under every rule. The rules differ only in which part of its carbon change belongs to the company, what nets against what, and what is disclosed rather than claimed.
        </p>

        <h2 style={h2}>The forest, in four rates</h2>
        <p style={p}>
          Each hectare changes carbon stock for four reasons, set as rates in t CO₂ per hectare per year. Ambient growth is what rising CO₂, nitrogen deposition and a warmer, longer season add to every forest; globally this passive sink is on the order of 10 Gt CO₂ a year, two to three tonnes a hectare. Legacy regrowth is stands cut or cleared before the base year still filling in, large in the eastern United States and much of Europe and near zero in long-conserved forest. Management growth is what the company's own activity adds above a no-activity counterfactual: young stands regrowing faster than the old ones they replaced, planting, fertilising. Harvest is the carbon leaving the forest when it is cut, roundwood plus slash and collateral damage, with a share still stored in products after a century. Area times rate gives Mt a year.
        </p>

        <h2 style={h2}>The four rules</h2>
        <p style={p}>
          <strong>MLP, as piloted.</strong> All flux on managed land is anthropogenic and goes in the scopes: harvest emissions at the time of harvest, and all three kinds of growth as removals, leased forest included. The pilots netted everything, fossil emissions too, and every company that tested it came out carbon negative. Untraced scope 3 wood takes a national or global factor, which carries the same growth.
        </p>
        <p style={p}>
          <strong>MLP+.</strong> The same physical inventory with three safeguards from the May 2025 submission: scope 3 removals need sourcing-region traceability and the safeguards, and cover only attributable productive land, so leased or non-productive forest is excluded there; a claims disclaimer says forest removals may not compensate fossil emissions; and a forest impact statement reports the effect of management against historical practice outside the inventory. Product carbon storage is a separate category. Nothing in it stops forest removals netting against agricultural or land-use-change emissions.
        </p>
        <p style={p}>
          <strong>ABA.</strong> Emissions are what harvest and wood use release, pool by pool, so the share still in products after a century is not emitted. Removals are only the growth the company's activity caused above a no-human-activity counterfactual; ambient and legacy growth are the baseline, and leased forest adds nothing. Stock change on owned land is reported outside the scopes as information. Traceability changes the data, not the rule: untraced wood takes an activity factor per tonne. Following the LSRS, land removals do not net against fossil emissions.
        </p>
        <p style={p}>
          <strong>Guardrails (our proposal).</strong> Four switches, each one rule. Attributable removals only: count the growth the company caused, disclose the background sink, do not claim it. Separate ledgers: report emissions and removals as two totals with no net line. Like for like: fossil CO₂ is balanced only by durable storage, land removals only balance land emissions. One claimant per tonne: a scope 3 removal reported by several companies along a chain is divided among them. With all four on, the inventory is ABA's removals in MLP's presentation, with nothing netted.
        </p>

        <h2 style={h2}>The supply chain strip</h2>
        <p style={p}>
          The strip above Figure 1 places each term where it arises, in chain order: conversion and land management on the land, the forest growing, harvest, the company's own processing and transport, products and slash decaying downstream, and durable storage. The bands mark the scope each stage falls in for a company of that type. The bar under each stage shows the pool it nets in under the chosen rule: one pool for everything under MLP as piloted, a land pool beside a fossil pool under MLP+ and ABA, an emissions ledger and a removals ledger under the guardrails. The line beneath says what happens to removals at the border between the land and the company's operations: whether they enter a buyer's inventory, whether they reach fossil emissions, or whether they stay where they arose.
        </p>

        <h2 style={h2}>The three readings</h2>
        <p style={p}>
          The cardinal tick in Figure 1 is the company's net-zero position: what it must still balance, or reports as surplus below the line. Where a rule lets forest removals offset fossil emissions the whole inventory nets; otherwise fossil stands alone and only a land surplus adds to it. Durable removals bought are subtracted from a shortfall to give the bold row of Figure 3. Figure 2 recomputes the position after each move a company of that scope could make; harvest and the regrowth it triggers move together, because cutting more makes more young, fast-growing stands, and a buyer moves its share of the sourcing region rather than the rate. The wood footprint divides the forest's in-scope emissions and removals by dry wood harvested, taking 60% of the carbon removed as roundwood at 50% carbon.
        </p>

        <h2 style={h2}>What this is not</h2>
        <p style={p}>
          A device for comparing rules, not an estimate for any real company. Growth rates are constant; there is no stand age, no rotation, no disturbance year and no decay curve, so harvest emissions land in the year of harvest except for the century-stored share. The company presets are invented, with rates in the range of national inventories and of a companion analysis of 334,000 re-measured inventory plots in the United States, France and Spain, where the two main rules disagree in sign and the choice of counterfactual moves the answer about six times less than the choice of rule.
        </p>
        <p style={{ ...p, color: 'var(--ink-3)', fontSize: 13 }}>
          Sources: GHG Protocol, Land Sector and Removals Standard (2026) and the 2022 draft guidance; Managed Land Proxy "Plus" final submission (May 2025); Explanation of activity-based accounting v. managed land proxy proposal (Brandão and others, 2025); Allen and others, Nature (2025); Grassi and others, ESSD (2023); Peng and others, Nature (2023). Status as of 8 November 2026; unlisted while in review.
        </p>
      </div>
    </div>
  );
}
