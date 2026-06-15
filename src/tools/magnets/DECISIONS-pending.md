# Magnet explorer — session status + decisions for Steve

_Branch: `magnet-tri-projects` (not merged to main). Autonomous session while you were out._

## TL;DR

I shipped everything that was **safe + verifiable without your judgment**, and a
**horizon-average TRI regrid** that I verified fixes the recycling puzzle you asked about.
I deliberately **deferred** three things that touch paper-critical methodology or need a
UX/grid-budget call from you. Details below.

---

## ✅ Shipped this session (on the branch, typechecked)

1. **Diagnosed your recycling question.** At china=100%, dytb=0.7 the separation TRI dipped at
   rec=0.2 (0.68) then rose at rec=0.4 (0.75) — looking like "more recycling = more risk." Root
   cause: a **degenerate near-tie** — when US recycled oxide exceeds what downstream US capacity
   can absorb, the cost-optimal solution is indifferent about exporting vs retaining it, so it
   reshuffles year-to-year. The **final-year snapshot** the TRI used happened to catch a bad year
   at rec=0.4. It's a snapshot artifact, not an economic effect. (Same root as the old
   "US recycles oxide → ships it to China" oddity.)

2. **Horizon-average TRI (regrid, verified).** Changed `_us_supply` to report **demand-weighted
   period self-sufficiency** (Σ retained / Σ requirement over 2026–35) instead of the final year.
   Verified per-year: the rec=0.2 vs 0.4 domestic share is **0.331 vs 0.332** (identical) — the
   non-monotonicity vanishes, and the recycling sweep is now monotone (sepTRI 0.83→0.76→0.77→0.74).
   This is **methodology-neutral** (same per-year computation, just averaged) and also makes the
   **stockpile** and the **recycling ramp** register (early-period relief now counts). Regrid is
   running into `outputs/explorer/scenarios_horizon.json`; I'll swap it in + re-verify when it lands.

3. **Stockpile now buys down the TRI.** The buffered fraction of period unmet is credited to the
   secure US-held bucket across stages. (Before, `applyStockpile` only touched the pathway unmet,
   never `us_supply`, so the TRI never moved — your observation.)

4. **"US trade-risk index"** title + a note that it's horizon-averaged and that recycling's benefit
   is **threat-conditional**.

5. **Country-level allied HHI (real data).** Retired the flat `N_ALLY=4` diversity fudge. The
   allied-import HHI is now computed per stage from real + announced project capacities. Reality is
   far more concentrated than the fudge assumed: **allied alloy ≈ Japan-only (HHI 1.0), magnet ≈ 0.79,
   separation ≈ 0.63** — so the old TRI *understated* allied concentration. This raises allied-import
   risk honestly.

6. **Real-world projects panel.** New selectable overlay (all / none / realistic-2026 presets,
   per-project scale, grouped by stage). The active **allied** set drives the country HHI live.

---

## ⏸ Deferred — need your call

### A. Recycled-oxide domestic-retention (the "proper" fix vs the horizon-average band-aid)
The horizon average **removes the symptom** (the non-monotonic jump) cleanly and is verified. The
**underlying degeneracy** — model indifferent about exporting US recycled oxide — still exists in
individual years. I did **not** add a trade-friction tie-breaker because `config/trade.py` already
warns (from your alloy experiment) that friction "only creates degenerate near-ties (noisy,
non-monotonic flows) or an intractable MIP." A cleaner fix would change how `_us_supply` attributes
"domestic" (e.g. priority attribution: US demand met domestic-first, then allied, then China, then
unmet — robust to degenerate cross-hauling), but that **shifts TRI values across the whole grid**
and is paper-critical. **My rec:** ship the horizon average now (done); decide the attribution
question together — it's a one-paragraph methods choice for the paper, not a code emergency.

### B. Friendshoring grid-restructure (the headline you're most excited about)
Splitting the content axis into **make** (component prong) × **source** (mineral prong) is a clean
precompute change, but it **restructures the grid** (DC[5] → make[3]×source[3] = 9) and needs the
frontend interp to grow a 7th axis + a second slider. Two calls are yours:
- **Grid budget.** 9 × REC[4] × DYTB[5] × CHINA[6] × RECYC[2] × DSCALE[3] = 6480 (vs 3600). To stay
  ~tractable I'd trim DYTB 5→4. Acceptable, or do you want the full grid (≈90-min regrid)?
- **UX.** Two sliders ("US-make %" and "non-China sourcing %") or keep one and add a friendshoring
  toggle? **My rec:** two sliders, DYTB trimmed to 4. I'll do this as a second regrid once you nod —
  it's the riskiest change (could break the tool) so I want it verified, not blind.

### C. Projects panel — data review + deeper coupling
- **The capacities/list need your expert eye** (`projects.ts`). They're grounded in your sourced
  CSVs + public 2024-26 figures but are representative. Especially: Round Top, Serra Verde, Lynas
  Seadrift, e-VAC, Noveon, the recycling entries.
- **Russia caveat:** Lovozero sits in the model's RoW/allied flows but I marked it `nonaligned`, so
  it's **excluded from the allied HHI** (a source, not a security hedge). Flag if you'd rather count
  it.
- **Next iteration (not built):** let the active projects **redraw the Sankey + supply mix** (your
  "real projected global supply chain"), reconciled with the least-cost model via the shadow price.
  I held off because folding projects into `us_supply` risks **double-counting** the model's own US
  build + the reshore overlays — needs a clean reconciliation rule, which is your call.

---

## To deploy when you're back
Branch `magnet-tri-projects`. Once the regrid lands I'll swap `scenarios.json`, re-verify the three
fixes, and it's ready to merge to main (unlisted, like now). Nothing here is on production yet.
