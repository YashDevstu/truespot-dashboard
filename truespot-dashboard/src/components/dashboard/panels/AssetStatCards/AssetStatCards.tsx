'use client'
import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtMinutes(total: number): string {
  const t = Math.round(total)
  if (t < 60) return `${t}m`
  const h = Math.floor(t / 60)
  const m = t % 60
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return rh === 0 ? `${d}d` : `${d}d ${rh}h`
  }
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ── StatCard ──────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string
  value: string | number
  subtitle: string
  valueColor?: string
}

function StatCard({ title, value, subtitle, valueColor }: StatCardProps) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
      <Paper
        variant="outlined"
        sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 0.5 }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.disabled', textTransform: 'uppercase', fontSize: 10 }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1.6rem', md: '2rem' },
            lineHeight: 1.15,
            color: valueColor ?? 'text.primary',
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
          {subtitle}
        </Typography>
      </Paper>
    </Grid>
  )
}

// ── AssetStatCards ────────────────────────────────────────────────────────────
interface AssetStatCardsProps {
  rows: Record<string, unknown>[]
  datePeriod: string  // "today" | "all time" | specific date string
}

export default function AssetStatCards({ rows, datePeriod }: AssetStatCardsProps) {
  const stats = useMemo(() => {
    if (rows.length === 0) return null

    const totalStops = rows.length

    const geofenceSet = new Set<string>()
    let totalMinutes = 0

    // Find most recent stop via string comparison — ISO 8601 sorts correctly as strings
    let latestRow = rows[0]
    let latestTime = String(rows[0]?.['[StartTime]'] ?? '')

    for (const r of rows) {
      geofenceSet.add(String(r['[Geofence]'] ?? ''))
      totalMinutes += Number(r['[MinutesDiff]'] ?? 0)
      const t = String(r['[StartTime]'] ?? '')
      if (t > latestTime) {
        latestTime = t
        latestRow = r
      }
    }

    const currentSubZone = String(latestRow['[SubGeoZone]'] ?? '').trim()
    const currentGeofence = String(latestRow['[Geofence]'] ?? '').trim()

    return {
      totalStops,
      uniqueGeofences: geofenceSet.size,
      totalMinutes,
      currentZoneLabel: currentSubZone || currentGeofence || '—',
      currentZoneSubtitle:
        currentSubZone && currentGeofence && currentSubZone !== currentGeofence
          ? `${currentGeofence} · Live`
          : 'Live',
    }
  }, [rows])

  if (!stats) return null

  return (
    <Box>
      <Grid container spacing={2}>
        <StatCard
          title="Stops"
          value={stats.totalStops.toLocaleString()}
          subtitle={`subzone visits ${datePeriod}`}
        />
        <StatCard
          title="Geofences"
          value={stats.uniqueGeofences}
          subtitle="unique locations"
        />
        <StatCard
          title="Time Tracked"
          value={fmtMinutes(stats.totalMinutes)}
          subtitle={`total ${datePeriod}`}
        />
        <StatCard
          title="Current Zone"
          value={stats.currentZoneLabel}
          subtitle={stats.currentZoneSubtitle}
          valueColor="#27AE60"
        />
      </Grid>
    </Box>
  )
}
