'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
  LineChart, Line, ReferenceLine, ReferenceArea,
} from 'recharts'
import type { IHUtilisationData, IHPeakData, IHDailyPeakRow, IHAssetTypeRow, IHHourlyRow, IHWeeklyRow, IHLocationCategoryRow, IHCategoryAssetRow, IHCategoryDailyRow } from '@/hooks/useInsightHubData'
import PerTenIconGrid from '../shared/PerTenIconGrid'
import FlipStatCards from '../shared/FlipStatCards'
import type { StatFace, StatCardConfig } from '../shared/FlipStatCards'
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
        are in use right now. Utilisation is healthy, with some buffer to absorb demand spikes.
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

const GOAL_PCT = 70  // target utilisation — shown as a tick on every bar

function barColor(pct: number): string {
  if (pct >= 60) return TEAL
  if (pct >= 30) return '#d97706'
  return '#ef4444'
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function UsageBar({ pct }: { pct: number }) {
  const color = barColor(pct)
  return (
    <Box sx={{ position: 'relative', flex: 1, height: 10, bgcolor: '#e2e8f0', borderRadius: 5 }}>
      <Box
        sx={{
          position:   'absolute',
          left: 0, top: 0, bottom: 0,
          width:      `${Math.min(pct, 100)}%`,
          bgcolor:    color,
          borderRadius: 5,
          transition: 'width 0.35s ease',
        }}
      />
      {/* GOAL tick */}
      <Box
        sx={{
          position: 'absolute',
          left:     `${GOAL_PCT}%`,
          top:      -4,
          bottom:   -4,
          width:    '2px',
          bgcolor:  '#64748b',
          borderRadius: 1,
          '&::before': {
            content:    '"GOAL"',
            position:   'absolute',
            bottom:     '100%',
            left:       '50%',
            transform:  'translateX(-50%)',
            fontSize:   '8px',
            fontWeight: 700,
            color:      '#64748b',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            mb:         '2px',
          },
        }}
      />
    </Box>
  )
}

function EquipmentRow({
  row,
  isSelected,
  onClick,
}: {
  row:        IHAssetTypeRow
  isSelected: boolean
  onClick:    () => void
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
        py:           1.25,
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

      {/* Name + tag count */}
      <Box sx={{ flex: '0 0 auto', minWidth: 140 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
            {row.assetType}
          </Typography>
          {isSelected && (
            <Typography
              sx={{
                fontSize:   9,
                fontWeight: 700,
                color:      TEAL,
                letterSpacing: '0.04em',
                border:     `1px solid ${TEAL}`,
                borderRadius: 1,
                px:         0.5,
                lineHeight: 1.6,
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
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.25 }}>
        <UsageBar pct={pct} />
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

function HourByHourChart({ rows, assetLabel }: { rows: IHHourlyRow[]; assetLabel: string }) {
  if (rows.length === 0) return null

  const peakRow  = [...rows].sort((a, b) => b.withPatient - a.withPatient)[0]
  const maxCount = peakRow?.withPatient ?? 1

  // Find the range of the peak — consecutive hours within 80% of peak
  const peakHour  = peakRow?.hour ?? 0
  let rushStart   = peakHour
  let rushEnd     = peakHour
  for (const r of rows) {
    if (r.withPatient >= maxCount * 0.8) {
      rushStart = Math.min(rushStart, r.hour)
      rushEnd   = Math.max(rushEnd, r.hour)
    }
  }
  const rushLabel = rushStart === rushEnd
    ? hourLabelLong(rushStart)
    : `${hourLabelLong(rushStart)}–${hourLabelLong(rushEnd)}`

  const chartData = rows.map((r) => ({
    hour:        r.hour,
    withPatient: r.withPatient,
    // Only the peak bar gets a LabelList value; others get null so no label renders
    peakLabel:   r.withPatient === maxCount ? r.withPatient : null,
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
            tickFormatter={(h: number) => hourLabelLong(h)}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const hr = (payload[0]?.payload as { hour?: number })?.hour ?? 0
              const v  = payload[0]?.value ?? 0
              return (
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '6px 12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}>
                  {hourLabelLong(hr)} — {String(v)} in use
                </div>
              )
            }}
          />
          <Bar dataKey="withPatient" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={TEAL}
                opacity={maxCount > 0 ? 0.35 + 0.65 * (entry.withPatient / maxCount) : 0.5}
              />
            ))}
            <LabelList
              dataKey="peakLabel"
              position="top"
              style={{ fontSize: 11, fontWeight: 700, fill: TEAL }}
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
            {' '}— when the most {assetLabel.toLowerCase()} are with patients.
            {' '}That&apos;s when any shortage hurts most.
          </Typography>
        </Box>
      )}
    </Box>
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
    <Box>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData} margin={{ top: 20, right: 70, left: -28, bottom: 0 }}>
          <ReferenceArea y1={60} y2={80} fill="#ccfbf1" fillOpacity={0.5} label={{ value: 'Healthy zone: 60–80%', position: 'insideTopLeft', fontSize: 9.5, fill: '#0d9488', dy: 4 }} />
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
            formatter={(v: unknown) => [`${v}%`, 'Utilisation']}
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
              return (
                <text key={p.index} x={p.x + 4} y={p.y} dy={-4} textAnchor="start" fill={TEAL} fontSize={12} fontWeight="bold">
                  {p.value}% this week
                </text>
              )
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

// ── Daily peak bar chart (GF clients) ─────────────────────────────────────────

function DailyPeakChart({
  rows,
  dayOffset,
  onSetDayOffset,
}: {
  rows: IHDailyPeakRow[]
  dayOffset: number
  onSetDayOffset: (offset: number) => void
}) {
  if (rows.length === 0) return null

  const today = new Date()
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  const chartData = rows.map((r) => {
    const rowDate  = new Date(r.year, r.month - 1, r.day)
    const offset   = Math.round((todayMs - rowDate.getTime()) / 86400000)
    const label    = offset === 0
      ? 'Today'
      : rowDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).replace(',', '')
    return { label, peakCount: r.peakCount, offset }
  })

  const maxPeak = Math.max(...chartData.map((d) => d.peakCount), 1)

  return (
    <Box>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} barSize={22} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, maxPeak * 1.15]} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [`${v} assets`, 'Peak concurrent']}
          />
          <Bar dataKey="peakCount" radius={[3, 3, 0, 0]} onClick={(d) => onSetDayOffset((d as unknown as typeof chartData[number]).offset)}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={TEAL}
                opacity={entry.offset === dayOffset ? 1 : 0.35 + 0.55 * (entry.peakCount / maxPeak)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
        Click a bar to see that day&apos;s hourly breakdown above.
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
    <Box>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData} margin={{ top: 20, right: 70, left: -28, bottom: 0 }}>
          <ReferenceArea y1={60} y2={80} fill="#ccfbf1" fillOpacity={0.5} label={{ value: 'Healthy zone: 60–80%', position: 'insideTopLeft', fontSize: 9.5, fill: '#0d9488', dy: 4 }} />
          <ReferenceLine y={60} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <ReferenceLine y={80} stroke="#5eead4" strokeDasharray="4 3" strokeWidth={1} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide domain={[0, 100]} />
          <Tooltip
            cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: unknown) => [`${v}%`, 'Peak utilisation']}
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
              return (
                <text key={p.index} x={p.x + 4} y={p.y} dy={-4} textAnchor="start" fill={TEAL} fontSize={12} fontWeight="bold">
                  {p.value}% {lastItem?.label === 'Today' ? 'today' : 'yesterday'}
                </text>
              )
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
  data:        IHUtilisationData
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
                {offRadar} {label}s haven't been reliably tracked in {days}+ days.{' '}
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
                  Hold off on new purchases until you've recovered the off-radar ones first.
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
  data:                  IHUtilisationData | null
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
  assetTypeUtilisation:  IHAssetTypeRow[]
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
  assetTypeUtilisation,
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

  const { total, withPatient, cleaning, hardToFind, sittingUnused } = data
  // For GF clients (Halifax), hoursBasedPct reflects average session-hours in patient zones per day.
  // Count-based (withPatient/total) is used only when no hours data is available (BSA fallback).
  const utilisationPct = data.hoursBasedPct ?? (total > 0 ? (withPatient / total) * 100 : 0)
  const assetLabel     = assetType ?? 'equipment'
  // nPatient is derived from utilisationPct so the icon grid and the % stat are always consistent
  const nPatient       = Math.round(utilisationPct / 10)
  const narrativeJSX   = getNarrativeJSX(utilisationPct, assetLabel, nPatient, TEAL)

  // Compute actual date range label — abbreviated months to prevent wrapping
  const dateRangeLabel = (() => {
    const to   = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
    const fmt  = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(from)} – ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  })()

  // Flip stat cards — peak / freeable / idle values
  const peak        = peakData?.count ?? withPatient
  const idleAtPeak  = Math.max(0, total - peak)
  const peakPct     = total > 0 ? Math.round((peak / total) * 100) : 0
  const uv          = unitValue ?? 0
  const buf         = spareBuffer ?? 0
  const freeable    = Math.max(0, total - (peak + buf))
  const freeablePct = total > 0 ? Math.round((freeable / total) * 100) : 0
  const showCard3   = uv > 0 && peak > 0

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
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
                {utilisationPct.toFixed(0)}
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
                Each bar's length is that group's share of the fleet; every pin is one {assetType ? assetType.toLowerCase().replace(/s$/, '') : 'device'} in ten.
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
            why:    `All ${assetLabel.toLowerCase()} with an active TrueSpot tag and at least one recent location ping across your facility.`,
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

        const card3Faces: StatFace[] = showCard3 ? [
          {
            metric: fmtMoney(freeable * uv),
            suffix: 'freeable',
            why:    `Freeable count (${freeable.toLocaleString()}) × unit cost ($${uv.toLocaleString()}) = ${fmtMoney(freeable * uv)} worth of equipment beyond what you actually need.`,
          },
          {
            metric: freeable.toLocaleString(),
            suffix: `${assetLabel.toLowerCase().replace(/s$/, '')}s too many`,
            why:    `Total (${total.toLocaleString()}) − peak demand (${peak.toLocaleString()}) − safety buffer (${buf}) = ${freeable.toLocaleString()} more ${assetLabel.toLowerCase()} than required.`,
          },
          {
            metric: `${freeablePct}%`,
            suffix: 'of the fleet',
            why:    `Freeable count (${freeable.toLocaleString()}) ÷ total fleet (${total.toLocaleString()}) = ${freeablePct}% of your tagged fleet is beyond what peak demand requires.`,
          },
        ] : []

        return (
          <FlipStatCards
            card1={{
              label:       peakData ? 'Your busiest moment' : 'With patients',
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
              description: `The value of roughly ${freeable.toLocaleString()} ${assetLabel.toLowerCase()} beyond your busiest day plus a comfortable cushion of ${buf} spares.`,
            } : null}
          />
        )
      })()}

      {/* ── Usage by equipment type + right panels ────────────────────────────── */}
      {assetTypeUtilisation.length > 0 && (
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
              {assetTypeUtilisation.map((row) => (
                <EquipmentRow
                  key={row.assetType}
                  row={row}
                  isSelected={assetType === row.assetType}
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
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5, mb: isGeofenceBased ? 1.5 : 2 }}>
                {(() => {
                  if (!isGeofenceBased) {
                    return `${assetType ?? 'Equipment'} with patients at each hour of the day`
                  }
                  const d = new Date()
                  d.setDate(d.getDate() - dayOffset)
                  const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
                  const monDay  = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  return `${assetType ?? 'Pumps'} with patients at each hour on ${dayName} ${monDay}`
                })()}
              </Typography>

              {/* S — 7-day chip row (GF clients only) */}
              {isGeofenceBased && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
                  {Array.from({ length: 7 }, (_, i) => {
                    const offset = 6 - i
                    const d      = new Date()
                    d.setDate(d.getDate() - offset)
                    const isToday    = offset === 0
                    const isSelected = dayOffset === offset
                    const label      = isToday
                      ? 'Today'
                      : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
                    return (
                      <Box
                        key={offset}
                        onClick={() => onSetDayOffset(offset)}
                        sx={{
                          px:           1.5,
                          py:           0.5,
                          borderRadius: 6,
                          fontSize:     11.5,
                          fontWeight:   isSelected ? 700 : 500,
                          cursor:       'pointer',
                          bgcolor:      isSelected ? TEAL : '#f1f5f9',
                          color:        isSelected ? '#fff' : '#475569',
                          border:       `1.5px solid ${isSelected ? TEAL : 'transparent'}`,
                          transition:   'all 0.12s',
                          '&:hover': {
                            bgcolor: isSelected ? TEAL : '#e2e8f0',
                          },
                        }}
                      >
                        {label}
                      </Box>
                    )
                  })}
                </Box>
              )}

              {loading ? (
                <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
              ) : hourlyRows.length > 0 ? (
                <HourByHourChart rows={hourlyRows} assetLabel={assetType ?? 'equipment'} />
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
                  : `Daily peak utilisation, last 7 days`}
              </Typography>
              {loading ? (
                <Skeleton variant="rectangular" height={150} sx={{ borderRadius: 2 }} />
              ) : weeklyTrend.length >= 4 ? (
                <WeeklyTrendChart rows={weeklyTrend} />
              ) : dailyPeakRows.length > 0 ? (
                <DailyLineChart rows={dailyPeakRows} total={data.total} dayOffset={dayOffset} onSetDayOffset={onSetDayOffset} />
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
              {' '}tracked in real time by TrueSpot. Utilisation figures reflect session time in each zone type over the selected period. Dollar figures use the unit value you configured — they are directional, not accounting.{' '}
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
