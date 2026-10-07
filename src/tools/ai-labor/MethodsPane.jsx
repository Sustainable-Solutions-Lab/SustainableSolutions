/**
 * MethodsPane — in-tool methods documentation for the AI and labor tool
 * (general equilibrium at full AI progress), following the map tools' methods-panel pattern (full overlay inside
 * the tool frame, mono eyebrow, X close). The standalone page at
 * /tools/ai-labor-methods keeps the model schematic and data provenance;
 * this pane carries the prose and links out to it.
 */
import { X } from 'lucide-react';

const h2Style = {
  fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 600,
  marginTop: 24, marginBottom: 8, color: 'var(--ink)',
};
const pStyle = { fontSize: 15, lineHeight: 1.55, margin: '0 0 12px', color: 'var(--ink)' };
const linkStyle = { color: 'var(--ink-2)', textDecoration: 'underline', textUnderlineOffset: 3 };
const srcStyle = { ...pStyle, fontSize: 13, color: 'var(--ink-3)' };
const dtStyle = { fontWeight: 600, color: 'var(--ink)', fontSize: 15, marginBottom: 4 };
const symStyle = { fontFamily: 'var(--font-mono)', color: 'var(--cardinal)', marginRight: 4 };

const INPUTS = [
  ['ε', 'Income elasticity of demand',
    'How strongly demand for the industry’s output responds to income: each 1% of income growth moves the quantity demanded by about ε%.',
    'Measured per industry: 66 years (1959–2025) of US personal consumption (BEA PCE) regressed on real disposable income per person, bridged to BEA’s detail industries. Two specifications (levels and price-controlled) bound it in the scenario grid.'],
  ['ρ', 'Human-attention shield',
    'The share of an industry’s spending growth that buys more human attention per unit rather than more units (more nurse hours per bed-day, more teachers per pupil). That labor stays human whatever AI can do.',
    'Measured for 21 industries from natural-unit series (inpatient days, enrollment, consultations, passengers and others) and assigned by demand class elsewhere; 80% of it (50–100% in the scenario grid) is treated as embodied human attention.'],
  ['ℓ', 'Labor cost share',
    'Compensation as a share of the industry’s output value; it bounds how much automation can cut the price.',
    'BEA 2017 detail benchmark input–output accounts.'],
  ['θ', 'Task mix (physical / analytic / creative)',
    'How the industry’s wage bill divides across task types: physical tasks need a body; analytic tasks are compute-like cognition; creative tasks are novel combination and judgment.',
    'Occupation staffing (BLS OEWS, May 2024) crossed with task content (O*NET 30.3); teleworkability separates physical from cognitive work.'],
  ['g', 'AI reach by task type',
    'The share of each task type AI can perform at full progress. AI exposure, the automated share of an industry’s tasks, is its task mix weighted by these reaches.',
    'Scenarios, not measurements: central 25% physical, 95% analytic, 60% creative; the grid spans 0–60%, 70–100% and 30–90%.'],
  ['χ', 'Workers’ share of capital income',
    'Who receives the returns on the capital AI runs on. It changes how well off workers are far more than which industries grow.',
    'Three worlds in the scenario grid: concentrated (0), today-like (0.3) and broad (all of it).'],
];

export default function MethodsPane({ onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Methods"
      style={{ position: 'absolute', inset: 0, zIndex: 30, overflowY: 'auto', background: 'var(--paper)', borderTop: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 96px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: 0 }}>
            Methods
          </p>
          <button type="button" onClick={onClose} aria-label="Close methods"
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ink-3)', padding: 4, margin: -4 }}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1.15, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 16px', color: 'var(--ink)' }}>
          How the model works
        </h1>

        <p style={pStyle}>
          Every chart in the tool reports one model at full AI progress: an 84-industry general
          equilibrium of the US economy in which one budget and one labor market discipline every
          industry at once. It asks which industries' jobs AI shrinks or grows, what happens to
          pay in each, and why.
        </p>

        <p style={{ margin: '18px 0 24px', padding: '12px 14px', border: '1px solid var(--rule-strong)', borderRadius: 4, background: 'var(--paper-2)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
          <a href="/tools/ai-labor-methods" style={linkStyle}>
            <strong>Schematic, equations and data provenance</strong>
          </a>
          <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>
            The model in one picture, which inputs are measured and which are scenarios, and where
            every number comes from.
          </span>
        </p>

        <h2 style={h2Style}>The model</h2>
        <p style={pStyle}>
          Demand follows nonhomothetic preferences calibrated to the measured income elasticities,
          so richer households shift spending toward income-elastic industries and away from
          saturated ones. Each industry produces with labor and capital; automation reassigns its
          AI-exposed tasks from labor to capital, except the share protected by the human-attention
          shield. Total employment is fixed, so an industry's change in jobs is a change in its share
          of the workforce. Workers move between industries imperfectly (mobility elasticity 2), so
          average wages differ by industry. Workers (90% of people) earn wages plus a share χ of
          capital income; capital owners receive the rest.
        </p>

        <h2 style={h2Style}>The forces</h2>
        <p style={pStyle}>
          An industry's employment equals labor per unit of output times its spending share
          divided by its price, so its log change in jobs splits exactly into AI taking over tasks
          (split by physical, analytic and creative tasks in proportion to each type's share of the
          automated tasks), the human-attention shield, the shift toward labor as it gets cheaper
          relative to capital, cheaper output, and spending shifts. The parts add up to the net
          change.
        </p>

        <h2 style={h2Style}>Scenarios and ranges</h2>
        <p style={pStyle}>
          The model is solved on a full grid of its uncertain assumptions: AI reach into physical
          (3 levels), analytic (3) and creative (3) tasks, capital supply (3), the human share of
          attention spending (2), productivity growth (2) and the demand estimate (2), 648
          economies, each in three ownership worlds, 1,944 outcomes per industry. The growth chip
          splits them in half: no additional productivity growth (real output about 1.2 times
          today's at full progress) or growth that raises it about 3.5-fold. Ranges are the 5th to
          95th percentile of an industry's outcomes in the chosen case (972 for jobs; 324 for wages,
          which hold ownership at today-like levels). An industry "loses" or "gains" if it does so in
          at least 90% of all 1,944 outcomes. The five lanes of the first chart are sector types
          from a Ward clustering of each industry's central-case force mix (the five forces below,
          standardized). Care, desk work and the attention-shielded group hold across k-means, the
          growth case and a clustering on industry traits; saturated services mostly do; the mixed
          group of goods and utilities is a residual. The decision bar splits an industry's uncertainty
          among capability, demand and ownership by a first-order variance decomposition over the
          grid. Scatter colours, the forces and the contour use the central assumptions.
        </p>

        <h2 style={h2Style}>Wages and prices</h2>
        <p style={pStyle}>
          Real wages are wages deflated by a consumer price index, so they already include the fall in prices that automation brings. Deflating instead by what workers themselves buy, which leans toward care and housing whose prices fall least, lowers the central real wage only slightly (0.73 rather than 0.74 of today's). The index covers existing industries' output only: new goods, better quality and free AI services never appear in it, so the decline in living standards is likely overstated on that count. Worker welfare also counts workers' share of capital income, which is why it can hold up while the real wage falls.
        </p>

        <h2 style={h2Style}>The inputs, and where each value comes from</h2>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {INPUTS.map(([sym, name, what, source]) => (
            <div key={sym}>
              <dt style={dtStyle}><span style={symStyle}>{sym}</span>{name}</dt>
              <dd style={{ margin: 0 }}>
                <p style={pStyle}>{what}</p>
                <p style={srcStyle}>{source}</p>
              </dd>
            </div>
          ))}
        </dl>

        <h2 style={h2Style}>Engel parameters, briefly</h2>
        <p style={pStyle}>
          An Engel curve traces how spending on a good changes as income rises — named for Ernst
          Engel's 1857 observation that food's budget share falls as households get richer. Its
          slope, the income elasticity ε, is the demand-ceiling idea in one number: when ε has
          fallen to zero, more income buys no more of the good, and productivity growth in that
          sector can only cut jobs. Across US sectors the systematic pattern is that physical
          goods sit low (food at home ≈ 0.5) while human-time services and open-ended categories
          sit high (≈ 2–3). Two cautions the tool inherits: ε is a long-run average slope, not a
          constant — sectors drift down their Engel curves as saturation approaches — and
          extrapolating it across the several-fold income growth AI scenarios imply stretches it
          far out of sample.
        </p>

        <h2 style={h2Style}>Caveats</h2>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20, listStyle: 'disc' }}>
          {['Scenario analysis, not a forecast: results are conditional on assumptions whose future values nobody knows.',
            'Total employment is fixed: industry changes are shifts in shares of jobs, not unemployment; transition frictions, wage floors and exit from the labor force are not modeled.',
            'Measured elasticities are long-run co-movements extrapolated out of sample.',
            'Task shares divide the wage bill, which proxies output composition imperfectly.',
            'Wage results rest on an assumed mobility between industries rather than measured worker flows.'].map((t) => (
            <li key={t} style={{ ...pStyle, margin: '0 0 6px' }}>{t}</li>
          ))}
        </ul>
        <p style={srcStyle}>
          Data: BEA 2017 detail benchmark; BLS QCEW 2025; BLS OEWS May 2024; O*NET 30.3;
          Dingel–Neiman (2020) teleworkability; BEA PCE and real disposable income 1959–2025.
          Aggregate framework:{' '}
          <a href="https://www.brookings.edu/articles/artificial-intelligence-saturation-and-the-future-of-work/"
            target="_blank" rel="noopener noreferrer" style={linkStyle}>Kording &amp; Marinescu (2025)</a>.
          The research repository is private while the paper is in preparation.
        </p>
      </div>
    </div>
  );
}
