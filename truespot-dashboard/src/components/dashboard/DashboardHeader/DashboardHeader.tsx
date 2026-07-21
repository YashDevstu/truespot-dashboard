'use client'
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExportButton from '@/components/dashboard/ExportButton'

// Accepts either a US-format string ("7/8/2026 6:03:11 AM") or an ISO string with
// explicit offset ("2026-07-08T06:03:11-05:00"). If the ISO form is detected and a
// displayTimezone is given, renders in that timezone — so BSA staff in Texas always
// see CST/CDT time regardless of the viewer's browser timezone.
function formatRefreshTime(timestamp: string, displayTimezone?: string): string {
  if (/T\d{2}:\d{2}:\d{2}[+-]/.test(timestamp)) {
    const d = new Date(timestamp)
    if (isNaN(d.getTime())) return timestamp
    return d.toLocaleString('en-US', {
      timeZone: displayTimezone,
      month: 'numeric', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZoneName: 'short',
    })
  }
  return timestamp
}

function useRelativeTime(timestamp: string | undefined): string | null {
  const [rel, setRel] = useState<string | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!timestamp) { setRel(null); return }
    const compute = () => {
      const d = new Date(timestamp)
      if (isNaN(d.getTime())) return null
      const diffMin = Math.round((Date.now() - d.getTime()) / 60_000)
      if (diffMin < 1) return 'just now'
      if (diffMin < 60) return `${diffMin}m ago`
      const diffHr = Math.round(diffMin / 60)
      if (diffHr < 24) return `${diffHr}h ago`
      return null
    }
    setRel(compute())
    const id = setInterval(() => setRel(compute()), 60_000)
    return () => clearInterval(id)
  }, [timestamp])
  return rel
}

interface DashboardHeaderProps {
  clientName: string
  dashboardLabel: string
  lastRefresh?: string
  displayTimezone?: string
  onRefresh?: () => void
  onExportExcel?: () => Promise<void>
  exportDisabled?: boolean
}

export default function DashboardHeader({
  clientName,
  dashboardLabel,
  lastRefresh,
  displayTimezone,
  onRefresh,
  onExportExcel,
  exportDisabled,
}: DashboardHeaderProps) {
  const relativeTime = useRelativeTime(lastRefresh)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', rowGap: 1 }}>
      {/* Left: title + client badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: '1 1 auto' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: '1.375rem', sm: '1.625rem', md: '2.125rem' } }}>
            {dashboardLabel}
          </Typography>
          <Chip
            label={clientName}
            size="small"
            sx={{ mt: 0.5, bgcolor: 'primary.main', color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}
          />
        </Box>
      </Box>

      {/* Right: last refresh + export + refresh */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 0.5 }}>
        {lastRefresh && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                Last refresh: {formatRefreshTime(lastRefresh, displayTimezone)}
              </Typography>
              {relativeTime && (
                <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled', lineHeight: 1.3, opacity: 0.7 }}>
                  {relativeTime}
                </Typography>
              )}
            </Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 16, alignSelf: 'center' }} />
          </>
        )}

        {onExportExcel && (
          <ExportButton
            onExportExcel={onExportExcel}
            disabled={exportDisabled}
          />
        )}

        {onRefresh && (
          <Tooltip title="Refresh data">
            <IconButton onClick={onRefresh} size="small" sx={{ color: 'text.secondary' }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
