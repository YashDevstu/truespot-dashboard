'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'

// ─── colour palette ──────────────────────────────────────────────────────────
const STOP_COLORS = [
  '#4A90D9', // blue
  '#9B59B6', // purple
  '#27AE60', // green
  '#E67E22', // orange
  '#E74C3C', // red
  '#1ABC9C', // teal
  '#E91E63', // pink
  '#8BC34A', // lime
  '#FF5722', // deep-orange
  '#607D8B', // blue-grey
]

function buildColorMap(geofences: string[]): Map<string, string> {
  const map = new Map<string, string>()
  ;[...new Set(geofences)].forEach((g, i) => map.set(g, STOP_COLORS[i % STOP_COLORS.length]))
  return map
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
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

function fmtTick(ms: number, prevMs: number | null): string {
  const time = fmtTime(ms)
  if (prevMs === null) return time
  // If this tick crosses a day boundary, prefix with the date
  if (new Date(prevMs).getDate() !== new Date(ms).getDate()) {
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
  }
  return time
}

// ─── types ────────────────────────────────────────────────────────────────────
interface Stop {
  geofence: string
  subZone: string
  startMs: number
  endMs: number
  minutes: number
  beaconId: string
  vin: string
  stockNumber: string
}

interface Gap {
  startMs: number
  endMs: number
  minutes: number
}

interface JourneyTimelineProps {
  rows: Record<string, unknown>[]
  /** Label shown in the header — typically the BeaconId, VIN, or Stock Number filter value. */
  selectedAsset?: string
}

// ─── component ───────────────────────────────────────────────────────────────
export default function JourneyTimeline({ rows, selectedAsset }: JourneyTimelineProps) {
  const { stops, gaps, colorMap, minMs, totalMs, ticks, nowLeft } = useMemo(() => {
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
          beaconId: String(r['[BeaconId]'] ?? ''),
          vin: String(r['[VIN]'] ?? ''),
          stockNumber: String(r['[StockNumber]'] ?? ''),
        }
      })
      .filter((s): s is Stop => s !== null)
      .sort((a, b) => a.startMs - b.startMs)

    if (parsed.length === 0) {
      return { stops: [], gaps: [], colorMap: new Map(), minMs: 0, totalMs: 0, ticks: [], nowLeft: null }
    }

    const minMs = parsed[0].startMs
    const maxMs = Math.max(...parsed.map((s) => s.endMs))
    const totalMs = maxMs - minMs

    // Detect untracked gaps (> 1 min between consecutive stop end and next start)
    const gaps: Gap[] = []
    for (let i = 1; i < parsed.length; i++) {
      const gapMs = parsed[i].startMs - parsed[i - 1].endMs
      if (gapMs > 60_000) {
        gaps.push({ startMs: parsed[i - 1].endMs, endMs: parsed[i].startMs, minutes: Math.round(gapMs / 60_000) })
      }
    }

    const colorMap = buildColorMap(parsed.map((s) => s.geofence))

    // Time axis ticks every 30 minutes, snapped to the nearest half-hour
    const tickMs: number[] = []
    const tick = new Date(minMs)
    tick.setMinutes(Math.ceil(tick.getMinutes() / 30) * 30, 0, 0)
    while (tick.getTime() <= maxMs) {
      tickMs.push(tick.getTime())
      tick.setMinutes(tick.getMinutes() + 30)
    }

    // "Now" marker position (null when outside today's data range)
    const now = Date.now()
    const nowLeft = now >= minMs && now <= maxMs ? `${((now - minMs) / totalMs) * 100}%` : null

    return { stops: parsed, gaps, colorMap, minMs, totalMs, ticks: tickMs, nowLeft }
  }, [rows])

  // ── placeholder when no asset is identified ──────────────────────────────
  if (rows.length === 0 || stops.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 3, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
      >
        <TimelineIcon sx={{ fontSize: 28 }} />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Journey Timeline
          </Typography>
          <Typography variant="caption">
            {rows.length === 0
              ? 'No data loaded yet — select a date and apply filters to begin.'
              : 'No timeline data could be built from the current rows (timestamps missing or invalid).'}
          </Typography>
        </Box>
      </Paper>
    )
  }

  const pctLeft = (ms: number) => `${((ms - minMs) / totalMs) * 100}%`
  const pctWidth = (startMs: number, endMs: number) => `${((endMs - startMs) / totalMs) * 100}%`

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TimelineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 0.8, color: 'text.secondary', textTransform: 'uppercase' }}
        >
          Journey Timeline · {stops.length} stop{stops.length !== 1 ? 's' : ''}
          {selectedAsset ? ` · ${selectedAsset}` : ''}
        </Typography>
      </Box>

      {/* Timeline */}
      <Box sx={{ position: 'relative' }}>
        {/* Bar track */}
        <Box sx={{ position: 'relative', height: 44 }}>
          {/* Background */}
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'grey.100', borderRadius: 1 }} />

          {/* Stop blocks */}
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
                    {fmtTime(stop.startMs)} → {fmtTime(stop.endMs)}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    Duration: {fmtDuration(stop.minutes)}
                  </Typography>
                </Box>
              }
            >
              <Box
                sx={{
                  position: 'absolute',
                  left: pctLeft(stop.startMs),
                  width: pctWidth(stop.startMs, stop.endMs),
                  minWidth: 4,
                  top: 2,
                  bottom: 2,
                  bgcolor: colorMap.get(stop.geofence),
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'default',
                  px: 0.5,
                  transition: 'opacity 0.15s',
                  '&:hover': { opacity: 0.8 },
                }}
              >
                <Typography variant="caption" sx={{ color: 'white', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
                  {fmtDuration(stop.minutes)}
                </Typography>
              </Box>
            </Tooltip>
          ))}

          {/* Untracked gaps */}
          {gaps.map((gap, i) => (
            <Tooltip key={`gap-${i}`} arrow placement="top" title={`Untracked · ${fmtDuration(gap.minutes)}`}>
              <Box
                sx={{
                  position: 'absolute',
                  left: pctLeft(gap.startMs),
                  width: pctWidth(gap.startMs, gap.endMs),
                  minWidth: 4,
                  top: 2,
                  bottom: 2,
                  background: 'repeating-linear-gradient(45deg,#FFFDE7 0px,#FFFDE7 5px,#FFC107 5px,#FFC107 10px)',
                  border: '1.5px dashed #FFC107',
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'default',
                  fontSize: 13,
                }}
              >
                ⚠
              </Box>
            </Tooltip>
          ))}

          {/* "Now" marker */}
          {nowLeft && (
            <Box sx={{ position: 'absolute', left: nowLeft, top: -16, bottom: -6, width: 2, bgcolor: 'error.main', zIndex: 10 }}>
              <Typography
                variant="caption"
                sx={{ position: 'absolute', top: 0, left: 4, color: 'error.main', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}
              >
                Now
              </Typography>
            </Box>
          )}
        </Box>

        {/* Time axis */}
        <Box sx={{ position: 'relative', height: 22, mt: 0.5 }}>
          {ticks.map((ms, i) => (
            <Typography
              key={i}
              variant="caption"
              sx={{
                position: 'absolute',
                left: pctLeft(ms),
                transform: 'translateX(-50%)',
                color: 'text.disabled',
                fontSize: 10,
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              {fmtTick(ms, i > 0 ? ticks[i - 1] : null)}
            </Typography>
          ))}
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2, alignItems: 'center' }}>
        {[...colorMap.entries()].map(([geofence, color]) => (
          <Box key={geofence} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: color, borderRadius: '2px', flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">
              {geofence}
            </Typography>
          </Box>
        ))}
        {gaps.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                background: 'repeating-linear-gradient(45deg,#FFFDE7 0px,#FFFDE7 3px,#FFC107 3px,#FFC107 6px)',
                border: '1px dashed #FFC107',
                borderRadius: '2px',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" color="text.secondary">
              ⚠ Untracked
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  )
}
