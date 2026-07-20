'use client'

import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  LineChart, Line, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { IHUtilizationData, IHPeakData, IHDailyPeakRow, IHAssetTypeRow, IHHourlyRow, IHWeeklyRow, IHLocationCategoryRow, IHCategoryAssetRow, IHCategoryDailyRow } from '@/hooks/useInsightHubData'
import PerTenIconGrid from '../shared/PerTenIconGrid'
import FlipStatCards from '../shared/FlipStatCards'
import type { StatFace } from '../shared/FlipStatCards'
import WhereDoTheySpend from '../shared/WhereDoTheySpend'

const TEAL = '#0d9488'

// SVG monitor icon — used inline in section headings
function DeviceIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 9.5H7L9 6.5L11.5 12.5L13.5 8L15 9.5H19"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="12" y1="16" x2="12" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8" y1="19" x2="16" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// Placeholder — untagged assets are, by definition, invisible to our tracking
// system (no tag means no VIN, no session, no way for us to know they exist).
// Placed per client request even though it can't be wired up to real data yet.
function UntaggedAssetButton({ assetLabel }: { assetLabel: string }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="button"
        onClick={() => setOpen((v) => !v)}
        sx={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          0.6,
          px:           1.75,
          py:           0.85,
          borderRadius: 6,
          border:       '1.5px solid',
          borderColor:  TEAL,
          bgcolor:      'transparent',
          color:        TEAL,
          fontSize:     13,
          fontWeight:   700,
          cursor:       'pointer',
          fontFamily:   'inherit',
          transition:   'background-color 0.12s',
          '&:hover':    { bgcolor: `${TEAL}12` },
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        Untagged Asset
      </Box>

      {open && (
        <Box
          sx={{
            position:     'absolute',
            top:          'calc(100% + 8px)',
            right:        0,
            zIndex:       5,
            bgcolor:      'background.paper',
            border:       '1px solid',
            borderColor:  'divider',
            borderRadius: 2,
            boxShadow:    '0 4px 16px rgba(0,0,0,0.12)',
            p:            1.75,
            width:        260,
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            Coming soon
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.6 }}>
            Flagging untagged {assetLabel.toLowerCase()}{' '}
            isn&apos;t available yet — an asset without a TrueSpot tag can&apos;t be seen by
            our tracking system, so this will need a separate way to report them.
          </Typography>
        </Box>
      )}
    </Box>
  )
}

function getNarrativeJSX(pct: number, assetLabel: string, nPatient10: number, TEAL: string): React.ReactNode {
  const label   = assetLabel.toLowerCase()
  const notUsed = 10 - nPatient10

  if (pct >= 75) {
    return (
      <>
        Nearly{' '}
        <Box component="span" sx={{ fontWeight: 700, color: TEAL }}>
          {nPatient10} of every 10 {label}
        </Box>{' '}
        are with patients right now. This fleet is earning its keep — watch it doesn&apos;t tip past 80%.
      </>
    )
  }
  if (pct >= 50) {
    return (
      <>
        About{' '}
        <Box component="span" sx={{ fontWeight: 700, color: TEAL }}>
          {nPatient10} of every 10 {label}
        </Box>{' '}
        are in use right now. Utilization is healthy, with some buffer to absorb demand spikes.
      </>
    )
  }
  if (pct >= 25) {
    return (
      <>
        That means{' '}
        <Box component="span" sx={{ fontWeight: 700, color: '#d97706' }}>
          about {notUsed} of every 10 {label}
        </Box>{' '}
        are not with a patient at any given moment. Some rest is normal — but this much means the fleet is bigger than the job.
      </>
    )
  }
  return (
    <>
      Only{' '}
      <Box component="span" sx={{ fontWeight: 700, color: '#ef4444' }}>
        {nPatient10} of every 10 {label}
      </Box>{' '}
      are with patients right now. Most of the fleet is sitting unused — consider reviewing par levels or distribution.
    </>
  )
}

// ── Peak date+hour formatter ───────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatPeakDateTime(d: IHPeakData): string {
  const date    = new Date(d.year, d.month - 1, d.day)
  const dayName = DAY_NAMES[date.getDay()]
  const monName = MONTH_NAMES[d.month - 1]
  const hourStr = d.hour === 0 ? '12am' : d.hour < 12 ? `${d.hour}am` : d.hour === 12 ? '12pm' : `${d.hour - 12}pm`
  return `${dayName} ${monName} ${d.day} · ${hourStr}`
}

// ── Usage by equipment type ────────────────────────────────────────────────────

const GOAL_PCT = 70  // target utilization — shown as a tick on every bar

// Today's peak-so-far is naturally lower than a completed day's peak (fewer
// hours observed), which can make the "Is it getting better?" trend look like
// a sudden drop even though nothing changed. Client asked to include it anyway
// so it fills in live over the course of the day.
const EXCLUDE_TODAY_FROM_DAILY_PEAK_TREND = false

function isToday(day: number, month: number, year: number): boolean {
  const now = new Date()
  return day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear()
}

function barColor(pct: number): string {
  if (pct >= 70) return TEAL       // green — at or above goal
  if (pct >= 25) return '#d97706'  // orange — 25-69%
  return '#ef4444'                // red — below 25%
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function UsageBar({ pct, showGoalLabel }: { pct: number; showGoalLabel?: boolean }) {
  const color = barColor(pct)
  return (
    <Box sx={{ position: 'relative', flex: 1, height: 10, bgcolor: '#e2e8f0', borderRadius: 5, overflow: 'visible' }}>
      {/* Fill */}
      <Box
        sx={{
          position:     'absolute',
          left: 0, top: 0, bottom: 0,
          width:        `${Math.min(pct, 100)}%`,
          bgcolor:      color,
          borderRadius: 5,
          transition:   'width 0.35s ease',
        }}
      />
      {/* GOAL dashed tick line */}
      <Box
        sx={{
          position:   'absolute',
          left:       `${GOAL_PCT}%`,
          top:        -5,
          bottom:     -5,
          width:      '1.5px',
          background: 'repeating-linear-gradient(to bottom, #64748b 0px, #64748b 3px, transparent 3px, transparent 6px)',
        }}
      >
        {/* "GOAL 70%" label — only on first row so it appears once above all bars */}
        {showGoalLabel && (
          <Box
            sx={{
              position:  'absolute',
              bottom:    'calc(100% + 6px)',
              left:      '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              display:   'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap:        0.25,
            }}
          >
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>
              GOAL {GOAL_PCT}%
            </Typography>
            {/* Downward arrow pointing to tick */}
            <Box sx={{
              width: 0, height: 0,
              borderLeft:  '3px solid transparent',
              borderRight: '3px solid transparent',
              borderTop:   '4px solid #94a3b8',
            }} />
          </Box>
        )}
      </Box>
    </Box>
  )
}

function EquipmentRow({
  row,
  isSelected,
  onClick,
  showGoalLabel,
}: {
  row:           IHAssetTypeRow
  isSelected:    boolean
  onClick:       () => void
  showGoalLabel?: boolean
}) {
  const pct   = row.total > 0 ? Math.round((row.withPatient / row.total) * 100) : 0
  const color = barColor(pct)

  return (
    <Box
      onClick={onClick}
      sx={{
        display:      'flex',
        alignItems:   'center',
        gap:          1.5,
        px:           1.5,
        pt:           showGoalLabel ? 3.5 : 1.25,
        pb:           1.25,
        borderRadius: 2,
        cursor:       'pointer',
        border:       `1.5px solid ${isSelected ? TEAL : 'transparent'}`,
        bgcolor:      isSelected ? `${TEAL}10` : 'transparent',
        transition:   'all 0.12s',
        '&:hover': {
          bgcolor: isSelected ? `${TEAL}12` : 'action.hover',
        },
      }}
    >
      {/* Device icon */}
      <Box sx={{ color, flexShrink: 0 }}>
        <DeviceIcon size={18} />
      </Box>

      {/* Name + tag count — fixed width so the bar always starts at the same x position,
          regardless of how long the asset type name is */}
      <Box sx={{ flex: '0 0 150px', width: 150, minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 13, fontWeight: 600, color: 'text.primary', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            }}
            title={row.assetType}
          >
            {row.assetType}
          </Typography>
          {isSelected && (
            <Typography
              sx={{
                fontSize:      9,
                fontWeight:    700,
                color:         TEAL,
                letterSpacing: '0.04em',
                border:        `1px solid ${TEAL}`,
                borderRadius:  1,
                px:            0.5,
                lineHeight:    1.6,
              }}
            >
              viewing
            </Typography>
          )}
        </Box>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.3 }}>
          {row.total.toLocaleString()} tagged
        </Typography>
      </Box>

      {/* Bar */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <UsageBar pct={pct} showGoalLabel={showGoalLabel} />
        <Typography sx={{ fontSize: 14, fontWeight: 700, color, minWidth: 38, textAlign: 'right' }}>
          {pct}%
        </Typography>
      </Box>
    </Box>
  )
}

// ── Component props ────────────────────────────────────────────────────────────

// ── Hour-by-hour bar chart ─────────────────────────────────────────────────────

function hourLabelLong(h: number): string {
  if (h === 0)  return '12am'
  if (h < 12)   return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

// Axis tick label — "9 am" / "12 pm", spaced out (distinct from hourLabelLong's
// compact "9am"/"12pm" used in the tooltip and callout text).
function hourLabelAxis(h: number): string {
  if (h === 0)  return '12 am'
  if (h < 12)   return `${h} am`
  if (h === 12) return '12 pm'
  return `${h - 12} pm`
}

function HourByHourChart({ rows, assetLabel, total }: { rows: IHHourlyRow[]; assetLabel: string; total: number }) {
  const [hoverHour, setHoverHour] = React.useState<number | null>(null)
  if (rows.length === 0) return null

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  const peakRow  = [...rows].sort((a, b) => b.withPatient - a.withPatient)[0]
  const maxCount = peakRow?.withPatient ?? 1
  // Halifax's real occupancy curve only varies ~20-25% peak-to-trough, so an
  // auto-scaled (0-based) axis makes every bar look nearly the same height.
  // Zooming the domain in on the actual data range (with a little headroom)
  // makes the real hour-to-hour shape of the day visible, matching the
  // reference design's much more dramatic-looking bars for the same data.
  const minCount = Math.min(...rows.map((r) => r.withPatient))
  const yMin     = Math.max(0, Math.floor(minCount * 0.85))
  const yMax     = Math.ceil(maxCount * 1.05)

  // Find the rush window — always exactly a 2-hour span (client asked for this
  // specifically). Primary score is min(hour, hour+1) across every adjacent
  // pair in the day — a window is only as good as its weaker hour, so this
  // correctly rejects a lone spike paired with a mediocre neighbor and finds
  // the true tightest 2-hour stretch regardless of where in the day it falls.
  //
  // On a real (gently plateaued) day, several windows often tie on that score
  // — verified against live data: hours 9-13 all scored identically, and the
  // day's single busiest hour (noon) ended up excluded from the picked window
  // purely because an earlier-starting tied window was scanned first. Ties
  // are broken by: (1) prefer the window containing the day's single busiest
  // hour, so "the rush" always includes the actual peak moment, not just any
  // equally-strong plateau neighbor; (2) prefer the higher combined total if
  // still tied; (3) earliest window wins as the final, rarely-reached fallback.
  const byHour   = new Map(rows.map((r) => [r.hour, r.withPatient]))
  const peakHour = peakRow?.hour ?? 0
  type Candidate = { h: number; score: number; sum: number; hasPeak: boolean }
  let best: Candidate | null = null
  for (let h = 0; h <= 22; h++) {
    const a = byHour.get(h)
    const b = byHour.get(h + 1)
    if (a === undefined || b === undefined) continue
    const candidate: Candidate = {
      h,
      score:   Math.min(a, b),
      sum:     a + b,
      hasPeak: h === peakHour || h + 1 === peakHour,
    }
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.hasPeak && !best.hasPeak) ||
      (candidate.score === best.score && candidate.hasPeak === best.hasPeak && candidate.sum > best.sum)
    ) {
      best = candidate
    }
  }
  const rushStart = best?.h ?? 0
  const rushEnd    = rushStart + 1
  const rushLabel = `${hourLabelLong(rushStart)}–${hourLabelLong(rushEnd)}`

  const chartData = rows.map((r) => ({
    hour:        r.hour,
    withPatient: r.withPatient,
    // Only the hovered bar gets a label value; others get null so no label renders.
    // Above the bar we show the raw quantity; the tooltip below shows the percentage.
    hoverLabel:  r.hour === hoverHour ? r.withPatient : null,
  }))

  return (
    <Box>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={chartData} barSize={14} margin={{ top: 18, right: 4, left: 12, bottom: 0 }}>
          <XAxis
            dataKey="hour"
            type="number"
            domain={[0, 23]}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
            tickFormatter={(h: number) => hourLabelAxis(h)}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[yMin, yMax]} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const hr = (payload[0]?.payload as { hour?: number })?.hour ?? 0
              const v  = payload[0]?.value ?? 0
              return (
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  background: '#0f172a', color: '#fff',
                  borderRadius: 999, padding: '7px 14px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  whiteSpace: 'nowrap',
                }}>
                  {hourLabelLong(hr)} — {pct(Number(v))}% in use
                </div>
              )
            }}
          />
          <Bar dataKey="withPatient" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => {
              const inRush = entry.hour >= rushStart && entry.hour <= rushEnd
              const hovered = entry.hour === hoverHour
              return (
                <Cell
                  key={i}
                  fill={inRush ? TEAL : hovered ? '#cbd5e1' : '#e2e8f0'}
                  onMouseEnter={() => setHoverHour(entry.hour)}
                  onMouseLeave={() => setHoverHour(null)}
                />
              )
            })}
            <LabelList
              dataKey="hoverLabel"
              position="top"
              formatter={(v?: React.ReactNode) => (v === null || v === undefined ? '' : String(v))}
              style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Insight callout */}
      {peakRow && (
        <Box
          sx={{
            mt:           1.5,
            p:            1.5,
            borderRadius: 2,
            bgcolor:      `${TEAL}12`,
            border:       `1px solid ${TEAL}30`,
            display:      'flex',
            gap:          1,
            alignItems:   'flex-start',
          }}
        >
          <Typography sx={{ color: TEAL, fontSize: 14, lineHeight: 1, mt: '2px', flexShrink: 0 }}>
            ⚡
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#0c4a42', lineHeight: 1.65 }}>
            <Box component="span" sx={{ fontWeight: 700 }}>
              The rush is {rushLabel}
            </Box>
            {rushStart >= 6 && rushStart <= 11
              ? ', when morning medications start.'
              : `, when the most ${assetLabel.toLowerCase()} are with patients.`}
            {' '}That&apos;s when any shortage hurts most.
          </Typography>
        </Box>
      )}
    </Box>
  )
}

// ── End-of-line label pill ─────────────────────────────────────────────────────
// Placed above the last point, this got sliced by the line itself on a steep
// drop (the point sits low, so "above" lands mid-chart, right where the
// descending line still is) and read as floating, disconnected from the dot
// it's meant to label. Docking it to the right of the dot instead — vertically
// centered on it, connected by a short leader — is slope-independent: it
// reads the same whether the last value is high, low, rising, or falling.
// Needs real right-margin room on the chart (see callers) since it now grows
// rightward off the plot area instead of sitting inside it.
function EndLabelPill({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const width  = text.length * 6.6 + 18
  const height = 22
  const gap    = 10
  const left   = x + gap
  const top    = y - height / 2
  return (
    <g>
      <line x1={x} y1={y} x2={left} y2={y} stroke={color} strokeWidth={1.5} />
      <rect x={left} y={top} width={width} height={height} rx={height / 2} fill="#fff" stroke={color} strokeWidth={1.5} />
      <text x={left + width / 2} y={top + height / 2 + 4} textAnchor="middle" fill={color} fontSize={12} fontWeight="bold">
        {text}
      </text>
    </g>
  )
}

// ── Week label helper ──────────────────────────────────────────────────────────

function weekStartLabel(year: number, weekNum: number): string {
  // Approximate Monday of ISO week: find first Monday of year, then add weeks
  const jan1       = new Date(year, 0, 1)
  const jan1Day    = jan1.getDay() // 0=Sun
  const toMonday   = jan1Day === 0 ? 1 : jan1Day === 1 ? 0 : 8 - jan1Day
  const firstMon   = new Date(year, 0, 1 + toMonday)
  const weekStart  = new Date(firstMon.getTime() + (weekNum - 1) * 7 * 86400000)
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Weekly trend chart ─────────────────────────────────────────────────────────

function WeeklyTrendChart({ rows }: { rows: IHWeeklyRow[] }) {
  if (rows.length < 2) return null

  const chartData = rows.map((r) => ({
    label: weekStartLabel(r.year, r.weekNum),
    pct:   Math.round(r.pct),
  }))

  const first    = chartData[0].pct
  const lastItem = chartData[chartData.length - 1]
  const last     = lastItem.pct
  const delta    = last - first
  const trending = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'

  const trendText =
    trending === 'up'
      ? `Creeping up, but still ${last < 60 ? 'well below' : last > 80 ? 'above' : 'within'} the healthy zone. Over ${rows.length} weeks it moved from ${first}% to ${last}%.`
      : trending === 'down'
        ? `Easing down. Over ${rows.length} weeks it moved from ${first}% to ${last}%.`
        : `Holding steady around ${last}% over ${rows.length} weeks.`

  return (
    <Box sx={{ '& svg': { overflow: 'visible' } }}>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData} margin={{ top: 20, right: 100, left: -8, bottom: 0 }}>
          <ReferenceArea y1={60} y2={80} fill="#ccfbf1" fillOpacity={0.5} label={{ value: 'Healthy zone: 60–80%', position: 'insideTopLeft', fontSize: 9.5, fill: '#0d9488', dy: 4, dx: 4 }} />
          <ReferenceLine y={60} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <ReferenceLine y={80} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [`${v}%`, 'Utilization']}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke={TEAL}
            strokeWidth={2}
            dot={{ fill: TEAL, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            label={(props: unknown) => {
              const p = props as { x: number; y: number; value: number; index: number }
              if (p.index !== chartData.length - 1) return <g key={p.index} />
              return <EndLabelPill key={p.index} x={p.x} y={p.y} text={`${p.value}% this week`} color={TEAL} />
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography sx={{ fontSize: 13, mt: 0.5, lineHeight: 1.6 }}>
        <Box component="span" sx={{ fontWeight: 700 }}>{last}% this week.</Box>{' '}
        {trendText}
      </Typography>
    </Box>
  )
}

// ── Daily line chart (GF clients, <4 weeks of data) ───────────────────────────

function DailyLineChart({
  rows,
  total,
  dayOffset,
  onSetDayOffset,
}: {
  rows:           IHDailyPeakRow[]
  total:          number
  dayOffset:      number
  onSetDayOffset: (offset: number) => void
}) {
  if (rows.length === 0 || total === 0) return null

  const today   = new Date()
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  const chartData = rows.map((r) => {
    const rowDate = new Date(r.year, r.month - 1, r.day)
    const offset  = Math.round((todayMs - rowDate.getTime()) / 86400000)
    const label   = offset === 0
      ? 'Today'
      : rowDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).replace(',', '')
    return { label, pct: Math.round((r.peakCount / total) * 100), offset }
  })

  const lastItem = chartData[chartData.length - 1]
  const last     = lastItem?.pct ?? 0
  const first    = chartData[0]?.pct ?? 0
  const delta    = last - first
  const trending = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'
  const lastLabel = lastItem?.label === 'Today' ? 'today' : `on ${lastItem?.label ?? ''}`

  const trendText =
    trending === 'up'
      ? `Creeping up — moved from ${first}% to ${last}% over ${rows.length} days.`
      : trending === 'down'
        ? `Easing down — moved from ${first}% to ${last}% over ${rows.length} days.`
        : `Holding steady around ${last}% over ${rows.length} days.`

  return (
    <Box sx={{ '& svg': { overflow: 'visible' } }}>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData} margin={{ top: 20, right: 100, left: -8, bottom: 0 }}>
          <ReferenceArea y1={60} y2={80} fill="#ccfbf1" fillOpacity={0.5} label={{ value: 'Healthy zone: 60–80%', position: 'insideTopLeft', fontSize: 9.5, fill: '#0d9488', dy: 4, dx: 4 }} />
          <ReferenceLine y={60} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <ReferenceLine y={80} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [`${v}%`, 'Peak utilization']}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke={TEAL}
            strokeWidth={2}
            dot={(props: unknown) => {
              const p = props as { cx: number; cy: number; index: number; payload: { offset: number } }
              const isSelected = p.payload.offset === dayOffset
              return (
                <circle
                  key={p.index}
                  cx={p.cx}
                  cy={p.cy}
                  r={isSelected ? 5 : 3}
                  fill={TEAL}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSetDayOffset(p.payload.offset)}
                />
              )
            }}
            activeDot={false}
            label={(props: unknown) => {
              const p = props as { x: number; y: number; value: number; index: number }
              if (p.index !== chartData.length - 1) return <g key={p.index} />
              const text = `${p.value}% ${lastItem?.label === 'Today' ? 'today' : 'yesterday'}`
              return <EndLabelPill key={p.index} x={p.x} y={p.y} text={text} color={TEAL} />
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <Typography sx={{ fontSize: 13, mt: 0.5, lineHeight: 1.6 }}>
        <Box component="span" sx={{ fontWeight: 700 }}>{last}% {lastLabel}.</Box>{' '}
        {trendText}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
        Click a dot to see that day&apos;s hourly breakdown above.
      </Typography>
    </Box>
  )
}

// ── "What you can do about it" action cards ───────────────────────────────────

function ActionCard({
  timeframe,
  title,
  description,
  chip,
  ctaLabel,
  ctaSecondary,
  ctaPrimary,
  onCta,
}: {
  timeframe:    string
  title:        string
  description:  React.ReactNode
  chip:         string
  ctaLabel:     string
  ctaSecondary?: string
  ctaPrimary?:  boolean
  onCta?:       () => void
}) {
  return (
    <Box
      sx={{
        display: 'flex', flexDirection: 'column', gap: 1.75,
        border: '1px solid', borderColor: 'divider',
        borderRadius: 3, p: 2.5, bgcolor: 'background.paper',
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'text.disabled', textTransform: 'uppercase' }}>
        {timeframe}
      </Typography>

      <Typography sx={{ fontSize: 18, fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
        {title}
      </Typography>

      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.7, flex: 1 }}>
        {description}
      </Typography>

      {/* Outcome pill */}
      <Box sx={{ display: 'inline-flex', alignSelf: 'flex-start', px: 1.5, py: 0.5, borderRadius: 6, bgcolor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{chip}</Typography>
      </Box>

      {/* CTA button */}
      <Box
        onClick={onCta}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
          py: 1.25, borderRadius: 1.5,
          bgcolor: TEAL, color: '#fff',
          cursor: 'pointer',
          '&:hover': { bgcolor: '#0b8276' },
          transition: 'background-color 0.15s',
          userSelect: 'none',
        }}
      >
        {ctaPrimary && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{ctaLabel}</Typography>
      </Box>

      {ctaSecondary && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', cursor: 'pointer', '&:hover': { color: TEAL } }}>
          {ctaSecondary}
        </Typography>
      )}
    </Box>
  )
}

function WhatCanYouDoAboutIt({
  data,
  peakData,
  spareBuffer,
  unitValue,
  assetLabel,
  days,
}: {
  data:        IHUtilizationData
  peakData:    IHPeakData | null
  spareBuffer?: number
  unitValue?:  number
  assetLabel:  string
  days:        number
}) {
  const label      = assetLabel.toLowerCase()
  const offRadar   = data.hardToFind
  const peakCount  = peakData?.count ?? data.withPatient
  const buffer     = spareBuffer ?? Math.round(peakCount * 1.2)
  const retire     = Math.max(0, data.total - buffer)
  const freeValue  = retire > 0 && unitValue ? retire * unitValue : 0
  const monthlySave = offRadar > 0 && unitValue ? Math.round(offRadar * unitValue * 0.025) : 0

  return (
    <Box sx={{ mt: 5, mb: 2 }}>
      <Typography sx={{ fontSize: 26, fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
        What you can do about it.
      </Typography>
      <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3.5, lineHeight: 1.6, maxWidth: 620 }}>
        Three moves this data supports — the button is the next step, and TrueSpot can talk any of them through.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
        {/* Card 1 — THIS WEEK */}
        <ActionCard
          timeframe="This week"
          title={offRadar > 0 ? `Recover ${offRadar} off-radar ${label}s` : `Locate your off-radar ${label}s`}
          description={
            offRadar > 0 ? (
              <>
                {offRadar} {label}s haven&apos;t been reliably tracked in {days}+ days.{' '}
                <Box component="span" sx={{ color: TEAL, fontWeight: 500 }}>
                  Find them before assuming you need more — they may be in a storeroom, closet, or a sister unit.
                </Box>
              </>
            ) : (
              <>
                All {label}s are being tracked reliably.{' '}
                <Box component="span" sx={{ color: TEAL, fontWeight: 500 }}>
                  Keep that up — every gap in coverage means a {label.slice(0, -1)} that could quietly go missing.
                </Box>
              </>
            )
          }
          chip={monthlySave > 0 ? `Saves ≈ ${fmtMoney(monthlySave)} / month` : `${offRadar} devices to locate`}
          ctaLabel="Get the list →"
          ctaSecondary="or talk it through with TrueSpot"
        />

        {/* Card 2 — THIS MONTH */}
        <ActionCard
          timeframe="This month"
          title={`Rebalance floors before buying`}
          description={
            <>
              Some floors hold more idle {label}s than they use, while others run short every morning.{' '}
              <Box component="span" sx={{ color: TEAL, fontWeight: 500 }}>
                Move {label}s between floors before anyone orders new ones.
              </Box>
            </>
          }
          chip="Ends the morning scramble"
          ctaLabel="See the floor detail →"
          ctaSecondary="or talk it through with TrueSpot"
        />

        {/* Card 3 — THIS QUARTER */}
        <ActionCard
          timeframe="This quarter"
          title={`Pause new ${label} purchases`}
          description={
            retire > 0 ? (
              <>
                The busiest moment in {days} days needed {peakCount} {label}s. With a spare cushion, {buffer} covers you.{' '}
                <Box component="span" sx={{ color: '#f97316', fontWeight: 500 }}>
                  The other {retire} can retire as they age out — not be replaced.
                </Box>
              </>
            ) : (
              <>
                Peak demand over {days} days reached {peakCount} {label}s — close to your total fleet of {data.total}.{' '}
                <Box component="span" sx={{ color: '#f97316', fontWeight: 500 }}>
                  Hold off on new purchases until you&apos;ve recovered the off-radar ones first.
                </Box>
              </>
            )
          }
          chip={freeValue > 0 ? `Frees ≈ ${fmtMoney(freeValue)}` : `Fleet right-sizing opportunity`}
          ctaLabel="Talk it through with TrueSpot"
          ctaPrimary
        />
      </Box>
    </Box>
  )
}

// ── Component props ────────────────────────────────────────────────────────────

interface HowMuchGetsUsedProps {
  clientId:              string
  dashboardKey:          string
  product:               string
  data:                  IHUtilizationData | null
  peakData:              IHPeakData | null
  spareBuffer?:          number
  unitValue?:            number
  isGeofenceBased:       boolean
  dayOffset:             number
  onSetDayOffset:        (offset: number) => void
  dailyPeakRows:         IHDailyPeakRow[]
  assetType:             string | undefined
  days?:                 number
  displayName:           string
  loading:               boolean
  assetTypeUtilization:  IHAssetTypeRow[]
  hourlyRows:            IHHourlyRow[]
  weeklyTrend:           IHWeeklyRow[]
  locationCategories:    IHLocationCategoryRow[]
  categoryAssets:        IHCategoryAssetRow[]
  selectedCategory:      string | null
  categoryLoading:       boolean
  selectedAsset:         string | null
  assetTrailRows:        import('@/hooks/useInsightHubData').IHAssetTrailRow[]
  assetTrailLoading:     boolean
  categoryDailyRows:     IHCategoryDailyRow[]
  categoryDailyLoading:  boolean
  selectedDay:           number | null
  onSelectAssetType:     (t: string | undefined) => void
  onSelectCategory:      (cat: string | null) => void
  onSelectDay:           (dateKey: number | null) => void
  onSelectAsset:         (vin: string | null) => void
}

export default function HowMuchGetsUsed({
  clientId,
  dashboardKey,
  product,
  data,
  peakData,
  spareBuffer,
  unitValue,
  isGeofenceBased,
  dayOffset,
  onSetDayOffset,
  dailyPeakRows,
  assetType,
  days = 7,
  displayName,
  loading,
  assetTypeUtilization,
  hourlyRows,
  weeklyTrend,
  locationCategories,
  categoryAssets,
  selectedCategory,
  categoryLoading,
  selectedAsset,
  assetTrailRows,
  assetTrailLoading,
  categoryDailyRows,
  categoryDailyLoading,
  selectedDay,
  onSelectAssetType,
  onSelectCategory,
  onSelectDay,
  onSelectAsset,
}: HowMuchGetsUsedProps) {
  if (loading || !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Skeleton variant="rectangular" height={24} width={220} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={44} width="60%" sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={18} width="45%" sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 3 }} />
      </Box>
    )
  }

  const { total, withPatient, cleaning, hardToFind, sittingUnused, exit } = data
  // For GF clients (Halifax), hoursBasedPct reflects average session-hours in patient zones per day.
  // Count-based (withPatient/total) is used only when no hours data is available (BSA fallback).
  const utilizationPct = data.hoursBasedPct ?? (total > 0 ? (withPatient / total) * 100 : 0)
  const assetLabel     = assetType ?? 'equipment'
  // nPatient is derived from utilizationPct so the icon grid and the % stat are always consistent
  const nPatient       = Math.round(utilizationPct / 10)
  const narrativeJSX   = getNarrativeJSX(utilizationPct, assetLabel, nPatient, TEAL)

  // Compute actual date range label — abbreviated months to prevent wrapping
  const dateRangeLabel = (() => {
    const to   = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const fmt  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(from)} – ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  })()

  // Flip stat cards — peak / freeable / idle values
  const peak           = peakData?.count ?? withPatient
  const idleAtPeak     = Math.max(0, total - peak)
  const peakPct        = total > 0 ? Math.round((peak / total) * 100) : 0
  const uv             = unitValue ?? 0
  const buf            = spareBuffer ?? 0
  // "What that's worth": idle at peak (645) + spare buffer (50) × unit value
  // Represents the full cost of non-active inventory including the safety cushion
  const costlySitting    = idleAtPeak + buf
  const costlySittingPct = total > 0 ? Math.round((costlySitting / total) * 100) : 0
  const showCard3        = uv > 0 && peak > 0

  // Compute 2-letter initials from first two words of displayName
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <Box>

        {/* Client identity row */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width:          48,
                height:         48,
                borderRadius:   '50%',
                bgcolor:        '#0c1a27',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
              }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
                {initials}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}>
                {displayName}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3, mt: 0.25 }}>
                Your Location Insights · powered by{' '}
                <Box component="span" sx={{ color: TEAL, fontWeight: 600 }}>TrueSpot</Box>
              </Typography>
            </Box>
          </Box>

          <UntaggedAssetButton assetLabel={assetLabel} />
        </Box>

        {/* Eyebrow — teal dot + label */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TEAL, flexShrink: 0 }} />
          <Typography
            sx={{
              fontSize:      11,
              fontWeight:    700,
              letterSpacing: '0.1em',
              color:         TEAL,
              textTransform: 'uppercase',
            }}
          >
            Equipment Usage Report
          </Typography>
        </Box>

        {/* H1 + asset chip inline */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <Typography
            component="h1"
            sx={{
              fontSize:      { xs: 32, sm: 42 },
              fontWeight:    800,
              lineHeight:    1.05,
              color:         'text.primary',
              letterSpacing: '-0.02em',
            }}
          >
            How much gets used?
          </Typography>

          {assetType && (
            <Box
              sx={{
                display:       'inline-flex',
                alignItems:    'center',
                gap:           0.6,
                px:            1.5,
                py:            0.65,
                borderRadius:  6,
                bgcolor:       TEAL,
                color:         '#fff',
                fontSize:      13,
                fontWeight:    600,
                letterSpacing: '0.01em',
                flexShrink:    0,
                mt:            0.5,
              }}
            >
              <DeviceIcon size={14} />
              {assetType}
            </Box>
          )}
        </Box>

        {/* Description */}
        <Typography
          sx={{
            fontSize:   14,
            color:      'text.secondary',
            lineHeight: 1.7,
            maxWidth:   600,
          }}
        >
          This page answers one question: out of all the{' '}
          {assetType ? assetType.toLowerCase() : 'equipment'} you own, how many are
          actually working with patients — and how many are just sitting somewhere?
        </Typography>
      </Box>

      {/* ── Icon grid + stat card ─────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 3, sm: 4 },
          boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {/* Card heading — TEAL, full width, above both columns */}
        <Typography
          sx={{
            fontSize:      10.5,
            fontWeight:    700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color:         TEAL,
            lineHeight:    1.4,
            mb:            2.5,
          }}
        >
          For every 10 {assetType ? assetType.toUpperCase() : 'EQUIPMENT'} you own, on an average day…
        </Typography>

        {/* Two-column layout: stat+narrative LEFT | pin rows RIGHT */}
        <Box sx={{ display: 'flex', gap: 5, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* LEFT — stat + narrative + date */}
          <Box sx={{ flex: '0 0 auto', minWidth: 300, maxWidth: 360 }}>

            {/* "41% in use" — "% in use" lifted to sit at 40% height of the big number */}
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', mb: 2 }}>
              <Typography
                sx={{
                  fontSize:      { xs: 64, sm: 82 },
                  fontWeight:    900,
                  color:         TEAL,
                  lineHeight:    0.88,
                  letterSpacing: '-0.04em',
                }}
              >
                {utilizationPct.toFixed(0)}
              </Typography>
              {/* pb lifts "% in use" off the baseline — sits at ~40% height of the number */}
              <Typography
                sx={{
                  fontSize:      { xs: 15, sm: 18 },
                  fontWeight:    500,
                  color:         TEAL,
                  letterSpacing: '-0.01em',
                  lineHeight:    1,
                  opacity:       0.85,
                  pb:            '14px',
                }}
              >
                % in use
              </Typography>
            </Box>

            {/* Narrative */}
            <Typography sx={{ fontSize: 14, color: 'text.primary', lineHeight: 1.75, mb: 2 }}>
              {narrativeJSX}
            </Typography>

            {/* Date — below narrative */}
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', lineHeight: 1.5 }}>
              Based on {total.toLocaleString()} tagged {assetLabel.toLowerCase()} · {dateRangeLabel}
            </Typography>
          </Box>

          {/* RIGHT — pin icon rows + HOW TO READ */}
          <Box sx={{ flex: '1 1 auto', minWidth: 300 }}>
            <PerTenIconGrid
              total={total}
              withPatient={withPatient}
              cleaning={cleaning}
              sittingUnused={sittingUnused}
              hardToFind={hardToFind}
              exit={exit}
            />

            {/* HOW TO READ — sits naturally below pin rows, no date conflict */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mt: 2.5 }}>
              <Typography
                sx={{
                  fontSize:      9,
                  fontWeight:    800,
                  letterSpacing: '0.1em',
                  color:         TEAL,
                  textTransform: 'uppercase',
                  flexShrink:    0,
                  mt:            '2px',
                }}
              >
                How to read
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.disabled', lineHeight: 1.55 }}>
                Each bar&apos;s length is that group&apos;s share of the fleet; every pin is one {assetType ? assetType.toLowerCase().replace(/s$/, '') : 'device'} in ten.
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* CTA link — bottom of card */}
        <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid #f1f5f9' }}>
          <Typography
            component="span"
            onClick={() => {}}
            sx={{
              fontSize:   13.5,
              fontWeight: 600,
              color:      TEAL,
              cursor:     'pointer',
              display:    'inline-flex',
              alignItems: 'center',
              gap:        0.5,
              '&:hover':  { textDecoration: 'underline' },
            }}
          >
            See where your {assetLabel.toLowerCase()} actually walk
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Typography>
        </Box>
      </Box>

      {/* ── Flip stat cards ──────────────────────────────────────────────────── */}
      {(() => {
        const card1Faces: StatFace[] = [
          {
            metric: peak.toLocaleString(),
            suffix: assetLabel.toLowerCase(),
            why:    `The highest number of ${assetLabel.toLowerCase()} seen simultaneously in patient zones during the selected period. We scan each hour-long window and take the peak.`,
          },
          {
            metric: `${peakPct}%`,
            suffix: 'of fleet',
            why:    `Peak concurrent (${peak.toLocaleString()}) ÷ total fleet (${total.toLocaleString()}) = ${peakPct}% — the share of your fleet actively needed at the single busiest moment.`,
          },
          {
            metric: uv > 0 ? fmtMoney(peak * uv) : `${idleAtPeak.toLocaleString()}`,
            suffix: uv > 0 ? 'busy at once' : 'idle at peak',
            why:    uv > 0
              ? `Peak count (${peak.toLocaleString()}) × unit cost ($${uv.toLocaleString()}) = ${fmtMoney(peak * uv)} in active equipment value at the busiest moment.`
              : `Total fleet (${total.toLocaleString()}) minus peak concurrent (${peak.toLocaleString()}) = ${idleAtPeak.toLocaleString()} assets not needed even at your busiest.`,
          },
        ]

        const card2Faces: StatFace[] = [
          {
            metric: total.toLocaleString(),
            suffix: 'owned',
            why:    `Every ${assetLabel.toLowerCase()} registered to your facility with a TrueSpot tag — including ones that haven't been seen recently. Those show up separately as "Hard to Find," not dropped from the count.`,
          },
          {
            metric: uv > 0 ? fmtMoney(total * uv) : `${idleAtPeak.toLocaleString()}`,
            suffix: uv > 0 ? 'fleet value' : 'idle at peak',
            why:    uv > 0
              ? `Total fleet (${total.toLocaleString()}) × unit cost ($${uv.toLocaleString()}) = ${fmtMoney(total * uv)} estimated fleet value.`
              : `${idleAtPeak.toLocaleString()} ${assetLabel.toLowerCase()} were not with patients even at the peak demand moment.`,
          },
          {
            metric: idleAtPeak.toLocaleString(),
            suffix: 'idle at peak',
            why:    `Even at the busiest moment, ${idleAtPeak.toLocaleString()} ${assetLabel.toLowerCase()} were not with patients — a direct measure of surplus capacity.`,
          },
        ]

        const card3Why = (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box>
              <Box component="span" sx={{ fontWeight: 700, display: 'block' }}>What this measures</Box>
              The cost of {assetLabel.toLowerCase()} sitting unused — every unit idle at your busiest moment plus the spare cushion you keep on hand.
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 700, display: 'block' }}>How it&apos;s calculated</Box>
              Idle at peak ({idleAtPeak.toLocaleString()}) + spare cushion ({buf}) = {costlySitting.toLocaleString()} units × ${uv.toLocaleString()} each = {fmtMoney(costlySitting * uv)}.
            </Box>
            <Box>
              <Box component="span" sx={{ fontWeight: 700, display: 'block' }}>Benchmark</Box>
              A real 380-bed hospital cut a 1,200-pump purchase to 780 with exactly this math — over $1M saved.
            </Box>
          </Box>
        )

        const card3Faces: StatFace[] = showCard3 ? [
          {
            metric: fmtMoney(costlySitting * uv),
            suffix: 'sitting idle',
            why:    card3Why,
          },
          {
            metric: costlySitting.toLocaleString(),
            suffix: `${assetLabel.toLowerCase().replace(/s$/, '')}s not active`,
            why:    card3Why,
          },
          {
            metric: `${costlySittingPct}%`,
            suffix: 'of the fleet',
            why:    card3Why,
          },
        ] : []

        return (
          <FlipStatCards
            card1={{
              label:       peakData ? 'Your busiest moment' : 'Patient area',
              faces:       card1Faces,
              description: peakData
                ? `The most ${assetLabel.toLowerCase()} ever needed at the same time in ${days} days (${formatPeakDateTime(peakData)}).`
                : `Actively in patient care on a typical day, out of ${total.toLocaleString()} total.`,
            }}
            card2={{
              label: 'What you own',
              faces: card2Faces,
              description: peakData ? (
                <>
                  Even at that busiest moment,{' '}
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {idleAtPeak.toLocaleString()}
                  </Box>
                  {' '}were still sitting somewhere unused.
                </>
              ) : (
                `You have ${total.toLocaleString()} tagged ${assetLabel.toLowerCase()} across your facility.`
              ),
            }}
            card3={showCard3 ? {
              label:       'What that\'s worth',
              faces:       card3Faces,
              description: `${idleAtPeak.toLocaleString()} idle at peak + ${buf} spare cushion = ${costlySitting.toLocaleString()} ${assetLabel.toLowerCase()} × $${uv.toLocaleString()} = ${fmtMoney(costlySitting * uv)} sitting unused.`,
            } : null}
          />
        )
      })()}

      {/* ── Usage by equipment type + right panels ────────────────────────────── */}
      {assetTypeUtilization.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* LEFT — Equipment type selector */}
          <Box
            sx={{
              flex:         '1 1 380px',
              bgcolor:      'background.paper',
              borderRadius: 3,
              p:            3,
              boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.4 }}>
              Usage by equipment type — click to switch
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, mb: 2.5 }}>
              This chart is also the report&apos;s steering wheel: pick a row and the whole page follows.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {assetTypeUtilization.map((row, idx) => (
                <EquipmentRow
                  key={row.assetType}
                  row={row}
                  isSelected={assetType === row.assetType}
                  showGoalLabel={idx === 0}
                  onClick={() =>
                    onSelectAssetType(assetType === row.assetType ? undefined : row.assetType)
                  }
                />
              ))}
            </Box>
          </Box>

          {/* RIGHT — Contextual panels */}
          <Box
            sx={{
              flex:          '1 1 300px',
              display:       'flex',
              flexDirection: 'column',
              gap:           2,
            }}
          >
            {/* A typical day, hour by hour */}
            <Box
              sx={{
                bgcolor:      'background.paper',
                borderRadius: 3,
                p:            3,
                boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>
                A typical day, hour by hour
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, mb: 2 }}>
                {isGeofenceBased
                  ? `Share of ${(assetType ?? 'Pumps').toLowerCase()} with patients at each hour — hover a bar for its value`
                  : `${assetType ?? 'Equipment'} with patients at each hour of the day`}
              </Typography>

              {loading ? (
                <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
              ) : hourlyRows.length > 0 ? (
                <HourByHourChart rows={hourlyRows} assetLabel={assetType ?? 'equipment'} total={total} />
              ) : (
                <Box
                  sx={{
                    height:         100,
                    bgcolor:        '#f8fafc',
                    borderRadius:   2,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    border:         '1.5px dashed #cbd5e1',
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', px: 2 }}>
                    Hour-of-day chart requires a session-level datetime column. Coming in a future update.
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Is it getting better? */}
            <Box
              sx={{
                bgcolor:      'background.paper',
                borderRadius: 3,
                p:            3,
                boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary' }}>
                Is it getting better?
              </Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.65, mt: 0.5, mb: 2 }}>
                {weeklyTrend.length >= 4
                  ? `Weekly share of ${assetLabel.toLowerCase()} in use, last ${weeklyTrend.length} weeks`
                  : `Daily peak utilization, last 7 days`}
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={150} sx={{ borderRadius: 2 }} />
              ) : weeklyTrend.length >= 4 ? (
                <WeeklyTrendChart rows={weeklyTrend} />
              ) : dailyPeakRows.length > 0 ? (
                <DailyLineChart
                  rows={
                    EXCLUDE_TODAY_FROM_DAILY_PEAK_TREND
                      ? dailyPeakRows.filter((r) => !isToday(r.day, r.month, r.year))
                      : dailyPeakRows
                  }
                  total={data.total}
                  dayOffset={dayOffset}
                  onSetDayOffset={onSetDayOffset}
                />
              ) : (
                <Box
                  sx={{
                    height:         80,
                    bgcolor:        '#f8fafc',
                    borderRadius:   2,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    border:         '1.5px dashed #cbd5e1',
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: 'text.disabled', textAlign: 'center', px: 2 }}>
                    Not enough data yet — check back in a few days.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Where do they spend their time? ───────────────────────────────── */}
      <WhereDoTheySpend
        clientId={clientId}
        dashboardKey={dashboardKey}
        product={product}
        locationCategories={locationCategories}
        categoryAssets={categoryAssets}
        selectedCategory={selectedCategory}
        categoryLoading={categoryLoading}
        loading={loading}
        assetType={assetType}
        days={days}
        onSelectCategory={onSelectCategory}
        categoryDailyRows={categoryDailyRows}
        categoryDailyLoading={categoryDailyLoading}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        selectedAsset={selectedAsset}
        assetTrailRows={assetTrailRows}
        assetTrailLoading={assetTrailLoading}
        onSelectAsset={onSelectAsset}
        peakData={peakData}
      />

      {/* ── What you can do about it ──────────────────────────────────────── */}
      {!loading && data && (
        <WhatCanYouDoAboutIt
          data={data}
          peakData={peakData}
          spareBuffer={spareBuffer}
          unitValue={unitValue}
          assetLabel={assetLabel}
          days={days}
        />
      )}

      {/* ── Before it walks out the door — APA upsell banner ─────────────── */}
      {!loading && data && (() => {
        const atRisk     = data.hardToFind + Math.round(data.total * 0.04)
        const exposed    = unitValue ? fmtMoney(Math.round(atRisk * unitValue)) : null
        const assetPlural = assetLabel.toLowerCase().endsWith('s') ? assetLabel.toLowerCase() : `${assetLabel.toLowerCase()}s`
        return (
          <Box
            sx={{
              mt: 4, borderRadius: 3, overflow: 'hidden',
              bgcolor: '#0d1117',
              display: 'flex', alignItems: 'stretch', flexWrap: 'wrap',
            }}
          >
            {/* Device image */}
            <Box
              sx={{
                flex: '0 0 180px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                p: 2.5,
                bgcolor: '#161b22',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/apa-device.png"
                alt="TrueSpot Asset Proximity Alarm"
                style={{ width: 148, height: 148, objectFit: 'contain', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))' }}
                onError={(e) => {
                  // Fallback SVG if image not found
                  const t = e.currentTarget
                  t.style.display = 'none'
                  const svg = t.parentElement?.querySelector('svg')
                  if (svg) (svg as unknown as HTMLElement).style.display = 'block'
                }}
              />
              {/* Fallback icon — hidden when image loads */}
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ display: 'none' }}>
                <rect x="10" y="10" width="60" height="60" rx="10" fill="#1f2937" stroke="#374151" strokeWidth="2"/>
                <circle cx="28" cy="26" r="5" fill="#ef4444"/>
                <circle cx="52" cy="26" r="5" fill="#ef4444"/>
                <circle cx="40" cy="48" r="10" fill="#dc2626"/>
                <circle cx="40" cy="48" r="5" fill="#fca5a5"/>
                <rect x="14" y="58" width="12" height="4" rx="2" fill="#4b5563"/>
                <text x="28" y="66" fontSize="6" fill="#6b7280" fontFamily="system-ui">ASSET</text>
                <text x="22" y="72" fontSize="6" fill="#6b7280" fontFamily="system-ui">PROXIMITY ALARM</text>
              </svg>
            </Box>

            {/* Copy — takes remaining width */}
            <Box sx={{ flex: '1 1 320px', p: { xs: 3, sm: 4 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: TEAL, textTransform: 'uppercase', mb: 1.25 }}>
                Before it walks out the door
              </Typography>
              <Typography sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 800, color: '#f9fafb', lineHeight: 1.2, mb: 2 }}>
                An alarm on the exit — not a line on next year&apos;s loss report
              </Typography>
              <Typography sx={{ fontSize: 13.5, color: '#9ca3af', lineHeight: 1.7 }}>
                Right now about{' '}
                <Box component="span" sx={{ fontWeight: 700, color: '#f1f5f9' }}>{atRisk} {assetPlural}</Box>
                {exposed && <>{' '}— roughly <Box component="span" sx={{ fontWeight: 700, color: '#f1f5f9' }}>{exposed}</Box> at today&apos;s replacement prices</>}
                {' '}— spend their time at exits, on loan to sister sites, or off the radar. A{' '}
                <Box component="span" sx={{ fontWeight: 700, color: '#f1f5f9' }}>TrueSpot Asset Proximity Alarm (APA)</Box>
                {' '}sits at each exit and loading dock: when a tagged device gets too close, it flashes and sounds a siren right there — so someone grabs it before it&apos;s gone, and every attempt is logged.
              </Typography>
            </Box>

            {/* Right CTAs — stacked vertically, aligned to right */}
            <Box
              sx={{
                flex: '0 0 200px', p: 3,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'stretch', gap: 1.5,
              }}
            >
              {exposed && (
                <Box
                  sx={{
                    px: 2.5, py: 1.25, borderRadius: 3,
                    bgcolor: '#991b1b',
                    textAlign: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>
                    {exposed} exposed<br />today
                  </Typography>
                </Box>
              )}
              <Box
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                  px: 2, py: 1.4, borderRadius: 2,
                  bgcolor: TEAL, cursor: 'pointer',
                  '&:hover': { bgcolor: '#0b8276' },
                  transition: 'background-color 0.15s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Talk it through with TrueSpot</Typography>
              </Box>
            </Box>
          </Box>
        )
      })()}

      {/* ── MedSpot 360 banner ────────────────────────────────────────────── */}
      {!loading && data && (
        <Box
          sx={{
            mt: 3, borderRadius: 3,
            bgcolor: '#ecfdf5', border: '1.5px solid #6ee7b7',
            display: 'flex', alignItems: 'center', gap: 3, px: 3.5, py: 3, flexWrap: 'wrap',
          }}
        >
          {/* Logo — MEDSPOT near-black, 360 bold teal */}
          <Box sx={{ flex: '0 0 auto' }}>
            <Typography
              sx={{
                fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em',
                fontFamily: 'system-ui, sans-serif', lineHeight: 1, userSelect: 'none',
              }}
            >
              <Box component="span" sx={{ color: '#042f1a' }}>MEDSPOT</Box>
              <Box component="span" sx={{ color: TEAL }}>360</Box>
            </Typography>
          </Box>

          {/* Copy */}
          <Typography sx={{ fontSize: 14.5, color: '#1e293b', lineHeight: 1.65, flex: '1 1 280px' }}>
            Know what to move?{' '}
            <Box component="span" sx={{ fontWeight: 700, color: TEAL }}>MedSpot 360</Box>
            {' '}shows you exactly where every idle and rented {assetLabel.toLowerCase()} is sitting right now —{' '}
            <Box component="span" sx={{ fontWeight: 700, color: '#0f172a' }}>round them up in minutes, not shifts.</Box>
          </Typography>

          {/* CTA */}
          <Box
            sx={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 2.5, py: 1.3, borderRadius: 6,
              bgcolor: TEAL, cursor: 'pointer',
              '&:hover': { bgcolor: '#0b8276' },
              transition: 'background-color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Find these in MedSpot 360 →</Typography>
          </Box>
        </Box>
      )}

      {/* ── Glossary + methodology footer ────────────────────────────────── */}
      {!loading && data && (
        <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {/* Glossary */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                The grown-up words for what you just learned
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>
              If someone from finance or a consultant uses these terms — you already understand them.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {[
                {
                  term: '"Utilization rate"',
                  def: `The fancy name for the big number at the top: the share of time equipment spends actually working.`,
                },
                {
                  term: '"Peak demand"',
                  def: `Your busiest moment — the most equipment ever needed at once. Cover that moment (plus spares) and you can cover anything.`,
                },
                {
                  term: '"Fleet right-sizing"',
                  def: `Matching what you own to what your peak really needs — no more, no less. It's how this page turns into real savings.`,
                },
              ].map(({ term, def }) => (
                <Box key={term}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: TEAL, mb: 0.75 }}>{term}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.65 }}>{def}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Methodology */}
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>About these numbers</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, color: '#64748b', lineHeight: 1.75 }}>
              This data comes directly from{' '}
              <Box component="span" sx={{ fontWeight: 700, color: TEAL }}>{data.total.toLocaleString()} tagged {assetLabel.toLowerCase()}s</Box>
              {' '}tracked in real time by TrueSpot. Utilization figures reflect session time in each zone type over the selected period. Dollar figures use the unit value you configured — they are directional, not accounting.{' '}
              <Box component="span" sx={{ fontWeight: 700, color: TEAL }}>Your live data replaces every one of these with your own measured numbers.</Box>
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Page footer line ─────────────────────────────────────────────── */}
      {!loading && data && (
        <Box sx={{ mt: 3, mb: 1, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            TrueSpot Location Insights — live data
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            Signals from {data.total.toLocaleString()} tagged assets · updated on each data refresh
          </Typography>
        </Box>
      )}
    </Box>
  )
}
