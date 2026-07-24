'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import FirstPageIcon from '@mui/icons-material/FirstPage'
import LastPageIcon from '@mui/icons-material/LastPage'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import LocationOffIcon from '@mui/icons-material/LocationOff'
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt'
import ScheduleIcon from '@mui/icons-material/Schedule'
import { parsePings, mergeConsecutiveStops } from '@/utils/stops'
import { toTitleCase } from '@/utils/formatters'

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

function fmtDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateLabel(startMs: number, endMs: number): string {
  const startDay = new Date(startMs).toDateString()
  const endDay   = new Date(endMs).toDateString()
  if (startDay === endDay) return fmtDateShort(startMs)
  return `${fmtDateShort(startMs)} → ${fmtDateShort(endMs)}`
}

function fmtDuration(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${minutes}m`
}

const pulseRing = {
  '@keyframes pulseRing': {
    '0%': { transform: 'scale(1)', opacity: 0.8 },
    '70%': { transform: 'scale(2.2)', opacity: 0 },
    '100%': { transform: 'scale(2.2)', opacity: 0 },
  },
} as const

// ── types ─────────────────────────────────────────────────────────────────────
type SortMode = 'live' | 'oldest' | 'duration'

interface Stop {
  geofence: string
  subZone: string
  floorLevel: string
  assetType: 'Vehicle' | 'Key' | 'Mixed'
  make: string
  model: string
  year: string
  vin: string
  startMs: number
  endMs: number
  totalMinutes: number
}

function AssetIcon({ assetType }: { assetType: string }) {
  const isKey = assetType.toLowerCase() === 'key'
  const bg    = isKey ? 'rgba(245,158,11,0.13)' : 'rgba(59,130,246,0.13)'
  const border= isKey ? 'rgba(245,158,11,0.45)' : 'rgba(59,130,246,0.45)'
  const color = isKey ? '#f59e0b' : '#3b82f6'
  return (
    <Box sx={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      bgcolor: bg, border: '1.5px solid', borderColor: border,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {isKey
        ? <VpnKeyIcon sx={{ fontSize: 12, color }} />
        : <DirectionsCarIcon sx={{ fontSize: 12, color }} />
      }
    </Box>
  )
}

// Small pill-shaped sort button
function SortPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        border: '1px solid',
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? 'primary.main' : 'transparent',
        color: active ? '#fff' : 'text.secondary',
        borderRadius: '999px',
        px: 1.5,
        py: 0.4,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        lineHeight: 1.5,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        transition: 'background-color 0.15s, border-color 0.15s, color 0.15s',
        '&:hover': {
          bgcolor: active ? 'primary.dark' : 'grey.100',
          borderColor: active ? 'primary.dark' : 'grey.400',
        },
      }}
    >
      {label}
    </Box>
  )
}

const COLUMNS = ['#', 'VEHICLE', 'GEOFENCE', 'SUBZONE', 'TIME RANGE', 'DURATION'] as const
// Kept deliberately narrow so the table fits inside the map+table split view.
// The header/row region below also gets its own overflowX:'auto' wrapper as a
// safety net — if a container is ever narrower than this, only the table
// scrolls internally instead of blowing out the whole page's layout.
const GRID = '26px minmax(76px, 110px) minmax(130px, 1.3fr) minmax(130px, 1.3fr) 132px minmax(76px, 110px)'

// Numeric/time values use tabular figures (not a separate monospace font —
// that would clash with the app's typeface) so digits stay aligned as they change.
const TABULAR_NUMS = { fontVariantNumeric: 'tabular-nums' } as const

// Standard 2-line clamp for long location names — shows meaningfully more
// text than a single-line ellipsis without needing a hover to read it.
const CLAMP_2_LINES = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
}
const PAGE_SIZE = 5

// ── LocationsVisitedTable ─────────────────────────────────────────────────────
interface LocationsVisitedTableProps {
  rows: Record<string, unknown>[]
  colorMap: Map<string, string>
  showLive?: boolean
  selectedStartMs?: number | null
  onSelectRow?: (startMs: number | null) => void
  loading?: boolean
}

export default function LocationsVisitedTable({
  rows,
  colorMap,
  showLive = false,
  selectedStartMs,
  onSelectRow,
  loading,
}: LocationsVisitedTableProps) {
  const [sortMode, setSortMode] = useState<SortMode>(showLive ? 'live' : 'oldest')
  const [collapsed, setCollapsed] = useState(false)
  const [page, setPage] = useState(0)

  const { stops, liveStop, liveByVin, isMultiVehicle } = useMemo(() => {
    // Use the same merge logic as the dashboard/map so startMs values align exactly.
    // This fixes table→map selection: stop.startMs === mergedStop.startMs always.
    const merged = mergeConsecutiveStops(parsePings(rows))

    const parsed: Stop[] = merged.map((m) => {
      // Find the first raw row in this merged stop's window to get display fields
      const rawRow = rows.find((r) => {
        const t = parseMs(r['[StartTime]'])
        return t !== null && t >= m.startMs && t <= m.endMs &&
               String(r['[Geofence]'] ?? '') === m.geofence
      })
      return {
        geofence:     m.geofence,
        subZone:      m.subGeoZone,
        floorLevel:   String(rawRow?.['[FloorLevel]'] ?? ''),
        assetType:    m.assetType,
        make:         toTitleCase(String(rawRow?.['[Make]']        ?? '')),
        model:        toTitleCase(String(rawRow?.['[Model]']       ?? '')),
        year:         String(rawRow?.['[Year]']        ?? ''),
        vin:          String(rawRow?.['[VIN]']         ?? ''),
        startMs:      m.startMs,
        endMs:        m.endMs,
        totalMinutes: m.totalMinutes,
      }
    })

    // Per-VIN most-recent startMs — each vehicle's own live stop
    const liveByVin = new Map<string, number>()
    if (showLive) {
      for (const s of parsed) {
        const cur = liveByVin.get(s.vin)
        if (cur === undefined || s.startMs > cur) liveByVin.set(s.vin, s.startMs)
      }
    }
    const isMultiVehicle = liveByVin.size > 1

    // Single-vehicle banner: the one globally-most-recent stop
    const maxStartMs = parsed.length > 0 ? Math.max(...parsed.map((s) => s.startMs)) : -Infinity
    const liveStop   = showLive && !isMultiVehicle
      ? (parsed.find((s) => s.startMs === maxStartMs) ?? null)
      : null

    let sorted: Stop[]
    switch (sortMode) {
      case 'live':
        sorted = [...parsed].sort((a, b) => b.startMs - a.startMs)
        break
      case 'oldest':
        sorted = [...parsed].sort((a, b) => a.startMs - b.startMs)
        break
      case 'duration':
        sorted = [...parsed].sort((a, b) => b.totalMinutes - a.totalMinutes)
        break
      default:
        sorted = [...parsed].sort((a, b) => a.startMs - b.startMs)
    }

    return { stops: sorted, liveStop, liveByVin, isMultiVehicle }
  }, [rows, sortMode, showLive])

  const pageCount = Math.max(1, Math.ceil(stops.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pagedStops = stops.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  if (stops.length === 0) {
    if (loading) {
      return (
        <Paper variant="outlined" sx={{ borderRadius: 2 }}>
          <Box sx={{ px: 2.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Skeleton width={140} height={20} />
            <Skeleton width={50} height={16} sx={{ ml: 0.5 }} />
          </Box>
          <Box sx={{ px: 2.5, py: 1, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', display: 'grid', gridTemplateColumns: GRID, gap: 1 }}>
            {COLUMNS.map((h) => (
              <Skeleton key={h} width={60} height={12} />
            ))}
          </Box>
          {Array.from({ length: 5 }).map((_, i) => (
            <Box key={i} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'grid', gridTemplateColumns: GRID, gap: 1, alignItems: 'center', '&:last-child': { borderBottom: 'none' } }}>
              <Skeleton width={20} height={16} />
              <Skeleton width={110} height={16} />
              <Skeleton width={120} height={16} />
              <Skeleton width={100} height={16} />
              <Skeleton width={130} height={16} />
              <Skeleton width={50} height={16} />
            </Box>
          ))}
        </Paper>
      )
    }
    return (
      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Box sx={{ px: 2.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Locations Visited</Typography>
        </Box>
        <Box sx={{ py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, color: 'text.disabled' }}>
          <LocationOffIcon sx={{ fontSize: 36 }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>No stops recorded</Typography>
          <Typography variant="caption" align="center">No location stops found for this date range.</Typography>
        </Box>
      </Paper>
    )
  }

  const liveColor = liveStop ? colorMap.get(liveStop.geofence) ?? '#9E9E9E' : undefined

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
    setPage(0)
    onSelectRow?.(null)
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2 }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: '8px 8px 0 0' }}>

        {/* Title row — always visible */}
        <Box
          sx={{
            px: 2.5,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            rowGap: 0.75,
            borderBottom: collapsed ? 'none' : '1px solid',
            borderColor: 'divider',
          }}
        >
          {/* Left: title + count — never shrinks */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: '1 1 auto', minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              Locations Visited
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {stops.length} stops
            </Typography>
          </Box>

          {/* Right: sort pills + collapse — wraps onto next line if needed */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
            {showLive && (
              <SortPill label="Live" active={sortMode === 'live'} onClick={() => handleSortChange('live')} />
            )}
            <SortPill label="Oldest first" active={sortMode === 'oldest'} onClick={() => handleSortChange('oldest')} />
            <SortPill label="By duration"  active={sortMode === 'duration'} onClick={() => handleSortChange('duration')} />
            <IconButton
              size="small"
              onClick={() => setCollapsed((v) => !v)}
              sx={{ ml: 0.25 }}
            >
              {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>

        {/* Collapsible: Live banner + column labels */}
        <Collapse in={!collapsed}>
          {/* Live Now banner */}
          {liveStop && (
            <Box
              sx={{
                px: 2.5,
                py: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                bgcolor: '#E8F5E9',
                borderBottom: '2px solid #A5D6A7',
              }}
            >
              {/* Pulsing ring + solid dot */}
              <Box sx={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    bgcolor: 'success.main',
                    ...pulseRing,
                    animation: 'pulseRing 1.8s ease-out infinite',
                  }}
                />
                <Box sx={{ position: 'relative', width: 12, height: 12, borderRadius: '50%', bgcolor: 'success.main' }} />
              </Box>

              {/* Location text */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>Live now</Typography>
                <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'success.light', flexShrink: 0 }} />
                {liveColor && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: liveColor, flexShrink: 0 }} />}
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{liveStop.geofence}</Typography>
                {liveStop.subZone && (
                  <Typography variant="body2" color="text.secondary" noWrap>· {liveStop.subZone}</Typography>
                )}
              </Box>

              {/* Since time */}
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                since {fmtTime(liveStop.startMs)}
              </Typography>
            </Box>
          )}

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
        </Collapse>
      </Box>

      {/* ── Data rows ────────────────────────────────────────────────────── */}
      <Collapse in={!collapsed}>
        {pagedStops.map((stop, i) => {
          const globalIndex = safePage * PAGE_SIZE + i
          // Multi-vehicle: each VIN's own most-recent stop is "live"
          // Single-vehicle: the one globally-most-recent stop is "live"
          const isLive = showLive && (
            isMultiVehicle
              ? stop.startMs === liveByVin.get(stop.vin)
              : liveStop !== null && stop.startMs === liveStop.startMs
          )
          const isSelected = selectedStartMs === stop.startMs
          const dotColor   = colorMap.get(stop.geofence) ?? '#9E9E9E'

          return (
            <Box
              key={`${stop.startMs}-${stop.geofence}-${i}`}
              onClick={() => onSelectRow?.(isSelected ? null : stop.startMs)}
              sx={{
                px: 2.5,
                py: 1.75,
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 1,
                alignItems: 'center',
                bgcolor: isSelected ? '#E3F2FD' : isLive ? '#F1FBF3' : 'transparent',
                borderBottom: '1px solid',
                borderColor: isLive ? '#C8E6C9' : 'divider',
                borderLeft: isLive ? '3px solid' : '3px solid transparent',
                borderLeftColor: isLive ? 'success.main' : 'transparent',
                '&:last-child': { borderBottom: 'none' },
                cursor: 'pointer',
                transitionProperty: 'background-color, box-shadow',
                transitionDuration: '150ms',
                transitionTimingFunction: 'ease-out',
                position: 'relative',
                zIndex: 0,
                '&:hover': {
                  bgcolor: isSelected ? '#BBDEFB' : isLive ? '#E8F5E9' : 'grey.50',
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
                  zIndex: 1,
                },
              }}
            >
              {/* # */}
              <Typography variant="body2" color="text.disabled" sx={{ fontWeight: 500, ...TABULAR_NUMS }}>{globalIndex + 1}</Typography>

              {/* Vehicle */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <AssetIcon assetType={stop.assetType} />
                <Tooltip title={stop.model ? `${stop.model}${stop.year ? ` '${String(stop.year).slice(-2)}` : ''}` : stop.make || ''}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.primary' }}
                  >
                    {stop.model
                      ? `${stop.model}${stop.year ? ` '${String(stop.year).slice(-2)}` : ''}`
                      : stop.make || '—'}
                  </Typography>
                </Tooltip>
              </Box>

              {/* Geofence: colored dot + name, wraps to 2 lines before truncating */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Box sx={{ position: 'relative', width: 10, height: 10, flexShrink: 0, mt: 0.4 }}>
                  {isLive && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        bgcolor: dotColor,
                        ...pulseRing,
                        animation: 'pulseRing 1.8s ease-out infinite',
                      }}
                    />
                  )}
                  <Box sx={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', bgcolor: dotColor }} />
                </Box>
                <Tooltip title={stop.geofence || ''}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: isLive ? 600 : 500, lineHeight: 1.35, ...CLAMP_2_LINES }}
                  >
                    {stop.geofence || '—'}
                  </Typography>
                </Tooltip>
              </Box>

              {/* Subzone + floor level, wraps to 2 lines before truncating */}
              <Box sx={{ minWidth: 0 }}>
                <Tooltip title={stop.subZone || ''}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, lineHeight: 1.35, ...CLAMP_2_LINES }}
                  >
                    {stop.subZone || '—'}
                  </Typography>
                </Tooltip>
                {stop.floorLevel && (
                  <Typography variant="caption" color="text.disabled">{stop.floorLevel}</Typography>
                )}
              </Box>

              {/* Time range: date badge above, icon-linked start/end times below */}
              <Box>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    color: 'text.secondary',
                    bgcolor: 'grey.100',
                    borderRadius: '4px',
                    px: 0.6,
                    py: 0.15,
                    mb: 0.5,
                    lineHeight: 1.4,
                  }}
                >
                  {isLive ? fmtDateShort(stop.startMs) : fmtDateLabel(stop.startMs, stop.endMs)}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, whiteSpace: 'nowrap' }}>
                  <Typography variant="body2" sx={{ color: 'text.primary', fontSize: 13, ...TABULAR_NUMS }}>
                    {fmtTime(stop.startMs)}
                  </Typography>
                  <ArrowRightAltIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
                  {isLive
                    ? <Box component="span" sx={{ color: 'success.main', fontWeight: 700, fontSize: 13, ...TABULAR_NUMS }}>now</Box>
                    : (
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, ...TABULAR_NUMS }}>
                        {fmtTime(stop.endMs)}
                      </Typography>
                    )
                  }
                </Box>
              </Box>

              {/* Duration badge — Live state folded into the same pill instead of a second chip.
                  justifySelf keeps the pill sized to its own content instead of stretching
                  to fill the grid column (CSS Grid's default for items without justify-self). */}
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifySelf: 'start',
                  gap: 0.5,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor: isLive ? 'success.light' : 'divider',
                  bgcolor: isLive ? 'rgba(46, 125, 50, 0.08)' : 'grey.50',
                  px: 1,
                  py: 0.4,
                }}
              >
                {isLive ? (
                  <Box sx={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
                    <Box
                      sx={{
                        position: 'absolute', inset: 0, borderRadius: '50%',
                        bgcolor: 'success.main', ...pulseRing,
                        animation: 'pulseRing 1.8s ease-out infinite',
                      }}
                    />
                    <Box sx={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                  </Box>
                ) : (
                  <ScheduleIcon sx={{ fontSize: 13, color: 'text.disabled', flexShrink: 0 }} />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isLive ? 700 : 600,
                    color: isLive ? 'success.main' : 'text.primary',
                    fontSize: 13,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    ...TABULAR_NUMS,
                  }}
                >
                  {fmtDuration(stop.totalMinutes)}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Collapse>

      {/* ── Pagination footer ─────────────────────────────────────────────── */}
      {!collapsed && pageCount > 1 && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'grey.50',
            borderRadius: '0 0 8px 8px',
          }}
        >
          {/* Left: row range info */}
          <Typography variant="caption" color="text.secondary">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, stops.length)} of {stops.length} stops
          </Typography>

          {/* Right: nav buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Tooltip title="First page">
              <span>
                <IconButton size="small" onClick={() => setPage(0)} disabled={safePage === 0}>
                  <FirstPageIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="Previous page">
              <span>
                <IconButton size="small" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                  <NavigateBeforeIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Typography variant="caption" sx={{ px: 1, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Page {safePage + 1} of {pageCount}
            </Typography>

            <Tooltip title="Next page">
              <span>
                <IconButton size="small" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage === pageCount - 1}>
                  <NavigateNextIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="Last page">
              <span>
                <IconButton size="small" onClick={() => setPage(pageCount - 1)} disabled={safePage === pageCount - 1}>
                  <LastPageIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      )}
    </Paper>
  )
}
