'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Badge from '@mui/material/Badge'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FilterListIcon from '@mui/icons-material/FilterList'
import type { ActiveHealthFilters } from '@/utils/daxHealth'

function toArray(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map((s) => s.trim()).filter(Boolean)
}

// Converts a date string (any common format) to "MM/DD/YYYY" for display.
// Handles YYYY-MM-DD, MM/DD/YYYY, datetime strings with time components, etc.
function formatDateOption(raw: string): string {
  if (!raw) return raw

  // If it already looks like MM/DD/YYYY with no time component, return as-is
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const today = new Date()
    const [m, d, y] = raw.split('/').map(Number)
    if (m === today.getMonth() + 1 && d === today.getDate() && y === today.getFullYear()) {
      return `Today (${raw})`
    }
    return raw
  }

  // Try parsing as a Date (covers ISO, datetime strings, etc.)
  // Force UTC parsing for ISO dates to avoid timezone shift (YYYY-MM-DD → treated as UTC)
  let d: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Pure ISO date: parse as UTC to avoid local timezone offset flipping the day
    const [y, mo, da] = raw.split('-').map(Number)
    d = new Date(Date.UTC(y, mo - 1, da))
  } else {
    d = new Date(raw)
  }

  if (isNaN(d.getTime())) return raw   // unparseable — show raw string

  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd   = String(d.getUTCDate()).padStart(2, '0')
  const yyyy = d.getUTCFullYear()

  const today = new Date()
  const isToday = d.getUTCDate() === today.getDate()
    && d.getUTCMonth() === today.getMonth()
    && d.getUTCFullYear() === today.getFullYear()

  const formatted = `${mm}/${dd}/${yyyy}`
  return isToday ? `Today (${formatted})` : formatted
}

function MultiFilter({
  label,
  options,
  value,
  onChange,
  fullValue = false,
}: {
  label: string
  options: string[]
  value: string[]
  onChange: (vals: string[]) => void
  fullValue?: boolean
}) {
  const autocomplete = (
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
      limitTags={fullValue ? -1 : 1}
      disableCloseOnSelect
      renderInput={(params) => (
        <TextField {...params} label={label} fullWidth />
      )}
    />
  )

  if (!fullValue) return autocomplete

  return (
    <Box
      sx={{
        '& .MuiAutocomplete-tag': { maxWidth: 'none' },
        '& .MuiChip-label': {
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          fontSize: '11px',
        },
      }}
    >
      {autocomplete}
    </Box>
  )
}

interface HealthFilterSidebarProps {
  filters: ActiveHealthFilters
  filterOptions: Record<string, string[]>
  onFilterChange: (key: keyof ActiveHealthFilters, value: string | undefined) => void
  onReset: () => void
  open?: boolean
  onToggle?: () => void
}

export default function HealthFilterSidebar({
  filters,
  filterOptions,
  onFilterChange,
  onReset,
  open = false,
  onToggle,
}: HealthFilterSidebarProps) {
  const handleMulti =
    (key: keyof ActiveHealthFilters) => (vals: string[]) =>
      onFilterChange(key, vals.length > 0 ? vals.join(',') : undefined)

  const activeFilterCount = [
    toArray(filters.lastSeenDate).length > 0,
    toArray(filters.department).length > 0,
    toArray(filters.assetName).length > 0,
    toArray(filters.floor).length > 0,
    toArray(filters.geofence).length > 0,
    toArray(filters.subGeoZone).length > 0,
    toArray(filters.tagId).length > 0,
    toArray(filters.assetId).length > 0,
    Boolean(filters.exitsFilter),
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
      {/* ── Toggle button row (expanded) ──────────────────────────────── */}
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

      {/* ── Expanded: "FILTERS" label + active count pill ─────────────── */}
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

            {/* Last Seen (Detailed) — distinct dates from LastSeen CST, most recent first.
                Always prepends today's date as a synthetic option (matching Power BI behaviour).
                Deduplicates by display label so multiple datetimes on the same day don't
                produce duplicate React keys. */}
            <Autocomplete<string, true, false, false>
              multiple
              options={(() => {
                const seen = new Set<string>()
                return (filterOptions.lastSeenDate ?? [])
                  .filter((v) => {
                    const label = formatDateOption(v)
                    if (seen.has(label)) return false
                    seen.add(label)
                    return true
                  })
                  .sort((a, b) => {
                    const da = new Date(a).getTime(), db = new Date(b).getTime()
                    if (!isNaN(da) && !isNaN(db)) return db - da
                    return b.localeCompare(a)
                  })
              })()}
              value={toArray(filters.lastSeenDate)}
              onChange={(_, vals) => handleMulti('lastSeenDate')(vals)}
              getOptionLabel={(raw) => formatDateOption(raw)}
              getOptionKey={(raw) => raw}
              isOptionEqualToValue={(option, value) =>
                formatDateOption(option) === formatDateOption(value)
              }
              filterOptions={(opts, { inputValue }) =>
                opts.filter((o) => formatDateOption(o).toLowerCase().includes(inputValue.toLowerCase()))
              }
              clearOnEscape
              autoHighlight
              size="small"
              limitTags={1}
              disableCloseOnSelect
              renderInput={(params) => (
                <TextField {...params} label="Last Seen (Detailed)" fullWidth />
              )}
            />

            {/* Exits / Non-Exits */}
            <Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.disabled',
                  fontWeight: 600,
                  fontSize: 10,
                  mb: 0.5,
                  display: 'block',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Exits / Non-Exits
              </Typography>
              <ToggleButtonGroup
                value={filters.exitsFilter ?? ''}
                exclusive
                onChange={(_, val: string | null) =>
                  onFilterChange('exitsFilter', val || undefined)
                }
                fullWidth
                size="small"
                sx={{
                  '& .MuiToggleButton-root': {
                    flex: 1,
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: 11,
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
                  gap: 0.5,
                }}
              >
                <ToggleButton value="">All</ToggleButton>
                <ToggleButton value="Exit">Exits</ToggleButton>
                <ToggleButton value="Non-Exit">Non-Exits</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <MultiFilter
              label="Department"
              options={filterOptions.department ?? []}
              value={toArray(filters.department)}
              onChange={handleMulti('department')}
            />

            <MultiFilter
              label="Asset Name"
              options={filterOptions.assetName ?? []}
              value={toArray(filters.assetName)}
              onChange={handleMulti('assetName')}
            />

            <MultiFilter
              label="Floor"
              options={filterOptions.floor ?? []}
              value={toArray(filters.floor)}
              onChange={handleMulti('floor')}
            />

            <MultiFilter
              label="Geofence Location"
              options={filterOptions.geofence ?? []}
              value={toArray(filters.geofence)}
              onChange={handleMulti('geofence')}
            />

            <MultiFilter
              label="Sub Geo Zone"
              options={filterOptions.subGeoZone ?? []}
              value={toArray(filters.subGeoZone)}
              onChange={handleMulti('subGeoZone')}
            />

            <MultiFilter
              label="Tag ID"
              options={filterOptions.tagId ?? []}
              value={toArray(filters.tagId)}
              onChange={handleMulti('tagId')}
              fullValue
            />

            <MultiFilter
              label="Asset ID"
              options={filterOptions.assetId ?? []}
              value={toArray(filters.assetId)}
              onChange={handleMulti('assetId')}
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
