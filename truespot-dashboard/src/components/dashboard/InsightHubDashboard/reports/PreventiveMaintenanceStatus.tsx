'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const TEAL = '#0d9488'

function WrenchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.6 2.4a3 3 0 0 0-3.9 3.6L2 11l2 2 5-4.7a3 3 0 0 0 3.6-3.9l-2 2-1.4-1.4 2-2z"
        stroke={TEAL}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function PreventiveMaintenanceStatus() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography
        sx={{
          fontSize:      11,
          fontWeight:    700,
          letterSpacing: '0.1em',
          color:         TEAL,
          textTransform: 'uppercase',
        }}
      >
        Preventive Maintenance Status
      </Typography>

      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 4, sm: 6 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
          display:      'flex',
          flexDirection: 'column',
          alignItems:   'center',
          textAlign:    'center',
          gap:          1.5,
        }}
      >
        <Box
          sx={{
            width:          56,
            height:         56,
            borderRadius:   '50%',
            bgcolor:        '#f0fdfb',
            border:         `1px solid ${TEAL}30`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          <WrenchIcon />
        </Box>

        <Typography sx={{ fontSize: 20, fontWeight: 800, color: 'text.primary' }}>
          Will be implemented soon
        </Typography>

        <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 420, lineHeight: 1.6 }}>
          This report will track preventive maintenance schedules and status once that data
          is available. Check back soon.
        </Typography>
      </Box>
    </Box>
  )
}
