'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'

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

// ── types ─────────────────────────────────────────────────────────────────────
interface Stop {
  geofence: string
  subZone: string
  floorLevel: string
  startMs: number
  endMs: number
  minutes: number
}

const COLUMNS = ['#', 'GEOFENCE', 'SUBZONE', 'TIME RANGE', 'DURATION'] as const
const GRID = '40px 1fr 1fr 195px 100px'

// ── LocationsVisitedTable ─────────────────────────────────────────────────────
interface LocationsVisitedTableProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  showLive?: boolean       // mark the last stop as Live
  selectedIndex?: number | null
  onSelectRow?: (index: number | null) => void
}

export default function LocationsVisitedTable({
  rows,
  colorMap,
  showLive = false,
  selectedIndex,
  onSelectRow,
}: LocationsVisitedTableProps) {
  const stops: Stop[] = useMemo(
    () =>
      rows
        .map((r) => {
          const startMs = parseMs(r['[StartTime]'])
          const endMs = parseMs(r['[EndTime]'])
          if (startMs === null || endMs === null) return null
          return {
            geofence: String(r['[Geofence]'] ?? ''),
            subZone: String(r['[SubGeoZone]'] ?? ''),
            floorLevel: String(r['[FloorLevel]'] ?? ''),
            startMs,
            endMs,
            minutes: Number(r['[MinutesDiff]'] ?? 0),
          }
        })
        .filter((s): s is Stop => s !== null)
        .sort((a, b) => a.startMs - b.startMs),
    [rows]
  )

  if (stops.length === 0) return null

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Table header */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Locations visited
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Sorted by visit order
        </Typography>
      </Box>

      {/* Column labels */}
      <Box
        sx={{
          px: 2.5,
          py: 1,
          display: 'grid',
          gridTemplateColumns: GRID,
          gap: 1,
          bgcolor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {COLUMNS.map((h) => (
          <Typography
            key={h}
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.disabled', letterSpacing: 0.8, fontSize: 10 }}
          >
            {h}
          </Typography>
        ))}
      </Box>

      {/* Data rows */}
      {stops.map((stop, i) => {
        const isLive = showLive && i === stops.length - 1
        const isSelected = selectedIndex === i

        return (
          <Box
            key={i}
            onClick={() => onSelectRow?.(isSelected ? null : i)}
            sx={{
              px: 2.5,
              py: 1.5,
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 1,
              alignItems: 'center',
              bgcolor: isSelected
                ? '#E3F2FD'
                : isLive
                ? '#E8F5E9'
                : 'transparent',
              borderBottom: '1px solid',
              borderColor: 'divider',
              '&:last-child': { borderBottom: 'none' },
              cursor: 'pointer',
              transition: 'background-color 0.12s',
              '&:hover': {
                bgcolor: isSelected ? '#BBDEFB' : isLive ? '#C8E6C9' : 'grey.50',
              },
            }}
          >
            {/* # */}
            <Typography variant="body2" color="text.disabled" sx={{ fontWeight: 500 }}>
              {i + 1}
            </Typography>

            {/* Geofence */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: colorMap.get(stop.geofence) ?? '#9E9E9E',
                  flexShrink: 0,
                }}
              />
              <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stop.geofence || '—'}
              </Typography>
            </Box>

            {/* Subzone + floor level code */}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stop.subZone || '—'}
              </Typography>
              {stop.floorLevel && (
                <Typography variant="caption" color="text.disabled">
                  {stop.floorLevel}
                </Typography>
              )}
            </Box>

            {/* Time range */}
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {fmtTime(stop.startMs)}
              {' → '}
              {isLive ? (
                <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>
                  now
                </Box>
              ) : (
                fmtTime(stop.endMs)
              )}
            </Typography>

            {/* Duration + Live badge */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isLive ? 700 : 500,
                  color: isLive ? 'success.main' : 'text.primary',
                }}
              >
                {fmtDuration(stop.minutes)}
              </Typography>
              {isLive && (
                <Chip
                  label="Live"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    bgcolor: 'success.main',
                    color: '#fff',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
            </Box>
          </Box>
        )
      })}
    </Paper>
  )
}
