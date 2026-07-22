'use client'

import { useMemo, useState } from 'react'
import NextLink from 'next/link'
import Image from 'next/image'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useExitLocationData, type ExitAssetRow } from '@/hooks/useExitLocationData'
import { facilityLocalToUtcInstant, getTimeZoneAbbreviation } from '@/utils/formatters'
import { CLIENT_FACILITY_TIME_ZONE, DEFAULT_FACILITY_TIME_ZONE } from '@/constants/timezones'
import ExportButton from '@/components/dashboard/ExportButton/ExportButton'

const TEAL   = '#0d9488'
const AMBER  = '#d97706'
const TOP_BAR_H = 60

interface ExitLocationDashboardProps {
  clientId:      string
  dashboardKey:  string
  product:       string
  displayName:   string
  dashboardLabel: string
}

function minutesAgo(iso: string): number {
  if (!iso) return 0
  const d = facilityLocalToUtcInstant(iso)
  if (isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
}

// Splits "Trauma Double Doors Exit (I3c4a)" into name + code so the code can
// be styled as a small monospace tag (an identifier) rather than a lighter
// continuation of the location name.
function splitSubGeoZone(s: string): { name: string; code: string | null } {
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  return m ? { name: m[1], code: m[2] } : { name: s, code: null }
}

function fmtAgoFromMinutes(diffMin: number): string {
  if (diffMin < 1)  return '<1m ago'
  if (diffMin < 60) return `${diffMin}m ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type Dwell = 'new' | 'dwelling' | 'all'

// Staleness bar — a "new" (last-24h) row scales against 24h, a dwelling row
// scales against 7 days, so the bar always reads as "how far through the
// relevant window is it" — computed from the row's own status, not the page
// toggle, so it stays correct in the combined "All" view too.
function stalenessPct(diffMin: number, isNew: boolean): number {
  const scaleMin = isNew ? 24 * 60 : 7 * 24 * 60
  return Math.min(100, Math.round((diffMin / scaleMin) * 100))
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sublabel, accent, active, onClick }: { label: string; value: string; sublabel: string; accent?: string; active?: boolean; onClick?: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: '1 1 200px', minWidth: 180,
        bgcolor: active ? '#f0fdfb' : 'background.paper', borderRadius: 2.5,
        border: '1px solid', borderColor: active ? TEAL : 'divider',
        p: 2.25,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.12s, background-color 0.12s',
        '&:hover': onClick ? { borderColor: TEAL } : {},
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase', mb: 0.75 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 32, fontWeight: 900, color: accent ?? 'text.primary', lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
        {sublabel}
      </Typography>
    </Box>
  )
}

// ── Asset row (one row per asset — matches the client's reference layout:
// Asset | Location | Department | Time at Exit) ─────────────────────────────

const ASSET_ROW_COLUMNS = '1.7fr 1.6fr 0.6fr 1fr 1.1fr'

function AssetTableRow({ asset, product, clientId, locationCount }: { asset: ExitAssetRow; product: string; clientId: string; locationCount: number }) {
  const diffMin  = minutesAgo(asset.firstSeen)
  const pct      = stalenessPct(diffMin, asset.last24)
  const barColor = asset.last24 ? AMBER : TEAL

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: ASSET_ROW_COLUMNS,
        alignItems: 'center',
        gap: 2,
        px: 2, py: 1.5,
        borderBottom: '1px solid', borderColor: 'divider',
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* Asset — identity comes from the status dot in the Time-at-Exit
          column, not from coloring the label text itself */}
      <NextLink
        href={`/dashboard/${product}/locationhistory/${clientId}?vin=${encodeURIComponent(asset.vin)}`}
        style={{ textDecoration: 'none' }}
      >
        <Typography
          sx={{
            fontSize: 13, fontWeight: 700, color: 'text.primary',
            cursor: 'pointer', width: 'fit-content',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {asset.assetName}
        </Typography>
      </NextLink>

      {/* Location — sub-zone code styled as a monospace identifier tag,
          not a lighter continuation of the location name */}
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
          {asset.geofence}
        </Typography>
        {(() => {
          const { name, code } = splitSubGeoZone(asset.subGeoZone)
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{name}</Typography>
              {code && (
                <Typography
                  component="span"
                  sx={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 10, color: 'text.disabled',
                    bgcolor: 'action.hover', px: 0.5, py: 0.1, borderRadius: 0.75,
                  }}
                >
                  {code}
                </Typography>
              )}
            </Box>
          )
        })()}
      </Box>

      {/* Qty — how many assets currently share this same location */}
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {locationCount}
      </Typography>

      {/* Department — a flat identity dot beside neutral-ink text, not a
          saturated pill fill (text never wears the data color) */}
      {asset.department ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#2a78d6', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>{asset.department}</Typography>
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>
      )}

      {/* Time at Exit — status dot + neutral-ink text (color carries meaning
          via the dot, never via colored text), meter track is a lighter step
          of the same hue rather than generic gray so the bar reads as one
          continuous ramp. */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.5 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: barColor, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {asset.last24 ? 'New · ' : ''}{fmtAgoFromMinutes(diffMin)}
          </Typography>
        </Box>
        <Box sx={{ width: '100%', height: 3, borderRadius: 1.5, bgcolor: asset.last24 ? '#fef3c7' : '#ccfbf1', overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: barColor, borderRadius: '0 1.5px 1.5px 0' }} />
        </Box>
      </Box>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type SortKey = 'asset' | 'location' | 'department' | 'firstSeen'

export default function ExitLocationDashboard({ clientId, dashboardKey, product, displayName }: ExitLocationDashboardProps) {
  const {
    exitAssets, monitoredExits, assetTypeOptions, refreshTime, loading, error,
    filters, setFilters,
  } = useExitLocationData(clientId, dashboardKey)
  const [dwell, setDwell] = useState<Dwell>('all')
  const [activeGeofence, setActiveGeofence] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('firstSeen')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // DST-aware — "EDT" in summer, "EST" in winter, computed at render time
  // rather than hardcoded, so it never drifts out of sync with the season.
  const facilityTz = CLIENT_FACILITY_TIME_ZONE[clientId] ?? DEFAULT_FACILITY_TIME_ZONE
  const tzAbbr = getTimeZoneAbbreviation(facilityTz)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'location' ? 'asc' : 'desc')
    }
  }

  async function handleExport() {
    const { exportExitLocationExcel } = await import('@/utils/exportExitLocationReport')
    await exportExitLocationExcel({
      clientName: displayName, refreshTime, dwell, assets: exitAssets, monitoredExits,
      refreshCadence: `Daily at 2:00 PM ${tzAbbr}`,
    })
  }

  const dwellAssets = useMemo(
    () => dwell === 'all' ? exitAssets : exitAssets.filter((a) => (dwell === 'new' ? a.last24 : !a.last24)),
    [exitAssets, dwell]
  )

  const visibleAssets = useMemo(
    () => activeGeofence ? dwellAssets.filter((a) => `${a.geofence}::${a.subGeoZone}` === activeGeofence) : dwellAssets,
    [dwellAssets, activeGeofence]
  )

  // One row per asset — sorted per the active column
  const sortedAssets = useMemo((): ExitAssetRow[] => {
    const rows = [...visibleAssets]
    const dir  = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'location':   return dir * a.geofence.localeCompare(b.geofence)
        case 'asset':      return dir * a.assetName.localeCompare(b.assetName)
        case 'department': return dir * a.department.localeCompare(b.department)
        default: /* firstSeen */ return dir * a.firstSeen.localeCompare(b.firstSeen)
      }
    })
    return rows
  }, [visibleAssets, sortKey, sortDir])

  // How many assets share each location, within the currently visible set —
  // shown as the Qty column so a row still conveys "not alone here."
  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of visibleAssets) {
      const key = `${a.geofence}::${a.subGeoZone}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [visibleAssets])

  const activeExitKeys = useMemo(
    () => new Set(exitAssets.map((a) => `${a.geofence}::${a.subGeoZone}`)),
    [exitAssets]
  )

  const newCount = exitAssets.filter((a) => a.last24).length
  const activeLocationCount = new Set(exitAssets.map((a) => `${a.geofence}::${a.subGeoZone}`)).size

  return (
    <Box>
      {/* ── Top bar — fixed, matches the rest of the Health product line ────── */}
      <Box
        sx={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 20,
          height: TOP_BAR_H,
          bgcolor: 'background.paper',
          borderBottom: '1px solid', borderColor: 'divider',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          px: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 2, flexWrap: 'wrap',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
          <Image
            src="/images/TruespotHealth.webp"
            alt="TrueSpot Health"
            width={130}
            height={36}
            style={{ objectFit: 'contain', objectPosition: 'left center' }}
            priority
          />
          <Box sx={{ width: '1px', height: 24, bgcolor: 'divider', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: 'text.primary', whiteSpace: 'nowrap' }}>
            Exit Location Portal
          </Typography>
          <Box sx={{ px: 1.25, py: 0.35, borderRadius: 6, bgcolor: '#f0fdfb', border: '1px solid #99f6e4', flexShrink: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: TEAL, letterSpacing: '0.01em' }}>{displayName}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
              Refreshes daily · 2:00 PM {tzAbbr}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>
              {refreshTime ? `Last refresh: ${refreshTime}` : ''}
            </Typography>
          </Box>
          <Box sx={{ width: '1px', height: 24, bgcolor: 'divider', flexShrink: 0 }} />
          <ExportButton onExportExcel={handleExport} disabled={loading} />
        </Box>
      </Box>

      {/* ── Main content — offset by the fixed top bar ───────────────────────── */}
      <Box sx={{ mt: `${TOP_BAR_H}px`, p: { xs: 2.5, sm: 3 }, maxWidth: 1800, mx: 'auto' }}>

      {/* Filter bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Select
          size="small"
          displayEmpty
          value={filters.assetType ?? ''}
          onChange={(e) => setFilters({ ...filters, assetType: e.target.value || undefined })}
          sx={{ minWidth: 160, fontSize: 13, bgcolor: 'background.paper' }}
        >
          <MenuItem value="">All Asset Types</MenuItem>
          {assetTypeOptions.map((t) => (
            <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{t}</MenuItem>
          ))}
        </Select>
        {activeGeofence && (
          <Box
            onClick={() => setActiveGeofence(null)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              px: 1.5, py: 0.6, borderRadius: 6, cursor: 'pointer',
              border: '1.5px solid', borderColor: TEAL, bgcolor: '#f0fdfb',
              fontSize: 12.5, fontWeight: 600, color: TEAL,
            }}
          >
            {activeGeofence.replace('::', ' :: ')} ✕
          </Box>
        )}
      </Box>

      {error && (
        <Typography sx={{ fontSize: 13, color: '#dc2626', mb: 2 }}>
          Unable to load data — {error}
        </Typography>
      )}

      {/* KPI cards */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={100} sx={{ flex: '1 1 200px', borderRadius: 2.5 }} />)
        ) : (
          <>
            <KpiCard
              label="Assets at Exits"
              value={String(exitAssets.length)}
              sublabel={`across ${activeLocationCount} exit location${activeLocationCount !== 1 ? 's' : ''}`}
              active={dwell === 'all'}
              onClick={() => setDwell('all')}
            />
            <KpiCard
              label="Exit Locations"
              value={`${activeLocationCount}`}
              sublabel={activeGeofence ? `of ${monitoredExits.length} monitored — click to show all locations` : `of ${monitoredExits.length} monitored`}
              active={!activeGeofence}
              onClick={() => setActiveGeofence(null)}
            />
            <KpiCard
              label="New in Last 24h"
              value={String(newCount)}
              sublabel="marked with *"
              accent={AMBER}
              active={dwell === 'new'}
              onClick={() => setDwell('new')}
            />
          </>
        )}
      </Box>

      {/* Dwell toggle — one segmented control (single track, sliding active
          fill) instead of three loose pills */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase' }}>
          Review dwell
        </Typography>
        <Box
          sx={{
            display: 'inline-flex', position: 'relative',
            borderRadius: 6, border: '1px solid', borderColor: 'divider',
            bgcolor: 'background.paper', p: 0.25,
          }}
        >
          {(['all', 'new', 'dwelling'] as const).map((d) => (
            <Box
              key={d}
              onClick={() => setDwell(d)}
              sx={{
                position: 'relative', zIndex: 1,
                px: 1.5, py: 0.55, borderRadius: 5, cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                color: dwell === d ? '#fff' : 'text.secondary',
                bgcolor: dwell === d ? TEAL : 'transparent',
                transition: 'background-color 0.15s, color 0.15s',
              }}
            >
              {d === 'all' ? 'All Exits' : d === 'new' ? 'Previous 24 Hours' : 'Longer Than 24 Hours'}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Table */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2.5, border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase' }}>
            {dwell === 'all' ? 'All Detections at Exits' : dwell === 'new' ? 'New (Last 24h) Detections' : 'Dwelling Longer Than 24h'}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: ASSET_ROW_COLUMNS,
            gap: 2, px: 2, py: 1,
            borderBottom: '1px solid', borderColor: 'divider',
            position: 'sticky', top: TOP_BAR_H, zIndex: 5,
            bgcolor: 'background.paper',
          }}
        >
          {([
            { label: 'Asset',              key: 'asset' as const },
            { label: 'Location',           key: 'location' as const },
            { label: 'Qty',                key: null },
            { label: 'Department',         key: 'department' as const },
            { label: 'Time at Exit',       key: 'firstSeen' as const },
          ]).map(({ label, key }) => (
            <Box
              key={label}
              onClick={key ? () => toggleSort(key) : undefined}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.4,
                cursor: key ? 'pointer' : 'default',
                userSelect: 'none',
                '&:hover': key ? { color: 'text.secondary' } : {},
              }}
            >
              <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase' }}>
                {label}
              </Typography>
              {key && sortKey === key && (
                <Typography sx={{ fontSize: 10, color: TEAL, fontWeight: 700 }}>
                  {sortDir === 'asc' ? '▲' : '▼'}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        {loading ? (
          <Box sx={{ p: 3 }}><Skeleton height={120} /></Box>
        ) : sortedAssets.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 5 }}>
            No assets detected in this window.
          </Typography>
        ) : (
          sortedAssets.map((asset) => (
            <AssetTableRow
              key={asset.vin}
              asset={asset}
              product={product}
              clientId={clientId}
              locationCount={locationCounts.get(`${asset.geofence}::${asset.subGeoZone}`) ?? 1}
            />
          ))
        )}
        <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            * Asset first detected within the previous 24 hours
          </Typography>
        </Box>
      </Box>

      {/* Monitored exits */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 2.5, border: '1px solid', borderColor: 'divider', p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase' }}>
            Monitored Exits
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {monitoredExits.length} exits configured
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {monitoredExits.map((ex) => {
            const key = `${ex.geofence}::${ex.subGeoZone}`
            const active = activeExitKeys.has(key)
            const selected = activeGeofence === key
            return (
              <Box
                key={key}
                onClick={() => setActiveGeofence(selected ? null : key)}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.6,
                  px: 1.5, py: 0.6, borderRadius: 6, cursor: 'pointer',
                  border: '1.5px solid',
                  borderColor: selected ? TEAL : active ? '#fca5a5' : 'divider',
                  bgcolor: selected ? '#f0fdfb' : active ? '#fef2f2' : 'transparent',
                  fontSize: 12.5, fontWeight: 600,
                  color: selected ? TEAL : active ? '#dc2626' : 'text.secondary',
                }}
              >
                {active && (
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#dc2626' }} />
                )}
                {ex.geofence} :: {ex.subGeoZone.replace(/\s*\([^)]*\)$/, '')}
              </Box>
            )
          })}
        </Box>
      </Box>
      </Box>
    </Box>
  )
}
