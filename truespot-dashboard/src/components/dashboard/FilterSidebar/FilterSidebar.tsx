'use client'
import Image from 'next/image'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Slider from '@mui/material/Slider'
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
        width: 236,
        flexShrink: 0,
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <Image
          src="/images/logo.jpg"
          alt="TrueSpot"
          width={140}
          height={36}
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
          priority
        />
      </Box>

      {/* Filters section */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontSize: 11,
            color: 'text.secondary',
          }}
        >
          Filters
        </Typography>
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* Scrollable filter list */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
        <Stack spacing={1.5}>
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

          {/* Bounce Filter Interval — filters out stops shorter than N minutes */}
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, mb: 1, display: 'block' }}>
              Bounce Filter Interval
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                type="number"
                value={filters.minDurationMinutes}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(60, Number(e.target.value)))
                  onFilterChange('minDurationMinutes', String(v))
                }}
                slotProps={{ htmlInput: { min: 0, max: 60 } }}
                size="small"
                sx={{ width: 60, '& input': { textAlign: 'center', px: 0.5 } }}
              />
              <Slider
                value={Number(filters.minDurationMinutes) || 0}
                onChange={(_, val) => onFilterChange('minDurationMinutes', String(val))}
                min={0}
                max={60}
                step={1}
                size="small"
                sx={{ flex: 1, color: 'primary.main' }}
              />
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block' }}>
              Min stop duration (minutes)
            </Typography>
          </Box>

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
        </Stack>
      </Box>

      {/* Reset button */}
      <Box sx={{ px: 2, py: 2, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<RestartAltIcon />}
          onClick={onReset}
          fullWidth
          disableElevation
        >
          Reset Filters
        </Button>
      </Box>
    </Box>
  )
}
