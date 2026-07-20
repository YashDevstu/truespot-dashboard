'use client'

import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import { BarChart, Bar, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Cell, Tooltip, LabelList, LineChart, Line, ReferenceArea } from 'recharts'
import type { IHFloorStatusRow, IHFloorReadinessByTypeRow } from '@/hooks/useInsightHubData'
import CheckItYourself, { getFloorParTier, RED_MAX_PCT } from './CheckItYourself'
import WhatYouCanDoAboutIt from './WhatYouCanDoAboutIt'
import FlipStatCards from '../shared/FlipStatCards'
import { PinIcon } from '../shared/PerTenIconGrid'
import { parseFacilityLocalParts, getFacilityParts } from '@/utils/formatters'

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
  enough: { color: TEAL,  bg: '#f0fdfb' },
  tight:  { color: AMBER, bg: '#fffbeb' },
  short:  { color: RED,   bg: '#fff1f2' },
}

// ── "What this page tells you" checklist box ─────────────────────────────────

function WhatThisPageTellsYou({ assetLabel }: { assetLabel: string }) {
  const items = [
    `Your TrueSpot tags count exactly how many ${assetLabel.toLowerCase()} sit on every floor, every hour — not a guess from a spreadsheet built last quarter.`,
    `"Enough" means a floor had what it needed before the morning rush started — not after a nurse already went looking for one.`,
    `Every morning that missed par is a morning someone went hunting. Don't trust it blindly: follow any floor and its devices below, and flag anything wrong.`,
  ]

  return (
    <Box
      sx={{
        bgcolor:      'rgba(13,148,136,0.07)',
        border:       '1px solid rgba(13,148,136,0.18)',
        borderRadius: 3,
        p:            2.5,
      }}
    >
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
        What this page tells you
      </Typography>
      <Box
        sx={{
          display:               'grid',
          gridTemplateColumns:    { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap:                    2,
        }}
      >
        {items.map((text, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Box sx={{ color: TEAL, fontSize: 14, fontWeight: 700, lineHeight: 1.5, flexShrink: 0 }}>✓</Box>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.55 }}>
              {text}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// ── Status pin-row (horizontal) ─────────────────────────────────────────────────

function FloorStatusRow({
  floors,
  status,
}: {
  floors: IHFloorStatusRow[]
  status: 'enough' | 'tight' | 'short'
}) {
  const meta  = STATUS_META[status]
  const count = floors.length

  // Cap pins shown so the row doesn't run away for large floor counts
  const iconsVisible = Math.min(count, 15)
  const overflow     = count - iconsVisible

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {/* Label */}
      <Typography
        sx={{
          fontSize:   13,
          fontWeight: 500,
          color:      count > 0 ? 'text.secondary' : 'text.disabled',
          lineHeight: 1.35,
          minWidth:   120,
          flexShrink: 0,
        }}
      >
        {status === 'enough' ? 'Enough on hand' : status === 'tight' ? 'Getting tight' : 'Ran short'}
      </Typography>

      {/* Pin chip — wraps if it runs out of room */}
      {count > 0 ? (
        <Box
          sx={{
            flex:         1,
            bgcolor:      meta.bg,
            borderRadius: 2.5,
            px:           1.5,
            py:           0.75,
            display:      'flex',
            flexWrap:     'wrap',
            gap:          '5px',
            alignItems:   'center',
            minHeight:    38,
          }}
        >
          {Array.from({ length: iconsVisible }).map((_, i) => (
            <PinIcon key={i} color={meta.color} size={22} />
          ))}
          {overflow > 0 && (
            <Typography sx={{ fontSize: 11, color: meta.color, fontWeight: 700, ml: 0.5 }}>
              +{overflow} more
            </Typography>
          )}
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 38, display: 'flex', alignItems: 'center', px: 1 }}>
          <Box sx={{ width: 20, height: 2, bgcolor: '#e2e8f0', borderRadius: 1 }} />
        </Box>
      )}

      {/* Count */}
      <Typography
        sx={{
          fontSize:      24,
          fontWeight:    800,
          color:         count > 0 ? meta.color : '#cbd5e1',
          letterSpacing: '-0.02em',
          lineHeight:    1,
          minWidth:      28,
          textAlign:     'right',
          flexShrink:    0,
        }}
      >
        {count}
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
    // sessionStart/sessionEnd are already facility-local wall-clock strings —
    // read the components directly, no UTC round-trip (see formatters.ts).
    const startParts = parseFacilityLocalParts(s.sessionStart)
    const endParts   = parseFacilityLocalParts(s.sessionEnd)
    if (!startParts.year || !endParts.year) continue

    const dayKey = `${startParts.year}-${startParts.month}-${startParts.day}`
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, [])
    dayMap.get(dayKey)!.push({
      vin:      s.vin,
      startMin: startParts.hour * 60 + startParts.minute,
      endMin:   endParts.hour   * 60 + endParts.minute,
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
              {chartData.map((entry, i) => {
                // Only the tightest hour gets the full-strength red — every other
                // below-par hour is a much lighter tint, so the worst moment of
                // the day actually stands out instead of the chart reading as a
                // wall of red with no visual hierarchy.
                const fill = i === lowestIdx ? RED : entry.belowPar ? '#fecaca' : '#ccfbf1'
                return <Cell key={i} fill={fill} />
              })}
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
          {' '}that&apos;s when{' '}
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
  const WINDOW_DAYS  = 7

  // Build chart data for a fixed 7-day window (facility-local calendar days),
  // backfilling any day with zero qualifying sessions as an explicit gap
  // (pctMet: null) rather than letting it silently vanish. Without this, a day
  // with a total data outage just doesn't appear at all — the line quietly
  // connects the remaining days as if nothing happened, and "last 7 days"
  // mislabels itself "last 6 days" instead of showing that a day is missing.
  const pointByDateKey = new Map<string, TrendPoint>()
  for (const p of points) {
    const parts = parseFacilityLocalParts(p.date)
    if (!parts.year) continue
    pointByDateKey.set(`${parts.year}-${parts.month}-${parts.day}`, p)
  }

  const chartData: Array<{ label: string; date: string; pctMet: number | null }> =
    points.length > 0
      ? (() => {
          const today   = getFacilityParts(new Date())
          const todayMs = Date.UTC(today.year, today.month - 1, today.day)
          const rows: Array<{ label: string; date: string; pctMet: number | null }> = []
          for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
            const dt    = new Date(todayMs - i * 86400000)
            const key   = `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`
            const match = pointByDateKey.get(key)
            rows.push({
              label:  dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
              date:   match?.date ?? '',
              pctMet: match ? match.pctMet : null,
            })
          }
          return rows
        })()
      : [{ label: 'Today', date: '', pctMet: currentPctMet }]

  const validValues = chartData.map((d) => d.pctMet).filter((v): v is number => v !== null)
  const lastValidIdx = chartData.reduce((acc, d, i) => d.pctMet !== null ? i : acc, -1)

  const first = validValues[0] ?? currentPctMet
  const last  = validValues[validValues.length - 1] ?? currentPctMet
  const trend = last - first

  // Dynamic Y domain: pad 12 points below the minimum value so the line fills the chart
  const minVal   = validValues.length > 0 ? Math.min(...validValues) : 0
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
      <Box sx={{ flex: 1, position: 'relative', '& svg': { overflow: 'visible' } }}>
        {/* Healthy zone label — fixed position so it stays legible even when the
            shaded band itself shrinks to a thin sliver (trend far below target),
            but plain text with no pill/border so it reads as part of the band
            rather than a separate floating chip. */}
        <Typography sx={{ position: 'absolute', top: 4, left: 4, zIndex: 1, fontSize: 10, fontWeight: 600, color: TEAL }}>
          Healthy zone: {HEALTHY_ZONE}–100% of mornings meeting par
        </Typography>
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
            {/* Healthy zone lower border (label lives in the chip above instead) */}
            <ReferenceLine
              y={HEALTHY_ZONE}
              stroke="rgba(13,148,136,0.4)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={[yMin, yMax]} hide />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as { label: string; pctMet: number | null }
                if (row.pctMet === null) {
                  return (
                    <Box
                      sx={{
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                        borderRadius: 1.5, px: 1.5, py: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    >
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }}>{row.label}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No data this day</Typography>
                    </Box>
                  )
                }
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
              connectNulls={false}
              dot={(dotProps: Record<string, unknown>) => {
                const cx      = Number(dotProps.cx ?? 0)
                const cy      = Number(dotProps.cy ?? 0)
                const index   = Number(dotProps.index ?? 0)
                const payload = dotProps.payload as { pctMet: number | null }
                if (payload.pctMet === null) return <g key={index} />
                const isLast = index === lastValidIdx
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
  product:           string
  unitValue?:        number
}

export default function EnoughOnEveryFloor({ rows, byTypeRows, assetType, loading, onSelectAssetType, clientId, dashboardKey, product, unitValue, configuredTypes }: EnoughOnEveryFloorProps) {
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

  // Tightest floor: the floor that comes closest to par without consistently meeting it.
  // Exclude floors with very low average counts (< 5) — these are utility/service areas
  // with almost no tagged equipment and a par of 50, which would always rank as "worst".
  // Among meaningful floors, prefer ones that are short or tight; break ties by avgCount/par.
  const tightestFloor = [...rows]
    .filter((r) => r.par > 0 && r.avgCount >= 5)
    .sort((a, b) => {
      // Short floors first, then tight, then enough
      const statusRank = (r: typeof a) => r.status === 'short' ? 0 : r.status === 'tight' ? 1 : 2
      const sr = statusRank(a) - statusRank(b)
      if (sr !== 0) return sr
      // Within same status, pick the one closest to par (highest ratio) — most clinically relevant
      return (b.avgCount / b.par) - (a.avgCount / a.par)
    })[0]

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

      {/* ── What this page tells you ─────────────────────────────────────────── */}
      <WhatThisPageTellsYou assetLabel={assetLabel} />

      {/* ── Main card ────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 2.5, sm: 3.5 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* Eyebrow */}
        <Typography
          sx={{
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: '0.08em',
            color:         'text.disabled',
            textTransform: 'uppercase',
            mb:            2,
          }}
        >
          Across your {rows.length} floor{rows.length !== 1 ? 's' : ''} and units, on a typical morning…
        </Typography>

        {/* ── Left stat + narrative, right status pin-rows ────────────────────── */}
        <Box sx={{ display: 'flex', gap: 4, alignItems: 'stretch', flexWrap: 'wrap' }}>

          {/* LEFT — big stat + narrative + metadata */}
          <Box sx={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 240 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography
                sx={{
                  fontSize:      56,
                  fontWeight:    900,
                  color:         TEAL,
                  lineHeight:    0.95,
                  letterSpacing: '-0.02em',
                }}
              >
                {pctMet}%
              </Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.secondary' }}>
                met par
              </Typography>
            </Box>

            <Typography
              sx={{
                fontSize:   13,
                color:      'text.secondary',
                lineHeight: 1.65,
                mt:         1.5,
              }}
            >
              {narrative}
            </Typography>

            {/* Metadata sub-line */}
            <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 1.5 }}>
              {totalVINs > 0 && `Based on ${totalVINs.toLocaleString()} tagged ${assetLabel.toLowerCase()} across `}
              {totalVINs === 0 && 'Across '}
              {rows.length} floor{rows.length !== 1 ? 's' : ''} and units · {dateRange}
            </Typography>
          </Box>

          {/* Vertical divider — must be '1px' string; numeric 1 = 100% in MUI sx */}
          <Box
            sx={{
              width:     '1px',
              bgcolor:   'divider',
              flexShrink: 0,
              alignSelf: 'stretch',
              display:   { xs: 'none', md: 'block' },
            }}
          />

          {/* RIGHT — status pin-rows */}
          <Box sx={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5, minWidth: 280 }}>
            <FloorStatusRow floors={enoughFloors} status="enough" />
            <FloorStatusRow floors={tightFloors}  status="tight"  />
            <FloorStatusRow floors={shortFloors}  status="short"  />

            <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.5 }}>
              <Box component="span" sx={{ fontWeight: 700, letterSpacing: '0.04em' }}>HOW TO READ</Box>
              {'  '}Each row is how many of your {rows.length} floors fall in that group on a typical morning; every pin is one floor.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Three summary cards — flip animation ────────────────────────────── */}
      {rows.length > 0 && (() => {
        // Same metric as the "Dive deeper" grid below — average on-hand vs par —
        // so the summary cards and the grid never disagree about which floor is
        // worst or by how much. (Day-count-based selection was tried first but
        // can pick a floor whose weekly *average* sits above 100% of par even
        // though it's the most frequent day-level offender — a self-contradictory
        // "tightest moment ... 117% on hand" headline.)
        const parTiers   = rows.map((r) => ({ row: r, ...getFloorParTier(r) }))
        const shortByPar = parTiers.filter((t) => t.tier === 'shortfall').sort((a, b) => a.pct - b.pct)
        const stockedCount = parTiers.filter((t) => t.tier === 'stocked').length

        const worstFloor = shortByPar[0]?.row
        const worstPct   = shortByPar[0]?.pct ?? 0

        // Donor candidate — the floor with the largest raw surplus above its own
        // par. No separate "hoarding" tier feeds into this; it's a plain surplus
        // ranking independent of the shortage-severity bands above.
        const surplusFloor = [...rows].sort((a, b) => (b.avgCount - b.par) - (a.avgCount - a.par))[0]
        const surplus = surplusFloor ? Math.round(surplusFloor.avgCount - surplusFloor.par) : 0
        const savings = surplus > 0 && unitValue ? surplus * unitValue : 0

        const shortNames = shortByPar.map((t) => t.row.floor)
        const shortDesc = shortNames.length === 0
          ? 'No floors ran short in the last 7 days.'
          : shortNames.length === 1
            ? shortNames[0]
            : shortNames.length === 2
              ? `${shortNames[0]} and ${shortNames[1]}`
              : `${shortNames.slice(0, -1).join(', ')}, and ${shortNames[shortNames.length - 1]}`

        const card1Desc = shortByPar.length === 0
          ? 'Every floor had enough pumps each morning of the last 7 days.'
          : <>{<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{shortDesc}</Box>}{' '}regularly {shortNames.length === 1 ? "doesn't" : "don't"} have enough {assetLabel.toLowerCase()} when the morning rush hits.</>

        const card2Desc = worstFloor
          ? <>Weekday mornings, 8–10 am — the medication pass window. <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{worstFloor.floor}</Box>{' '}meets par only{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{worstPct}%</Box>{' '}of the time.</>
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
                  metric: `${shortByPar.length}`,
                  suffix: shortByPar.length === 1 ? 'floor' : 'floors',
                  why:    `A floor is counted as 'short' when it has, on average, less than ${RED_MAX_PCT}% of its required minimum on hand.`,
                },
                {
                  metric: `${stockedCount} of ${rows.length}`,
                  suffix: 'meet par',
                  why:    `Of the ${rows.length} floors tracked, ${stockedCount} sit at or near par on average during morning rounds.`,
                },
              ],
              description: card1Desc,
            }}
            card2={{
              label: 'The tightest moment',
              faces: worstFloor ? [
                {
                  metric: '8–10 am',
                  suffix: 'is the crunch',
                  why:    'The morning medication pass window — when all floors compete for the same pool of devices at the same time.',
                },
                {
                  metric: worstFloor.floor,
                  suffix: '',
                  why:    `This floor has the least ${assetLabel.toLowerCase()} on hand relative to what it needs — most likely where staff are hunting during rounds.`,
                },
                {
                  metric: `${worstPct}%`,
                  suffix: 'of par, on average',
                  why:    `${worstFloor.floor} averages ${worstFloor.avgCount} ${assetLabel.toLowerCase()} on hand against a par of ${worstFloor.par} — ${worstPct}% coverage.`,
                },
              ] : [
                { metric: 'All clear', suffix: '', why: 'Every floor met par on every morning tracked.' },
                { metric: '0', suffix: 'floors short', why: 'No floor fell below its minimum during the 8–10 am window in the last 7 days.' },
                { metric: '100%', suffix: 'of par, on average', why: 'Every floor averages at or above its required minimum.' },
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
        const visibleRows = configuredTypes
          ? byTypeRows.filter((r) => configuredTypes.includes(r.assetType))
          : byTypeRows

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
            product={product}
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
