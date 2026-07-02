'use client'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExportButton from '@/components/dashboard/ExportButton'

interface DashboardHeaderProps {
  clientName: string
  dashboardLabel: string
  lastRefresh?: string
  onRefresh?: () => void
  onExportExcel?: () => Promise<void>
  exportDisabled?: boolean
}

export default function DashboardHeader({
  clientName,
  dashboardLabel,
  lastRefresh,
  onRefresh,
  onExportExcel,
  exportDisabled,
}: DashboardHeaderProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      {/* Left: title + client badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {lastRefresh && (
          <>
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
              Last refresh: {lastRefresh}
            </Typography>
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
