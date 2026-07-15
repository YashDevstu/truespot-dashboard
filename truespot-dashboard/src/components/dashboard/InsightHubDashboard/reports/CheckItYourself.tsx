'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import type { IHFloorStatusRow } from '@/hooks/useInsightHubData'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FloorAssetRow {
  vin:          string
  assetName:    string   // human-readable name from AppendFinal[Name]
  assetType:    string
  subGeo:       string
  lastSeen:     string   // ISO — most recent ping ("last confirmed")
  prevSeen:     string   // ISO — session start ("here since")
}

interface AssetTrailRow {
  floor:        string
  subGeo:       string
  sessionStart: string   // ISO — when asset arrived at this location
  sessionEnd:   string   // ISO — when asset was next pinged (possibly elsewhere)
  assetType:    string
  durMins:      number
}

type Level =
  | { kind: 'floors' }
  | { kind: 'floor';  floorRow: IHFloorStatusRow; assets: FloorAssetRow[]; loadingAssets: boolean }
  | { kind: 'trail';  floorRow: IHFloorStatusRow; asset:  FloorAssetRow;   trail: AssetTrailRow[]; loadingTrail: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAL  = '#0d9488'
const RED   = '#dc2626'
const AMBER = '#d97706'

const TIER_STYLE = {
  stocked:   { bg: '#0d9488', text: '#fff',    subtext: 'rgba(255,255,255,0.8)', border: 'transparent', badge: 'rgba(255,255,255,0.22)', badgeText: '#fff',    dot: '#fff' },
  fine:      { bg: '#f0fdfb', text: '#0f4f4a', subtext: '#1e7268',              border: '#99f6e4',      badge: '#ccfbf1',                badgeText: TEAL,      dot: TEAL },
  tight:     { bg: '#fef9ec', text: '#78350f', subtext: '#92400e',              border: '#fde68a',      badge: '#fef3c7',                badgeText: AMBER,     dot: AMBER },
  shortfall: { bg: '#fff1f2', text: '#881337', subtext: '#9f1239',              border: '#fecdd3',      badge: '#ffe4e6',                badgeText: RED,       dot: RED },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFloorTier(row: IHFloorStatusRow): { label: string; tier: keyof typeof TIER_STYLE; pct: number } {
  const pct = row.totalDays > 0 ? Math.round((row.daysEnough / row.totalDays) * 100) : 0
  if (row.status === 'short') return { label: 'SHORT AT THE RUSH',  tier: 'shortfall', pct }
  if (row.status === 'tight') return { label: 'TIGHT',              tier: 'tight',     pct }
  if (pct >= 95)              return { label: 'COMFORTABLY STOCKED', tier: 'stocked',  pct }
  return                             { label: 'FINE',               tier: 'fine',      pct }
}

function floorDescription(row: IHFloorStatusRow): string {
  const avg   = row.avgCount
  const par   = row.par
  const extra = avg - par
  if (extra >= 0) return `${avg} on hand — ${extra} more than needed`
  return `${avg} on hand — ${Math.abs(extra)} below par`
}

function floorTooltip(row: IHFloorStatusRow): string {
  const avg   = row.avgCount
  const par   = row.par
  const extra = avg - par
  if (extra >= 0) return `${avg} on hand for a rush that needs ${par}`
  return `${avg} on hand for a rush that needs ${par} — ${Math.abs(extra)} short`
}

function fmtTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
}

function fmtDateHeader(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const today     = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const label = sameDay(d, today)     ? 'Today'
              : sameDay(d, yesterday) ? 'Yesterday'
              : ''
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return label ? `${label} · ${dateStr}` : dateStr
}

function getDateKey(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function fmtAgo(iso: string): string {
  if (!iso) return '—'
  const d    = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diff = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diff < 1)  return 'just now'
  if (diff < 60) return `${diff} min ago`
  const h = Math.floor(diff / 60)
  if (h < 24)    return `${h} hr ago`
  return `${Math.floor(h / 24)} day ago`
}

function fmtDuration(mins: number): string {
  if (mins <= 0)  return '—'
  if (mins < 2)   return '< 2 min'
  if (mins < 60)  return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

function trailContext(mins: number, floor: string): string {
  const unknown = !floor || floor.toLowerCase().includes('unknown')
  if (unknown)     return 'Signal lost or outside coverage'
  if (mins >= 480) return 'Parked overnight, unused'
  if (mins >= 120) return 'Sitting in one place — check if needed elsewhere'
  if (mins >= 30)  return 'Active stay'
  if (mins >= 5)   return 'Brief stop'
  return 'Quick pass-through'
}

// Color encodes how long the asset was at this location
function trailColor(mins: number, isUnknown: boolean): string {
  if (isUnknown) return '#e2e8f0'
  if (mins >= 480) return '#f59e0b'  // amber  — parked overnight
  if (mins >= 120) return '#f97316'  // orange — sitting unused
  if (mins >= 30)  return TEAL       // teal   — active stay
  if (mins >= 5)   return '#94a3b8'  // slate  — brief stop
  return '#e2e8f0'                   // light  — quick pass-through
}

// Muted text color matching the classification
function trailTextColor(mins: number, isUnknown: boolean): string {
  if (isUnknown) return 'text.disabled'
  if (mins >= 480) return '#d97706'
  if (mins >= 120) return '#ea580c'
  if (mins >= 30)  return '#0f766e'
  return 'text.secondary'
}

// Log-scaled connector height: longer sessions → taller gap between rows
function connectorPb(mins: number): number {
  if (mins < 5)   return 1.5   // 12px — pass-through: minimal
  if (mins < 30)  return 2.5   // 20px — brief stop
  if (mins < 120) return 3.5   // 28px — active stay
  if (mins < 480) return 5     // 40px — sitting unused
  return 7                     // 56px — overnight
}

// Connector line thickness scales with session length
function connectorWidth(mins: number): number {
  if (mins < 120) return 2   // brief / pass-through / active
  if (mins < 480) return 3   // sitting unused
  return 4                   // overnight
}

// Split "Room Name (zoneCode)" → { name, code }
function parseZone(raw: string): { name: string; code: string | null } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  return m ? { name: m[1].trim(), code: m[2] } : { name: raw, code: null }
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchIH(
  clientId:     string,
  dashboardKey: string,
  queryType:    string,
  filters:      Record<string, string>,
  signal:       AbortSignal,
): Promise<Record<string, unknown>[]> {
  const res = await fetch('/api/v1/insight-hub/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ clientId, dashboardKey, queryType, filters }),
    signal,
  })
  if (!res.ok) throw new Error(await res.text())
  const data = (await res.json()) as { rows?: Record<string, unknown>[] }
  return data.rows ?? []
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items: [keyof typeof TIER_STYLE, string][] = [
    ['stocked',   'Comfortably stocked'],
    ['fine',      'Fine'],
    ['tight',     'Tight'],
    ['shortfall', 'Frequent shortfall'],
  ]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: 0.5 }}>
      {items.map(([tier, label]) => {
        const s = TIER_STYLE[tier]
        return (
          <Box key={tier} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width:        14,
                height:       14,
                borderRadius: '3px',
                bgcolor:      s.bg,
                border:       `1px solid ${s.border || '#e2e8f0'}`,
                flexShrink:   0,
              }}
            />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ── Floor Card (Level 1) ──────────────────────────────────────────────────────

function FloorCard({ row, onClick }: { row: IHFloorStatusRow; onClick: () => void }) {
  const { tier, label, pct } = getFloorTier(row)
  const s       = TIER_STYLE[tier]
  const desc    = floorDescription(row)
  const tooltip = floorTooltip(row)
  const [tipOpen, setTipOpen] = useState(false)

  return (
    <Box
      onClick={onClick}
      onMouseEnter={() => setTipOpen(true)}
      onMouseLeave={() => setTipOpen(false)}
      sx={{
        bgcolor:      s.bg,
        border:       `1.5px solid ${s.border}`,
        borderRadius: 2.5,
        p:            2,
        cursor:       'pointer',
        position:     'relative',
        transition:   'transform 0.12s, box-shadow 0.12s',
        '&:hover':    { transform: 'translateY(-2px)', boxShadow: '0 6px 16px rgba(0,0,0,0.1)' },
      }}
    >
      {/* Floor name */}
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: s.text, lineHeight: 1.3, mb: 1, minHeight: 28 }}>
        {row.floor}
      </Typography>

      {/* Large pct */}
      <Typography sx={{ fontSize: 30, fontWeight: 900, color: s.text, lineHeight: 1, mb: 0.5 }}>
        {pct}<Box component="span" sx={{ fontSize: 16, fontWeight: 700 }}>%</Box>
      </Typography>

      {/* Status badge */}
      <Box
        sx={{
          display:      'inline-block',
          bgcolor:      s.badge,
          color:        s.badgeText,
          fontSize:     9,
          fontWeight:   800,
          letterSpacing:'0.08em',
          px:           0.75,
          py:           0.3,
          borderRadius: 1,
          mb:           1,
          textTransform:'uppercase',
        }}
      >
        {label}
      </Box>

      {/* Description */}
      <Typography sx={{ fontSize: 11, color: s.subtext, lineHeight: 1.45 }}>
        {desc}
      </Typography>

      {/* Hover tooltip */}
      {tipOpen && (
        <Box
          sx={{
            position:     'absolute',
            bottom:       'calc(100% + 8px)',
            left:         '50%',
            transform:    'translateX(-50%)',
            bgcolor:      '#1e293b',
            color:        '#fff',
            fontSize:     12,
            fontWeight:   500,
            px:           1.5,
            py:           0.75,
            borderRadius: 1.5,
            whiteSpace:   'nowrap',
            zIndex:       10,
            pointerEvents:'none',
            boxShadow:    '0 4px 12px rgba(0,0,0,0.2)',
            '&::after': {
              content:  '""',
              position: 'absolute',
              top:      '100%',
              left:     '50%',
              transform:'translateX(-50%)',
              border:   '5px solid transparent',
              borderTopColor: '#1e293b',
            },
          }}
        >
          {tooltip}
        </Box>
      )}
    </Box>
  )
}

// ── Asset row (Level 2) ───────────────────────────────────────────────────────

function AssetListRow({
  asset,
  statusDot,
  onSeeTrail,
}: {
  asset:      FloorAssetRow
  statusDot?: string
  onSeeTrail: () => void
}) {
  return (
    <Box
      onClick={onSeeTrail}
      sx={{
        display:     'grid',
        gridTemplateColumns: 'auto 1fr auto auto auto',
        alignItems:  'center',
        gap:         1.5,
        px:          2,
        py:          1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        cursor:      'pointer',
        '&:last-child': { borderBottom: 'none' },
        '&:hover': { bgcolor: '#f8fafc' },
      }}
    >
      {/* Status dot */}
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusDot ?? TEAL, flexShrink: 0 }} />

      {/* Name + VIN + type + sub-location */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.3 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
            {asset.assetName || asset.vin}
          </Typography>
          {asset.assetName && (
            <Typography component="span" sx={{ fontSize: 11, color: 'text.disabled', fontFamily: 'monospace' }}>
              {asset.vin}
            </Typography>
          )}
          {asset.assetType && (
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
              · {asset.assetType}
            </Typography>
          )}
        </Box>
        {asset.subGeo && (
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {parseZone(asset.subGeo).name}
          </Typography>
        )}
      </Box>

      {/* Here since */}
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>here since</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
          {fmtTime(asset.prevSeen)}
        </Typography>
      </Box>

      {/* Last confirmed */}
      <Box sx={{ textAlign: 'right' }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>last confirmed</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary' }}>
          {fmtAgo(asset.lastSeen)}
        </Typography>
      </Box>

      {/* Chevron */}
      <Box sx={{ color: 'text.disabled', flexShrink: 0 }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Box>
    </Box>
  )
}

// ── Floor mini-map (Level 3) ──────────────────────────────────────────────────

function FloorMiniMap({
  allFloors,
  visitOrderMap,
}: {
  allFloors:    IHFloorStatusRow[]
  visitOrderMap:Map<string, number>
}) {
  const sorted = [...allFloors].sort((a, b) => a.floor.localeCompare(b.floor))

  return (
    <Box
      sx={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap:                 1,
      }}
    >
      {sorted.map((f) => {
        const order    = visitOrderMap.get(f.floor)
        const visited  = order !== undefined
        const { tier } = getFloorTier(f)
        const s        = TIER_STYLE[tier]
        return (
          <Box
            key={f.floor}
            sx={{
              borderRadius: 1.5,
              border:       `1px solid ${visited ? TEAL : '#e2e8f0'}`,
              bgcolor:      visited ? '#f0fdfb' : '#fafafa',
              p:            0.875,
              position:     'relative',
              minHeight:    44,
              display:      'flex',
              flexDirection:'column',
              justifyContent:'flex-end',
            }}
          >
            {visited && (
              <Box
                sx={{
                  position:      'absolute',
                  top:           4,
                  right:         5,
                  width:         18,
                  height:        18,
                  borderRadius:  '50%',
                  bgcolor:       TEAL,
                  color:         '#fff',
                  fontSize:      10,
                  fontWeight:    700,
                  display:       'flex',
                  alignItems:    'center',
                  justifyContent:'center',
                  lineHeight:    1,
                }}
              >
                {order}
              </Box>
            )}
            <Box
              sx={{
                width:        6,
                height:       6,
                borderRadius: '50%',
                bgcolor:      s.bg === '#fff' ? '#e2e8f0' : s.bg,
                mb:           0.4,
                opacity:      visited ? 1 : 0.4,
              }}
            />
            <Typography
              sx={{
                fontSize:   9.5,
                fontWeight: visited ? 700 : 400,
                color:      visited ? TEAL : 'text.disabled',
                lineHeight: 1.2,
              }}
            >
              {f.floor}
            </Typography>
          </Box>
        )
      })}
    </Box>
  )
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function Breadcrumb({ parts }: { parts: { label: string; onClick?: () => void }[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
      {parts.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {i > 0 && (
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>›</Typography>
          )}
          <Typography
            onClick={p.onClick}
            sx={{
              fontSize:   12,
              fontWeight: i === parts.length - 1 ? 700 : 400,
              color:      p.onClick ? TEAL : 'text.primary',
              cursor:     p.onClick ? 'pointer' : 'default',
              '&:hover':  p.onClick ? { textDecoration: 'underline' } : {},
            }}
          >
            {p.label}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

// ── Back button ───────────────────────────────────────────────────────────────

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display:    'inline-flex',
        alignItems: 'center',
        gap:        0.5,
        color:      'text.secondary',
        fontSize:   12,
        fontWeight: 600,
        cursor:     'pointer',
        '&:hover':  { color: 'text.primary' },
        mb:         2,
      }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface CheckItYourselfProps {
  rows:          IHFloorStatusRow[]
  clientId:      string
  dashboardKey:  string
  assetType?:    string
  externalFloor?: string
}

export default function CheckItYourself({ rows, clientId, dashboardKey, assetType, externalFloor }: CheckItYourselfProps) {
  const [level, setLevel]   = useState<Level>({ kind: 'floors' })
  const abortRef            = useRef<AbortController | null>(null)

  const cancelPrev = useCallback(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    return ctrl.signal
  }, [])

  // ── Select a floor card ────────────────────────────────────────────────────

  const selectFloor = useCallback(async (floorRow: IHFloorStatusRow) => {
    const signal  = cancelPrev()
    setLevel({ kind: 'floor', floorRow, assets: [], loadingAssets: true })
    const filters: Record<string, string> = { floor: floorRow.floor }
    if (assetType) filters.assetType = assetType

    try {
      const rawRows = await fetchIH(clientId, dashboardKey, 'floor-assets', filters, signal)
      const assets: FloorAssetRow[] = rawRows
        .map((r) => ({
          vin:       String(r['[VIN]']       ?? '').trim(),
          assetName: String(r['[AssetName]'] ?? '').trim(),
          assetType: String(r['[AssetType]'] ?? '').trim(),
          subGeo:    String(r['[SubGeo]']    ?? '').trim(),
          lastSeen:  String(r['[LastSeen]']  ?? '').trim(),
          prevSeen:  String(r['[PrevSeen]']  ?? '').trim(),
        }))
        .filter((a) => a.vin)
      setLevel((prev) =>
        prev.kind === 'floor' && prev.floorRow.floor === floorRow.floor
          ? { ...prev, assets, loadingAssets: false }
          : prev
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setLevel((prev) => prev.kind === 'floor' ? { ...prev, loadingAssets: false } : prev)
    }
  }, [clientId, dashboardKey, assetType, cancelPrev])

  // ── Jump to a specific floor when parent sets externalFloor ──────────────
  const externalFloorRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!externalFloor || externalFloor === externalFloorRef.current) return
    externalFloorRef.current = externalFloor
    const target = rows.find((r) => r.floor === externalFloor)
    if (target) selectFloor(target)
  }, [externalFloor, rows, selectFloor])

  // ── Select "See its trail" ─────────────────────────────────────────────────

  const selectTrail = useCallback(async (floorRow: IHFloorStatusRow, asset: FloorAssetRow) => {
    const signal = cancelPrev()
    setLevel({ kind: 'trail', floorRow, asset, trail: [], loadingTrail: true })

    try {
      const rawRows = await fetchIH(clientId, dashboardKey, 'asset-trail', { vin: asset.vin }, signal)
      const trail: AssetTrailRow[] = rawRows.map((r) => ({
        floor:        String(r['[FloorLevel]']   ?? '').trim(),
        subGeo:       String(r['[SubGeoZone]']   ?? '').trim(),
        sessionStart: String(r['[StartTime]']    ?? '').trim(),
        sessionEnd:   '',
        assetType:    String(r['[AssetType]']    ?? '').trim(),
        durMins:      typeof r['[DurMins]'] === 'number' ? Math.round(r['[DurMins]'] as number) : 0,
      }))
      setLevel((prev) =>
        prev.kind === 'trail' && prev.asset.vin === asset.vin
          ? { ...prev, trail, loadingTrail: false }
          : prev
      )
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setLevel((prev) => prev.kind === 'trail' ? { ...prev, loadingTrail: false } : prev)
    }
  }, [clientId, dashboardKey, cancelPrev])

  // ── Back nav ───────────────────────────────────────────────────────────────

  const backToFloors = useCallback(() => {
    cancelPrev()
    setLevel({ kind: 'floors' })
  }, [cancelPrev])

  const backToFloor = useCallback((floorRow: IHFloorStatusRow) => {
    void selectFloor(floorRow)
  }, [selectFloor])

  // ── Derived ────────────────────────────────────────────────────────────────

  const problemFloors   = rows.filter((r) => r.status !== 'enough')
  const problemSummary  = problemFloors.length === 0
    ? 'All floors are comfortably stocked based on the last 7 days.'
    : problemFloors.length === 1
      ? `1 floor shows a pattern concern — ${problemFloors[0].floor}`
      : `${problemFloors.length} floors show pattern concerns`

  // ── Render ─────────────────────────────────────────────────────────────────

  if (rows.length === 0) return null

  // ──── LEVEL 1 — Floor grid ────────────────────────────────────────────────

  if (level.kind === 'floors') {
    return (
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 2.5, sm: 3 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color: 'text.primary', lineHeight: 1.2 }}>
            Dive deeper.
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.disabled', mt: 0.5, flexShrink: 0 }}>
            Tap a rectangle to open it →
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, mb: 2 }}>
          Which floors run short of {assetType?.toLowerCase() ?? 'equipment'}, and when? Every claim above is built from counts like these — drill down to any single device.
        </Typography>

        {/* "All places" pill */}
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display:      'inline-flex',
              alignItems:   'center',
              bgcolor:      '#f0fdfb',
              color:        TEAL,
              border:       `1.5px solid ${TEAL}40`,
              fontSize:     12,
              fontWeight:   600,
              px:           1.5,
              py:           0.5,
              borderRadius: 10,
            }}
          >
            All floors
          </Box>
        </Box>

        {/* Floor card grid */}
        <Box
          sx={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap:                 1.5,
            mb:                  2.5,
          }}
        >
          {[...rows]
            .sort((a, b) => {
              const tierOrder = { short: 0, tight: 1, enough: 2 }
              return tierOrder[a.status] - tierOrder[b.status] || a.floor.localeCompare(b.floor)
            })
            .map((row) => (
              <FloorCard key={row.floor} row={row} onClick={() => void selectFloor(row)} />
            ))}
        </Box>

        {/* Legend + footnote */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Legend />
          <Typography sx={{ fontSize: 11, color: 'text.disabled', maxWidth: 340, textAlign: 'right' }}>
            Deeper colour = further from par. Tiles are floors, not shares — they don&apos;t add up to anything.
          </Typography>
        </Box>
      </Box>
    )
  }

  // ──── LEVEL 2 — Floor detail with asset list ──────────────────────────────

  if (level.kind === 'floor') {
    const { floorRow, assets, loadingAssets } = level
    const { tier, label, pct }                = getFloorTier(floorRow)
    const s                                   = TIER_STYLE[tier]

    return (
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 2.5, sm: 3 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {/* Breadcrumb nav */}
        <Breadcrumb
          parts={[
            { label: 'All floors', onClick: backToFloors },
            { label: floorRow.floor },
          ]}
        />

        {/* Floor summary banner */}
        <Box
          sx={{
            display:      'flex',
            alignItems:   'center',
            flexWrap:     'wrap',
            gap:          1.5,
            p:            { xs: 1.5, sm: 2 },
            borderRadius: 2.5,
            bgcolor:      s.bg,
            border:       `1.5px solid ${s.border}`,
            mb:           2.5,
          }}
        >
          <Typography sx={{ fontSize: 18, fontWeight: 900, color: s.text, lineHeight: 1 }}>
            {floorRow.floor}
          </Typography>
          <Box
            sx={{
              bgcolor:       s.badge,
              color:         s.badgeText,
              fontSize:      10,
              fontWeight:    800,
              letterSpacing: '0.08em',
              px:            1,
              py:            0.35,
              borderRadius:  1.5,
              textTransform: 'uppercase',
              flexShrink:    0,
            }}
          >
            {label}
          </Box>
          <Typography sx={{ fontSize: 13, color: s.subtext, flex: 1, lineHeight: 1.5 }}>
            Meets par <Box component="span" sx={{ fontWeight: 700, color: s.text }}>{pct}% of mornings</Box>
            {' · '}{floorTooltip(floorRow)}
          </Typography>
        </Box>

        {/* Asset list heading */}
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 1.25 }}>
          Assets seen here in the last 48 hours
        </Typography>

        {/* Loading */}
        {loadingAssets && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
            <CircularProgress size={18} sx={{ color: TEAL }} />
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Loading assets on {floorRow.floor}…
            </Typography>
          </Box>
        )}

        {/* Asset rows */}
        {!loadingAssets && assets.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'text.disabled', py: 2 }}>
            No tagged assets seen on this floor in the last 48 hours.
          </Typography>
        )}

        {!loadingAssets && assets.length > 0 && (
          <Box
            sx={{
              border:       '1px solid',
              borderColor:  'divider',
              borderRadius: 2,
              overflow:     'hidden',
            }}
          >
            {assets.map((asset) => (
              <AssetListRow
                key={asset.vin}
                asset={asset}
                statusDot={s.dot}
                onSeeTrail={() => void selectTrail(floorRow, asset)}
              />
            ))}
          </Box>
        )}

        {!loadingAssets && assets.length > 0 && (
          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: 11, lineHeight: 1.7, color: 'text.secondary' }}>
              <Box component="span" sx={{ fontWeight: 800, color: TEAL, letterSpacing: '0.05em', fontSize: 10, textTransform: 'uppercase', mr: 0.75 }}>
                Why this matters
              </Box>
              These are real, named devices sitting on this floor right now — not an average. If a device shown here is actually somewhere else, that&apos;s exactly the kind of thing to flag. Click a row to see its full trail.
            </Typography>
          </Box>
        )}
      </Box>
    )
  }

  // ──── LEVEL 3 — Asset trail ───────────────────────────────────────────────

  if (level.kind === 'trail') {
    const { floorRow, asset, trail, loadingTrail } = level

    // Compute visit order: map from floor name → order of first visit (skip Unknown)
    const visitOrderMap = new Map<string, number>()
    trail.forEach((t) => {
      const floorKey = t.floor && !t.floor.toLowerCase().includes('unknown') ? t.floor : null
      if (floorKey && !visitOrderMap.has(floorKey)) {
        visitOrderMap.set(floorKey, visitOrderMap.size + 1)
      }
    })

    return (
      <Box
        sx={{
          bgcolor:      'background.paper',
          borderRadius: 3,
          p:            { xs: 2.5, sm: 3 },
          boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <BackButton label="Back to the list" onClick={() => backToFloor(floorRow)} />

        <Breadcrumb
          parts={[
            { label: 'All floors',  onClick: backToFloors },
            { label: floorRow.floor, onClick: () => backToFloor(floorRow) },
            { label: asset.assetName || asset.vin },
          ]}
        />

        {/* Asset header */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
          {/* Icon */}
          <Box
            sx={{
              width:        36,
              height:       36,
              borderRadius: 2,
              bgcolor:      '#f0fdfb',
              border:       `1px solid ${TEAL}30`,
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              flexShrink:   0,
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <rect x="2" y="3" width="20" height="13" rx="2" stroke={TEAL} strokeWidth="1.8" />
              <path d="M5 9.5H7L9 6.5L11.5 12.5L13.5 8L15 9.5H19" stroke={TEAL} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="16" x2="12" y2="19" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" />
              <line x1="8"  y1="19" x2="16" y2="19" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </Box>

          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary', lineHeight: 1.1 }}>
              {asset.assetName || asset.vin}
            </Typography>
            {asset.assetName && (
              <Typography sx={{ fontSize: 11, color: 'text.disabled', fontFamily: 'monospace' }}>{asset.vin}</Typography>
            )}
            {asset.assetType && (
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{asset.assetType}</Typography>
            )}
          </Box>

          {/* Badges */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ bgcolor: '#f0fdfb', border: `1px solid ${TEAL}40`, color: TEAL, fontSize: 11, fontWeight: 600, px: 1, py: 0.35, borderRadius: 1 }}>
              Tag healthy
            </Box>
            <Box sx={{ bgcolor: '#f0fdfb', border: `1px solid ${TEAL}40`, color: TEAL, fontSize: 11, fontWeight: 600, px: 1, py: 0.35, borderRadius: 1 }}>
              Last confirmed {fmtAgo(asset.lastSeen)}
              {asset.subGeo && !asset.subGeo.toLowerCase().includes('unknown') ? ` · ${asset.subGeo}` : ''}
            </Box>
          </Box>
        </Box>

        {/* Loading */}
        {loadingTrail && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 3 }}>
            <CircularProgress size={18} sx={{ color: TEAL }} />
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Loading trail for {asset.assetName || asset.vin}…
            </Typography>
          </Box>
        )}

        {!loadingTrail && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>

            {/* Left — Timeline */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
                Trail over the last 48 hours, hour by hour
              </Typography>

              {trail.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>
                  No sessions recorded for this asset in the last 48 hours.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {trail.map((t, i) => {
                    const isUnknown    = !t.floor || t.floor.toLowerCase().includes('unknown')
                    const color        = trailColor(t.durMins, isUnknown)
                    const textColor    = trailTextColor(t.durMins, isUnknown)
                    const pb           = connectorPb(t.durMins)
                    const cw           = connectorWidth(t.durMins)
                    const dotSize      = 6 + cw
                    const dotLeft      = -(dotSize / 2 + cw / 2)
                    const zone         = parseZone(t.subGeo || '')
                    const thisDateKey  = getDateKey(t.sessionStart)
                    const prevDateKey  = i > 0 ? getDateKey(trail[i - 1].sessionStart) : null
                    const showDateHdr  = thisDateKey !== prevDateKey

                    return (
                      <Box key={i}>
                        {/* ── Date group header ── */}
                        {showDateHdr && (
                          <Box
                            sx={{
                              display:    'flex',
                              alignItems: 'center',
                              gap:        1.5,
                              mt:         i === 0 ? 0 : 2,
                              mb:         1.5,
                            }}
                          >
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                            <Typography
                              sx={{
                                fontSize:      11,
                                fontWeight:    700,
                                color:         'text.disabled',
                                letterSpacing: '0.04em',
                                whiteSpace:    'nowrap',
                                textTransform: 'uppercase',
                              }}
                            >
                              {fmtDateHeader(t.sessionStart)}
                            </Typography>
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                          </Box>
                        )}

                        {/* ── Trail row ── */}
                        <Box
                          sx={{
                            display:             'grid',
                            gridTemplateColumns: '72px 1fr',
                            gap:                 1.5,
                          }}
                        >
                          {/* Time column */}
                          <Box sx={{ pt: 0.25, pb }}>
                            <Typography
                              sx={{
                                fontSize:   12,
                                fontWeight: 700,
                                color:      isUnknown ? 'text.disabled' : 'text.primary',
                                lineHeight: 1.2,
                              }}
                            >
                              {fmtTime(t.sessionStart)}
                            </Typography>
                          </Box>

                          {/* Content column with vertical timeline line */}
                          <Box
                            sx={{
                              borderLeft:  `${cw}px solid`,
                              borderColor: color,
                              pl:          1.5,
                              pb,
                              position:    'relative',
                              '&::before': {
                                content:      '""',
                                position:     'absolute',
                                left:         dotLeft,
                                top:          7,
                                width:        dotSize,
                                height:       dotSize,
                                borderRadius: '50%',
                                bgcolor:      color,
                              },
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize:   13,
                                fontWeight: 600,
                                color:      isUnknown ? 'text.disabled' : 'text.primary',
                                lineHeight: 1.35,
                              }}
                            >
                              {isUnknown
                                ? 'Outside tag coverage'
                                : t.subGeo && t.subGeo !== t.floor
                                  ? `${t.floor}, ${zone.name}`
                                  : t.floor}
                              {!isUnknown && zone.code && (
                                <Box
                                  component="span"
                                  sx={{ fontSize: 10, color: 'text.disabled', fontFamily: 'monospace', ml: 0.75 }}
                                >
                                  {zone.code}
                                </Box>
                              )}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: textColor, mt: 0.25, lineHeight: 1.5 }}>
                              {trailContext(t.durMins, t.floor)}
                              {t.durMins > 0 && (
                                <Box
                                  component="span"
                                  sx={{ fontWeight: 600, color: isUnknown ? 'text.disabled' : 'text.primary' }}
                                >
                                  {' · '}{fmtDuration(t.durMins)}
                                </Box>
                              )}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              )}
            </Box>

            {/* Right — Floor mini-map */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                Same trail on the floor map
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1.5 }}>
                Numbers = order visited
              </Typography>
              {rows.length > 0 ? (
                <FloorMiniMap allFloors={rows} visitOrderMap={visitOrderMap} />
              ) : (
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No floor map available.</Typography>
              )}
            </Box>

          </Box>
        )}

        {/* Footer actions */}
        {!loadingTrail && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
            <Box
              onClick={() => backToFloor(floorRow)}
              sx={{
                display:    'inline-flex',
                alignItems: 'center',
                gap:        0.5,
                fontSize:   12,
                fontWeight: 600,
                color:      'text.secondary',
                cursor:     'pointer',
                px:         1.5,
                py:         0.75,
                borderRadius: 10,
                border:     '1px solid',
                borderColor:'divider',
                '&:hover':  { bgcolor: '#f8fafc' },
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to the list
            </Box>
            <Box
              sx={{
                display:    'inline-flex',
                alignItems: 'center',
                gap:        0.5,
                fontSize:   12,
                fontWeight: 600,
                color:      '#fff',
                bgcolor:    TEAL,
                cursor:     'pointer',
                px:         1.75,
                py:         0.75,
                borderRadius: 10,
                '&:hover':  { bgcolor: '#0f766e' },
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Something looks wrong — flag this device
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  return null
}
