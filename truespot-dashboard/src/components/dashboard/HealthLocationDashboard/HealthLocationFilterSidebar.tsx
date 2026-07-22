'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Slider from '@mui/material/Slider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Badge from '@mui/material/Badge'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FilterListIcon from '@mui/icons-material/FilterList'
import type { ActiveHealthLocationFilters } from '@/utils/daxHealthLocation'

// ── Helper ─────────────────────────────────────────────────────────────────────

function toArray(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

// ── Multi-select autocomplete ──────────────────────────────────────────────────

function MultiFilter({
  label,
  options,
  value,
  onChange,
  placeholder,
  limitTags = 1,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (vals: string[]) => void
  placeholder?: string
  limitTags?: number
}) {
  return (
    <Autocomplete<string, true, false, false>
      multiple
      options={options}
      value={value}
      onChange={(_, vals) => onChange(vals)}
      filterOptions={(opts, { inputValue }) =>
        opts.filter((o) => o.toLowerCase().includes(inputValue.toLowerCase()))
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
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface HealthLocationFilterSidebarProps {
  filters:       ActiveHealthLocationFilters
  filterOptions: Record<string, string[]>
  onFilterChange: (key: keyof ActiveHealthLocationFilters, value: string | number | undefined) => void
  onReset:       () => void
  open:          boolean
  onToggle:      () => void
}

export default function HealthLocationFilterSidebar({
  filters,
  filterOptions,
  onFilterChange,
  onReset,
  open,
  onToggle,
}: HealthLocationFilterSidebarProps) {

  const handleMulti = (key: keyof ActiveHealthLocationFilters) => (vals: string[]) =>
    onFilterChange(key, vals.length > 0 ? vals.join(',') : undefined)

  // Active filter count (for badge on collapsed sidebar)
  // dateSeen is the default state — don't count it as an "active" user filter
  const activeCount = [
    toArray(filters.geofence).length > 0,
    toArray(filters.subGeoZone).length > 0,
    toArray(filters.floorLevel).length > 0,
    toArray(filters.assetType).length > 0,
    toArray(filters.beaconId).length > 0,
    toArray(filters.vin).length > 0,
    toArray(filters.assetName).length > 0,
    (filters.minDurationMinutes ?? 0) > 0,
  ].filter(Boolean).length

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, bgcolor: '#f8fafc', borderTop: '1px solid', borderColor: 'divider' }}>

      {/* ── Toggle row ──────────────────────────────────────────────────── */}
      {open ? (
        <Box sx={{ px: 2, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tooltip title="Collapse filters" placement="right">
            <IconButton size="small" onClick={onToggle} sx={{ width: 26, height: 26, borderRadius: '7px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', '&:hover': { bgcolor: 'primary.main', borderColor: 'primary.main', '& .MuiSvgIcon-root': { color: '#fff' } } }}>
              <ChevronLeftIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 2, pb: 2, gap: 1.5 }}>
          <Tooltip title="Expand filters" placement="right">
            <IconButton size="small" onClick={onToggle} sx={{ width: 26, height: 26, borderRadius: '7px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.default', '&:hover': { bgcolor: 'primary.main', borderColor: 'primary.main', '& .MuiSvgIcon-root': { color: '#fff' } } }}>
              <ChevronRightIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
            </IconButton>
          </Tooltip>
          <Badge badgeContent={activeCount} color="primary" invisible={activeCount === 0} sx={{ '& .MuiBadge-badge': { fontSize: 9, minWidth: 14, height: 14, px: 0.4 } }}>
            <FilterListIcon sx={{ fontSize: 20, color: activeCount > 0 ? 'primary.main' : 'text.disabled', transition: 'color 0.2s' }} />
          </Badge>
          <Box sx={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'text.disabled', userSelect: 'none', mt: 0.5 }}>
            Filters
          </Box>
        </Box>
      )}

      {/* ── Filters label ─────────────────────────────────────────────── */}
      {open && (
        <>
          <Box sx={{ px: 2, pt: 1.25, pb: 0.75, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, color: 'text.disabled' }}>
              Filters
            </Typography>
            {activeCount > 0 && (
              <Box sx={{ bgcolor: 'primary.main', borderRadius: '10px', px: 0.8, py: 0.15, display: 'flex', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1.6 }}>{activeCount} active</Typography>
              </Box>
            )}
          </Box>
          <Divider />
        </>
      )}

      {/* ── Scrollable filter list ─────────────────────────────────────── */}
      {open && (
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1.75, py: 1.25 }}>
          <Stack spacing={1.5}>

            <MultiFilter
              label="Asset Type"
              options={filterOptions.assetType ?? []}
              value={toArray(filters.assetType)}
              onChange={handleMulti('assetType')}
              placeholder="All asset types"
            />

            <MultiFilter
              label="Geofence"
              options={filterOptions.geofence ?? []}
              value={toArray(filters.geofence)}
              onChange={handleMulti('geofence')}
              placeholder="All geofences"
            />

            <MultiFilter
              label="Sub Geo Zone"
              options={filterOptions.subGeoZone ?? []}
              value={toArray(filters.subGeoZone)}
              onChange={handleMulti('subGeoZone')}
              placeholder="All sub geo zones"
            />

            <MultiFilter
              label="Floor Level"
              options={filterOptions.floorLevel ?? []}
              value={toArray(filters.floorLevel)}
              onChange={handleMulti('floorLevel')}
              placeholder="All floors"
            />

            <MultiFilter
              label="TrueTag ID"
              options={filterOptions.beaconId ?? []}
              value={toArray(filters.beaconId)}
              onChange={handleMulti('beaconId')}
              placeholder="Select tags…"
              limitTags={-1}
            />

            <MultiFilter
              label="Asset Name"
              options={filterOptions.assetName ?? []}
              value={toArray(filters.assetName)}
              onChange={handleMulti('assetName')}
              placeholder="All assets"
              limitTags={-1}
            />

            <MultiFilter
              label="Asset ID"
              options={filterOptions.vin ?? []}
              value={toArray(filters.vin)}
              onChange={handleMulti('vin')}
              placeholder="All IDs"
              limitTags={-1}
            />

            {/* Bounce Filter Interval — at bottom, rarely changed */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 10, mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Bounce Filter Interval
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <TextField
                  type="number"
                  value={filters.minDurationMinutes ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(60, Number(e.target.value)))
                    onFilterChange('minDurationMinutes', v > 0 ? v : undefined)
                  }}
                  slotProps={{ htmlInput: { min: 0, max: 60 } }}
                  size="small"
                  sx={{ width: 54, '& input': { textAlign: 'center', px: 0.5, fontSize: 13 } }}
                />
                <Slider
                  value={filters.minDurationMinutes ?? 0}
                  onChange={(_, val) => onFilterChange('minDurationMinutes', (val as number) > 0 ? (val as number) : undefined)}
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
            disabled={activeCount === 0}
          >
            Reset Filters{activeCount > 0 && ` (${activeCount})`}
          </Button>
        </Box>
      )}
    </Box>
  )
}
