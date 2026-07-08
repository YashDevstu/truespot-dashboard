'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import type { ChartDataPoint } from '@/hooks/useMissingAssetsData'

const VISIBLE_COUNT = 8

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseSelected(value: string | undefined): Set<string> {
  if (!value) return new Set()
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean))
}

function serializeSelected(set: Set<string>): string | undefined {
  return set.size === 0 ? undefined : Array.from(set).join(',')
}

function toggle(current: string | undefined, value: string): string | undefined {
  const set = parseSelected(current)
  if (set.has(value)) { set.delete(value) } else { set.add(value) }
  return serializeSelected(set)
}

// ── Sub-component ──────────────────────────────────────────────────────────────

interface GeofencePillProps {
  label: string
  count: number
  isActive: boolean
  isDimmed: boolean
  onToggle: () => void
}

function GeofencePill({ label, count, isActive, isDimmed, onToggle }: GeofencePillProps) {
  return (
    <ButtonBase onClick={onToggle} sx={{ borderRadius: 999, opacity: isDimmed ? 0.4 : 1, transition: 'opacity 0.15s', '&:hover': { opacity: 1 } }}>
      <Chip
        label={
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <span>{label}</span>
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                fontSize: 10,
                color: isActive ? 'rgba(255,255,255,0.8)' : 'text.disabled',
              }}
            >
              {count.toLocaleString()}
            </Box>
          </Box>
        }
        size="small"
        variant={isActive ? 'filled' : 'outlined'}
        sx={{
          fontSize: 11,
          fontWeight: 500,
          height: 26,
          cursor: 'pointer',
          bgcolor: isActive ? '#2563eb' : 'transparent',
          color: isActive ? '#fff' : 'text.primary',
          borderColor: isActive ? '#2563eb' : 'divider',
          '& .MuiChip-label': { px: 1.25 },
          '&:hover': {
            borderColor: '#2563eb',
            bgcolor: isActive ? '#1d4ed8' : 'rgba(37,99,235,0.06)',
          },
        }}
      />
    </ButtonBase>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface GeofenceFilterPillsProps {
  topLocationsData: ChartDataPoint[]
  activeGeofence: string | undefined
  onSelect: (geofence: string | undefined) => void
}

export default function GeofenceFilterPills({
  topLocationsData,
  activeGeofence,
  onSelect,
}: GeofenceFilterPillsProps) {
  const [expanded, setExpanded] = useState(false)

  if (topLocationsData.length === 0) return null

  const selected = parseSelected(activeGeofence)
  const hasAny = selected.size > 0

  const visible = topLocationsData.slice(0, VISIBLE_COUNT)
  const hidden = topLocationsData.slice(VISIBLE_COUNT)
  const hasMore = hidden.length > 0

  // Auto-expand if any selected geofence lives in the hidden set
  const activeIsHidden = hidden.some((d) => selected.has(d.label))
  const showAll = expanded || activeIsHidden

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.disabled',
            fontSize: '0.62rem',
          }}
        >
          Filter by Geofence
        </Typography>
        {hasAny && (
          <Typography
            variant="caption"
            onClick={() => onSelect(undefined)}
            sx={{
              fontSize: '0.65rem',
              color: 'text.disabled',
              cursor: 'pointer',
              '&:hover': { color: 'text.primary', textDecoration: 'underline' },
            }}
          >
            Clear all
          </Typography>
        )}
        {hasAny && (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
            · {selected.size} selected
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* "All" pill — clears entire selection */}
        <ButtonBase onClick={() => onSelect(undefined)} sx={{ borderRadius: 999 }}>
          <Chip
            label="All"
            size="small"
            variant={!hasAny ? 'filled' : 'outlined'}
            sx={{
              fontSize: 11,
              fontWeight: 600,
              height: 26,
              cursor: 'pointer',
              bgcolor: !hasAny ? '#2563eb' : 'transparent',
              color: !hasAny ? '#fff' : 'text.secondary',
              borderColor: !hasAny ? '#2563eb' : 'divider',
              '& .MuiChip-label': { px: 1.25 },
            }}
          />
        </ButtonBase>

        {/* Always-visible top N geofences */}
        {visible.map(({ label, count }) => (
          <GeofencePill
            key={label}
            label={label}
            count={count}
            isActive={selected.has(label)}
            isDimmed={hasAny && !selected.has(label)}
            onToggle={() => onSelect(toggle(activeGeofence, label))}
          />
        ))}

        {/* Collapsed: "+ N more" badge */}
        {hasMore && !showAll && (
          <ButtonBase
            onClick={() => setExpanded(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.4,
              px: 1.25,
              height: 26,
              borderRadius: 999,
              border: '1px dashed',
              borderColor: 'divider',
              color: 'text.secondary',
              fontSize: 11,
              fontWeight: 600,
              '&:hover': { borderColor: '#2563eb', color: '#2563eb', bgcolor: 'rgba(37,99,235,0.05)' },
            }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
            +{hidden.length} more
          </ButtonBase>
        )}
      </Box>

      {/* Expanded: additional geofences */}
      <Collapse in={showAll} unmountOnExit>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', pt: 0.25 }}>
          {hidden.map(({ label, count }) => (
            <GeofencePill
              key={label}
              label={label}
              count={count}
              isActive={selected.has(label)}
              isDimmed={hasAny && !selected.has(label)}
              onToggle={() => onSelect(toggle(activeGeofence, label))}
            />
          ))}

          <ButtonBase
            onClick={() => setExpanded(false)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.4,
              px: 1.25,
              height: 26,
              borderRadius: 999,
              border: '1px dashed',
              borderColor: 'divider',
              color: 'text.disabled',
              fontSize: 11,
              fontWeight: 600,
              '&:hover': { borderColor: 'text.secondary', color: 'text.secondary' },
            }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: 14 }} />
            Show less
          </ButtonBase>
        </Box>
      </Collapse>
    </Box>
  )
}
