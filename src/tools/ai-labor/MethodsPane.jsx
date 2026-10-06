/**
 * MethodsPane — in-tool methods documentation for the AI and labor sector
 * lens, following the map tools' methods-panel pattern (full overlay inside
 * the tool frame, mono eyebrow, X close). The standalone page at
 * /tools/ai-labor-methods keeps the model schematic and data provenance;
 * this pane carries the prose and links out to it.
 */
import { X } from 'lucide-react';
import { ETA } from './model.js';

const h2Style = {
  fontFamily: 'var(--font-serif)', fontSize: 19, fontWeight: 600,
  marginTop: 24, marginBottom: 8, color: 'var(--ink)',
};
const pStyle = { fontSize: 15, lineHeight: 1.55, margin: '0 0 12px', color: 'var(--ink)' };
const linkStyle = { color: 'var(--ink-2)', textDecoration: 'underline', textUnderlineOffset: 3 };
const srcStyle = { ...pStyle, fontSize: 13, color: 'var(--ink-3)' };
const dtStyle = { fontWeight: 600, color: 'var(--ink)', fontSize: 15, marginBottom: 4 };
const symStyle = { fontFamily: 'var(--font-mono)', color: 'var(--cardinal)', marginRight: 4 };

const LEVERS = [
  ['ε', 'Demand ceiling (income elasticity)',
    'How strongly the sector’s demand responds to income: each 1% of income growth moves the quantity demanded by about ε%.',
    'Measured per sector: 66 years (1959–2025) of US personal consumption (BEA PCE) regressed on real disposable income per person, bridged to BEA’s ≈400-industry detail. Loaded automatically when you pick a sector.'],
  ['φ', 'Provenance premium',
    'The share of the sector’s demand that insists on attested human work — that slice keeps its human labor and its human cost, whatever AI can do.',
    'A scenario dial (default 0). Evidence that such demand exists and behaves as a complement: live performance’s share of music spending rose from 34% to 78% while its relative price more than doubled.'],
  ['ℓ', 'Labor intensity',
    'Compensation as a share of the sector’s output value — it bounds how much automation can cut the price.',
    'BEA 2017 detail benchmark input–output accounts. Loaded with the sector.'],
  ['θ', 'Task mix (physical / analytic / creative)',
    'How the sector’s wage bill divides across task types: physical tasks need a body; analytic tasks are compute-like cognition; creative tasks are novel combination and judgment.',
    'Occupation staffing (BLS OEWS, May 2024) crossed with task content (O*NET); teleworkability separates physical from cognitive work. Loaded with the sector.'],
  ['g', 'AI reach by task type',
    'The share of each task type AI can perform at full frontier progress. Physical tasks lag cognitive ones while robotics catches up.',
    'Scenario dials, not measurements (defaults: analytic 95%, creative 60%, physical 25%). The gray slider ticks mark these defaults.'],
  ['χ', 'Workers’ share of capital income',
    'Who receives the automation gains. χ = 1: capital income reaches everyone; χ = 0: wages only. It changes how well off workers are far more than which industries grow.',
    'A scenario dial; the income paths it selects come from our 84-industry general equilibrium.'],
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
          How the sector lens works
        </h1>

        <p style={pStyle}>
          The tool asks one question per sector: as AI takes over a growing share of work, do the
          jobs in this industry grow or shrink? The answer is a race between demand growth and
          task displacement, and the sector-specific variables that decide the race are measured,
          not assumed, wherever the data allows.
        </p>

        <p style={{ margin: '18px 0 24px', padding: '12px 14px', border: '1px solid var(--rule-strong)', borderRadius: 4, background: 'var(--paper-2)', fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
          <a href="/tools/ai-labor-methods" style={linkStyle}>
            <strong>Schematic: the model in one picture, with equations and data provenance</strong>
          </a>
          <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>
            One page showing the three channels from AI progress to the jobs index, which inputs
            are measured and which are scenario dials, and where every number comes from.
          </span>
        </p>

        <h2 style={h2Style}>The jobs identity</h2>
        <p style={pStyle}>
          At frontier progress <em>a</em> (0 = today, 100% ≈ analytic work fully automated):
        </p>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink)', background: 'var(--paper-2)', border: '1px solid var(--rule)', borderRadius: 4, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>
{`J = D · price⁻η · h   (jobs index, today = 1)

A = a · (θ-mix × AI reach g)
h = φ + (1−φ)(1−A)
price = 1 − ℓ(1−φ)A·0.9
D = sʷ·yʷ^ε + (1−sʷ)·yᵏ^ε`}
        </pre>
        <p style={pStyle}>
          A is the automated share of tasks, h the human task share, and D demand at base prices,
          with y<sup>w</sup>, y<sup>k</sup> the worker and capital-owner real income paths from
          the project's general equilibrium (interpolated as you move χ) and s<sup>w</sup> the
          workers' base spending share. η = {ETA} is the price elasticity of sector demand, and AI
          performs an automated task at 10% of the human cost.
        </p>
        <p style={pStyle}>
          <strong>Jobs, not wages.</strong> The index counts the quantity of human labor the
          sector demands — employment — at the sector's going wage, which this
          partial-equilibrium lens holds fixed; up to that assumption the same curve is also the
          sector's wage-bill index. How wages move, and the labor-vs-capital split, are
          general-equilibrium questions treated in the project's formal model.
        </p>

        <h2 style={h2Style}>The levers, and where each value comes from</h2>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {LEVERS.map(([sym, name, what, source]) => (
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

        <h2 style={h2Style}>The general-equilibrium backdrop</h2>
        <p style={pStyle}>
          The outlook and the income paths behind χ come from the project's formal model:
          an 84-industry general equilibrium in which one wage clears a fixed workforce, demand follows nonhomothetic preferences calibrated to the measured Engel parameters, automation moves tasks from labor to capital, and workers (90% of people) earn the wage bill plus a share χ of capital income while capital owners receive the rest. Its industry outlook (the chart at the top of the tool) solves that model at full AI progress across 648 combinations of AI reach into physical, analytic and creative tasks, income growth, capital supply, the human share of spending and the demand estimates, each in three ownership worlds (χ = 0, 0.3, 1): 1,944 outcomes per industry. An industry 'loses' or 'gains' if it does so in at least 90% of them, and the decision bar splits its uncertainty among capability, demand and ownership by a variance decomposition.
          The sector lens is deliberately partial equilibrium on that backdrop: each sector's
          own wage and prices do not feed back on the economy.
        </p>

        <h2 style={h2Style}>Caveats</h2>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20, listStyle: 'disc' }}>
          {['Mechanism illustration, not a forecast: every curve is conditional on dials whose future values nobody knows.',
            'Measured elasticities are extrapolated far out of sample at high frontier progress.',
            'Task shares divide the wage bill, which proxies output composition imperfectly.',
            'Within-sector adjustment — quality upgrading, new varieties, intensity growth ("twice the chefs per dinner") — is not modeled here and works against pure displacement.',
            'No labor-market frictions or adjustment dynamics: the index compares equilibria, not years.'].map((t) => (
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
