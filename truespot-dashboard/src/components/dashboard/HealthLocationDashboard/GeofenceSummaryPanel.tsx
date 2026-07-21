'use client'

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CloseIcon from '@mui/icons-material/Close'
import type { HLGeofenceRow } from '@/hooks/useHealthLocationData'
import { formatDurationMins } from './HealthLocationKpiCards'

const UNKNOWN_GEOFENCE = 'Unknown Geofence'

interface GeofenceSummaryPanelProps {
  rows:             HLGeofenceRow[]
  loading:          boolean
  activeGeofence:   string | undefined
  onSelect:         (geofence: string | undefined) => void
  hasRowSelection?: boolean
}

export default function GeofenceSummaryPanel({
  rows,
  loading,
  activeGeofence,
  onSelect,
  hasRowSelection = false,
}: GeofenceSummaryPanelProps) {
  const maxMins = useMemo(() => Math.max(...rows.map((r) => r.cumulativeMins), 1), [rows])

  const activeSet = useMemo(
    () => new Set(activeGeofence ? activeGeofence.split(',').map((s) => s.trim()).filter(Boolean) : []),
    [activeGeofence]
  )

  function handleClick(geofence: string) {
    const next = new Set(activeSet)
    if (next.has(geofence)) next.delete(geofence)
    else next.add(geofence)
    onSelect(next.size === 0 ? undefined : Array.from(next).join(','))
  }

  const activeCount = activeSet.size

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Box
        sx={{
          px: 2.5, py: 1.75,
          borderBottom: '1px solid', borderBottomColor: 'divider',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box>
          <Typography
            sx={{ fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled' }}
          >
            Cumulative Time at Location
          </Typography>
          {!loading && (
            <Typography sx={{ fontSize: '0.72rem', color: hasRowSelection ? '#2563eb' : 'text.secondary', fontWeight: 500, mt: 0.25 }}>
              {rows.length} location{rows.length !== 1 ? 's' : ''} —{' '}
              {hasRowSelection ? 'filtered by row selection' : 'click row to filter'}
            </Typography>
          )}
        </Box>

        {activeCount > 0 && (
          <Tooltip title="Clear location filter" placement="left">
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                bgcolor: '#eff6ff', border: '1px solid #bfdbfe',
                borderRadius: '8px', pl: 1.25, pr: 0.5, py: 0.4,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', lineHeight: 1 }}>
                {activeCount} active
              </Typography>
              <IconButton
                size="small"
                onClick={() => onSelect(undefined)}
                sx={{ width: 16, height: 16, color: '#1d4ed8', '&:hover': { bgcolor: '#dbeafe' } }}
              >
                <CloseIcon sx={{ fontSize: 11 }} />
              </IconButton>
            </Box>
          </Tooltip>
        )}
      </Box>

      {/* ── Rows ─────────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
        {loading ? (
          <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...Array(7)].map((_, i) => (
              <Box key={i}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Skeleton width={`${55 - i * 3}%`} height={14} sx={{ borderRadius: 1 }} />
                  <Skeleton width={70} height={14} sx={{ borderRadius: 1 }} />
                </Box>
                <Skeleton width={`${85 - i * 8}%`} height={6} sx={{ borderRadius: 999 }} />
              </Box>
            ))}
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.disabled', fontWeight: 500 }}>No location data</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>Try adjusting your filters</Typography>
          </Box>
        ) : (
          rows.map((row, idx) => {
            const isUnknown = row.geofence === UNKNOWN_GEOFENCE
            const isActive  = activeSet.has(row.geofence)
            const barPct    = Math.max((row.cumulativeMins / maxMins) * 100, 1)
            const accent    = isUnknown ? '#ea580c' : '#2563eb'

            return (
              <Tooltip
                key={row.geofence}
                title={isActive ? 'Click to deselect' : 'Click to filter by this location'}
                placement="right"
                arrow
              >
                <Box
                  onClick={() => handleClick(row.geofence)}
                  sx={{
                    px: 2.5, py: 1.25,
                    cursor: 'pointer',
                    bgcolor: isActive ? (isUnknown ? '#fff7ed' : '#eff6ff') : 'transparent',
                    borderLeft: '3px solid',
                    borderLeftColor: isActive ? accent : isUnknown ? '#fdba74' : 'transparent',
                    transition: 'background-color 0.15s',
                    '&:hover': {
                      bgcolor: isActive
                        ? (isUnknown ? '#fed7aa' : '#dbeafe')
                        : '#f8fafc',
                    },
                  }}
                >
                  {/* Name + rank + duration */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      {/* Rank number */}
                      <Typography
                        sx={{
                          fontSize: 9, fontWeight: 800, color: isActive ? accent : '#94a3b8',
                          minWidth: 14, lineHeight: 1, flexShrink: 0,
                        }}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12.5,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? accent : isUnknown ? '#ea580c' : 'text.primary',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.geofence}
                      </Typography>
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 12, fontWeight: 700,
                        color: isActive ? accent : isUnknown ? '#ea580c' : '#64748b',
                        ml: 1, flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatDurationMins(row.cumulativeMins)}
                    </Typography>
                  </Box>

                  {/* Progress bar */}
                  <Box sx={{ height: 5, borderRadius: 999, bgcolor: '#f1f5f9', overflow: 'hidden' }}>
                    <Box
                      sx={{
                        height: '100%',
                        width: `${barPct}%`,
                        borderRadius: 999,
                        bgcolor: isActive ? accent : isUnknown ? '#fb923c' : '#93c5fd',
                        transition: 'width 0.4s ease, background-color 0.2s',
                      }}
                    />
                  </Box>
                </Box>
              </Tooltip>
            )
          })
        )}
      </Box>
    </Paper>
  )
}
