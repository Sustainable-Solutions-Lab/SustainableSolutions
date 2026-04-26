/**
 * components/detail-panel/bar-chart.jsx
 * A compact SVG bar chart comparing total benefit vs. min cost for the current climate.
 */

import { formatValue } from '../../lib/format.js'

const BENEFIT_COLOR = '#5B8A4E'
const COST_COLOR = '#E55C2F'
const MUTED_COLOR = '#6b6b6b'

const SVG_WIDTH = 220
const SVG_HEIGHT = 90
const BAR_HEIGHT = 14
const LABEL_WIDTH = 40  // reserved on the left for "Benefit"/"Cost" labels
const VALUE_PAD = 4     // gap between bar end and value label
const TITLE_HEIGHT = 16 // height reserved for the "Current Climate" title
const ROW_GAP = 8       // gap between the two bar rows
// bar area starts below title
const BAR_AREA_LEFT = LABEL_WIDTH + 4
const BAR_AREA_WIDTH = SVG_WIDTH - BAR_AREA_LEFT - 2

/**
 * Props:
 * cell:   CellData
 * config: ProjectConfig
 */
export function BenefitCostChart({ cell, config }) {
  if (!cell || !cell.values) return null

  const benefit = cell.values['total_benefit_current']
  const cost = cell.values['min_cost']
  const net = cell.values['net_min_current']

  // Require all three keys to be present and numeric
  if (
    benefit == null || isNaN(benefit) ||
    cost    == null || isNaN(cost) ||
    net     == null || isNaN(net)
  ) {
    return null
  }

  const maxVal = Math.max(Math.abs(benefit), Math.abs(cost))
  if (maxVal === 0) return null

  const benefitWidth = (Math.abs(benefit) / maxVal) * BAR_AREA_WIDTH
  const costWidth    = (Math.abs(cost)    / maxVal) * BAR_AREA_WIDTH

  // Vertical positions
  const benefitBarY = TITLE_HEIGHT + 2
  const costBarY    = benefitBarY + BAR_HEIGHT + ROW_GAP

  // Net breakeven line: at the point where benefit === cost on the bar scale
  // (i.e. the x position that corresponds to min(benefit, cost))
  const breakevenX = BAR_AREA_LEFT + (Math.min(Math.abs(benefit), Math.abs(cost)) / maxVal) * BAR_AREA_WIDTH

  // Net label
  const netIsPositive = net >= 0
  const netLabel = `Net: ${netIsPositive ? '+' : ''}${formatValue(net, '$/km²')}`
  const netColor = netIsPositive ? BENEFIT_COLOR : COST_COLOR

  const totalHeight = costBarY + BAR_HEIGHT + 18 // room for net label below

  return (
    <svg
      width={SVG_WIDTH}
      height={totalHeight}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label='Current Climate benefit vs cost chart'
    >
      {/* Title */}
      <text
        x={0}
        y={TITLE_HEIGHT - 3}
        fontSize={10}
        fill={MUTED_COLOR}
        fontFamily='system-ui, sans-serif'
      >
        Current Climate
      </text>

      {/* Benefit bar */}
      <text
        x={0}
        y={benefitBarY + BAR_HEIGHT - 2}
        fontSize={10}
        fill={MUTED_COLOR}
        fontFamily='system-ui, sans-serif'
      >
        Benefit
      </text>
      <rect
        x={BAR_AREA_LEFT}
        y={benefitBarY}
        width={benefitWidth}
        height={BAR_HEIGHT}
        fill={BENEFIT_COLOR}
        rx={2}
      />
      <text
        x={BAR_AREA_LEFT + benefitWidth + VALUE_PAD}
        y={benefitBarY + BAR_HEIGHT - 2}
        fontSize={10}
        fill={BENEFIT_COLOR}
        fontFamily='ui-monospace, monospace'
      >
        {formatValue(benefit, '$/km²')}
      </text>

      {/* Cost bar */}
      <text
        x={0}
        y={costBarY + BAR_HEIGHT - 2}
        fontSize={10}
        fill={MUTED_COLOR}
        fontFamily='system-ui, sans-serif'
      >
        Cost
      </text>
      <rect
        x={BAR_AREA_LEFT}
        y={costBarY}
        width={costWidth}
        height={BAR_HEIGHT}
        fill={COST_COLOR}
        rx={2}
      />
      <text
        x={BAR_AREA_LEFT + costWidth + VALUE_PAD}
        y={costBarY + BAR_HEIGHT - 2}
        fontSize={10}
        fill={COST_COLOR}
        fontFamily='ui-monospace, monospace'
      >
        {formatValue(cost, '$/km²')}
      </text>

      {/* Breakeven vertical line (net = 0 position) */}
      <line
        x1={breakevenX}
        y1={benefitBarY - 2}
        x2={breakevenX}
        y2={costBarY + BAR_HEIGHT + 2}
        stroke={MUTED_COLOR}
        strokeWidth={1}
        strokeDasharray='3 2'
      />

      {/* Net label */}
      <text
        x={BAR_AREA_LEFT}
        y={costBarY + BAR_HEIGHT + 14}
        fontSize={10}
        fill={netColor}
        fontFamily='ui-monospace, monospace'
        fontWeight='600'
      >
        {netLabel}
      </text>
    </svg>
  )
}
