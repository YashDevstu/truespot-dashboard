'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import type { ChartDataPoint } from '@/hooks/useMissingAssetsData'

const RANGE_CONFIG: Record<string, { dot: string; bg: string; activeBg: string; activeText: string; activeBorder: string }> = {
  'Less than 2hr': { dot: '#16a34a', bg: 'rgba(22,163,74,0.08)',   activeBg: '#dcfce7', activeText: '#15803d', activeBorder: '#86efac' },
  '2hr-24hr':      { dot: '#65a30d', bg: 'rgba(101,163,13,0.08)',  activeBg: '#d9f99d', activeText: '#4d7c0f', activeBorder: '#bef264' },
  '1d-7d':         { dot: '#d97706', bg: 'rgba(217,119,6,0.08)',   activeBg: '#fef9c3', activeText: '#92400e', activeBorder: '#fde047' },
  '7d-30d':        { dot: '#ea580c', bg: 'rgba(234,88,12,0.08)',   activeBg: '#ffedd5', activeText: '#9a3412', activeBorder: '#fdba74' },
  '30d+':          { dot: '#dc2626', bg: 'rgba(220,38,38,0.08)',   activeBg: '#fee2e2', activeText: '#991b1b', activeBorder: '#fca5a5' },
}

const NOT_SEEN_GROUPS = ['1d-7d', '7d-30d', '30d+']

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
  if (set.has(value)) {
    set.delete(value)
  } else {
    set.add(value)
  }
  return serializeSelected(set)
}

// ── Component ──────────────────────────────────────────────────────────────────

interface LastSeenRangePillsProps {
  timeSinceData: ChartDataPoint[]
  activeHourGroup: string | undefined
  onSelect: (hourGroup: string | undefined) => void
}

export default function LastSeenRangePills({
  timeSinceData,
  activeHourGroup,
  onSelect,
}: LastSeenRangePillsProps) {
  if (timeSinceData.length === 0) return null

  const selected = parseSelected(activeHourGroup)
  const hasAny = selected.size > 0

  // "Not Seen > 1 Day" is fully active when all 3 groups are selected
  const notSeen1dActive = NOT_SEEN_GROUPS.every((g) => selected.has(g))
  // Partially active when at least one of the 3 is selected
  const notSeen1dPartial = !notSeen1dActive && NOT_SEEN_GROUPS.some((g) => selected.has(g))

  function handleNotSeen1dClick() {
    const next = new Set(selected)
    if (notSeen1dActive) {
      // All 3 active → deselect all 3
      NOT_SEEN_GROUPS.forEach((g) => next.delete(g))
    } else {
      // Add all 3 (union with current selection)
      NOT_SEEN_GROUPS.forEach((g) => next.add(g))
    }
    onSelect(serializeSelected(next))
  }

  function handleClearAll() {
    onSelect(undefined)
  }

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
          Last Seen Range
        </Typography>
        {hasAny && (
          <Typography
            variant="caption"
            onClick={handleClearAll}
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
        {timeSinceData.map(({ label, count }) => {
          const cfg = RANGE_CONFIG[label]
          const isActive = selected.has(label)
          // Dim unselected pills only when there's an active selection
          const isDimmed = hasAny && !isActive

          return (
            <ButtonBase
              key={label}
              onClick={() => onSelect(toggle(activeHourGroup, label))}
              sx={{ borderRadius: 2 }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: isActive ? (cfg?.activeBorder ?? 'divider') : 'divider',
                  bgcolor: isActive ? (cfg?.activeBg ?? 'action.selected') : (cfg?.bg ?? 'transparent'),
                  opacity: isDimmed ? 0.45 : 1,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  '&:hover': {
                    opacity: 1,
                    borderColor: cfg?.dot ?? 'text.primary',
                    bgcolor: isActive ? cfg?.activeBg : (cfg?.bg ?? 'action.hover'),
                  },
                }}
              >
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: cfg?.dot ?? '#94a3b8',
                    flexShrink: 0,
                    // Ring around dot when active
                    boxShadow: isActive ? `0 0 0 2px ${cfg?.activeBg ?? 'transparent'}` : 'none',
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? (cfg?.activeText ?? 'text.primary') : 'text.primary',
                  }}
                >
                  {label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isActive ? (cfg?.activeText ?? 'text.secondary') : 'text.disabled',
                  }}
                >
                  {count.toLocaleString()}
                </Typography>
              </Box>
            </ButtonBase>
          )
        })}

        {/* Quick-select: Not Seen > 1 Day */}
        <Button
          size="small"
          variant={notSeen1dActive ? 'contained' : 'outlined'}
          onClick={handleNotSeen1dClick}
          sx={{
            fontSize: 11,
            fontWeight: 600,
            height: 28,
            px: 1.25,
            borderRadius: 999,
            textTransform: 'none',
            letterSpacing: 0,
            borderColor: (notSeen1dActive || notSeen1dPartial) ? '#ea580c' : 'divider',
            color: notSeen1dActive ? '#fff' : '#ea580c',
            bgcolor: notSeen1dActive ? '#ea580c' : notSeen1dPartial ? 'rgba(234,88,12,0.06)' : 'transparent',
            opacity: hasAny && !notSeen1dActive && !notSeen1dPartial ? 0.45 : 1,
            '&:hover': {
              opacity: 1,
              bgcolor: notSeen1dActive ? '#c2410c' : 'rgba(234,88,12,0.1)',
              borderColor: '#ea580c',
            },
          }}
        >
          Not Seen &gt; 1 Day
        </Button>
      </Box>
    </Box>
  )
}
