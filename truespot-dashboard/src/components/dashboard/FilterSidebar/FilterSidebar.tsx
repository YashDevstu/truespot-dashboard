'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import FilterListIcon from '@mui/icons-material/FilterList'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { LocationHistoryFilters } from '@/hooks/useFilters'

const DATE_SEEN_OPTIONS = [
  { value: 'Today', label: 'Today' },
  { value: 'Yesterday', label: 'Yesterday' },
  { value: 'Last 7 Days', label: 'Last 7 Days' },
  { value: 'Last 30 Days', label: 'Last 30 Days' },
]

interface FilterSidebarProps {
  filters: LocationHistoryFilters
  onFilterChange: (key: keyof LocationHistoryFilters, value: string) => void
  onReset: () => void
}

export default function FilterSidebar({ filters, onFilterChange, onReset }: FilterSidebarProps) {
  return (
    <Box
      sx={{
        width: 240,
        flexShrink: 0,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterListIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Filters
        </Typography>
      </Box>

      <Divider />

      <Stack spacing={2}>
        <TextField
          select
          label="Date"
          value={filters.dateSeen}
          onChange={(e) => onFilterChange('dateSeen', e.target.value)}
          fullWidth
        >
          {DATE_SEEN_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Beacon ID"
          value={filters.beaconId}
          onChange={(e) => onFilterChange('beaconId', e.target.value)}
          placeholder="e.g. A1:B2:C3"
          fullWidth
        />

        <TextField
          label="Geofence"
          value={filters.geofence}
          onChange={(e) => onFilterChange('geofence', e.target.value)}
          placeholder="e.g. Main Lot"
          fullWidth
        />

        <TextField
          label="Sub Geo Zone"
          value={filters.subGeoZone}
          onChange={(e) => onFilterChange('subGeoZone', e.target.value)}
          fullWidth
        />

        <TextField
          label="Floor Level"
          value={filters.floorLevel}
          onChange={(e) => onFilterChange('floorLevel', e.target.value)}
          fullWidth
        />

        <TextField
          label="VIN"
          value={filters.vin}
          onChange={(e) => onFilterChange('vin', e.target.value)}
          fullWidth
        />

        <TextField
          label="Stock Number"
          value={filters.stockNumber}
          onChange={(e) => onFilterChange('stockNumber', e.target.value)}
          fullWidth
        />

        <TextField
          label="Asset Type"
          value={filters.assetType}
          onChange={(e) => onFilterChange('assetType', e.target.value)}
          fullWidth
        />

        <TextField
          label="Min Duration (min)"
          type="number"
          value={filters.minDurationMinutes}
          onChange={(e) => onFilterChange('minDurationMinutes', e.target.value)}
          slotProps={{ htmlInput: { min: 0 } }}
          fullWidth
        />
      </Stack>

      <Box sx={{ mt: 'auto', pt: 1 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RestartAltIcon />}
          onClick={onReset}
          fullWidth
          sx={{ color: 'text.secondary', borderColor: 'divider' }}
        >
          Reset Filters
        </Button>
      </Box>
    </Box>
  )
}
