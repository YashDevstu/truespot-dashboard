'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import RefreshIcon from '@mui/icons-material/Refresh'
import LocationOnIcon from '@mui/icons-material/LocationOn'

interface DashboardHeaderProps {
  clientName: string
  dashboardLabel: string
  lastRefresh?: string
  onRefresh?: () => void
}

export default function DashboardHeader({
  clientName,
  dashboardLabel,
  lastRefresh,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 3,
        pb: 2.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LocationOnIcon sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4">{dashboardLabel}</Typography>
            <Chip
              label={clientName}
              size="small"
              sx={{
                bgcolor: 'primary.main',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.7rem',
              }}
            />
          </Box>
          {lastRefresh && (
            <Typography variant="caption" color="text.secondary">
              Last refresh: {lastRefresh}
            </Typography>
          )}
        </Box>
      </Box>

      {onRefresh && (
        <Tooltip title="Refresh data">
          <IconButton onClick={onRefresh} size="small" sx={{ color: 'text.secondary' }}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
