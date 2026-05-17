/**
 * components/sidebar/city-equity-chart.jsx
 *
 * Reads the pre-baked per-city equity stats from
 * /public/tools/just-air/city-equity.json and renders the same paired
 * income-tertile + race-bin chart the area-tool stats panel produces,
 * but driven by static data so it works without a drawn region. Used
 * by the mobile "City inequality" picker.
 *
 * Props:
 *   stats     — the equity object for one city × metric. Shape:
 *               { overall, income: [{dev,ci,n}|null × 3], race: [...] }
 *   isDark    — color scheme
 *   width     — px (chart scales horizontally)
 */

const W_DEFAULT = 280
const H = 96
const PAD_TOP = 16
const PAD_BOT = 14
const AXIS = 14
const BAR_W = 22
const BAR_GAP = 12
const GROUP_GAP = 28
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

export function CityEquityChart({ stats, isDark, width = W_DEFAULT }) {
  if (!stats) return null

  // Find the widest |dev| across bins to size the y-axis. Default to ±20 %.
  const all = [...(stats.income ?? []), ...(stats.race ?? [])].filter(Boolean)
  const allEdges = all.flatMap((b) => [
    Math.abs(b.dev ?? 0),
    Math.abs(b.ci?.lo ?? 0),
    Math.abs(b.ci?.hi ?? 0),
  ])
  const dataMax = Math.max(0.20, ...allEdges)
  const yMax = Math.min(0.40, Math.ceil(dataMax * 20) / 20)

  const innerH = H - PAD_TOP - PAD_BOT
  const yMid = PAD_TOP + innerH / 2
  const yScale = innerH / 2 / yMax

  const labelMuted = isDark ? 'rgba(248, 248, 232, 0.55)' : 'rgba(24, 24, 56, 0.55)'
  const labelFaint = isDark ? 'rgba(248, 248, 232, 0.35)' : 'rgba(24, 24, 56, 0.35)'
  const axisColor  = isDark ? 'rgba(248, 248, 232, 0.18)' : 'rgba(24, 24, 56, 0.18)'

  const palette = {
    income: {
      band: isDark ? 'rgba(67, 147, 195, 0.22)' : 'rgba(67, 147, 195, 0.28)',
      bar:  isDark ? 'rgba(67, 147, 195, 0.95)' : '#2166ac',
    },
    race: {
      band: isDark ? 'rgba(214, 96, 77, 0.22)'  : 'rgba(214, 96, 77, 0.28)',
      bar:  isDark ? 'rgba(214, 96, 77, 0.95)'  : '#b2182b',
    },
  }

  // Compute x positions
  const groupW = 3 * BAR_W + 2 * BAR_GAP
  const totalContent = 30 + groupW + GROUP_GAP + groupW  // y-label gutter + two groups + gap
  // Center the chart if width is wider than content
  const startX = Math.max(30, (width - totalContent) / 2 + 30)
  const incomeXs = [0, 1, 2].map((i) => startX + i * (BAR_W + BAR_GAP))
  const raceStart = startX + groupW + GROUP_GAP
  const raceXs = [0, 1, 2].map((i) => raceStart + i * (BAR_W + BAR_GAP))
  const dividerX = startX + groupW + GROUP_GAP / 2

  function devY(d) { return yMid - d * yScale }

  function renderBar(b, x, bandFill, barFill) {
    if (!b || b.dev == null) return null
    const POINT_H = 3
    const elements = []
    if (b.ci) {
      const top = devY(b.ci.hi)
      const bot = devY(b.ci.lo)
      elements.push(<rect key='ci' x={x} y={top} width={BAR_W} height={Math.max(2, bot - top)} fill={bandFill} />)
    }
    elements.push(<rect key='pt' x={x} y={devY(b.dev) - POINT_H / 2} width={BAR_W} height={POINT_H} fill={barFill} />)
    const sign = b.dev >= 0 ? '+' : ''
    const labelY = b.dev >= 0
      ? Math.max(8, devY(b.ci?.hi ?? b.dev) - 4)
      : Math.min(H - AXIS - 2, devY(b.ci?.lo ?? b.dev) + 11)
    elements.push(
      <text key='lbl'
        x={x + BAR_W / 2}
        y={labelY}
        fontSize={9} fontFamily={FONT_MONO}
        fill={labelMuted} textAnchor='middle'>
        {sign}{(b.dev * 100).toFixed(1)}%
      </text>,
    )
    return <g key={x}>{elements}</g>
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: labelMuted, marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Excess relative to city mean
      </div>
      <div style={{ display: 'flex', fontFamily: FONT_MONO, fontSize: 9, color: labelFaint, marginBottom: 2 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>higher income →</span>
        <span style={{ flex: 1, textAlign: 'center' }}>more white →</span>
      </div>
      <svg viewBox={`0 0 ${width} ${H}`} preserveAspectRatio='none' style={{ width: '100%', height: H, display: 'block' }}>
        <line x1={0} y1={yMid} x2={width} y2={yMid} stroke={axisColor} strokeWidth={0.8} />
        <text x={0} y={PAD_TOP + 3} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>+{(yMax * 100).toFixed(0)}%</text>
        <text x={0} y={yMid + 3} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>0</text>
        <text x={0} y={H - AXIS - 2} fontSize={8} fontFamily={FONT_MONO} fill={labelFaint}>−{(yMax * 100).toFixed(0)}%</text>

        <line x1={dividerX} y1={PAD_TOP - 4} x2={dividerX} y2={H - AXIS + 6} stroke={axisColor} strokeWidth={0.6} strokeDasharray='3 3' />

        {(stats.income ?? []).map((b, i) => renderBar(b, incomeXs[i], palette.income.band, palette.income.bar))}
        {(stats.race ?? []).map((b, i) => renderBar(b, raceXs[i], palette.race.band, palette.race.bar))}

        {['<33ʳᵈ', '33–66ᵗʰ', '>66ᵗʰ'].map((lbl, i) => (
          <text key={`il${i}`} x={incomeXs[i] + BAR_W / 2} y={H - AXIS + 11}
            fontSize={9} fontFamily={FONT_MONO} fill={labelMuted} textAnchor='middle'>{lbl}</text>
        ))}
        {['<30%', '30–60%', '>60%'].map((lbl, i) => (
          <text key={`rl${i}`} x={raceXs[i] + BAR_W / 2} y={H - AXIS + 11}
            fontSize={9} fontFamily={FONT_MONO} fill={labelMuted} textAnchor='middle'>{lbl}</text>
        ))}
      </svg>
      <div style={{ display: 'flex', fontFamily: FONT_MONO, fontSize: 9, color: labelFaint, marginTop: 1 }}>
        <span style={{ flex: 1, textAlign: 'center' }}>percentiles</span>
        <span style={{ flex: 1, textAlign: 'center' }}>percentiles</span>
      </div>
    </div>
  )
}
