'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { InsightHubReport } from '@/hooks/useInsightHubData'

// ── Design tokens ─────────────────────────────────────────────────────────────

const TEAL        = '#0d9488'
const NAV_BG      = '#ffffff'
const BORDER_CLR  = '#e8eef4'
const SECTION_LBL = '#94a3b8'
const IDLE_TEXT   = '#374151'
const IDLE_ICON   = '#64748b'
const SOON_TEXT   = '#94a3b8'
const HOVER_BG    = '#f1f5f9'

// ── Types ─────────────────────────────────────────────────────────────────────

type NavId = InsightHubReport | 'walking-maps' | 'rental-watch'

interface NavItem {
  id:    NavId
  label: string
  soon?: boolean
  icon:  React.ReactNode
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconUsage = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor"/>
  </svg>
)

const IconFloors = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="11.5" width="12" height="2" rx="1" fill="currentColor" opacity=".5"/>
    <rect x="2" y="7"    width="12" height="2" rx="1" fill="currentColor" opacity=".75"/>
    <rect x="2" y="2.5"  width="12" height="2" rx="1" fill="currentColor"/>
    <path d="M8 6.5V11" stroke="currentColor" strokeWidth="1.2" opacity=".4"/>
    <path d="M8 2V6.5"  stroke="currentColor" strokeWidth="1.2" opacity=".4"/>
  </svg>
)

const IconLoop = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M8 2.5h3.5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const IconHiding = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="8" cy="8" r="2" fill="currentColor"/>
    <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".6"/>
  </svg>
)

const IconMaps = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 4l4-1.5 4 1.5 4-1.5v9l-4 1.5-4-1.5-4 1.5V4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity=".7"/>
    <path d="M6 2.5v9M10 4v9" stroke="currentColor" strokeWidth="1.3" opacity=".4"/>
  </svg>
)

const IconRental = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" opacity=".7"/>
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".55"/>
  </svg>
)

// ── Nav data ──────────────────────────────────────────────────────────────────

const LIVE_ITEMS: NavItem[] = [
  { id: 'utilisation',        label: 'How much gets used?',    icon: IconUsage  },
  { id: 'floor-distribution', label: 'Enough on every floor?', icon: IconFloors },
  { id: 'cleaning-loop',      label: 'The cleaning loop',      icon: IconLoop   },
  { id: 'hiding-spots',       label: 'The hiding spots',       icon: IconHiding },
]

const SOON_ITEMS: NavItem[] = [
  { id: 'walking-maps', label: 'Walking maps', icon: IconMaps,   soon: true },
  { id: 'rental-watch', label: 'Rental watch', icon: IconRental, soon: true },
]

// ── Public exports ────────────────────────────────────────────────────────────

export const REPORT_LABELS: Record<InsightHubReport, string> = {
  'utilisation':        'How much gets used?',
  'floor-distribution': 'Enough on every floor?',
  'cleaning-loop':      'The cleaning loop',
  'hiding-spots':       'The hiding spots',
}

export function formatRefreshAgo(raw: string): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return ''
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
    if (diffMin < 1)  return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const h = Math.floor(diffMin / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  } catch { return '' }
}

// ── Nav row ───────────────────────────────────────────────────────────────────

interface NavRowProps {
  item:      NavItem
  isActive:  boolean
  collapsed: boolean
  onClick?:  () => void
}

function NavRow({ item, isActive, collapsed, onClick }: NavRowProps) {
  const clickable = !item.soon

  if (collapsed) {
    return (
      <Box
        onClick={clickable ? onClick : undefined}
        title={item.label}
        sx={{
          position:       'relative',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          height:         36,
          mx:             0.75,
          borderRadius:   1.5,
          cursor:         clickable ? 'pointer' : 'default',
          bgcolor:        isActive ? TEAL : 'transparent',
          color:          isActive ? '#fff' : item.soon ? SOON_TEXT : IDLE_ICON,
          transition:     'background-color 0.12s',
          '&:hover':      clickable && !isActive ? { bgcolor: HOVER_BG } : {},
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {item.icon}
        </Box>
      </Box>
    )
  }

  return (
    <Box
      onClick={clickable ? onClick : undefined}
      sx={{
        display:     'flex',
        alignItems:  'center',
        gap:         1.25,
        mx:          1.25,
        px:          1.25,
        py:          0.875,
        borderRadius: 1.5,
        cursor:      clickable ? 'pointer' : 'default',
        bgcolor:     isActive ? TEAL : 'transparent',
        color:       isActive ? '#fff' : item.soon ? SOON_TEXT : IDLE_TEXT,
        transition:  'background-color 0.12s',
        '&:hover':   clickable && !isActive ? { bgcolor: HOVER_BG } : {},
      }}
    >
      {/* Icon */}
      <Box
        sx={{
          color:      isActive ? '#fff' : item.soon ? SOON_TEXT : IDLE_ICON,
          flexShrink: 0,
          display:    'flex',
          alignItems: 'center',
        }}
      >
        {item.icon}
      </Box>

      {/* Label */}
      <Typography
        sx={{
          fontSize:     13,
          fontWeight:   isActive ? 600 : 450,
          color:        'inherit',
          lineHeight:   1.3,
          flex:         1,
          minWidth:     0,
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
      </Typography>

      {/* SOON badge */}
      {item.soon && (
        <Box
          component="span"
          sx={{
            fontSize:      9,
            fontWeight:    700,
            letterSpacing: '0.06em',
            color:         '#fff',
            bgcolor:       '#cbd5e1',
            borderRadius:  '4px',
            px:            '5px',
            py:            '2px',
            flexShrink:    0,
          }}
        >
          SOON
        </Box>
      )}
    </Box>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface InsightHubNavProps {
  activeReport:     InsightHubReport
  onSelectReport:   (r: InsightHubReport) => void
  refreshTime:      string
  displayName:      string
  collapsed:        boolean
  onToggleCollapse: () => void
}

export default function InsightHubNav({
  activeReport,
  onSelectReport,
  refreshTime,
  displayName,
  collapsed,
  onToggleCollapse,
}: InsightHubNavProps) {
  const ago = formatRefreshAgo(refreshTime)

  return (
    <Box
      sx={{
        display:       'flex',
        flexDirection: 'column',
        height:        '100%',
        width:         '100%',
        overflow:      'hidden',
        bgcolor:       NAV_BG,
        borderRight:   `1px solid ${BORDER_CLR}`,
      }}
    >
      {/* ── Sticky section header — "REPORTS" + collapse toggle ───────────── */}
      <Box
        sx={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px:             collapsed ? 0 : 2.5,
          py:             1.25,
          borderBottom:   `1px solid ${BORDER_CLR}`,
          flexShrink:     0,
          position:       'sticky',
          top:            0,
          bgcolor:        NAV_BG,
          zIndex:         1,
        }}
      >
        {!collapsed && (
          <Typography
            sx={{
              fontSize:      9.5,
              fontWeight:    700,
              letterSpacing: '0.12em',
              color:         SECTION_LBL,
              textTransform: 'uppercase',
            }}
          >
            Reports
          </Typography>
        )}

        {/* Collapse / expand toggle */}
        <Box
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          sx={{
            width:          24,
            height:         24,
            borderRadius:   '50%',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            cursor:         'pointer',
            flexShrink:     0,
            color:          SECTION_LBL,
            transition:     'background-color 0.12s, color 0.12s',
            '&:hover':      { bgcolor: HOVER_BG, color: '#475569' },
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {collapsed
              ? <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              : <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            }
          </svg>
        </Box>
      </Box>

      {/* ── Nav sections (scrollable) ────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1.5 }}>

        {/* LIVE section label */}
        {!collapsed && (
          <Typography
            sx={{
              fontSize:      9.5,
              fontWeight:    700,
              letterSpacing: '0.12em',
              color:         SECTION_LBL,
              textTransform: 'uppercase',
              px:            2.5,
              mb:            0.5,
            }}
          >
            Live
          </Typography>
        )}
        {collapsed && <Box sx={{ height: 4 }} />}

        {LIVE_ITEMS.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            isActive={item.id === activeReport}
            collapsed={collapsed}
            onClick={() => onSelectReport(item.id as InsightHubReport)}
          />
        ))}

        {/* Divider */}
        <Box sx={{ mx: collapsed ? 1 : 2, my: 1.5, height: '1px', bgcolor: BORDER_CLR }} />

        {/* COMING SOON section label */}
        {!collapsed && (
          <Typography
            sx={{
              fontSize:      9.5,
              fontWeight:    700,
              letterSpacing: '0.12em',
              color:         SECTION_LBL,
              textTransform: 'uppercase',
              px:            2.5,
              mb:            0.5,
            }}
          >
            Coming soon
          </Typography>
        )}

        {SOON_ITEMS.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            isActive={false}
            collapsed={collapsed}
          />
        ))}
      </Box>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <Box
          sx={{
            borderTop: `1px solid ${BORDER_CLR}`,
            px:        2.5,
            py:        1.5,
            flexShrink: 0,
          }}
        >
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#475569', mb: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </Typography>
          {ago && (
            <Typography sx={{ fontSize: 10.5, color: SECTION_LBL, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Data refreshed {ago}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  )
}
