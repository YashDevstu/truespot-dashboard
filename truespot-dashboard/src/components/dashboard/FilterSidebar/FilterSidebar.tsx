'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import FilterListIcon from '@mui/icons-material/FilterList'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { LocationHistoryFilters } from '@/hooks/useFilters'

function buildDateOptions() {
  const options: { value: string; label: string }[] = [
    { value: 'all', label: 'All Dates' },
    { value: 'Today', label: 'Today' },
  ]
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    const label = `${mm}/${dd}/${yy}`
    options.push({ value: label, label })
  }
  return options
}

const DATE_OPTIONS = buildDateOptions()

export interface FilterOptions {
  geofence: string[]
  subGeoZone: string[]
  floorLevel: string[]
  beaconId: string[]
  vin: string[]
  stockNumber: string[]
  assetType: string[]
}

interface FilterSidebarProps {
  filters: LocationHistoryFilters
  onFilterChange: (key: keyof LocationHistoryFilters, value: string) => void
  onReset: () => void
  filterOptions: FilterOptions
}

// Shared Autocomplete props: type-to-search, limit to 100 items in the list,
// allow free-text entry so users can type values not yet in the loaded dataset.
function makeAutoProps(options: string[]) {
  return {
    options,
    filterOptions: (opts: string[], { inputValue }: { inputValue: string }) =>
      opts
        .filter((o) => o.toLowerCase().includes(inputValue.toLowerCase()))
        .slice(0, 100),
    freeSolo: true as const,
    clearOnEscape: true,
    autoHighlight: true,
    size: 'small' as const,
  }
}

export default function FilterSidebar({
  filters,
  onFilterChange,
  onReset,
  filterOptions,
}: FilterSidebarProps) {
  const handleAuto =
    (key: keyof LocationHistoryFilters) =>
    (_: React.SyntheticEvent, value: string | null) =>
      onFilterChange(key, value ?? '')

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

      <Stack spacing={1.5}>
        {/* Date Seen — static options, no Autocomplete needed */}
        <TextField
          select
          label="Date Seen"
          value={filters.dateSeen}
          onChange={(e) => onFilterChange('dateSeen', e.target.value)}
          fullWidth
          size="small"
        >
          {DATE_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>

        <Autocomplete
          {...makeAutoProps(filterOptions.geofence)}
          value={filters.geofence || null}
          onChange={handleAuto('geofence')}
          renderInput={(params) => (
            <TextField {...params} label="Geofence" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.subGeoZone)}
          value={filters.subGeoZone || null}
          onChange={handleAuto('subGeoZone')}
          renderInput={(params) => (
            <TextField {...params} label="Sub Geo Zone" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.floorLevel)}
          value={filters.floorLevel || null}
          onChange={handleAuto('floorLevel')}
          renderInput={(params) => (
            <TextField {...params} label="Floor Level" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.beaconId)}
          value={filters.beaconId || null}
          onChange={handleAuto('beaconId')}
          renderInput={(params) => (
            <TextField {...params} label="Beacon ID" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.assetType)}
          value={filters.assetType || null}
          onChange={handleAuto('assetType')}
          renderInput={(params) => (
            <TextField {...params} label="Asset Type" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.vin)}
          value={filters.vin || null}
          onChange={handleAuto('vin')}
          renderInput={(params) => (
            <TextField {...params} label="VIN" fullWidth />
          )}
        />

        <Autocomplete
          {...makeAutoProps(filterOptions.stockNumber)}
          value={filters.stockNumber || null}
          onChange={handleAuto('stockNumber')}
          renderInput={(params) => (
            <TextField {...params} label="Stock Number" fullWidth />
          )}
        />

        <TextField
          label="Min Duration (min)"
          type="number"
          value={filters.minDurationMinutes}
          onChange={(e) => onFilterChange('minDurationMinutes', e.target.value)}
          slotProps={{ htmlInput: { min: 0 } }}
          fullWidth
          size="small"
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
