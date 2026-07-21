'use client'

import { useState, useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import OutlinedInput from '@mui/material/OutlinedInput'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import GroupsIcon from '@mui/icons-material/Groups'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'

interface OutsideDeptFilterProps {
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
}

export default function OutsideDeptFilter({ options, selected, onChange }: OutsideDeptFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const anchorRef = useRef<HTMLButtonElement>(null)

  const isActive = selected.length > 0
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))

  function toggle(dept: string) {
    if (selected.includes(dept)) {
      onChange(selected.filter((d) => d !== dept))
    } else {
      onChange([...selected, dept])
    }
  }

  function clearAll() {
    onChange([])
    setSearch('')
  }

  return (
    <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 1 }}>

      {/* Trigger button */}
      <Button
        ref={anchorRef}
        onClick={() => setOpen((o) => !o)}
        size="small"
        variant={isActive ? 'contained' : 'outlined'}
        startIcon={<GroupsIcon sx={{ fontSize: '14px !important' }} />}
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: '14px !important', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />}
        sx={{
          borderRadius: '8px',
          textTransform: 'none',
          fontWeight: 600,
          fontSize: 12,
          px: 1.5,
          py: 0.6,
          letterSpacing: 0,
          whiteSpace: 'nowrap',
          ...(isActive ? {
            bgcolor: '#7c3aed',
            borderColor: '#7c3aed',
            color: '#fff',
            '&:hover': { bgcolor: '#6d28d9' },
          } : {
            borderColor: 'divider',
            color: 'text.secondary',
            bgcolor: 'background.paper',
            '&:hover': { borderColor: '#7c3aed', color: '#7c3aed', bgcolor: '#faf5ff' },
          }),
        }}
      >
        Outside My Dept
        {isActive && (
          <Box
            component="span"
            sx={{
              ml: 0.75,
              bgcolor: 'rgba(255,255,255,0.25)',
              borderRadius: '4px',
              px: 0.6,
              py: 0.1,
              fontSize: 11,
              fontWeight: 700,
              lineHeight: 1.6,
            }}
          >
            {selected.length}
          </Box>
        )}
      </Button>

      {/* Clear button — only when active */}
      {isActive && (
        <Chip
          label="Clear"
          size="small"
          icon={<CloseIcon sx={{ fontSize: '11px !important' }} />}
          onClick={clearAll}
          sx={{
            height: 22,
            fontSize: 11,
            fontWeight: 600,
            bgcolor: '#ede9fe',
            color: '#5b21b6',
            border: '1px solid #c4b5fd',
            '& .MuiChip-icon': { color: '#7c3aed' },
            cursor: 'pointer',
          }}
        />
      )}

      {/* Dropdown panel */}
      {open && (
        <ClickAwayListener onClickAway={() => { setOpen(false); setSearch('') }}>
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 1400,
              width: 280,
              borderRadius: '10px',
              border: '1px solid',
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            {/* Search */}
            <Box sx={{ p: 1 }}>
              <OutlinedInput
                autoFocus
                size="small"
                fullWidth
                placeholder="Search departments…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                startAdornment={
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                  </InputAdornment>
                }
                sx={{
                  fontSize: 13,
                  borderRadius: '6px',
                  '& .MuiOutlinedInput-input': { py: 0.75, px: 0.5 },
                }}
              />
            </Box>

            <Divider />

            {/* Header row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {filtered.length} departments
              </Typography>
              {selected.length > 0 && (
                <Typography
                  variant="caption"
                  onClick={clearAll}
                  sx={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  Clear all
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Department list */}
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <Typography variant="caption" sx={{ display: 'block', px: 2, py: 1.5, color: 'text.disabled' }}>
                  No departments found
                </Typography>
              ) : (
                filtered.map((dept) => {
                  const checked = selected.includes(dept)
                  return (
                    <Box
                      key={dept}
                      onClick={() => toggle(dept)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        px: 1,
                        py: 0.4,
                        cursor: 'pointer',
                        bgcolor: checked ? '#faf5ff' : 'transparent',
                        '&:hover': { bgcolor: checked ? '#f3e8ff' : '#f8fafc' },
                        transition: 'background-color 0.1s',
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={checked}
                        readOnly
                        sx={{
                          p: 0.25,
                          color: 'text.disabled',
                          '&.Mui-checked': { color: '#7c3aed' },
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: 12.5,
                          fontWeight: checked ? 600 : 400,
                          color: checked ? '#5b21b6' : 'text.primary',
                          flex: 1,
                          userSelect: 'none',
                        }}
                      >
                        {dept}
                      </Typography>
                    </Box>
                  )
                })
              )}
            </Box>
          </Paper>
        </ClickAwayListener>
      )}
    </Box>
  )
}
