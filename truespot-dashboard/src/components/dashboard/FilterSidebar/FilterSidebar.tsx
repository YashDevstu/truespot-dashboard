'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Slider from '@mui/material/Slider'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Badge from '@mui/material/Badge'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FilterListIcon from '@mui/icons-material/FilterList'
import type { LocationHistoryFilters } from '@/hooks/useFilters'


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
  open?: boolean
  onToggle?: () => void
}

// Parse a comma-separated filter string into an array for multi-select inputs.
function toArray(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

// Typed multi-select autocomplete so TypeScript infers renderTags correctly.
function MultiFilter({
  label,
  options,
  value,
  onChange,
  placeholder,
  limitTags = 1,
  fullValue = false,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
  limitTags?: number
  fullValue?: boolean
}) {
  const autocomplete = (
    <Autocomplete<string, true, false, false>
      multiple
      options={options}
      value={value}
      onChange={(_, vals) => onChange(vals)}
      filterOptions={(opts, { inputValue }) =>
        opts.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 100)
      }
      clearOnEscape
      autoHighlight
      size="small"
      limitTags={limitTags}
      disableCloseOnSelect
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          fullWidth
          placeholder={value.length === 0 ? placeholder : undefined}
        />
      )}
    />
  )

  if (!fullValue) return autocomplete

  return (
    <Box
      sx={{
        '& .MuiAutocomplete-tag': { maxWidth: 'none' },
        '& .MuiChip-label': { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: '11px' },
      }}
    >
      {autocomplete}
    </Box>
  )
}

export default function FilterSidebar({
  filters,
  onFilterChange,
  onReset,
  filterOptions,
  open = true,
  onToggle,
}: FilterSidebarProps) {
  const handleMulti = (key: keyof LocationHistoryFilters) => (vals: string[]) =>
    onFilterChange(key, vals.join(','))

  const activeFilterCount = [
    toArray(filters.assetType).length > 0,
    toArray(filters.geofence).length > 0,
    toArray(filters.subGeoZone).length > 0,
    toArray(filters.floorLevel).length > 0,
    toArray(filters.beaconId).length > 0,
    toArray(filters.vin).length > 0,
    toArray(filters.stockNumber).length > 0,
    Number(filters.minDurationMinutes) > 0,
  ].filter(Boolean).length

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
        bgcolor: '#f8fafc',
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* ── Toggle button row ─────────────────────────────────────────── */}
      {open && (
        <Box
          sx={{
            px: 2,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexShrink: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tooltip title="Collapse filters" placement="right">
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{
                width: 26,
                height: 26,
                borderRadius: '7px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': {
                  bgcolor: 'primary.main',
                  borderColor: 'primary.main',
                  '& .MuiSvgIcon-root': { color: '#fff' },
                },
              }}
            >
              <ChevronLeftIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ── Collapsed view ────────────────────────────────────────────── */}
      {!open && (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pt: 2,
            pb: 2,
            gap: 1.5,
          }}
        >
          <Tooltip title="Expand filters" placement="right">
            <IconButton
              size="small"
              onClick={onToggle}
              sx={{
                width: 26,
                height: 26,
                borderRadius: '7px',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.default',
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': {
                  bgcolor: 'primary.main',
                  borderColor: 'primary.main',
                  '& .MuiSvgIcon-root': { color: '#fff' },
                },
              }}
            >
              <ChevronRightIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>

          <Badge
            badgeContent={activeFilterCount}
            color="primary"
            invisible={activeFilterCount === 0}
            sx={{ '& .MuiBadge-badge': { fontSize: 9, minWidth: 14, height: 14, px: 0.4 } }}
          >
            <FilterListIcon
              sx={{
                fontSize: 20,
                color: activeFilterCount > 0 ? 'primary.main' : 'text.disabled',
                transition: 'color 0.2s',
              }}
            />
          </Badge>

          <Box
            sx={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: 'text.disabled',
              userSelect: 'none',
              mt: 0.5,
            }}
          >
            Filters
          </Box>
        </Box>
      )}

      {/* ── Expanded: filters label ───────────────────────────────────── */}
      {open && (
        <Box
          sx={{
            px: 2,
            pt: 1.25,
            pb: 0.75,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: 10,
              color: 'text.disabled',
            }}
          >
            Filters
          </Typography>

          {activeFilterCount > 0 && (
            <Box
              sx={{
                bgcolor: 'primary.main',
                borderRadius: '10px',
                px: 0.8,
                py: 0.15,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1.6 }}>
                {activeFilterCount} active
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {open && <Divider />}

      {/* ── Scrollable filter list ────────────────────────────────────── */}
      {open && (
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.75, py: 1.25 }}>
          <Stack spacing={1.25}>

            {/* Asset Type */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 10, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Asset Type
              </Typography>
              <ToggleButtonGroup
                value={toArray(filters.assetType)}
                onChange={(_, vals: string[]) => onFilterChange('assetType', vals.join(','))}
                fullWidth
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    flex: 1,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 12,
                    gap: 0.5,
                    borderRadius: '6px !important',
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    py: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: '#fff',
                      borderColor: 'primary.main',
                      '&:hover': { bgcolor: 'primary.dark' },
                    },
                  },
                  gap: 0.75,
                }}
              >
                <ToggleButton value="Vehicle">
                  <DirectionsCarOutlinedIcon sx={{ fontSize: 14 }} />
                  Vehicle
                </ToggleButton>
                <ToggleButton value="Key">
                  <VpnKeyOutlinedIcon sx={{ fontSize: 14 }} />
                  Key
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <MultiFilter
              label="Geofence"
              options={filterOptions.geofence}
              value={toArray(filters.geofence)}
              onChange={handleMulti('geofence')}
            />

            <MultiFilter
              label="Sub Geo Zone"
              options={filterOptions.subGeoZone}
              value={toArray(filters.subGeoZone)}
              onChange={handleMulti('subGeoZone')}
            />

            <MultiFilter
              label="Floor Level"
              options={filterOptions.floorLevel}
              value={toArray(filters.floorLevel)}
              onChange={handleMulti('floorLevel')}
            />

            {/* Bounce Filter Interval */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 10, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Bounce Filter Interval
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <TextField
                  type="number"
                  value={filters.minDurationMinutes}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(60, Number(e.target.value)))
                    onFilterChange('minDurationMinutes', String(v))
                  }}
                  slotProps={{ htmlInput: { min: 0, max: 60 } }}
                  size="small"
                  sx={{ width: 54, '& input': { textAlign: 'center', px: 0.5, fontSize: 13 } }}
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
              <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, display: 'block', fontSize: 10 }}>
                Minutes (0 = show all)
              </Typography>
            </Box>

            <MultiFilter
              label="Beacon ID"
              options={filterOptions.beaconId}
              value={toArray(filters.beaconId)}
              onChange={handleMulti('beaconId')}
              limitTags={-1}
              fullValue
            />

            <MultiFilter
              label="VIN"
              options={filterOptions.vin}
              value={toArray(filters.vin)}
              onChange={handleMulti('vin')}
              limitTags={-1}
              fullValue
            />

            <MultiFilter
              label="Stock Number"
              options={filterOptions.stockNumber}
              value={toArray(filters.stockNumber)}
              onChange={handleMulti('stockNumber')}
              limitTags={-1}
              fullValue
            />

          </Stack>
        </Box>
      )}

      {/* ── Reset button ──────────────────────────────────────────────── */}
      {open && (
        <Box sx={{ px: 1.75, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={onReset}
            fullWidth
            disableElevation
            disabled={activeFilterCount === 0}
          >
            Reset Filters
            {activeFilterCount > 0 && ` (${activeFilterCount})`}
          </Button>
        </Box>
      )}
    </Box>
  )
}
