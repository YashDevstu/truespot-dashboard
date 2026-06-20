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

// Time ticks at geofence-transition boundaries.
// Falls back to evenly-spaced ticks when transitions are too dense.
function buildTimeTicks(stops: Stop[], minMs: number, maxMs: number, maxTicks = 6) {
  const totalMs = maxMs - minMs || 1
  const toPct = (ms: number) => ((ms - minMs) / totalMs) * 100

  // Collect geofence change times
  const times = new Set<number>([minMs, maxMs])
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].geofence !== stops[i - 1].geofence) times.add(stops[i].startMs)
  }

  let sorted = [...times].sort((a, b) => a - b)

  // If there are more transitions than maxTicks, sample evenly
  if (sorted.length > maxTicks) {
    const step = (sorted.length - 1) / (maxTicks - 1)
    const sampled = [sorted[0]]
    for (let i = 1; i < maxTicks - 1; i++) sampled.push(sorted[Math.round(i * step)])
    sampled.push(sorted[sorted.length - 1])
    sorted = sampled
  }

  return sorted.map((ms, i, arr) => ({
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

// ── JourneyTimeline ───────────────────────────────────────────────────────────
interface JourneyTimelineProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  dateLabel?: string           // e.g. "TODAY'S JOURNEY"
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
  const { stops, uniqueGeofences, minMs, maxMs, timeTicks } = useMemo(() => {
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
      return { stops: [], uniqueGeofences: [], minMs: 0, maxMs: 0, timeTicks: [] }
    }

    const minMs = parsed[0].startMs
    const maxMs = parsed.reduce((m, s) => (s.endMs > m ? s.endMs : m), parsed[0].endMs)

    return {
      stops: parsed,
      uniqueGeofences: [...new Set(parsed.map((s) => s.geofence))].filter(Boolean),
      minMs,
      maxMs,
      timeTicks: buildTimeTicks(parsed, minMs, maxMs, 6),
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
          sx={{
            fontWeight: 700,
            letterSpacing: 1.5,
            color: 'text.secondary',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          {dateLabel}
        </Typography>
        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled', flexShrink: 0 }} />
        <Typography variant="caption" color="text.disabled">
          click a segment to select
        </Typography>
      </Box>

      {/* Single timeline bar */}
      <Box
        sx={{
          position: 'relative',
          height: 48,
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: 'grey.100',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {stops.map((stop, i) => (
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
              onClick={() => onSelectIndex?.(selectedIndex === i ? null : i)}
              sx={{
                position: 'absolute',
                left: toLeft(stop.startMs),
                width: toWidth(stop.startMs, stop.endMs),
                top: 0,
                bottom: 0,
                bgcolor: colorMap.get(stop.geofence) ?? '#9E9E9E',
                cursor: 'pointer',
                // White right-edge separator so adjacent same-colour stops are distinguishable
                borderRight: i < stops.length - 1 ? '1.5px solid rgba(255,255,255,0.7)' : 'none',
                outline: selectedIndex === i ? '3px solid rgba(255,255,255,0.85)' : 'none',
                outlineOffset: '-3px',
                transition: 'filter 0.15s',
                '&:hover': { filter: 'brightness(0.82)', zIndex: 1 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {stop.minutes >= 60 && (
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
                  {fmtDuration(stop.minutes)}
                </Typography>
              )}
            </Box>
          </Tooltip>
        ))}
      </Box>

      {/* Time axis */}
      <Box sx={{ position: 'relative', height: 20, mt: 0.5 }}>
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
            {/* Tick mark */}
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
            <Box
              sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: colorMap.get(g) ?? '#9E9E9E', flexShrink: 0 }}
            />
            <Typography variant="caption" color="text.secondary">
              {g}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
