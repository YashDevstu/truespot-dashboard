'use client'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import type { LocationHistoryFilters } from '@/hooks/useFilters'

interface FilterChipsProps {
  filters: LocationHistoryFilters
  onFilterChange: (key: keyof LocationHistoryFilters, value: string) => void
  onReset: () => void
}

interface ActiveChip {
  label: string
  onDelete: () => void
}

function shorten(val: string, max: number): string {
  return val.length > max ? val.slice(0, max) + '…' : val
}

export default function FilterChips({ filters, onFilterChange, onReset }: FilterChipsProps) {
  const chips: ActiveChip[] = []

  function addMulti(key: keyof LocationHistoryFilters, prefix: string, display?: (v: string) => string) {
    const values = (filters[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    for (const val of values) {
      const shown = display ? display(val) : val
      chips.push({
        label: `${prefix}: ${shown}`,
        onDelete: () => {
          const remaining = values.filter((v) => v !== val).join(',')
          onFilterChange(key, remaining)
        },
      })
    }
  }

  addMulti('assetType',   'Type')
  addMulti('geofence',    'Geofence',  (v) => shorten(v, 22))
  addMulti('subGeoZone',  'Sub Zone',  (v) => shorten(v, 22))
  addMulti('floorLevel',  'Floor')
  addMulti('beaconId',    'Beacon',    (v) => v.length > 12 ? '…' + v.slice(-8) : v)
  addMulti('vin',         'VIN',       (v) => v.length > 12 ? v.slice(0, 4) + '…' + v.slice(-4) : v)
  addMulti('stockNumber', 'Stock #')

  const minDur = Number(filters.minDurationMinutes)
  if (minDur > 0) {
    chips.push({
      label: `Min Duration: ${minDur}m`,
      onDelete: () => onFilterChange('minDurationMinutes', '0'),
    })
  }

  if (chips.length === 0) return null

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
      {chips.map((chip, i) => (
        <Chip
          key={i}
          label={chip.label}
          size="small"
          onDelete={chip.onDelete}
          sx={{
            fontSize: 12,
            height: 26,
            fontWeight: 500,
            bgcolor: '#EFF6FF',
            color: '#1D4ED8',
            border: '1px solid #BFDBFE',
            '& .MuiChip-deleteIcon': { color: '#3B82F6', fontSize: 14, '&:hover': { color: '#1D4ED8' } },
          }}
        />
      ))}
      {chips.length > 1 && (
        <Chip
          label="Clear all"
          size="small"
          variant="outlined"
          onClick={onReset}
          sx={{ fontSize: 12, height: 26, color: 'text.secondary', borderColor: 'divider', cursor: 'pointer' }}
        />
      )}
    </Box>
  )
}
