'use client'

import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip, LabelList, LineChart, Line, ReferenceArea } from 'recharts'
import type { IHFloorStatusRow, IHFloorReadinessByTypeRow } from '@/hooks/useInsightHubData'
import CheckItYourself from './CheckItYourself'
import WhatYouCanDoAboutIt from './WhatYouCanDoAboutIt'
import FlipStatCards from '../shared/FlipStatCards'

const TEAL   = '#0d9488'
const AMBER  = '#d97706'
const RED    = '#dc2626'

// ── Device icon (ECG monitor) ─────────────────────────────────────────────────

function DeviceIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="13" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M5 9.5H7L9 6.5L11.5 12.5L13.5 8L15 9.5H19" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="16" x2="12" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8"  y1="19" x2="16" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── Status metadata ────────────────────────────────────────────────────────────

const STATUS_META = {
  enough: {
    color:    TEAL,
    bg:       '#f0fdfb',
    label:    (n: number) => n === 1 ? 'floor enough on hand' : 'floors enough on hand',
  },
  tight: {
    color:    AMBER,
    bg:       '#fffbeb',
    label:    (n: number) => n === 1 ? 'floor getting tight' : 'floors getting tight',
  },
  short: {
    color:    RED,
    bg:       '#fff1f2',
    label:    (n: number) => n === 1 ? 'floor ran short' : 'floors ran short',
  },
}

// ── Icon column ────────────────────────────────────────────────────────────────

function FloorIconColumn({
  floors,
  status,
}: {
  floors: IHFloorStatusRow[]
  status: 'enough' | 'tight' | 'short'
}) {
  const meta  = STATUS_META[status]
  const count = floors.length
  if (count === 0) return null

  // Cap at 10 icons so the column doesn't overflow; show "+N" if more
  const iconsVisible = Math.min(count, 10)
  const overflow     = count - iconsVisible

  return (
    <Box
      sx={{
        flex:           '1 1 0',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            0.5,
      }}
    >
      {/* Tile with stacked icons */}
      <Box
        sx={{
          bgcolor:        meta.bg,
          borderRadius:   3,
          p:              2,
          width:          '100%',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'flex-end',
          gap:            0.75,
          minHeight:      80,
        }}
      >
        {Array.from({ length: iconsVisible }).map((_, i) => (
          <DeviceIcon key={i} size={20} color={meta.color} />
        ))}
        {overflow > 0 && (
          <Typography sx={{ fontSize: 11, color: meta.color, fontWeight: 700 }}>
            +{overflow} more
          </Typography>
        )}
      </Box>

      {/* Count */}
      <Typography
        sx={{
          fontSize:   28,
          fontWeight: 900,
          color:      meta.color,
          lineHeight: 1.1,
          mt:         0.5,
        }}
      >
        {count}
      </Typography>

      {/* Label */}
      <Typography
        sx={{
          fontSize:   11,
          color:      'text.secondary',
          textAlign:  'center',
          lineHeight: 1.35,
          px:         0.5,
        }}
      >
        {meta.label(count)}
      </Typography>
    </Box>
  )
}

// ── Narrative generator ────────────────────────────────────────────────────────

function buildNarrative(rows: IHFloorStatusRow[], assetLabel: string): string {
  const short = rows.filter((r) => r.status === 'short')

  if (short.length === 0) {
    const tight = rows.filter((r) => r.status === 'tight')
    if (tight.length === 0) {
      return `All ${rows.length} floors met their par level across the last 7 days. The fleet is well distributed.`
    }
    return `No floors ran short over the last 7 days, but ${tight.length} ${tight.length === 1 ? 'is' : 'are'} getting close to the limit — worth watching.`
  }

  const worst    = short.sort((a, b) => b.daysShort - a.daysShort)[0]
  const daysText = `${worst.daysShort} of ${worst.totalDays} day${worst.totalDays !== 1 ? 's' : ''}`

  if (short.length === 1) {
    return `Most floors clear the bar most days. The exception is ${worst.floor}, which came up short on ${daysText} — usually because extra ${assetLabel.toLowerCase()} are parked, unused, one floor away.`
  }

  return `${short.length} floors came up short at least twice in the last 7 days. The worst is ${worst.floor}, short on ${daysText}.`
}

// ── Date range helper ──────────────────────────────────────────────────────────

function last7DaysLabel(): string {
  const end   = new Date()
  const start = new Date(Date.now() - 6 * 86_400_000)
  const fmt   = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// ── Hour labels ───────────────────────────────────────────────────────────────

// Short labels for X-axis ticks
const HOUR_LABELS = [
  '12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
  '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p',
]

// Full labels for insight text — "8 am", "3 pm" etc.
const HOUR_FULL = [
  '12 am','1 am','2 am','3 am','4 am','5 am','6 am','7 am','8 am','9 am','10 am','11 am',
  '12 pm','1 pm','2 pm','3 pm','4 pm','5 pm','6 pm','7 pm','8 pm','9 pm','10 pm','11 pm',
]

// X-axis ticks every 3 hours — "12am", "3am", "6am" etc.
const HOUR_TICK_LABELS = HOUR_FULL.map((l, i) => {
  if (i % 3 !== 0) return ''
  // Compact form: "12am" / "3am" / "12pm" / "3pm"
  return l.replace(' ', '')
})

// ── Hour-binning: sessions → avg distinct assets per hour ─────────────────────

interface HourlySession {
  vin:          string
  sessionStart: string
  sessionEnd:   string
}

function computeHourlyAvg(sessions: HourlySession[]): number[] {
  if (sessions.length === 0) return new Array(24).fill(0)

  const dayMap = new Map<string, { vin: string; startMin: number; endMin: number }[]>()

  for (const s of sessions) {
    const start = new Date(s.sessionStart)
    const end   = new Date(s.sessionEnd)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue

    const dayKey = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}`
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push({
      vin:      s.vin,
      startMin: start.getHours() * 60 + start.getMinutes(),
      endMin:   end.getHours()   * 60 + end.getMinutes(),
    })
  }

  const hourSums = new Array(24).fill(0)
  const dayCount = dayMap.size || 1

  for (const daySessions of dayMap.values()) {
    for (let h = 0; h < 24; h++) {
      const vins = new Set<string>()
      for (const s of daySessions) {
        if (s.startMin < (h + 1) * 60 && s.endMin > h * 60) vins.add(s.vin)
      }
      hourSums[h] += vins.size
    }
  }

  return hourSums.map((sum) => Math.round((sum / dayCount) * 10) / 10)
}

// ── Typical day chart ─────────────────────────────────────────────────────────

function TypicalDayChart({
  floorName,
  par,
  hourlyAvg,
  loading,
  assetType,
}: {
  floorName:  string
  par:        number
  hourlyAvg:  number[]
  loading:    boolean
  assetType?: string
}) {
  const [howToOpen, setHowToOpen] = useState(false)
  const cardSx = {
    bgcolor:       'background.paper',
    borderRadius:  3,
    p:             3,
    boxShadow:     '0 1px 3px rgba(0,0,0,0.06)',
    display:       'flex',
    flexDirection: 'column' as const,
  }

  if (loading) {
    return (
      <Box sx={cardSx}>
        <Skeleton variant="text"        width={220} height={28} sx={{ mb: 1 }} />
        <Skeleton variant="text"        width={180} height={18} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
        <Skeleton variant="text"        width="90%" height={18} sx={{ mt: 1.5 }} />
      </Box>
    )
  }

  if (hourlyAvg.every((v) => v === 0)) {
    return (
      <Box sx={{ ...cardSx, alignItems: 'center', justifyContent: 'center', minHeight: 280 }}>
        <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>No session data for last 7 days.</Typography>
      </Box>
    )
  }

  // Convert raw counts → % of par so bars always fill proportionally
  const hourlyPct = par > 0
    ? hourlyAvg.map((c) => Math.round((c / par) * 100))
    : hourlyAvg.map(() => 0)

  const chartData = hourlyPct.map((pct, h) => ({
    hour:     HOUR_LABELS[h],
    tick:     HOUR_TICK_LABELS[h],
    pct,
    belowPar: pct < 100,
  }))

  const minPct = Math.min(...hourlyPct)
  const tiedIndices = hourlyPct.reduce<number[]>((acc, p, i) => { if (p === minPct) acc.push(i); return acc }, [])
  // Prefer the 8–10 am medication pass window when there's a tie — most clinically relevant
  const lowestIdx  = tiedIndices.find(i => i === 8 || i === 9) ?? tiedIndices[0] ?? 0
  const lowestPct  = minPct
  const tightStart = HOUR_FULL[lowestIdx]
  const tightEnd   = HOUR_FULL[(lowestIdx + 1) % 24]

  return (
    <Box
      sx={{
        bgcolor:       'background.paper',
        borderRadius:  3,
        p:             3,
        boxShadow:     '0 1px 3px rgba(0,0,0,0.06)',
        display:       'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
          A typical day on your tightest floor
        </Typography>
        <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ml: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#64748b', lineHeight: 1 }}>i</Typography>
        </Box>
      </Box>

      {/* Sub-description */}
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2, lineHeight: 1.5 }}>
        Share of par on hand on{' '}
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{floorName}</Box>
        {', '}hour by hour — hover a bar for its value
      </Typography>

      {/* Bar chart — extra right margin so PAR label has room */}
      <Box sx={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="18%" margin={{ top: 10, right: 8, left: -16, bottom: 4 }}>
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickFormatter={(value: string) => {
                const idx = HOUR_LABELS.indexOf(value)
                if (idx < 0) return ''
                if (idx % 3 === 0 || idx === 23) return HOUR_FULL[idx].replace(' ', '')
                return ''
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, Math.max(120, Math.max(...hourlyPct) * 1.1)]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const pct       = Number(payload[0]?.value ?? 0)
                // `hour` is the short key (e.g. "2a"); look it up in HOUR_FULL
                const shortHour = String(payload[0]?.payload?.hour ?? '')
                const h         = HOUR_LABELS.indexOf(shortHour)
                const fullLabel = h >= 0 ? HOUR_FULL[h] : shortHour
                return (
                  <Box
                    sx={{
                      bgcolor:      'background.paper',
                      border:       '1px solid',
                      borderColor:  'divider',
                      borderRadius: 1.5,
                      px:           1.5,
                      py:           1,
                      boxShadow:    '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }}>
                      {fullLabel}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      {pct}% of par
                    </Typography>
                  </Box>
                )
              }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <ReferenceLine
              y={100}
              stroke="#475569"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={(props: { viewBox?: { x?: number; y?: number; width?: number } }) => {
                const vb = props.viewBox ?? {}
                const x  = (vb.x ?? 0) + (vb.width ?? 0)
                const y  = (vb.y ?? 0) - 4
                return (
                  <text
                    x={x}
                    y={y}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={600}
                    fill="#475569"
                    fontFamily="inherit"
                  >
                    PAR (100%)
                  </text>
                )
              }}
            />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.belowPar ? RED : '#ccfbf1'} />
              ))}
              <LabelList
                dataKey="pct"
                content={(props) => {
                  const p = props as { x?: number; y?: number; width?: number; index?: number }
                  if (p.index !== lowestIdx) return null
                  const x = Number(p.x ?? 0)
                  const y = Number(p.y ?? 0)
                  const w = Number(p.width ?? 0)
                  return (
                    <text
                      x={x + w / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill={RED}
                      fontFamily="inherit"
                    >
                      {lowestPct}%
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Auto-insight — always teal callout */}
      <Box
        sx={{
          mt:           1.5,
          p:            1.5,
          borderRadius: 2,
          bgcolor:      'rgba(13,148,136,0.07)',
          border:       '1px solid rgba(13,148,136,0.2)',
          display:      'flex',
          gap:          1,
          alignItems:   'flex-start',
        }}
      >
        <Box sx={{ fontSize: 16, lineHeight: 1, mt: '1px', flexShrink: 0, color: TEAL }}>⚡</Box>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.65 }}>
          {lowestIdx >= 8 && lowestIdx <= 9
            ? <>The tightest window is{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>8–10 am</Box>{', '}when the morning medication pass starts —</>
            : <>The tightest window is{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{tightStart}–{tightEnd}</Box>{' '}—</>
          }
          {' '}that's when{' '}
          <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{floorName}</Box>
          {' '}
          {lowestPct < 100
            ? <>dips to{' '}<Box component="span" sx={{ fontWeight: 700, color: RED }}>{lowestPct}%</Box>{' '}of what it needs.</>
            : <>meets{' '}<Box component="span" sx={{ fontWeight: 700, color: TEAL }}>{lowestPct}%</Box>{' '}of par (above minimum).</>
          }
          {tiedIndices.length > 1 && lowestPct < 100 && (
            <Box component="span" sx={{ color: 'text.disabled', fontSize: 12 }}>
              {' '}({tiedIndices.length} hours tie at this level)
            </Box>
          )}
        </Typography>
      </Box>

      {/* How to read this */}
      <Box sx={{ mt: 1 }}>
        <Box
          onClick={() => setHowToOpen((v) => !v)}
          sx={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        0.75,
            cursor:     'pointer',
            px:         1.25,
            py:         0.5,
            borderRadius: 6,
            border:     '1px solid',
            borderColor:'divider',
            '&:hover':  { bgcolor: '#f8fafc' },
          }}
        >
          <Box
            sx={{
              width: 15, height: 15, borderRadius: '50%',
              border: '1.5px solid', borderColor: 'text.disabled',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.disabled', lineHeight: 1 }}>i</Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>
            How to read this
          </Typography>
          <Box
            component="svg" width={12} height={12} viewBox="0 0 24 24" fill="none"
            sx={{ transition: 'transform 0.2s', transform: howToOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'text.disabled' }}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </Box>
        {howToOpen && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.7, mt: 1, pl: 0.5, maxWidth: 380 }}>
            Each bar is the average number of{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>{assetType?.toLowerCase() ?? 'devices'}</Box>
            {' '}seen on this floor at that hour, expressed as a percentage of its par level (minimum required).
            Bars above the dashed line — the floor had enough. Bars below — staff may need to hunt for equipment.
          </Typography>
        )}
      </Box>
    </Box>
  )
}

// ── Trend chart — "Is it getting better?" ────────────────────────────────────

interface TrendPoint {
  date:   string
  pctMet: number
}

function TrendChart({
  points,
  loading,
  currentPctMet,
  assetType,
}: {
  points:        TrendPoint[]
  loading:       boolean
  currentPctMet: number
  assetType?:    string
}) {
  const [howToOpen, setHowToOpen] = useState(false)

  const cardSx = {
    bgcolor:       'background.paper',
    borderRadius:  3,
    p:             3,
    boxShadow:     '0 1px 3px rgba(0,0,0,0.06)',
    display:       'flex',
    flexDirection: 'column' as const,
  }

  if (loading) {
    return (
      <Box sx={cardSx}>
        <Skeleton variant="text" width={180} height={28} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={240} height={16} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
        <Skeleton variant="text" width="90%" height={16} sx={{ mt: 1.5 }} />
      </Box>
    )
  }

  const HEALTHY_ZONE = 85

  // Format date string from Fabric (could be ISO or locale string) → short label
  function fmtDate(d: string): string {
    try {
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return d }
  }

  // Build chart data — use currentPctMet as a single point if no points returned yet
  const chartData: Array<{ label: string; date: string; pctMet: number }> =
    points.length > 0
      ? points.map((p) => ({ label: fmtDate(p.date), date: p.date, pctMet: p.pctMet }))
      : [{ label: 'Today', date: '', pctMet: currentPctMet }]

  const first = chartData[0]?.pctMet ?? currentPctMet
  const last  = chartData[chartData.length - 1]?.pctMet ?? currentPctMet
  const trend = last - first

  // Dynamic Y domain: pad 12 points below the minimum value so the line fills the chart
  const minVal   = Math.min(...chartData.map((d) => d.pctMet))
  const yMin     = Math.max(0, Math.floor((minVal - 12) / 10) * 10)
  const yMax     = 108  // a little above 100 so the healthy zone top isn't clipped

  const statusColor = last >= HEALTHY_ZONE ? TEAL : last >= 70 ? AMBER : RED
  const statusText =
    last >= HEALTHY_ZONE ? 'In the healthy zone — floors are reliably meeting par.'
    : last >= 70          ? 'Getting there — most floors meeting par most days.'
    : 'Below target — significant gaps in floor coverage.'

  const firstLabel = chartData[0]?.label ?? ''
  const lastLabel  = chartData[chartData.length - 1]?.label ?? ''
  const dayCount   = chartData.length

  return (
    <Box sx={cardSx}>
      {/* Title row */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>
          Is it getting better?
        </Typography>
        <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ml: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#64748b', lineHeight: 1 }}>i</Typography>
        </Box>
      </Box>

      {/* Subtitle */}
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1.5, lineHeight: 1.5 }}>
        Daily share of floor-mornings meeting par
        {assetType ? ` for ${assetType.toLowerCase()}` : ''}, last {dayCount} day{dayCount !== 1 ? 's' : ''}
      </Typography>

      {/* Line chart — overflow visible so the "X% this week" label doesn't clip */}
      <Box sx={{ flex: 1, '& svg': { overflow: 'visible' } }}>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 120, left: 0, bottom: 0 }}
          >
            {/* Healthy zone shading */}
            <ReferenceArea
              y1={HEALTHY_ZONE}
              y2={yMax}
              fill="rgba(13,148,136,0.08)"
              fillOpacity={1}
            />
            {/* Healthy zone lower border + label */}
            <ReferenceLine
              y={HEALTHY_ZONE}
              stroke="rgba(13,148,136,0.4)"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{
                value: `Healthy zone: ${HEALTHY_ZONE}–100%`,
                position: 'insideTopLeft',
                fontSize: 9,
                fill: 'rgba(13,148,136,0.6)',
                fontWeight: 600,
                dy: -6,
                dx: 4,
              }}
            />

            <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={[yMin, yMax]} hide />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as { label: string; pctMet: number }
                return (
                  <Box
                    sx={{
                      bgcolor:      'background.paper',
                      border:       '1px solid',
                      borderColor:  'divider',
                      borderRadius: 1.5,
                      px:           1.5,
                      py:           1,
                      boxShadow:    '0 2px 8px rgba(0,0,0,0.08)',
                    }}
                  >
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }}>
                      {row.label}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      <Box component="span" sx={{ fontWeight: 700, color: row.pctMet >= HEALTHY_ZONE ? TEAL : row.pctMet >= 70 ? AMBER : RED }}>
                        {row.pctMet}%
                      </Box>
                      {' '}of floors met par
                    </Typography>
                  </Box>
                )
              }}
              cursor={{ stroke: 'rgba(0,0,0,0.08)', strokeWidth: 1 }}
            />

            <Line
              dataKey="pctMet"
              stroke={TEAL}
              strokeWidth={2}
              isAnimationActive={false}
              dot={(dotProps: Record<string, unknown>) => {
                const cx     = Number(dotProps.cx ?? 0)
                const cy     = Number(dotProps.cy ?? 0)
                const index  = Number(dotProps.index ?? 0)
                const isLast = index === chartData.length - 1
                if (isLast) {
                  return (
                    <g key={index}>
                      <circle cx={cx} cy={cy} r={9} fill="rgba(13,148,136,0.12)" />
                      <circle cx={cx} cy={cy} r={5} fill={TEAL} />
                      <text
                        x={cx + 14}
                        y={cy + 5}
                        fontSize={13}
                        fontWeight={800}
                        fill={TEAL}
                        fontFamily="inherit"
                      >
                        {last}% this week
                      </text>
                    </g>
                  )
                }
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={TEAL}
                    opacity={0.65}
                  />
                )
              }}
              activeDot={{ r: 5, fill: TEAL, stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {/* X-axis date labels — first and last only */}
      {dayCount > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25, px: 0.5 }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{firstLabel}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.disabled', mr: '118px' }}>{lastLabel}</Typography>
        </Box>
      )}

      {/* Narrative */}
      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.7, mt: 1.5 }}>
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{last}% this week.</Box>
        {' '}
        <Box component="span" sx={{ fontWeight: 600, color: statusColor }}>{statusText}</Box>
        {dayCount > 1 && trend !== 0 && (
          <Box component="span">
            {' '}Over {dayCount} days it moved from{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{first}%</Box>
            {' '}to{' '}
            <Box component="span" sx={{ fontWeight: 700, color: statusColor }}>{last}%</Box>.
          </Box>
        )}
      </Typography>

      {/* How to read this */}
      <Box sx={{ mt: 1.25 }}>
        <Box
          onClick={() => setHowToOpen((v) => !v)}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
            px: 1.25, py: 0.5, borderRadius: 6, border: '1px solid', borderColor: 'divider',
            '&:hover': { bgcolor: '#f8fafc' },
          }}
        >
          <Box sx={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid', borderColor: 'text.disabled', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: 'text.disabled', lineHeight: 1 }}>i</Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 600 }}>How to read this</Typography>
          <Box component="svg" width={12} height={12} viewBox="0 0 24 24" fill="none" sx={{ transition: 'transform 0.2s', transform: howToOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'text.disabled' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </Box>
        </Box>
        {howToOpen && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.7, mt: 1, pl: 0.5, maxWidth: 380 }}>
            Each dot shows what percentage of floor-morning checks met their par level that day during the 8–10 am medication pass window.
            The shaded band is the healthy zone — {HEALTHY_ZONE}% or above means most floors had enough {assetType?.toLowerCase() ?? 'devices'} most mornings.
          </Typography>
        )}
      </Box>
    </Box>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

interface EnoughOnEveryFloorProps {
  rows:              IHFloorStatusRow[]
  byTypeRows:        IHFloorReadinessByTypeRow[]
  configuredTypes?:  string[]
  assetType:         string
  loading:           boolean
  onSelectAssetType: (type: string | undefined) => void
  clientId:          string
  dashboardKey:      string
  unitValue?:        number
}

export default function EnoughOnEveryFloor({ rows, byTypeRows, assetType, loading, onSelectAssetType, clientId, dashboardKey, unitValue, configuredTypes }: EnoughOnEveryFloorProps) {
  const assetLabel = assetType ?? 'equipment'

  // jumpToFloor: set by WhatYouCanDoAboutIt CTA → consumed by CheckItYourself
  const [jumpToFloor, setJumpToFloor] = useState<string | undefined>(undefined)
  const checkItRef = useRef<HTMLDivElement | null>(null)

  function handleSelectFloor(floor: string) {
    setJumpToFloor(floor)
    setTimeout(() => {
      checkItRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  // Hourly chart state — key encodes everything that triggers a refetch
  const [hourlyState,   setHourlyState]   = useState<{ avg: number[]; key: string }>({ avg: [], key: '' })
  const hourlyFetchRef  = useRef<AbortController | null>(null)

  // Trend chart state — per-day pctMet for "Is it getting better?"
  const [trendState,  setTrendState]  = useState<{ points: TrendPoint[]; key: string }>({ points: [], key: '' })
  const trendFetchRef = useRef<AbortController | null>(null)

  // Tightest floor: lowest avgCount/par ratio — the floor most below its minimum on average
  const tightestFloor = [...rows]
    .filter((r) => r.par > 0)
    .sort((a, b) => (a.avgCount / a.par) - (b.avgCount / b.par))[0]

  // Single string that encodes all fetch inputs — safe to use as the sole dep
  const hourlyKey     = tightestFloor ? `${clientId}|${dashboardKey}|${tightestFloor.floor}|${assetType ?? ''}` : ''
  const hourlyLoading = !!hourlyKey && hourlyState.key !== hourlyKey
  const hourlyAvg     = hourlyState.avg

  const trendKey     = `${clientId}|${dashboardKey}|${assetType ?? ''}`
  const trendLoading = trendState.key !== trendKey
  const trendPoints  = trendState.points

  useEffect(() => {
    if (!hourlyKey || !tightestFloor) return

    hourlyFetchRef.current?.abort()
    const ctrl = new AbortController()
    hourlyFetchRef.current = ctrl

    fetch('/api/v1/insight-hub/query', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        clientId,
        dashboardKey,
        queryType: 'floor-hourly',
        filters:   { floor: tightestFloor.floor, ...(assetType ? { assetType } : {}) },
      }),
      signal: ctrl.signal,
    })
      .then((r) => r.json() as Promise<{ rows?: Record<string, unknown>[] }>)
      .then((data) => {
        const sessions = (data.rows ?? []).map((r) => ({
          vin:          String(r['[VIN]']          ?? ''),
          sessionStart: String(r['[SessionStart]'] ?? ''),
          sessionEnd:   String(r['[SessionEnd]']   ?? ''),
        }))
        setHourlyState({ avg: computeHourlyAvg(sessions), key: hourlyKey })
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setHourlyState({ avg: [], key: hourlyKey })
      })

    return () => ctrl.abort()
  // hourlyKey encodes clientId, dashboardKey, floor, and assetType — one dep is enough
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourlyKey])

  useEffect(() => {
    trendFetchRef.current?.abort()
    const ctrl = new AbortController()
    trendFetchRef.current = ctrl

    fetch('/api/v1/insight-hub/query', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        clientId,
        dashboardKey,
        queryType: 'floor-daily-trend',
        filters:   assetType ? { assetType } : {},
      }),
      signal: ctrl.signal,
    })
      .then((r) => r.json() as Promise<{ rows?: Record<string, unknown>[] }>)
      .then((data) => {
        const points = (data.rows ?? [])
          .map((r) => ({
            date:   String(r['[Date]']   ?? ''),
            pctMet: Number(r['[PctMet]'] ?? 0),
          }))
          .filter((p) => p.date)
        setTrendState({ points, key: trendKey })
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setTrendState({ points: [], key: trendKey })
      })

    return () => ctrl.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendKey])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Skeleton variant="rectangular" height={22} width={180} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={40} width="60%" sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={16} width="45%" sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={360} sx={{ borderRadius: 3 }} />
      </Box>
    )
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Keep the heading visible even with no data */}
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TEAL, textTransform: 'uppercase' }}>
          Floor Readiness Report
        </Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 800, lineHeight: 1.15 }}>
          Enough on every floor?
          {assetType && (
            <Box
              component="span"
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                ml: 1.5, px: 1.5, py: 0.5, borderRadius: 6,
                bgcolor: TEAL, color: '#fff', fontSize: 13, fontWeight: 600,
                verticalAlign: 'middle',
              }}
            >
              <DeviceIcon size={14} color="#fff" />
              {assetType}
            </Box>
          )}
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 6 }}>
          No floor data available for the last 7 days.
        </Typography>
      </Box>
    )
  }

  // Compute summary stats
  const enoughFloors = rows.filter((r) => r.status === 'enough')
  const tightFloors  = rows.filter((r) => r.status === 'tight')
  const shortFloors  = rows.filter((r) => r.status === 'short')

  const totalFloorDays  = rows.reduce((s, r) => s + r.totalDays, 0)
  const floorDaysMet    = rows.reduce((s, r) => s + r.daysEnough, 0)
  const pctMet          = totalFloorDays > 0 ? Math.round((floorDaysMet / totalFloorDays) * 100) : 0

  const totalVINs = rows[0]?.totalVINs ?? 0
  const dateRange = last7DaysLabel()
  const narrative = buildNarrative(rows, assetLabel)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

      {/* ── Category label ──────────────────────────────────────────────────── */}
      <Typography
        sx={{
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: '0.1em',
          color:         TEAL,
          textTransform: 'uppercase',
        }}
      >
        Floor Readiness Report
      </Typography>

      {/* ── Heading + asset type pill ────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography
          component="h1"
          sx={{
            fontSize:   { xs: 26, sm: 32 },
            fontWeight: 800,
            lineHeight: 1.15,
            color:      'text.primary',
          }}
        >
          Enough on every floor?
        </Typography>
        {assetType && (
          <Box
            sx={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          0.5,
              px:           1.5,
              py:           0.5,
              borderRadius: 6,
              bgcolor:      TEAL,
              color:        '#fff',
              fontSize:     13,
              fontWeight:   600,
              flexShrink:   0,
            }}
          >
            <DeviceIcon size={14} color="#fff" />
            {assetType}
          </Box>
        )}
      </Box>

      {/* ── Sub-description ──────────────────────────────────────────────────── */}
      <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6, maxWidth: 600 }}>
        This page answers one question: when the morning rush hits, does every floor already
        have enough {assetLabel.toLowerCase()} on hand — or does someone have to go hunting first?
      </Typography>

      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 2.5, sm: 3.5 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* Card heading */}
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', mb: 1.25 }}>
          When the morning rush hits, does every floor have enough{' '}
          {assetLabel.toLowerCase()}?
        </Typography>

        {/* % of floor-days met par */}
        <Typography sx={{ fontSize: 14, color: 'text.primary', lineHeight: 1.6 }}>
          <Box component="span" sx={{ fontWeight: 700 }}>
            {pctMet}% of floor-days met par
          </Box>
          {' '}over the last 7 days — the rest, someone had to go hunting.
        </Typography>

        {/* Metadata sub-line */}
        <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5, mb: 3 }}>
          {totalVINs > 0 && `Based on ${totalVINs.toLocaleString()} tagged ${assetLabel.toLowerCase()} across `}
          {totalVINs === 0 && 'Across '}
          {rows.length} floor{rows.length !== 1 ? 's' : ''} and units · {dateRange}
        </Typography>

        {/* ── Three-column icon grid + right stat ───────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'stretch' }}>

          {/* LEFT — icon columns */}
          <Box
            sx={{
              flex:           '1 1 auto',
              display:        'flex',
              gap:            2,
              alignItems:     'flex-end',
              minWidth:       0,
            }}
          >
            <FloorIconColumn floors={enoughFloors} status="enough" />
            <FloorIconColumn floors={tightFloors}  status="tight"  />
            <FloorIconColumn floors={shortFloors}  status="short"  />
          </Box>

          {/* Vertical divider — must be '1px' string; numeric 1 = 100% in MUI sx */}
          <Box
            sx={{
              width:     '1px',
              bgcolor:   'divider',
              flexShrink: 0,
              alignSelf: 'stretch',
            }}
          />

          {/* RIGHT — stat + narrative */}
          <Box
            sx={{
              flex:    '0 0 240px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontSize:   56,
                fontWeight: 900,
                color:      TEAL,
                lineHeight: 0.95,
                letterSpacing: '-0.02em',
              }}
            >
              {pctMet}%
            </Typography>

            <Typography
              sx={{
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: '0.09em',
                color:         'text.disabled',
                textTransform: 'uppercase',
                mt:            1.25,
                mb:            1.5,
              }}
            >
              Of floor-days met par
            </Typography>

            <Typography
              sx={{
                fontSize:   13,
                color:      'text.secondary',
                lineHeight: 1.65,
              }}
            >
              {narrative}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Three summary cards — flip animation ────────────────────────────── */}
      {rows.length > 0 && (() => {
        const worstShort  = [...shortFloors].sort((a, b) => b.daysShort - a.daysShort)[0]
        const worstPctAvg = worstShort && worstShort.par > 0
          ? Math.round((worstShort.avgCount / worstShort.par) * 100)
          : 0
        const worstPctDays = worstShort && worstShort.totalDays > 0
          ? Math.round((worstShort.daysEnough / worstShort.totalDays) * 100)
          : 0

        // Pick the floor with the highest total count — the most stocked donor candidate.
        // surplus = how many above par (can be 0 or negative if counts are at/below par).
        const surplusFloor = [...rows]
          .map((r) => ({ ...r, surplus: Math.round(r.avgCount - r.par) }))
          .sort((a, b) => b.avgCount - a.avgCount)[0]

        const surplus = surplusFloor?.surplus ?? 0
        const savings = surplus > 0 && unitValue ? surplus * unitValue : 0

        const shortNames = [...shortFloors]
          .sort((a, b) => b.daysShort - a.daysShort)
          .map((f) => f.floor)
        const shortDesc = shortNames.length === 0
          ? 'No floors ran short in the last 7 days.'
          : shortNames.length === 1
            ? shortNames[0]
            : shortNames.length === 2
              ? `${shortNames[0]} and ${shortNames[1]}`
              : `${shortNames.slice(0, -1).join(', ')}, and ${shortNames[shortNames.length - 1]}`

        const card1Desc = shortFloors.length === 0
          ? 'Every floor had enough pumps each morning of the last 7 days.'
          : <>{<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{shortDesc}</Box>}{' '}regularly {shortNames.length === 1 ? "doesn't" : "don't"} have enough {assetLabel.toLowerCase()} when the morning rush hits.</>

        const card2Desc = worstShort
          ? <>Weekday mornings, 8–10 am — the medication pass window. On average, only{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{worstPctAvg}%</Box>{' '}of the required minimum ({worstShort.par} {assetLabel.toLowerCase()}) is on hand at <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{worstShort.floor}</Box>.</>
          : 'Every floor met par throughout the last 7 days.'

        const card3Desc = surplusFloor && surplus > 0
          ? <>Moving the{' '}<Box component="span" sx={{ fontWeight: 700, color: '#fff' }}>{surplus} extra {assetLabel.toLowerCase()}</Box>{' '}sitting at{' '}<Box component="span" sx={{ fontWeight: 700, color: '#fff' }}>{surplusFloor.floor}</Box>{' '}avoids buying that many more — rebalancing, not repurchasing.</>
          : surplusFloor
            ? <><Box component="span" sx={{ fontWeight: 700, color: '#fff' }}>{surplusFloor.floor}</Box>{' '}has the most {assetLabel.toLowerCase()} on hand ({Math.round(surplusFloor.avgCount)}) — the best candidate to lend to short floors if redistribution is needed.</>
            : 'No floor data available.'

        return (
          <FlipStatCards
            card1={{
              label: 'Floors that run short',
              faces: [
                {
                  metric: `${100 - pctMet}%`,
                  suffix: 'of mornings miss',
                  why:    `Across all ${rows.length} floors, ${100 - pctMet}% of morning rush hours saw fewer ${assetLabel.toLowerCase()} than the required minimum over the last 7 days.`,
                },
                {
                  metric: `${shortFloors.length}`,
                  suffix: shortFloors.length === 1 ? 'floor' : 'floors',
                  why:    `A floor is counted as 'short' when it falls below its ${assetLabel.toLowerCase()} minimum on 2 or more mornings in 7 days.`,
                },
                {
                  metric: `${enoughFloors.length} of ${rows.length}`,
                  suffix: 'meet par',
                  why:    `Of the ${rows.length} floors tracked, ${enoughFloors.length} consistently had enough ${assetLabel.toLowerCase()} during morning rounds.`,
                },
              ],
              description: card1Desc,
            }}
            card2={{
              label: 'The tightest moment',
              faces: worstShort ? [
                {
                  metric: '8–10 am',
                  suffix: 'is the crunch',
                  why:    'The morning medication pass window — when all floors compete for the same pool of devices at the same time.',
                },
                {
                  metric: worstShort.floor,
                  suffix: '',
                  why:    `This floor ran short most often in the last 7 days — most likely where staff are hunting for ${assetLabel.toLowerCase()} during rounds.`,
                },
                {
                  metric: `${worstPctDays}%`,
                  suffix: 'of mornings at par',
                  why:    `Out of ${worstShort.totalDays} mornings checked, ${worstShort.floor} had enough ${assetLabel.toLowerCase()} on only ${worstShort.daysEnough}.`,
                },
              ] : [
                { metric: 'All clear', suffix: '', why: 'Every floor met par on every morning tracked.' },
                { metric: '0', suffix: 'floors short', why: 'No floor fell below its minimum during the 8–10 am window in the last 7 days.' },
                { metric: '100%', suffix: 'of mornings at par', why: 'Every morning, every floor had at least its required minimum number of devices.' },
              ],
              description: card2Desc,
            }}
            card3={surplusFloor ? {
              label: 'What could be saved',
              faces: surplus > 0 ? [
                {
                  metric: '0',
                  suffix: `new ${assetLabel.toLowerCase()} to buy`,
                  why:    `The ${surplus} extra ${assetLabel.toLowerCase()} at ${surplusFloor.floor} can cover the shortage — no new procurement needed.`,
                },
                {
                  metric: savings > 0 ? fmtMoney(savings) : `${surplus}`,
                  suffix: savings > 0 ? 'avoided' : `${assetLabel.toLowerCase()} to move`,
                  why:    savings > 0
                    ? `At $${unitValue?.toLocaleString()} per device, moving ${surplus} ${assetLabel.toLowerCase()} from ${surplusFloor.floor} avoids that purchase entirely.`
                    : `${surplusFloor.floor} has ${surplus} more ${assetLabel.toLowerCase()} than its minimum — enough to donate to short floors.`,
                },
                {
                  metric: `${surplus}`,
                  suffix: `${assetLabel.toLowerCase()} to move`,
                  why:    `${surplusFloor.floor} averages ${surplus} more ${assetLabel.toLowerCase()} than its par — the surplus that can fix the shortage without new equipment.`,
                },
              ] : [
                {
                  metric: '0',
                  suffix: `new ${assetLabel.toLowerCase()} to buy`,
                  why:    `Redistribution — not procurement — is the answer. ${surplusFloor.floor} has the highest count on hand and is the best donor candidate.`,
                },
                {
                  metric: surplusFloor.floor,
                  suffix: 'most pumps on hand',
                  why:    `${surplusFloor.floor} consistently carries the highest number of ${assetLabel.toLowerCase()} during the 8–10 am window — the natural place to pull from first.`,
                },
                {
                  metric: `${Math.round(surplusFloor.avgCount)}`,
                  suffix: `on hand at peak`,
                  why:    `${surplusFloor.floor} averages ${Math.round(surplusFloor.avgCount)} ${assetLabel.toLowerCase()} during morning rounds — more than any other tracked floor.`,
                },
              ],
              description: card3Desc,
            } : null}
          />
        )

      })()}

      {/* ── Floor readiness by type  +  Is it getting better? — side by side ───── */}
      {(byTypeRows.length > 0 || rows.length > 0) && (() => {
        const visibleRows = byTypeRows

        const selectedRow = visibleRows.find((r) => r.assetType === assetType)
        const focusRow    = selectedRow ?? [...visibleRows].sort((a, b) => a.pctMet - b.pctMet)[0]
        const barColor    = (pct: number) => pct >= 85 ? TEAL : pct >= 70 ? AMBER : RED
        return (
          <Box sx={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 2, alignItems: 'stretch' }}>

            {/* ── LEFT — Floor readiness by equipment type ────────────────────── */}
            <Box
              sx={{
                bgcolor:      'background.paper',
                borderRadius: 3,
                p:            3,
                boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
                display:      'flex',
                flexDirection:'column',
              }}
            >
              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
                  Floor readiness by equipment type
                  <Box component="span" sx={{ fontSize: 12, fontWeight: 400, color: 'text.disabled', ml: 0.75 }}>
                    — click to switch
                  </Box>
                </Typography>
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ml: 1 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#64748b', lineHeight: 1 }}>i</Typography>
                </Box>
              </Box>

              {/* Description */}
              {focusRow && (
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, mb: 2 }}>
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{focusRow.assetType}</Box>
                  {' '}clears par on{' '}
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{focusRow.enoughFloors} of {focusRow.totalFloors}</Box>
                  {' '}floors
                  {focusRow.shortFloors > 0 && (
                    <>; <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{focusRow.shortFloors}</Box>{' '}
                    {focusRow.shortFloors === 1 ? 'comes' : 'come'} up short most mornings</>
                  )}.
                </Typography>
              )}

              {/* Progress bar rows */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1 }}>
                {visibleRows.map((row) => {
                  const isViewing = row.assetType === assetType
                  const color     = barColor(row.pctMet)
                  return (
                    <Box
                      key={row.assetType}
                      onClick={() => onSelectAssetType(isViewing ? undefined : row.assetType)}
                      sx={{
                        display:      'grid',
                        gridTemplateColumns: '1fr auto',
                        alignItems:   'center',
                        gap:          1.5,
                        px:           1.25,
                        py:           0.875,
                        borderRadius: 2,
                        cursor:       'pointer',
                        bgcolor:      isViewing ? `${color}10` : 'transparent',
                        outline:      isViewing ? `1.5px solid ${color}50` : '1.5px solid transparent',
                        transition:   'all 0.15s',
                        '&:hover':    { bgcolor: isViewing ? `${color}16` : '#f8fafc' },
                      }}
                    >
                      {/* Left: icon + name + bar */}
                      <Box>
                        {/* Name row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.6 }}>
                          <DeviceIcon size={14} color={isViewing ? color : '#94a3b8'} />
                          <Typography sx={{ fontSize: 13, fontWeight: isViewing ? 700 : 500, color: 'text.primary', lineHeight: 1 }}>
                            {row.assetType}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1 }}>
                            · {row.totalVINs.toLocaleString()} tagged{isViewing ? ' · viewing' : ''}
                          </Typography>
                        </Box>

                        {/* Bar + GOAL */}
                        <Box sx={{ position: 'relative' }}>
                          {/* GOAL label — top-right corner of the track */}
                          <Typography
                            sx={{
                              position:      'absolute',
                              right:         0,
                              top:           -14,
                              fontSize:      9,
                              fontWeight:    700,
                              color:         'text.disabled',
                              letterSpacing: '0.06em',
                            }}
                          >
                            GOAL
                          </Typography>
                          {/* Track */}
                          <Box sx={{ height: 8, bgcolor: '#e8edf2', borderRadius: 1, overflow: 'hidden' }}>
                            <Box
                              sx={{
                                width:        `${row.pctMet}%`,
                                height:       '100%',
                                bgcolor:      color,
                                borderRadius: 1,
                                transition:   'width 0.5s ease',
                              }}
                            />
                          </Box>
                          {/* Goal tick — right edge */}
                          <Box
                            sx={{
                              position: 'absolute',
                              right:    0,
                              top:      -4,
                              bottom:   -4,
                              width:    '2px',
                              bgcolor:  '#94a3b8',
                              borderRadius: 1,
                            }}
                          />
                        </Box>
                      </Box>

                      {/* Right: percentage */}
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color, minWidth: 44, textAlign: 'right' }}>
                        {row.pctMet}%
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </Box>

            {/* ── RIGHT — two cards stacked ────────────────────────────────────── */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* Card 1: A typical day on your tightest floor */}
              {tightestFloor && (
                <TypicalDayChart
                  floorName={tightestFloor.floor}
                  par={tightestFloor.par}
                  hourlyAvg={hourlyAvg}
                  loading={hourlyLoading}
                  assetType={assetType}
                />
              )}

              {/* Card 2: Is it getting better? — real 7-day trend */}
              <TrendChart
                points={trendPoints}
                loading={trendLoading}
                currentPctMet={pctMet}
                assetType={assetType}
              />

            </Box>

          </Box>
        )
      })()}


      {/* ── Check it yourself — interactive floor drill-down (Dive deeper) ───── */}
      {rows.length > 0 && (
        <Box ref={checkItRef}>
          <CheckItYourself
            rows={rows}
            clientId={clientId}
            dashboardKey={dashboardKey}
            assetType={assetType}
            externalFloor={jumpToFloor}
          />
        </Box>
      )}

      {/* ── What you can do about it — action cards ──────────────────────────── */}
      {rows.length > 0 && (
        <WhatYouCanDoAboutIt
          rows={rows}
          assetType={assetLabel}
          unitValue={unitValue}
          onSelectFloor={handleSelectFloor}
        />
      )}
    </Box>
  )
}
