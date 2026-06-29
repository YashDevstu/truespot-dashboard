'use client'
import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

function buildPastDates(): string[] {
  const out: string[] = []
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(
      `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
    )
  }
  return out
}

const PAST_DATES  = buildPastDates()
const YESTERDAY   = PAST_DATES[0]
const ALL_OPTIONS = ['Today', ...PAST_DATES]

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function DateQuickFilter({ value, onChange }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)

  const isToday     = value === 'Today'
  const isYesterday = value === YESTERDAY
  const isAllDates  = !value || value === 'all'
  const isCustom    = !isToday && !isYesterday && !isAllDates

  const selected = useMemo(
    () => new Set(isAllDates ? [] : value.split(',').map((s) => s.trim()).filter(Boolean)),
    [isAllDates, value]
  )

  function toggle(date: string) {
    if (isAllDates) { onChange(date); return }
    const next = new Set(selected)
    if (next.has(date)) next.delete(date); else next.add(date)
    onChange(next.size === 0 ? 'all' : [...next].join(','))
  }

  const pill = (active: boolean) => ({
    borderRadius: '20px',
    px: 2,
    py: 0.5,
    fontSize: 14,
    fontWeight: 600,
    textTransform: 'none' as const,
    border: '1px solid',
    bgcolor:     active ? 'primary.main' : 'background.paper',
    borderColor: active ? 'primary.main' : 'divider',
    color:       active ? '#fff' : 'text.primary',
    minWidth: 'auto',
    lineHeight: 1.6,
    '&:hover': {
      bgcolor:     active ? 'primary.dark' : 'grey.100',
      borderColor: active ? 'primary.dark' : 'grey.300',
    },
  })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Button variant="text" onClick={() => onChange('Today')} sx={pill(isToday)}>Today</Button>
      <Button variant="text" onClick={() => onChange(YESTERDAY)} sx={pill(isYesterday)}>Yesterday</Button>
      <Button variant="text" onClick={() => onChange('all')} sx={pill(isAllDates)}>Last 7 days</Button>
      <Button
        variant="text"
        endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={pill(isCustom)}
      >
        {isCustom && selected.size === 1 ? [...selected][0] : 'Custom range'}
      </Button>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 200 } } }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'text.secondary', mb: 1.5, display: 'block' }}
        >
          Select dates
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {ALL_OPTIONS.map((date) => (
            <Chip
              key={date}
              label={date}
              size="small"
              variant={selected.has(date) ? 'filled' : 'outlined'}
              color={selected.has(date) ? 'primary' : 'default'}
              onClick={() => toggle(date)}
              sx={{ cursor: 'pointer', justifyContent: 'flex-start', borderRadius: 1.5 }}
            />
          ))}
        </Box>
        {selected.size > 0 && (
          <Button
            size="small"
            variant="contained"
            disableElevation
            fullWidth
            sx={{ mt: 1.5 }}
            onClick={() => setAnchor(null)}
          >
            Apply{selected.size > 1 ? ` (${selected.size} dates)` : ''}
          </Button>
        )}
      </Popover>
    </Box>
  )
}
