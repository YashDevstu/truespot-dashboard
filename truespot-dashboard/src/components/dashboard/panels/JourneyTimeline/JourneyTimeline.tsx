'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'

// ── colour palette ────────────────────────────────────────────────────────────
const STOP_COLORS = [
  '#4A90D9', '#9B59B6', '#27AE60', '#E67E22', '#E74C3C',
  '#1ABC9C', '#E91E63', '#8BC34A', '#FF5722', '#607D8B',
  '#F39C12', '#2ECC71', '#3498DB', '#8E44AD', '#95A5A6',
]

function buildColorMap(geofences: string[]): Map<string, string> {
  const map = new Map<string, string>()
  ;[...new Set(geofences)].forEach((g, i) => map.set(g, STOP_COLORS[i % STOP_COLORS.length]))
  return map
}

// ── constants ─────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000

const HOUR_TICKS = [
  { h: 0,  label: '12am' },
  { h: 6,  label: '6am'  },
  { h: 12, label: '12pm' },
  { h: 18, label: '6pm'  },
]

// ── types ─────────────────────────────────────────────────────────────────────
interface Stop {
  geofence: string
  subZone: string
  startMs: number
  endMs: number
  minutes: number
}

interface Gap { startMs: number; endMs: number; minutes: number }

interface DayGroup {
  dateLabel: string
  dayStartMs: number
  stops: Stop[]
  gaps: Gap[]
}

// ── helpers ───────────────────────────────────────────────────────────────────
function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function midnightOf(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// Splits a stop that crosses midnight into per-day segments so each day row
// only contains activity that belongs to its calendar date.
function splitByDay(stop: Stop): Stop[] {
  const segments: Stop[] = []
  let cursor = stop.startMs
  while (cursor < stop.endMs) {
    const nextMidnight = midnightOf(cursor) + DAY_MS
    const segEnd = Math.min(nextMidnight, stop.endMs)
    const mins = Math.round((segEnd - cursor) / 60_000)
    if (mins > 0) segments.push({ ...stop, startMs: cursor, endMs: segEnd, minutes: mins })
    cursor = nextMidnight
  }
  return segments
}

function groupByDay(stops: Stop[]): DayGroup[] {
  const map = new Map<number, Stop[]>()

  for (const stop of stops) {
    for (const seg of splitByDay(stop)) {
      const key = midnightOf(seg.startMs)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(seg)
    }
  }

  return [...map.entries()]
    .sort((a, b) => b[0] - a[0]) // newest first
    .map(([dayMs, dayStops]) => {
      const sorted = [...dayStops].sort((a, b) => a.startMs - b.startMs)

      const gaps: Gap[] = []
      for (let i = 1; i < sorted.length; i++) {
        const gapMs = sorted[i].startMs - sorted[i - 1].endMs
        if (gapMs > 60_000) {
          gaps.push({
            startMs: sorted[i - 1].endMs,
            endMs: sorted[i].startMs,
            minutes: Math.round(gapMs / 60_000),
          })
        }
      }

      const date = new Date(dayMs)
      return {
        dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dayStartMs: dayMs,
        stops: sorted,
        gaps,
      }
    })
}

// ── DayRow ────────────────────────────────────────────────────────────────────
// One horizontal row for one calendar date. Fixed 24-hour axis (midnight–midnight)
// keeps all rows visually aligned so patterns across days are easy to compare.
function DayRow({ group, colorMap }: { group: DayGroup; colorMap: Map<string, string> }) {
  const toLeftPct = (ms: number) => {
    const c = Math.max(group.dayStartMs, Math.min(group.dayStartMs + DAY_MS, ms))
    return `${((c - group.dayStartMs) / DAY_MS) * 100}%`
  }

  const toWidthPct = (sMs: number, eMs: number) => {
    const s = Math.max(group.dayStartMs, sMs)
    const e = Math.min(group.dayStartMs + DAY_MS, eMs)
    return `${Math.max(0, (e - s) / DAY_MS) * 100}%`
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
      {/* Date label — fixed 52 px column keeps all bars left-aligned */}
      <Typography
        variant="caption"
        sx={{ width: 52, flexShrink: 0, pt: 0.75, fontSize: 11, color: 'text.secondary' }}
      >
        {group.dateLabel}
      </Typography>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Bar */}
        <Box sx={{ position: 'relative', height: 34 }}>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'grey.100', borderRadius: 1 }} />

          {/* Stop blocks */}
          {group.stops.map((stop, i) => (
            <Tooltip
              key={i}
              arrow
              placement="top"
              title={
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                    {stop.geofence}
                  </Typography>
                  {stop.subZone && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
                      {stop.subZone}
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                    {fmtTime(stop.startMs)} – {fmtTime(stop.endMs)}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    {fmtDuration(stop.minutes)}
                  </Typography>
                </Box>
              }
            >
              <Box
                sx={{
                  position: 'absolute',
                  left: toLeftPct(stop.startMs),
                  width: toWidthPct(stop.startMs, stop.endMs),
                  minWidth: 2,
                  top: 2,
                  bottom: 2,
                  bgcolor: colorMap.get(stop.geofence) ?? '#9E9E9E',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 0.75, zIndex: 1 },
                }}
              >
                {/* Duration label only for stops ≥ 1 h — block is wide enough to read */}
                {stop.minutes >= 60 && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'white', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap', px: 0.25 }}
                  >
                    {fmtDuration(stop.minutes)}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          ))}

          {/* Untracked gaps */}
          {group.gaps.map((gap, i) => (
            <Tooltip key={`gap-${i}`} arrow placement="top" title={`Untracked · ${fmtDuration(gap.minutes)}`}>
              <Box
                sx={{
                  position: 'absolute',
                  left: toLeftPct(gap.startMs),
                  width: toWidthPct(gap.startMs, gap.endMs),
                  minWidth: 3,
                  top: 2,
                  bottom: 2,
                  background: 'repeating-linear-gradient(45deg,#FFFDE7 0,#FFFDE7 5px,#FFC107 5px,#FFC107 10px)',
                  border: '1px dashed #FFC107',
                  cursor: 'default',
                }}
              />
            </Tooltip>
          ))}
        </Box>

        {/* 24-hour axis — same tick positions on every row so days align */}
        <Box sx={{ position: 'relative', height: 16 }}>
          {HOUR_TICKS.map(({ h, label }) => (
            <Typography
              key={h}
              variant="caption"
              sx={{
                position: 'absolute',
                left: `${(h / 24) * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: 9,
                color: 'text.disabled',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

// ── JourneyTimeline ───────────────────────────────────────────────────────────
interface JourneyTimelineProps {
  rows: Record<string, unknown>[]
  selectedAsset?: string
}

export default function JourneyTimeline({ rows, selectedAsset }: JourneyTimelineProps) {
  const { dayGroups, colorMap, totalStops, uniqueGeofences } = useMemo(() => {
    const parsed: Stop[] = rows
      .map((r) => {
        const startMs = parseMs(r['[StartTime]'])
        const endMs = parseMs(r['[EndTime]'])
        if (startMs === null || endMs === null || endMs <= startMs) return null
        return {
          geofence: String(r['[Geofence]'] ?? ''),
          subZone: String(r['[SubGeoZone]'] ?? ''),
          startMs,
          endMs,
          minutes: Number(r['[MinutesDiff]'] ?? 0),
        }
      })
      .filter((s): s is Stop => s !== null)

    return {
      dayGroups: groupByDay(parsed),
      colorMap: buildColorMap(parsed.map((s) => s.geofence)),
      uniqueGeofences: [...new Set(parsed.map((s) => s.geofence))].filter(Boolean),
      totalStops: parsed.length,
    }
  }, [rows])

  if (rows.length === 0 || dayGroups.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
      >
        <TimelineIcon sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
          <Typography variant="caption">No valid timeline data in the current result set.</Typography>
        </Box>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TimelineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase' }}
        >
          Journey Timeline
          {selectedAsset ? ` · ${selectedAsset}` : ''}
          {` · ${totalStops.toLocaleString()} stop${totalStops !== 1 ? 's' : ''}`}
          {` · ${dayGroups.length} day${dayGroups.length !== 1 ? 's' : ''}`}
        </Typography>
      </Box>

      {/* One row per calendar day, newest at top */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {dayGroups.map((group) => (
          <DayRow key={group.dayStartMs} group={group} colorMap={colorMap} />
        ))}
      </Box>

      {/* Legend */}
      <Box
        sx={{
          display: 'flex', flexWrap: 'wrap', gap: 1.5,
          mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider',
          alignItems: 'center',
        }}
      >
        {uniqueGeofences.map((geofence) => (
          <Box key={geofence} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: colorMap.get(geofence), borderRadius: '2px', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{geofence}</Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 10, height: 10, borderRadius: '2px', flexShrink: 0,
              background: 'repeating-linear-gradient(45deg,#FFFDE7 0,#FFFDE7 3px,#FFC107 3px,#FFC107 6px)',
              border: '1px dashed #FFC107',
            }}
          />
          <Typography variant="caption" color="text.secondary">Untracked</Typography>
        </Box>
      </Box>
    </Paper>
  )
}
