'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'

// ── helpers ───────────────────────────────────────────────────────────────────
function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

// Hour-boundary ticks with auto-scaling interval.
// Falls back to start/end only when the range is very short.
function buildTimeTicks(minMs: number, maxMs: number) {
  const range = maxMs - minMs || 1
  const rangeHours = range / 3_600_000

  const intervalMs =
    rangeHours <= 1   ? 15 * 60_000      // 15 min
    : rangeHours <= 3 ? 30 * 60_000      // 30 min
    : rangeHours <= 6 ? 3_600_000        // 1 h
    : rangeHours <= 12 ? 2 * 3_600_000   // 2 h
    : rangeHours <= 24 ? 4 * 3_600_000   // 4 h
    : 6 * 3_600_000                       // 6 h

  // Find first multiple of intervalMs that falls inside the range
  const firstTick = Math.ceil(minMs / intervalMs) * intervalMs
  const candidates: number[] = []
  for (let ms = firstTick; ms < maxMs; ms += intervalMs) {
    candidates.push(ms)
  }

  // Drop any tick too close (< 5 % of range) to the start or end labels
  const minGap = range * 0.05
  const filtered = candidates.filter(
    (ms) => ms - minMs > minGap && maxMs - ms > minGap
  )

  const times = [minMs, ...filtered, maxMs]
  const toPct = (ms: number) => ((ms - minMs) / range) * 100

  return times.map((ms, i, arr) => ({
    pct: toPct(ms),
    label: fmtTime(ms),
    isFirst: i === 0,
    isLast: i === arr.length - 1,
  }))
}

// ── types ─────────────────────────────────────────────────────────────────────
interface Stop {
  geofence: string
  subZone: string
  startMs: number
  endMs: number
  minutes: number
}

// Consecutive stops that share the same geofence are merged into one visual block.
// This keeps the bar readable even when the same asset ping-pongs between sub-zones.
interface VisualBlock {
  geofence: string
  startMs: number
  endMs: number
  totalMinutes: number
  stopCount: number
}

function mergeGeofenceRuns(stops: Stop[]): VisualBlock[] {
  if (stops.length === 0) return []
  const blocks: VisualBlock[] = []
  let cur: VisualBlock = {
    geofence: stops[0].geofence,
    startMs: stops[0].startMs,
    endMs: stops[0].endMs,
    totalMinutes: stops[0].minutes,
    stopCount: 1,
  }
  for (let i = 1; i < stops.length; i++) {
    const s = stops[i]
    if (s.geofence === cur.geofence) {
      cur.endMs = s.endMs
      cur.totalMinutes += s.minutes
      cur.stopCount++
    } else {
      blocks.push(cur)
      cur = { geofence: s.geofence, startMs: s.startMs, endMs: s.endMs, totalMinutes: s.minutes, stopCount: 1 }
    }
  }
  blocks.push(cur)
  return blocks
}

// ── JourneyTimeline ───────────────────────────────────────────────────────────
interface JourneyTimelineProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  dateLabel?: string
  selectedIndex?: number | null
  onSelectIndex?: (i: number | null) => void
}

export default function JourneyTimeline({
  rows,
  colorMap,
  dateLabel = "TODAY'S JOURNEY",
  selectedIndex,
  onSelectIndex,
}: JourneyTimelineProps) {
  const { stops, blocks, uniqueGeofences, minMs, maxMs, timeTicks } = useMemo(() => {
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
      .sort((a, b) => a.startMs - b.startMs)

    if (parsed.length === 0) {
      return { stops: [], blocks: [], uniqueGeofences: [], minMs: 0, maxMs: 0, timeTicks: [] }
    }

    const minMs = parsed[0].startMs
    const maxMs = parsed.reduce((m, s) => (s.endMs > m ? s.endMs : m), parsed[0].endMs)

    return {
      stops: parsed,
      blocks: mergeGeofenceRuns(parsed),
      uniqueGeofences: [...new Set(parsed.map((s) => s.geofence))].filter(Boolean),
      minMs,
      maxMs,
      timeTicks: buildTimeTicks(minMs, maxMs),
    }
  }, [rows])

  if (stops.length === 0) {
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

  const totalMs = maxMs - minMs || 1
  const toLeft = (ms: number) => `${((ms - minMs) / totalMs) * 100}%`
  const toWidth = (s: number, e: number) => `${Math.max(0.3, ((e - s) / totalMs) * 100)}%`

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', textTransform: 'uppercase', lineHeight: 1 }}
        >
          {dateLabel}
        </Typography>
        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
        <Typography variant="caption" color="text.disabled">
          click a segment to select
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.disabled">
          {stops.length} stop{stops.length !== 1 ? 's' : ''} · {uniqueGeofences.length} geofence{uniqueGeofences.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Single timeline bar — merged geofence blocks */}
      <Box
        sx={{
          position: 'relative',
          height: 48,
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: 'grey.100',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        {blocks.map((block, i) => {
          const color = colorMap.get(block.geofence) ?? '#9E9E9E'
          const isSelected = selectedIndex === i

          return (
            <Tooltip
              key={i}
              arrow
              placement="top"
              title={
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                    {block.geofence}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
                    {fmtTime(block.startMs)} – {fmtTime(block.endMs)}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                    {fmtDuration(block.totalMinutes)}
                    {block.stopCount > 1 ? ` · ${block.stopCount} stops` : ''}
                  </Typography>
                </Box>
              }
            >
              <Box
                onClick={() => onSelectIndex?.(isSelected ? null : i)}
                sx={{
                  position: 'absolute',
                  left: toLeft(block.startMs),
                  width: toWidth(block.startMs, block.endMs),
                  top: 0,
                  bottom: 0,
                  bgcolor: color,
                  cursor: 'pointer',
                  // White gap between blocks — only where geofence changes
                  borderRight: i < blocks.length - 1 ? '2px solid rgba(255,255,255,0.85)' : 'none',
                  // Selection ring
                  outline: isSelected ? '3px solid rgba(255,255,255,0.9)' : 'none',
                  outlineOffset: '-3px',
                  transition: 'filter 0.15s',
                  '&:hover': { filter: 'brightness(0.82)', zIndex: 1 },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {/* Duration label inside wide-enough blocks */}
                {block.totalMinutes >= 60 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      px: 0.5,
                      textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                    }}
                  >
                    {fmtDuration(block.totalMinutes)}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          )
        })}
      </Box>

      {/* Time axis */}
      <Box sx={{ position: 'relative', height: 22, mt: 0.5 }}>
        {timeTicks.map((tick, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              left: `${tick.pct}%`,
              transform: tick.isFirst ? 'none' : tick.isLast ? 'translateX(-100%)' : 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: tick.isFirst ? 'flex-start' : tick.isLast ? 'flex-end' : 'center',
            }}
          >
            <Box sx={{ width: 1, height: 4, bgcolor: 'divider', mb: 0.25 }} />
            <Typography
              variant="caption"
              sx={{ fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap', userSelect: 'none' }}
            >
              {tick.label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Legend */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          alignItems: 'center',
        }}
      >
        {uniqueGeofences.map((g) => (
          <Box key={g} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colorMap.get(g) ?? '#9E9E9E', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">
              {g}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
