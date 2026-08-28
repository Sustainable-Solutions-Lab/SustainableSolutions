# Contrail-check RCT — design notes (NOT implemented; awaiting IRB)

Status 2026-08-28: idea parked until Steve is ready to pursue IRB
approval. Nothing in the shipped extension collects any user data.
The v1.2 telemetry/randomization build starts only after an exempt
determination is in hand.

## Research question

Does surfacing flight-level contrail-warming predictions at booking
time shift traveler choices toward lower-forcing flights — and by how
much, in predicted forcing per passenger-km?

## Two candidate designs

### A. Per-search holdout (within-user)

Consented users see badges on ~85–90% of searches; a random 10–15% of
searches render with no badges at all. Compare the chosen itinerary's
predicted forcing (or within-choice-set rank) between badged and
unbadged searches, SEs clustered by user.

- Clean estimand: effect of the tool's presence on that search.
- Bias: learning spillover (badge-trained users choose greener even
  unbadged) attenuates toward zero → estimates are conservative.
- Product cost: occasional fully-dark searches.

### B. Per-flight withholding (Steve's variant, 2026-08-28)

Within every search, badge a random subset of the displayed flights;
the rest show no chip. Users always get some information; behavior
toward the UNBADGED flights is the measurement.

- Product cost lower: no fully dark searches.
- Estimand is subtler: this measures the effect of *information
  presence on an option*, not the tool vs. no tool. Two forces mix:
  (i) users may avoid unbadged options simply because unknown feels
  risky (mere-information/ambiguity effect, direction independent of
  the option's true forcing); (ii) users can't act on the withheld
  value. Disentangling needs the withheld flights' *actual* predictions
  (which we log but don't show): test whether selection of unbadged
  flights is independent of their hidden forcing (it should be, if
  badges are the only channel) and whether badged options are chosen
  more overall regardless of value.
- Randomize which flights are withheld uniformly (not by predicted
  value!) or the comparison is confounded by construction.
- Nice secondary estimand: demand curve for information — how much does
  a chip per se attract/repel choice.

Likely best: run B as the default experience (low product cost),
with a small dose of A (occasional all-dark searches) to anchor the
tool-level effect. Both randomizations are cheap once telemetry exists.

## Outcome + power sketch

Primary: predicted kg CO2e per passenger-km of the selected itinerary;
secondary: within-choice-set percentile rank of the selection; for
design B, P(select | badged) vs P(select | unbadged) controlling for
hidden prediction. Choice-rank SD ≈ 29 points ⇒ ~1,000 searches in the
smaller arm detects a 5-point shift at 80% power; a few hundred active
users over a few months.

## v1.2 implementation plan (build later, behind a flag)

- First-run consent screen: opt-in, default OFF; names investigator +
  contact per exempt consent requirements; discloses that predictions
  may be hidden for some flights/searches for research.
- Local random ID (crypto.randomUUID, stored in extension storage);
  no accounts, no cookies, no IP retention server-side.
- Event POST per results interaction: {anon_id, search_id, route, date,
  arm assignments (per search + per flight), displayed set with our
  predictions, selected index or null}. Schedule facts only.
- Storage: free-tier Postgres (Neon/Supabase) behind /api/telemetry;
  Vercel functions are stateless so external store required.
- Chrome Web Store data disclosure gains "user activity" (research,
  consented); privacy page gains a research section.
- Manifest bump; store re-review expected (new disclosure).

## Sequencing

1. IRB exempt protocol filed (draft prepared 2026-08-28, in Dropbox
   Contrails/IRB/). Likely Exempt Category 3 (benign behavioral
   intervention) + limited review of privacy provisions.
2. Build v1.2 behind a disabled flag while review runs.
3. Enable collection only after determination letter.
