'use client'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined'
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import type { HLKpiData } from '@/hooks/useHealthLocationData'

// ── Duration formatting ────────────────────────────────────────────────────────

export function formatDurationMins(totalMinutes: number): string {
  if (totalMinutes == null || totalMinutes < 0) return '—'
  if (totalMinutes === 0) return '0m'
  const d = Math.floor(totalMinutes / (24 * 60))
  const h = Math.floor((totalMinutes % (24 * 60)) / 60)
  const m = totalMinutes % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' ') || '0m'
}

// ── Single card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:      string
  value:      string
  subtitle?:  string
  accent:     string
  icon:       React.ElementType
  loading:    boolean
  onClick?:   () => void
  isActive?:  boolean
}

function KpiCard({ label, value, subtitle, accent, icon: Icon, loading, onClick, isActive }: KpiCardProps) {
  const clickable = !!onClick
  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        flex: 1,
        minWidth: 0,
        borderRadius: 2.5,
        border: '1.5px solid',
        borderColor: isActive ? accent : 'divider',
        bgcolor: isActive ? `${accent}08` : 'background.paper',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        transition: 'box-shadow 0.18s, border-color 0.18s, background-color 0.18s',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover': clickable
          ? { boxShadow: `0 4px 16px 0 ${accent}22`, borderColor: accent }
          : { boxShadow: '0 4px 16px 0 rgba(0,0,0,0.07)' },
      }}
    >
      {/* Icon + label row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 32, height: 32, borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: `${accent}14`,
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 17, color: accent }} />
        </Box>
        <Typography
          sx={{ fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' }}
        >
          {label}
        </Typography>
        {isActive && (
          <Box sx={{ ml: 'auto', bgcolor: accent, borderRadius: '6px', px: 0.8, py: 0.2 }}>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#fff', lineHeight: 1.6 }}>
              filtered
            </Typography>
          </Box>
        )}
      </Box>

      {/* Value */}
      {loading ? (
        <>
          <Skeleton width={90} height={38} sx={{ borderRadius: 1 }} />
          <Skeleton width={110} height={14} />
        </>
      ) : (
        <>
          <Typography
            sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: accent, letterSpacing: '-0.03em' }}
          >
            {value}
          </Typography>
          {subtitle && (
            <Typography sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 500 }}>
              {subtitle}
            </Typography>
          )}
        </>
      )}
    </Paper>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface HealthLocationKpiCardsProps {
  kpis:                 HLKpiData | null
  loading:              boolean
  activeGeofence:       string | undefined
  isKnownOnly:          boolean
  hasRowSelection?:     boolean
  onGeofencesVisited:   () => void
  onTimeTracked:        () => void
  onUnknownZoneTime:    () => void
}

export default function HealthLocationKpiCards({
  kpis,
  loading,
  activeGeofence,
  isKnownOnly,
  hasRowSelection = false,
  onGeofencesVisited,
  onTimeTracked,
  onUnknownZoneTime,
}: HealthLocationKpiCardsProps) {
  const unknownPct =
    kpis && kpis.timeTrackedMins > 0
      ? Math.round((kpis.unknownZoneMins / kpis.timeTrackedMins) * 100)
      : 0

  const isUnknownOnly = activeGeofence === 'Unknown Geofence'

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <KpiCard
        label="Total Tags"
        value={kpis ? kpis.totalTags.toLocaleString() : '—'}
        subtitle="unique tags in range"
        accent="#2563eb"
        icon={LocalOfferOutlinedIcon}
        loading={loading}
      />
      <KpiCard
        label="Geofences Visited"
        value={kpis ? kpis.geofencesVisited.toLocaleString() : '—'}
        subtitle={isKnownOnly ? 'click to show all' : 'click to filter known locations'}
        accent="#0891b2"
        icon={LocationOnOutlinedIcon}
        loading={loading}
        onClick={onGeofencesVisited}
        isActive={isKnownOnly}
      />
      <KpiCard
        label="Time Tracked"
        value={kpis ? formatDurationMins(kpis.timeTrackedMins) : '—'}
        subtitle={hasRowSelection ? 'from selected rows — click to clear' : 'click to reset all filters'}
        accent="#16a34a"
        icon={AccessTimeIcon}
        loading={loading}
        onClick={onTimeTracked}
        isActive={hasRowSelection}
      />
      <KpiCard
        label="Unknown Zone Time"
        value={kpis ? formatDurationMins(kpis.unknownZoneMins) : '—'}
        subtitle={isUnknownOnly ? 'click to show all' : `${unknownPct}% of total — click to filter`}
        accent="#ea580c"
        icon={HelpOutlineIcon}
        loading={loading}
        onClick={onUnknownZoneTime}
        isActive={isUnknownOnly}
      />
    </Box>
  )
}
