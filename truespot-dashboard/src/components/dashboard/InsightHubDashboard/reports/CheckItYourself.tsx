'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import type { IHFloorStatusRow } from '@/hooks/useInsightHubData'
import { parseFacilityLocalParts, facilityLocalToUtcInstant, getFacilityParts } from '@/utils/formatters'

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
  category:     string   // 'patient' | 'moving_cleaning' | 'exit' | 'unknown' | 'sitting_unused'
  batteryLevel: number | null  // 0-100, null if not reported for this session
}

type Level =
  | { kind: 'floors' }
  | { kind: 'floor';  floorRow: IHFloorStatusRow; assets: FloorAssetRow[]; loadingAssets: boolean }
  | { kind: 'trail';  floorRow: IHFloorStatusRow; asset:  FloorAssetRow;   trail: AssetTrailRow[]; loadingTrail: boolean }

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAL  = '#0d9488'
const RED   = '#ef4444'
const AMBER = '#d97706'

// Solid fills for every status, not just "stocked" — a short/tight floor should
// read as urgent at a glance, not blend in as a pale tile among green ones.
const TIER_STYLE = {
  stocked:   { bg: TEAL,  text: '#fff', subtext: 'rgba(255,255,255,0.85)', border: 'transparent', badge: 'rgba(255,255,255,0.22)', badgeText: '#fff', dot: '#fff' },
  tight:     { bg: AMBER, text: '#fff', subtext: 'rgba(255,255,255,0.85)', border: 'transparent', badge: 'rgba(255,255,255,0.22)', badgeText: '#fff', dot: '#fff' },
  shortfall: { bg: RED,   text: '#fff', subtext: 'rgba(255,255,255,0.85)', border: 'transparent', badge: 'rgba(255,255,255,0.22)', badgeText: '#fff', dot: '#fff' },
  // Same amber as 'tight' — distinct key so the Level-1 par-coverage grid's
  // "sitting on way more than it needs" case reads separately from Level 2/3's
  // day-based "ran tight some days" concept, even though they share a color.
  hoarding:  { bg: AMBER, text: '#fff', subtext: 'rgba(255,255,255,0.85)', border: 'transparent', badge: 'rgba(255,255,255,0.22)', badgeText: '#fff', dot: '#fff' },
}

// Par-coverage bands for the Level-1 floor grid — how much is on hand, on
// average, relative to what the floor needs at the rush.
export const HOARD_PCT    = 130  // 30%+ over par, on average → sitting on more than needed
export const NEAR_PAR_PCT = 90   // under 90% of par, on average → short at the rush

// ── Helpers ───────────────────────────────────────────────────────────────────

// The single tier definition shared by every level of this page (grid tiles,
// summary cards, floor-detail banner, floor mini-map) — how well-stocked a
// floor is on average, relative to par. Percentage is capped at 100 for
// display (a floor sitting on 2x par still just reads "100%"); the real
// surplus/deficit shows in the description text alongside it.
export function getFloorParTier(row: IHFloorStatusRow): { label: string; tier: keyof typeof TIER_STYLE; pct: number } {
  const par    = row.par || 0
  const rawPct = par > 0 ? Math.round((row.avgCount / par) * 100) : 100
  const pct    = Math.min(100, rawPct)
  if (rawPct >= HOARD_PCT)    return { label: 'MORE THAN NEEDED',    tier: 'hoarding',  pct }
  if (rawPct < NEAR_PAR_PCT)  return { label: 'SHORT AT THE RUSH',   tier: 'shortfall', pct }
  return                             { label: 'COMFORTABLY STOCKED', tier: 'stocked',   pct }
}

function floorParDescription(row: IHFloorStatusRow): string {
  const diff = row.avgCount - row.par
  if (diff === 0) return 'Right at par'
  return diff > 0 ? `+${diff} above par` : `${diff} below par`
}

// Friendlier, sentence-case labels for the same tiers — used by the Legend and
// the Level-2 floor banner, where the FloorCard's shouty uppercase badge text
// ('COMFORTABLY STOCKED') would read wrong next to a full sentence.
const PAR_TIER_LABEL: Record<keyof typeof TIER_STYLE, string> = {
  stocked:   'At or near par',
  hoarding:  'More than needed (hoarding risk)',
  shortfall: 'Short at the rush',
  tight:     'Tight',
}

// One-sentence version for the Level-2 floor banner: names the actual counts
// (avg on hand vs par) rather than the abstract percentage, and highlights the
// gap in tier-matching color regardless of the banner's overall badge color.
function floorParSummary(row: IHFloorStatusRow, assetNoun: string) {
  const diff = row.avgCount - row.par
  const lead = <>At the rush this floor typically has{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{row.avgCount}</Box>{' '}{assetNoun} on hand for a par of{' '}<Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{row.par}</Box></>
  if (diff === 0) return <>{lead} — right at par.</>
  const over = diff > 0
  return <>{lead} — about{' '}<Box component="span" sx={{ fontWeight: 700, color: over ? AMBER : RED }}>{Math.abs(diff)}</Box>{' '}{over ? 'more than needed' : 'short'}.</>
}

function floorTooltip(row: IHFloorStatusRow): string {
  const par = row.par
  if (row.status === 'short' || row.status === 'tight') {
    const worst = row.minCount
    const short = par - worst
    if (short > 0) return `${row.avgCount} on hand on average, but dropped to ${worst} on its worst day — ${short} short of the ${par} needed`
    return `${row.avgCount} on hand on average — as low as ${worst} on its tightest day (par: ${par})`
  }
  const avg   = row.avgCount
  const extra = avg - par
  if (extra >= 0) return `${avg} on hand for a rush that needs ${par}`
  return `${avg} on hand for a rush that needs ${par} — ${Math.abs(extra)} short`
}

const DAY_NAMES_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Shows the facility's own local clock time as literally recorded — AppendFinal's
// timestamps are already facility-local wall-clock time, so no timezone
// conversion is needed (or wanted — see formatters.ts).
function fmtTime(iso: string): string {
  if (!iso) return '—'
  const { hour, minute } = parseFacilityLocalParts(iso)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12  = hour % 12 || 12
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`
}

function fmtDateHeader(iso: string): string {
  if (!iso) return ''
  const p       = parseFacilityLocalParts(iso)
  if (!p.year) return ''
  const today   = getFacilityParts(new Date())
  const yesterdayDate = new Date(Date.UTC(today.year, today.month - 1, today.day) - 86400000)
  const yesterday     = getFacilityParts(yesterdayDate)
  const sameDay = (a: typeof p, b: typeof p) => a.year === b.year && a.month === b.month && a.day === b.day
  const label = sameDay(p, today)     ? 'Today'
              : sameDay(p, yesterday) ? 'Yesterday'
              : ''
  const dateStr = `${DAY_NAMES_FULL[p.weekday]}, ${MONTH_NAMES_FULL[p.month - 1]} ${p.day}, ${p.year}`
  return label ? `${label} · ${dateStr}` : dateStr
}

function getDateKey(iso: string): string {
  if (!iso) return ''
  const { year, month, day } = parseFacilityLocalParts(iso)
  if (!year) return ''
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function fmtAgo(iso: string): string {
  if (!iso) return '—'
  const d    = facilityLocalToUtcInstant(iso)
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

// Category comes from the same patient/cleaning/exit/hard-to-find classification
// used everywhere else on this dashboard (see categoryExprGFLH in daxInsightHub.ts),
// so "In use with a patient" is a real geofence match, not a guess from duration alone.
// Duration-based phrasing is the fallback for 'sitting_unused' stops, where the
// zone itself doesn't imply anything beyond how long the asset sat there.
function trailContext(mins: number, floor: string, category: string, prevCategory?: string): string {
  const unknown = !floor || floor.toLowerCase().includes('unknown')
  if (unknown || category === 'unknown') return 'Signal lost or outside coverage'
  if (category === 'patient')  return 'In use with a patient'
  if (category === 'exit')     return "Near an exit — confirm it hasn't left the building"
  if (category === 'moving_cleaning') {
    return prevCategory === 'patient'
      ? `Back on ${floor}, ready for the next patient`
      : 'In a cleaning/utility area'
  }
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
    ['stocked',   PAR_TIER_LABEL.stocked],
    ['hoarding',  PAR_TIER_LABEL.hoarding],
    ['shortfall', PAR_TIER_LABEL.shortfall],
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
  const { tier, label, pct } = getFloorParTier(row)
  const s       = TIER_STYLE[tier]
  const desc    = floorParDescription(row)
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
        const { tier } = getFloorParTier(f)
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
    // selectFloor fetches that floor's assets — a legitimate effect (syncing
    // the parent's requested floor to a data fetch), not a plain state mirror.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target) selectFloor(target)
  }, [externalFloor, rows, selectFloor])

  // ── Select "See its trail" ─────────────────────────────────────────────────

  const selectTrail = useCallback(async (floorRow: IHFloorStatusRow, asset: FloorAssetRow) => {
    const signal = cancelPrev()
    setLevel({ kind: 'trail', floorRow, asset, trail: [], loadingTrail: true })

    try {
      const rawRows = await fetchIH(clientId, dashboardKey, 'asset-trail', { vin: asset.vin }, signal)
      const trail: AssetTrailRow[] = rawRows.map((r) => {
        const rawBattery = r['[BatteryLevel]']
        const batteryNum = rawBattery != null ? Number(rawBattery) : NaN
        return {
          floor:        String(r['[FloorLevel]']   ?? '').trim(),
          subGeo:       String(r['[SubGeoZone]']   ?? '').trim(),
          sessionStart: String(r['[StartTime]']    ?? '').trim(),
          sessionEnd:   '',
          assetType:    String(r['[AssetType]']    ?? '').trim(),
          durMins:      typeof r['[DurMins]'] === 'number' ? Math.round(r['[DurMins]'] as number) : 0,
          category:     String(r['[Category]']     ?? '').trim(),
          batteryLevel: Number.isFinite(batteryNum) ? batteryNum : null,
        }
      })
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
            All places
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
              const tierOrder = { shortfall: 0, hoarding: 1, stocked: 2, tight: 2 }
              return tierOrder[getFloorParTier(a).tier] - tierOrder[getFloorParTier(b).tier]
                || a.floor.localeCompare(b.floor)
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
    // Same avg-vs-par tier as the Level-1 grid and the summary cards above —
    // not the day-based getFloorTier, so this banner never disagrees with them.
    const { tier }                            = getFloorParTier(floorRow)
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
            { label: 'All places', onClick: backToFloors },
            { label: floorRow.floor },
          ]}
        />

        {/* Floor summary banner — neutral background, colored pill does the work.
            A solid status-colored banner (matching the Level-1 tiles) reads as
            an alarm on every visit, even for "stocked" floors; the pill alone
            is enough signal here since the visitor already chose this floor. */}
        <Box
          sx={{
            display:      'flex',
            alignItems:   'center',
            flexWrap:     'wrap',
            gap:          1.5,
            p:            { xs: 1.5, sm: 2 },
            borderRadius: 2.5,
            bgcolor:      '#f8fafc',
            border:       '1px solid',
            borderColor:  'divider',
            mb:           2.5,
          }}
        >
          <Typography sx={{ fontSize: 18, fontWeight: 900, color: 'text.primary', lineHeight: 1 }}>
            {floorRow.floor}
          </Typography>
          <Box
            sx={{
              bgcolor:      s.bg,
              color:        '#fff',
              fontSize:     12,
              fontWeight:   700,
              px:           1.25,
              py:           0.4,
              borderRadius: 10,
              flexShrink:   0,
            }}
          >
            {PAR_TIER_LABEL[tier]}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', flex: 1, lineHeight: 1.5 }}>
            {floorParSummary(floorRow, assetType?.toLowerCase() ?? 'equipment')}
          </Typography>
        </Box>

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
            { label: 'All places',  onClick: backToFloors },
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
            {/* Battery — this device's own most recently reported level */}
            {(() => {
              const battery = trail[trail.length - 1]?.batteryLevel ?? null
              const low     = battery !== null && battery <= 20
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: low ? '#fef2f2' : '#f8fafc', border: `1px solid ${low ? '#fecaca' : '#e2e8f0'}`, borderRadius: 1, px: 1, py: 0.35 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={low ? '#dc2626' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="18" height="11" rx="2"/>
                    <path d="M22 11v3"/>
                    <rect x="4" y="9" width="11" height="7" rx="1" fill={low ? '#dc2626' : '#64748b'} stroke="none"/>
                  </svg>
                  <Typography sx={{ fontSize: 11, color: low ? '#b91c1c' : 'text.secondary', fontWeight: low ? 700 : 600 }}>
                    {battery !== null ? `Battery ${battery}%` : 'Battery —'}
                  </Typography>
                </Box>
              )
            })()}
            <Box sx={{ bgcolor: '#f0fdfb', border: `1px solid ${TEAL}40`, color: TEAL, fontSize: 11, fontWeight: 600, px: 1, py: 0.35, borderRadius: 1 }}>
              Last confirmed {fmtAgo(asset.lastSeen)}
              {asset.subGeo && !asset.subGeo.toLowerCase().includes('unknown') ? ` · ${asset.subGeo}` : ''}
            </Box>
            {/* Signal quality — illustrative placeholder; needs a real-time device
                telemetry feed to be accurate. Open item, not a hidden gap. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1, px: 1, py: 0.35 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                <circle cx="12" cy="20" r="1" fill="#64748b" stroke="none"/>
              </svg>
              <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Signal good</Typography>
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
                              {trailContext(t.durMins, t.floor, t.category, i > 0 ? trail[i - 1].category : undefined)}
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
