'use client'

import React, { useState, useRef } from 'react'
import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import type {
  IHLocationCategoryRow,
  IHCategoryAssetRow,
  IHCategoryDailyRow,
  IHAssetTrailRow,
  IHPeakData,
} from '@/hooks/useInsightHubData'
import { parseUtcTimestamp, getFacilityParts } from '@/utils/formatters'

const TEAL = '#0d9488'

// ── Category metadata ──────────────────────────────────────────────────────────

interface CatMeta {
  label:    string
  sublabel: string
  badge:    string
  bg:       string
  fg:       string
  badgeBg:  string
  badgeFg:  string
}

const AMBER      = '#d97706'
const RED        = '#ef4444'
const DARK_NAVY  = '#0c2340'

// 5 location-status categories — matches categoryExprGFLH and the same status
// vocabulary used everywhere else in the app (With Patient / Moving-Cleaning /
// Exit / Sitting Unused / Hard to Find), rather than raw building names.
const CAT_META: Record<string, CatMeta> = {
  patient: {
    label:    'With Patient',
    sublabel: 'Clinical · active',
    badge:    'WHERE IT SHOULD BE',
    bg:       TEAL,
    fg:       '#fff',
    badgeBg:  'rgba(255,255,255,0.18)',
    badgeFg:  '#fff',
  },
  moving_cleaning: {
    label:    'Moving / Cleaning',
    sublabel: 'Turnover',
    badge:    'CLEANING & PREP',
    bg:       AMBER,
    fg:       '#fff',
    badgeBg:  'rgba(255,255,255,0.18)',
    badgeFg:  '#fde68a',
  },
  exit: {
    label:    'Exit',
    sublabel: 'Off the radar',
    badge:    'OFF THE RADAR',
    bg:       RED,
    fg:       '#fff',
    badgeBg:  'rgba(255,255,255,0.18)',
    badgeFg:  '#fca5a5',
  },
  sitting_unused: {
    label:    'Sitting Unused',
    sublabel: 'Idle, wherever it is',
    badge:    'SITTING UNUSED',
    bg:       '#f1f5f9',
    fg:       '#0f172a',
    badgeBg:  '#e2e8f0',
    badgeFg:  '#475569',
  },
  unknown: {
    label:    'Hard to Find',
    sublabel: 'Off the radar',
    badge:    'OFF THE RADAR',
    bg:       DARK_NAVY,
    fg:       '#fff',
    badgeBg:  'rgba(255,255,255,0.12)',
    badgeFg:  '#93c5fd',
  },
}

const LEGEND = [
  { color: TEAL,       label: 'With Patient' },
  { color: AMBER,      label: 'Moving / Cleaning' },
  { color: RED,        label: 'Exit' },
  { color: '#e2e8f0',  label: 'Sitting Unused', border: '#94a3b8' },
  { color: DARK_NAVY,  label: 'Hard to Find' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - parseUtcTimestamp(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// Shows the facility's own local clock time (Eastern, DST-aware) — not the
// viewer's browser timezone and not the raw UTC digits.
function fmtTime(iso: string): string {
  if (!iso) return ''
  const { hour, minute } = getFacilityParts(parseUtcTimestamp(iso))
  const ampm = hour >= 12 ? 'pm' : 'am'
  const h12  = hour % 12 || 12
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`
}

function formatPeakHour(hour: number): string {
  if (hour === 0)  return '12am'
  if (hour < 12)   return `${hour}am`
  if (hour === 12) return '12pm'
  return `${hour - 12}pm`
}

function trailLabel(row: IHAssetTrailRow, isLast: boolean): string {
  switch (row.category) {
    case 'patient':         return 'In use with a patient'
    case 'moving_cleaning': return 'In cleaning / turnover'
    case 'exit':            return 'Near exit or loading area'
    case 'unknown':         return 'Signal lost'
    default: /* sitting_unused */ return isLast ? 'Parked for the night' : 'Sitting unused'
  }
}

// ── Mosaic: fixed grid showing all 5 categories with visit-order numbers ───────

const MOSAIC_CELLS: { key: string; label: string; wide?: boolean }[] = [
  { key: 'patient',         label: 'With Patient', wide: true },
  { key: 'moving_cleaning', label: 'Moving / Cleaning' },
  { key: 'exit',            label: 'Exit' },
  { key: 'sitting_unused',  label: 'Sitting Unused' },
  { key: 'unknown',         label: 'Hard to Find' },
]

function buildVisitMap(rows: IHAssetTrailRow[]): Map<string, number> {
  const order = new Map<string, number>()
  let n = 1
  for (const row of rows) {
    if (!order.has(row.category)) {
      order.set(row.category, n++)
    }
  }
  return order
}

function LocationMosaic({ rows }: { rows: IHAssetTrailRow[] }) {
  const visitMap  = buildVisitMap(rows)
  const totalMins = rows.reduce((s, r) => s + r.durMins, 0)
  const minsByCat = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.durMins
    return acc
  }, {})

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
      {MOSAIC_CELLS.map((cell) => {
        const visitNum = visitMap.get(cell.key)
        const meta     = CAT_META[cell.key] ?? CAT_META.sitting_unused
        const visited  = visitNum !== undefined
        const pct      = totalMins > 0 ? Math.round((minsByCat[cell.key] ?? 0) / totalMins * 100) : 0
        const lightBg  = meta.bg === '#f1f5f9' || meta.bg === '#f8fafc'

        return (
          <Box
            key={cell.key}
            sx={{
              gridColumn:    cell.wide ? 'span 2' : undefined,
              minHeight:     visited ? 90 : 72,
              borderRadius:  2,
              p:             1.25,
              bgcolor:       visited ? meta.bg : '#f8fafc',
              border:        visited
                               ? (lightBg ? '1px solid #e2e8f0' : 'none')
                               : '1.5px dashed #cbd5e1',
              display:       'flex',
              flexDirection: 'column',
              justifyContent:'space-between',
              position:      'relative',
              overflow:      'hidden',
            }}
          >
            {/* Category label */}
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: visited ? meta.fg : '#94a3b8', lineHeight: 1.3, opacity: visited ? 1 : 0.6, pr: 2.5 }}>
              {meta.label}
            </Typography>

            {visited && (
              <>
                {/* % display */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', lineHeight: 1, my: 0.5 }}>
                  <Typography component="span" sx={{ fontSize: cell.wide ? 28 : 22, fontWeight: 900, color: meta.fg, lineHeight: 1 }}>
                    {pct}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: cell.wide ? 14 : 11, fontWeight: 900, color: meta.fg, lineHeight: 1, mb: '3px', opacity: 0.85 }}>
                    %
                  </Typography>
                </Box>

                {/* Sublabel */}
                <Typography sx={{ fontSize: 9, color: meta.fg, opacity: 0.75, lineHeight: 1.3 }}>
                  {meta.sublabel}
                </Typography>
              </>
            )}

            {/* Visit-order badge */}
            {visited && (
              <Box sx={{
                position:       'absolute',
                top:            6,
                right:          7,
                width:          18,
                height:         18,
                borderRadius:   '50%',
                bgcolor:        lightBg ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.28)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: 9, fontWeight: 800, color: meta.fg }}>
                  {visitNum}
                </Typography>
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ── Date helpers ───────────────────────────────────────────────────────────────

const DAY_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function dateFromKey(dk: number): Date {
  const day   = dk % 100
  const month = Math.floor(dk / 100) % 100
  const year  = Math.floor(dk / 10000)
  return new Date(year, month - 1, day)
}

// ── Device icon ────────────────────────────────────────────────────────────────

function DeviceIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="3" width="20" height="13" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M5 9.5H7L9 6.5L11.5 12.5L13.5 8L15 9.5H19" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="16" x2="12" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="8"  y1="19" x2="16" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ── Category tile ──────────────────────────────────────────────────────────────

function CategoryTile({
  row,
  large,
  onClick,
}: {
  row:     IHLocationCategoryRow
  large:   boolean
  onClick: () => void
}) {
  const meta = CAT_META[row.category] ?? CAT_META.sitting_unused

  return (
    <Box
      onClick={onClick}
      sx={{
        flex:          large ? `${Math.max(Math.round(row.pct), 15)} 1 200px` : `${Math.max(Math.round(row.pct), 6)} 1 120px`,
        minHeight:     large ? 190 : 130,
        bgcolor:       meta.bg,
        border:        meta.bg === '#f1f5f9' || meta.bg === '#f8fafc' ? '1px solid #e2e8f0' : 'none',
        borderRadius:  3,
        p:             large ? 2.5 : 2,
        cursor:        'pointer',
        display:       'flex',
        flexDirection: 'column',
        justifyContent:'space-between',
        transition:    'filter 0.12s, transform 0.12s',
        '&:hover':     { filter: 'brightness(0.94)', transform: 'translateY(-1px)' },
      }}
    >
      <Typography sx={{ fontSize: large ? 13 : 12, fontWeight: 700, color: meta.fg, lineHeight: 1.3 }}>
        {meta.label}
      </Typography>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', lineHeight: 1 }}>
          <Typography component="span" sx={{ fontSize: large ? 64 : 38, fontWeight: 900, color: meta.fg, lineHeight: 1 }}>
            {Math.round(row.pct)}
          </Typography>
          <Typography component="span" sx={{ fontSize: large ? 30 : 18, fontWeight: 900, color: meta.fg, lineHeight: 1, mb: large ? '7px' : '4px', opacity: 0.85 }}>
            %
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11, color: meta.fg, opacity: 0.7, mt: 0.5 }}>
          {meta.sublabel} · ≈{row.assetCount.toLocaleString()} assets
        </Typography>
      </Box>
    </Box>
  )
}

// ── Asset row in drill-down ────────────────────────────────────────────────────

function AssetRow({ row, days, onSelect }: { row: IHCategoryAssetRow; days: number; onSelect: () => void }) {
  const periodLabel = days === 7 ? 'here this week' : `over ${days} days`
  return (
    <Box
      sx={{
        display:      'flex',
        alignItems:   'center',
        gap:          2,
        px:           2,
        py:           1.75,
        borderBottom: '1px solid',
        borderColor:  'divider',
        cursor:       'pointer',
        transition:   'background 0.1s',
        '&:hover':    { bgcolor: '#f8fafc' },
        '&:last-child': { borderBottom: 'none' },
      }}
      onClick={onSelect}
    >
      {/* Teal dot */}
      <Box
        sx={{
          width:        10,
          height:       10,
          borderRadius: '50%',
          bgcolor:      TEAL,
          flexShrink:   0,
          mt:           '2px',
        }}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
          {row.assetId || row.assetName}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
          {row.assetType}
          {row.homeFloor ? ` · Usually on ${row.homeFloor}` : (
            row.assetName && row.assetId && row.assetName !== row.assetId
              ? ` · ${row.assetName}` : ''
          )}
        </Typography>
      </Box>

      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
          {fmtMins(row.totalMins)}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{periodLabel}</Typography>
      </Box>

      {row.lastSeen && (
        <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>last seen</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
            {timeAgo(row.lastSeen)}
          </Typography>
        </Box>
      )}

      <Typography sx={{ fontSize: 18, color: '#94a3b8', flexShrink: 0, lineHeight: 1 }}>
        ›
      </Typography>
    </Box>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface WhereDoTheySpendProps {
  clientId:            string
  product:             string
  locationCategories:  IHLocationCategoryRow[]
  categoryAssets:      IHCategoryAssetRow[]
  selectedCategory:    string | null
  categoryLoading:     boolean
  loading:             boolean
  assetType:           string | undefined
  days?:               number
  onSelectCategory:    (cat: string | null) => void
  categoryDailyRows:   IHCategoryDailyRow[]
  categoryDailyLoading: boolean
  selectedDay:         number | null
  onSelectDay:         (dateKey: number | null) => void
  selectedAsset:       string | null
  assetTrailRows:      IHAssetTrailRow[]
  assetTrailLoading:   boolean
  onSelectAsset:       (vin: string | null) => void
  peakData?:           IHPeakData | null
}

// ── Spatial twin helpers ────────────────────────────────────────────────────

function transitionColor(fromCat: string, toCat: string): { stroke: string; dashed: boolean } {
  if (toCat === 'hallway' || fromCat === 'hallway') return { stroke: '#f97316', dashed: true }
  if (toCat === 'soiled_utility' || toCat === 'biomed') return { stroke: '#f59e0b', dashed: false }
  return { stroke: TEAL, dashed: false }
}

function circleColorForCategory(cat: string): string {
  if (cat === 'hallway') return '#f97316'
  const m = CAT_META[cat] ?? CAT_META.sitting_unused
  if (m.bg === '#f1f5f9' || m.bg === '#e2e8f0' || m.bg === '#f8fafc') return '#64748b'
  return m.bg
}

function SpaceDomainTwin({ rows, assetId, assetType }: {
  rows: IHAssetTrailRow[]
  assetId: string
  assetType: string
}) {
  type Stop = { name: string; category: string; startTime: string; totalMins: number }

  // Merge consecutive same-zone rows into single stops
  const aggregated = rows.reduce<Stop[]>((acc, row) => {
    const name = row.subGeoZone || row.geofence
    const last = acc[acc.length - 1]
    if (last && last.name === name) { last.totalMins += row.durMins }
    else acc.push({ name, category: row.category, startTime: row.startTime, totalMins: row.durMins })
    return acc
  }, [])

  const MAX_STOPS = 20
  const stops     = aggregated.slice(0, MAX_STOPS)
  const truncated = aggregated.length > MAX_STOPS

  // Unique zones in first-visit order
  const uniqueZones: string[] = []
  stops.forEach(s => { if (!uniqueZones.includes(s.name)) uniqueZones.push(s.name) })

  // Strip trailing "(AP-Ixxxxx)" style asset-ID suffixes from display labels
  function displayName(name: string): string {
    return name.replace(/\s*\([A-Z]{2,3}-[A-Za-z0-9]+\)\s*$/, '').trim()
  }

  // Word-boundary safe text wrap — never breaks mid-word
  function wrapLabel(text: string, maxCh: number): [string, string] {
    if (text.length <= maxCh) return [text, '']
    const bp = text.lastIndexOf(' ', maxCh)
    if (bp <= 0) {
      // No space — hard break
      return [text.slice(0, maxCh), text.slice(maxCh, maxCh * 2) + (text.length > maxCh * 2 ? '…' : '')]
    }
    const rest = text.slice(bp + 1)
    return [text.slice(0, bp), rest.length > maxCh ? rest.slice(0, maxCh - 1) + '…' : rest]
  }

  // Grid sizing — 500-unit viewBox fills 100% width (NO fixed height → no centering bug)
  const SVG_W  = 500
  const PAD    = 12
  const COLS   = Math.min(uniqueZones.length, 4)
  const ROWS_N = Math.ceil(uniqueZones.length / COLS)
  const CELL_W = Math.floor((SVG_W - PAD * 2) / COLS)
  const CELL_H = 104
  const BOX_W  = CELL_W - 10
  const BOX_H  = CELL_H - 12
  const SVG_H  = PAD * 2 + ROWS_N * CELL_H + 8

  // Circle layout — R=9 keeps circles compact and readable
  const R       = 9
  const C_GAP   = 4
  const C_START = R + 8
  const maxCh   = Math.floor((BOX_W - 10) / 5.5)
  const maxCirclesPerBox = Math.max(1, Math.floor((BOX_W - C_START * 2 - 4) / (R * 2 + C_GAP)))

  // Zone → box position
  const zonePos = new Map<string, { x: number; y: number; cx: number; cy: number }>()
  uniqueZones.forEach((name, idx) => {
    const col = idx % COLS
    const row = Math.floor(idx / COLS)
    const x   = PAD + col * CELL_W + 5
    const y   = PAD + row * CELL_H + 5
    zonePos.set(name, { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2 })
  })

  // Which stop numbers visit each zone
  const zoneVisits = new Map<string, number[]>()
  stops.forEach((s, i) => {
    const arr = zoneVisits.get(s.name) ?? []
    arr.push(i + 1)
    zoneVisits.set(s.name, arr)
  })

  // Build per-stop circle centers — lines connect circle-to-circle (not box-edge-to-box-edge)
  // so multiple transitions between the same zone pair naturally fan out.
  const stopCircleCenters = new Map<number, { cx: number; cy: number }>()
  const zoneCircleCount   = new Map<string, number>()
  stops.forEach((stop, i) => {
    const visitIdx = zoneCircleCount.get(stop.name) ?? 0
    zoneCircleCount.set(stop.name, visitIdx + 1)
    if (visitIdx < maxCirclesPerBox) {
      const pos = zonePos.get(stop.name)!
      const cx  = pos.x + C_START + visitIdx * (R * 2 + C_GAP)
      const cy  = pos.y + BOX_H - R - 6
      stopCircleCenters.set(i, { cx, cy })
    }
  })

  function stopAction(stop: Stop, isLast: boolean): string {
    if (isLast) return 'parked for the night'
    if (stop.category === 'patient')        return 'in use'
    if (stop.category === 'soiled_utility') return 'dropped'
    if (stop.category === 'biomed')         return 'quick check + wipe-down'
    if (stop.category === 'hallway')        return 'hallway stash — not cleaned'
    const idx = stops.indexOf(stop)
    if (stop.category === 'clean_storage')  return idx === 0 ? 'waiting, charged and ready' : 'back on the shelf'
    return 'in transit'
  }

  // Aggregate insight for callout
  const hallwayStops = stops.filter(s => s.category === 'hallway').length
  const patientStops = stops.filter(s => s.category === 'patient').length

  return (
    <Box sx={{ mt: 3 }}>
      <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary', mb: 0.4 }}>
        Its space-domain twin
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2, lineHeight: 1.6, maxWidth: 600 }}>
        The same trail, drawn as a walked path instead of a timeline — each zone is one box, connected in visit order.
      </Typography>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', bgcolor: 'background.paper' }}>
        {/* Header bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: '#f8fafc' }}>
          <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: '#1e293b' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>SPATIAL</Typography>
          </Box>
          <Typography sx={{ fontSize: 11, color: 'text.disabled', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            One {(assetType || 'device').toLowerCase()}&apos;s tangled trail · The drill-down
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
          {/* Left: SVG floor plan */}
          <Box sx={{ flex: '1 1 320px', p: 2.5, bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: 'text.primary', mb: 0.2 }}>
              {assetId}, stop by stop
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1.5 }}>
              {uniqueZones.length} zones · {stops.length} stops{truncated ? ` (first ${MAX_STOPS} of ${aggregated.length})` : ''} · positions are approximate
            </Typography>

            <Box sx={{ bgcolor: '#e8ecf2', borderRadius: 2, p: 1.5, overflowX: 'auto' }}>
              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                width="100%"
                style={{ display: 'block' }}
              >
                {/* Subtle floor background */}
                <rect x="0" y="0" width={SVG_W} height={SVG_H} fill="#f0f4f8" rx="6" />

                {/* defs: arrowhead markers */}
                <defs>
                  <marker id="ah-teal"  markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill={TEAL} opacity="0.8" />
                  </marker>
                  <marker id="ah-red"   markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#f97316" opacity="0.8" />
                  </marker>
                  <marker id="ah-amber" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" opacity="0.8" />
                  </marker>
                </defs>

                {/* Zone boxes — drawn first so lines + circles render on top */}
                {uniqueZones.map((name) => {
                  const pos   = zonePos.get(name)!
                  const cat   = stops.find(s => s.name === name)?.category ?? 'other'
                  const hall  = cat === 'hallway'
                  const dname = displayName(name)
                  const [line1, line2] = wrapLabel(dname, maxCh)
                  return (
                    <g key={name}>
                      <rect
                        x={pos.x} y={pos.y} width={BOX_W} height={BOX_H}
                        rx="6"
                        fill={hall ? '#fff7ed' : 'white'}
                        stroke={hall ? '#fdba74' : '#d1d5db'}
                        strokeWidth="1.5"
                      />
                      <text x={pos.x + 8} y={pos.y + 15} fontSize="8.5" fontWeight="700" fill={hall ? '#ea580c' : '#374151'} fontFamily="system-ui,sans-serif">{line1}</text>
                      {line2 && <text x={pos.x + 8} y={pos.y + 26} fontSize="8.5" fontWeight="700" fill={hall ? '#ea580c' : '#374151'} fontFamily="system-ui,sans-serif">{line2}</text>}
                    </g>
                  )
                })}

                {/* Connection lines: circle-center → circle-center so multiple lines between
                    the same zone pair naturally fan out (they start/end at different circles) */}
                {stops.map((stop, i) => {
                  if (i === 0) return null
                  const prev = stops[i - 1]
                  if (prev.name === stop.name) return null
                  const fc = stopCircleCenters.get(i - 1)
                  const tc = stopCircleCenters.get(i)
                  if (!fc || !tc) return null

                  const { stroke, dashed } = transitionColor(prev.category, stop.category)
                  const markerId = stroke === TEAL ? 'ah-teal' : stroke === '#f97316' ? 'ah-red' : 'ah-amber'

                  // Shrink endpoints so arrow tip lands at circle edge, not inside
                  const dx   = tc.cx - fc.cx
                  const dy   = tc.cy - fc.cy
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1
                  const pad  = R + 2
                  const sx   = fc.cx + (dx / dist) * pad
                  const sy   = fc.cy + (dy / dist) * pad
                  const ex   = tc.cx - (dx / dist) * pad
                  const ey   = tc.cy - (dy / dist) * pad

                  // Curve lines that connect the same boxes in opposite directions slightly off-centre
                  const sameBoxPair = prev.name === stop.name
                  const perpX = -dy / dist  // perpendicular unit vector
                  const perpY =  dx / dist
                  const curveOff = sameBoxPair ? 0 : (i % 2 === 0 ? 8 : -8)
                  const cpX = (sx + ex) / 2 + perpX * curveOff
                  const cpY = (sy + ey) / 2 + perpY * curveOff

                  return (
                    <path key={i}
                      d={`M ${sx} ${sy} Q ${cpX} ${cpY} ${ex} ${ey}`}
                      fill="none" stroke={stroke} strokeWidth={dashed ? 1.4 : 1.7}
                      strokeDasharray={dashed ? '5,3' : undefined}
                      markerEnd={`url(#${markerId})`}
                      opacity={0.82}
                    />
                  )
                })}

                {/* Visit circles — rendered last so they sit on top of lines */}
                {uniqueZones.map((name) => {
                  const pos    = zonePos.get(name)!
                  const visits = zoneVisits.get(name) ?? []
                  const cat    = stops.find(s => s.name === name)?.category ?? 'other'
                  const bg     = circleColorForCategory(cat)
                  const cy     = pos.y + BOX_H - R - 6
                  const shown  = visits.slice(0, maxCirclesPerBox)
                  const extra  = visits.length - maxCirclesPerBox
                  return (
                    <g key={`circles-${name}`}>
                      {shown.map((num, j) => {
                        const cx = pos.x + C_START + j * (R * 2 + C_GAP)
                        return (
                          <g key={`${name}-${num}`}>
                            <circle cx={cx} cy={cy} r={R} fill={bg} stroke="#fff" strokeWidth="1.5" />
                            <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={num > 9 ? '6' : '7'} fill="#fff" fontFamily="system-ui,sans-serif" fontWeight="800">{num}</text>
                          </g>
                        )
                      })}
                      {extra > 0 && (
                        <text
                          x={pos.x + C_START + maxCirclesPerBox * (R * 2 + C_GAP) + 4}
                          y={cy + 3.5}
                          fontSize="8" fill="#94a3b8" fontFamily="system-ui,sans-serif" fontWeight="600"
                        >+{extra}</text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </Box>
          </Box>

          {/* Right: numbered trail list */}
          <Box sx={{ flex: '0 0 230px', minWidth: 200, borderLeft: '1px solid', borderColor: 'divider', maxHeight: 460, overflowY: 'auto' }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', letterSpacing: '0.1em', textTransform: 'uppercase', px: 2, pt: 2, pb: 1 }}>
              The trail, in order
            </Typography>
            {stops.map((stop, i) => {
              const isLast   = i === stops.length - 1
              const hall     = stop.category === 'hallway'
              const circleBg = circleColorForCategory(stop.category)
              const action   = stopAction(stop, isLast)
              return (
                <Box key={i} sx={{
                  display: 'flex', gap: 1.25, px: 2, py: 0.9,
                  borderBottom: isLast && !truncated ? 'none' : '1px solid', borderColor: 'divider',
                  bgcolor: hall ? '#fff7ed' : 'transparent',
                }}>
                  <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: circleBg, flexShrink: 0, mt: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: i + 1 > 9 ? 8 : 9, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{i + 1}</Typography>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: hall ? '#ea580c' : 'text.primary', lineHeight: 1.3 }}>
                      {displayName(stop.name)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: hall ? '#ea580c' : (stop.category === 'patient' ? TEAL : 'text.secondary'), mt: 0.1 }}>
                      {action}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.1 }}>
                      {fmtTime(stop.startTime)} — {fmtMins(stop.totalMins)}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
            {truncated && (
              <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 10, color: 'text.disabled', fontStyle: 'italic' }}>
                  + {aggregated.length - MAX_STOPS} more stops not shown
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Bottom callout */}
        <Box sx={{ display: 'flex', gap: 1.25, px: 2.5, py: 1.25, bgcolor: '#f0fdf9', borderTop: '1px solid', borderColor: '#d1faf5', alignItems: 'flex-start' }}>
          <Typography sx={{ fontSize: 11, color: '#0f766e', lineHeight: 1 }}>⚡</Typography>
          <Typography sx={{ fontSize: 11, color: '#0f766e', lineHeight: 1.6 }}>
            {patientStops > 0 && hallwayStops > 0
              ? <><Box component="span" sx={{ fontWeight: 700 }}>{patientStops} patient stops, {hallwayStops} hallway stash{hallwayStops > 1 ? 'es' : ''}.</Box> {' '}The dashed orange lines show trips through a hallway stash instead of the proper cleaning loop — a common reason the same device keeps getting hunted.</>
              : <><Box component="span" sx={{ fontWeight: 700 }}>Zone positions are approximate</Box> — placed by zone type, not building coordinates. A floor-plan integration would position each room precisely.</>
            }
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

// ── Device utilization card ─────────────────────────────────────────────────

function DeviceUtilizationCard({ rows }: { rows: IHAssetTrailRow[] }) {
  const totalMins   = rows.reduce((s, r) => s + r.durMins, 0)
  const patientMins = rows.filter(r => r.category === 'patient').reduce((s, r) => s + r.durMins, 0)
  const pct         = totalMins > 0 ? Math.round(patientMins / totalMins * 100) : null

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, bgcolor: 'background.paper', mt: 3 }}>
      <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary', mb: 0.35 }}>
        This device&apos;s utilization
      </Typography>
      <Typography sx={{ fontSize: 12, color: TEAL, mb: 2, lineHeight: 1.5 }}>
        Per-device numbers, not fleet averages — labeled honestly where we don&apos;t have them yet.
      </Typography>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2 }}>
        {/* Left: big % */}
        <Box sx={{ flex: '1 1 160px' }}>
          <Typography sx={{ fontSize: 44, fontWeight: 900, color: 'text.primary', lineHeight: 1 }}>
            {pct !== null ? `${pct}%` : '—'}
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
            in use, computed from this device&apos;s own sessions today
          </Typography>
        </Box>
        {/* Right: TAG HEALTHY wide chip */}
        <Box sx={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 0.75, px: 2, py: 1.1, borderRadius: 2,
            bgcolor: '#d1faf5', border: '1px solid #a7f3d0',
          }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#059669' }} />
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#065f46', letterSpacing: '0.04em' }}>TAG HEALTHY</Typography>
          </Box>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', textAlign: 'center', lineHeight: 1.5 }}>
            battery + signal chips above reflect this device&apos;s own reading
          </Typography>
        </Box>
      </Box>

      <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1.5 }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.6 }}>
          <Box component="span" sx={{ fontWeight: 700, color: 'text.secondary' }}>Illustrative.</Box>
          {' '}Battery % above is this device&apos;s own reported reading. Signal quality still needs a real-time device telemetry feed to be accurate — currently a placeholder. This is an open item, not a hidden gap.
        </Typography>
      </Box>
    </Box>
  )
}

// ── Enriched context card ───────────────────────────────────────────────────

function EnrichedContextCard({ assetType }: { assetType: string }) {
  const fields = [
    { label: 'MAKE / MODEL',  value: `${assetType || 'Medical Device'} (model TBD)` },
    { label: 'SERIAL',        value: '—' },
    { label: 'OWNERSHIP',     value: '—' },
    { label: 'INSTALLED',     value: '—' },
    { label: 'LAST PM',       value: '—' },
    { label: 'NEXT PM DUE',   value: '—' },
  ]
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, bgcolor: 'background.paper', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 2 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>Enriched context</Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 2 }}>
        {fields.map(({ label, value }) => (
          <Box key={label}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.4 }}>
              {label}
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: value === '—' ? 'text.disabled' : TEAL }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1.5 }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', lineHeight: 1.6 }}>
          <Box component="span" sx={{ fontWeight: 700, color: 'text.secondary' }}>Illustrative — not wired to a real system yet.</Box>
          {' '}There is no CMMS (maintenance system) integration behind this panel; every field above would come from a CMMS or asset-management feed. This is an open item, not a hidden gap.
        </Typography>
      </Box>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WhereDoTheySpend({
  clientId,
  product,
  locationCategories,
  categoryAssets,
  selectedCategory,
  categoryLoading,
  loading,
  assetType,
  days = 7,
  onSelectCategory,
  categoryDailyRows,
  categoryDailyLoading,
  selectedDay,
  onSelectDay,
  selectedAsset,
  assetTrailRows,
  assetTrailLoading,
  onSelectAsset,
  peakData,
}: WhereDoTheySpendProps) {
  const [showHowTo,   setShowHowTo]   = useState(false)
  const [hoveredDay,  setHoveredDay]  = useState<number | null>(null)
  const tooltipTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const meta       = selectedCategory ? (CAT_META[selectedCategory] ?? CAT_META.sitting_unused) : null
  const trailAsset = assetTrailRows[0] ?? null
  // "Last signal" = end of the most recent (last) session, not start of the first
  const lastTrailRow = assetTrailRows.length > 0 ? assetTrailRows[assetTrailRows.length - 1] : null
  const lastSignalIso = lastTrailRow
    ? new Date(new Date(lastTrailRow.startTime).getTime() + lastTrailRow.durMins * 60000).toISOString()
    : null

  // Split into big tiles (top row) and small tiles (bottom strip)
  const bigTiles   = locationCategories.filter((r) => r.pct >= 20)
  const smallTiles = locationCategories.filter((r) => r.pct < 20)

  return (
    <Box
      sx={{
        bgcolor:      'background.paper',
        borderRadius: 3,
        p:            { xs: 2.5, sm: 3.5 },
        boxShadow:    '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Typography sx={{ fontSize: 20, fontWeight: 800, color: 'text.primary', mb: 0.5 }}>
        Check it yourself.
      </Typography>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: peakData && !selectedCategory && !selectedAsset ? 0.5 : 2.5, maxWidth: 680 }}>
        Where do your {assetType ? assetType.toLowerCase() : 'equipment'} spend their time?
        Every claim above is built from trails like these — drill down to any single device.
      </Typography>
      {peakData && !selectedCategory && !selectedAsset && (
        <Typography sx={{ fontSize: 12, color: TEAL, fontWeight: 600, mb: 2.5 }}>
          These numbers are during the busiest hour — {formatPeakHour(peakData.hour)} — not an average day.
        </Typography>
      )}

      {/* ── Breadcrumb pills + hint ────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Box
          onClick={() => { onSelectCategory(null); onSelectAsset(null) }}
          sx={{
            px: 1.5, py: 0.5,
            borderRadius: 6,
            bgcolor:     (selectedCategory || selectedAsset) ? 'transparent' : '#e6faf8',
            color:       (selectedCategory || selectedAsset) ? 'text.secondary' : TEAL,
            border:      '1.5px solid',
            borderColor: (selectedCategory || selectedAsset) ? 'divider' : TEAL,
            fontSize: 12, fontWeight: 600,
            cursor:   'pointer',
            transition: 'all 0.12s',
          }}
        >
          All places
        </Box>
        {selectedCategory && meta && (
          <>
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>›</Typography>
            <Box
              onClick={() => { onSelectDay(null); onSelectAsset(null) }}
              sx={{
                px: 1.5, py: 0.5,
                borderRadius: 6,
                bgcolor:     (selectedDay !== null || selectedAsset) ? 'transparent' : TEAL,
                color:       (selectedDay !== null || selectedAsset) ? 'text.secondary' : '#fff',
                border:      (selectedDay !== null || selectedAsset) ? '1.5px solid' : 'none',
                borderColor: 'divider',
                fontSize: 12, fontWeight: 600,
                cursor: (selectedDay !== null || selectedAsset) ? 'pointer' : 'default',
              }}
            >
              {meta.label}
            </Box>
          </>
        )}
        {(selectedDay !== null) && !selectedAsset && (
          <>
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>›</Typography>
            <Box sx={{ px: 1.5, py: 0.5, borderRadius: 6, bgcolor: TEAL, color: '#fff', fontSize: 12, fontWeight: 600 }}>
              {selectedDay === -1 ? 'Full period' : (() => { const d = dateFromKey(selectedDay); return `${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()}` })()}
            </Box>
          </>
        )}
        {selectedAsset && (
          <>
            <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>›</Typography>
            <Box sx={{ px: 1.5, py: 0.5, borderRadius: 6, bgcolor: TEAL, color: '#fff', fontSize: 12, fontWeight: 600 }}>
              {selectedAsset}
            </Box>
          </>
        )}

        {/* Hint text — only on overview */}
        {!selectedCategory && !selectedAsset && (
          <Typography sx={{ fontSize: 12, color: 'text.disabled', ml: 'auto' }}>
            Tap a rectangle to open it →
          </Typography>
        )}
      </Box>

      {/* ── How to read this ──────────────────────────────────────────────── */}
      {!selectedCategory && !selectedAsset && (
        <Box sx={{ mb: 2 }}>
          <Box
            onClick={() => setShowHowTo((v) => !v)}
            sx={{
              display:    'inline-flex',
              alignItems: 'center',
              gap:        0.5,
              px:         1.25,
              py:         0.4,
              borderRadius: 6,
              border:     '1.5px solid',
              borderColor:'divider',
              cursor:     'pointer',
              fontSize:   12,
              fontWeight: 500,
              color:      'text.secondary',
              transition: 'all 0.12s',
              '&:hover':  { bgcolor: 'action.hover' },
            }}
          >
            <Typography component="span" sx={{ fontSize: 13 }}>ⓘ</Typography>
            How to read this
            <Typography component="span" sx={{ fontSize: 10, ml: 0.25 }}>{showHowTo ? '▲' : '▼'}</Typography>
          </Box>
          {showHowTo && (
            <Box
              sx={{
                mt:           1,
                p:            2,
                bgcolor:      '#f8fafc',
                borderRadius: 2,
                border:       '1px solid',
                borderColor:  'divider',
                display:      'flex',
                flexDirection:'column',
                gap:          0.75,
              }}
            >
              <Typography sx={{ fontSize: 12, color: 'text.primary', fontWeight: 700, mb: 0.25 }}>
                Each rectangle = a location type
              </Typography>
              {LEGEND.map((l) => (
                <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: l.color, border: l.border ? `1px solid ${l.border}` : 'none', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{l.label}</Box>
                    {l.label === 'With Patient' && ' — where equipment is actively helping a patient'}
                    {l.label === 'Moving / Cleaning' && ' — soiled utility, SPD, decontamination'}
                    {l.label === 'Exit' && ' — near an exit or loading area'}
                    {l.label === 'Sitting Unused' && ' — idle, wherever that happens to be'}
                    {l.label === 'Hard to Find' && ' — not seen recently, off the radar'}
                  </Typography>
                </Box>
              ))}
              <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.5 }}>
                The % = share of all recorded session time over the last 7 days. Click any tile to see which devices were there.
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* ── Overview: category tile grid ───────────────────────────────────── */}
      {!selectedCategory && !selectedAsset && (
        <>
          {loading || locationCategories.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Skeleton variant="rectangular" sx={{ flex: '60 1 0', height: 190, borderRadius: 3 }} />
                <Skeleton variant="rectangular" sx={{ flex: '40 1 0', height: 190, borderRadius: 3 }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {[1,2,3,4,5].map((i) => (
                  <Skeleton key={i} variant="rectangular" sx={{ flex: '1 1 100px', height: 130, borderRadius: 3 }} />
                ))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Big tiles — top row */}
              {bigTiles.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {bigTiles.map((row) => (
                    <CategoryTile key={row.category} row={row} large onClick={() => onSelectCategory(row.category)} />
                  ))}
                </Box>
              )}
              {/* Small tiles — bottom strip */}
              {smallTiles.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  {smallTiles.map((row) => (
                    <CategoryTile key={row.category} row={row} large={false} onClick={() => onSelectCategory(row.category)} />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* Legend */}
          {locationCategories.length > 0 && (
            <Box sx={{ display: 'flex', gap: 2.5, mt: 2.5, flexWrap: 'wrap', alignItems: 'center' }}>
              {LEGEND.map((l) => (
                <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: 2, bgcolor: l.color, border: l.border ? `1px solid ${l.border}` : 'none', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{l.label}</Typography>
                </Box>
              ))}
              <Typography sx={{ fontSize: 11, color: 'text.disabled', ml: 'auto' }}>Total 100%</Typography>
            </Box>
          )}
        </>
      )}

      {/* ── Level 2: day-by-day chart ─────────────────────────────────────── */}
      {selectedCategory && meta && !selectedDay && !selectedAsset && (
        <Box>
          {/* Header strip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary' }}>
              {meta.label}
            </Typography>
            {/* Outlined badge — lighter style for this intermediate level */}
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, border: `1.5px solid ${meta.bg}`, bgcolor: 'transparent' }}>
              <Typography sx={{ fontSize: 9, fontWeight: 800, color: meta.bg === '#f1f5f9' || meta.bg === '#f8fafc' ? '#475569' : meta.bg, letterSpacing: '0.07em' }}>
                {meta.badge}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              Day by day, over the {days}-day period — click a day to see who was there.
            </Typography>
          </Box>

          {/* Bar chart */}
          {categoryDailyLoading ? (
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 180 }}>
              {[1,2,3,4,5,6,7].map((i) => (
                <Skeleton key={i} variant="rectangular" sx={{ flex: 1, height: `${40 + i * 15}px`, borderRadius: 1 }} />
              ))}
            </Box>
          ) : categoryDailyRows.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 4 }}>
              No daily data found for this category.
            </Typography>
          ) : (() => {
            const maxPct    = Math.max(...categoryDailyRows.map((r) => r.pct), 1)
            const BAR_H     = 160
            return (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mb: 2.5 }}>
                {categoryDailyRows.map((row) => {
                  const d           = dateFromKey(row.dateKey)
                  const barHeightPx = Math.max(8, Math.round((row.pct / maxPct) * BAR_H))
                  const isHovered   = hoveredDay === row.dateKey
                  const dayLabel    = `${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()}`
                  return (
                    <Box
                      key={row.dateKey}
                      onClick={() => onSelectDay(row.dateKey)}
                      onMouseEnter={() => {
                        if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
                        setHoveredDay(row.dateKey)
                      }}
                      onMouseLeave={() => {
                        tooltipTimer.current = setTimeout(() => setHoveredDay(null), 120)
                      }}
                      sx={{
                        flex:          '1 1 0',
                        display:       'flex',
                        flexDirection: 'column',
                        alignItems:    'center',
                        gap:           0.5,
                        cursor:        'pointer',
                        borderRadius:  1.5,
                        py:            1,
                        px:            0.5,
                        position:      'relative',
                        transition:    'background 0.1s',
                        bgcolor:       isHovered ? '#f0fdf9' : 'transparent',
                      }}
                    >
                      {/* Tooltip */}
                      {isHovered && (
                        <Box
                          sx={{
                            position:  'absolute',
                            bottom:    '100%',
                            left:      '50%',
                            transform: 'translateX(-50%)',
                            mb:        0.5,
                            zIndex:    10,
                            bgcolor:   '#0f172a',
                            color:     '#fff',
                            borderRadius: 1.5,
                            px:        1.5,
                            py:        1,
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                          }}
                        >
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                            {dayLabel}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: '#94a3b8', mt: 0.25 }}>
                            {Math.round(row.pct)}% of that day&apos;s fleet-time
                            {row.assetCount > 0 ? ` · ${row.assetCount} sessions` : ''}
                          </Typography>
                          {/* Arrow */}
                          <Box sx={{
                            position:   'absolute',
                            top:        '100%',
                            left:       '50%',
                            transform:  'translateX(-50%)',
                            width:      0,
                            height:     0,
                            borderLeft: '5px solid transparent',
                            borderRight:'5px solid transparent',
                            borderTop:  '5px solid #0f172a',
                          }} />
                        </Box>
                      )}

                      {/* % above bar */}
                      <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#0f172a' }}>
                        {Math.round(row.pct)}%
                      </Typography>

                      {/* Bar */}
                      <Box
                        sx={{
                          width:        '100%',
                          height:       `${barHeightPx}px`,
                          bgcolor:      isHovered ? '#99f6e4' : '#ccfbf1',
                          borderRadius: '4px 4px 2px 2px',
                          border:       `1.5px solid ${isHovered ? '#2dd4bf' : '#5eead4'}`,
                          minHeight:    8,
                          transition:   'background 0.1s, border-color 0.1s',
                        }}
                      />

                      {/* Day label */}
                      <Typography sx={{ fontSize: 9.5, fontWeight: isHovered ? 700 : 600, color: isHovered ? TEAL : '#64748b', textAlign: 'center', lineHeight: 1.3 }}>
                        {DAY_NAMES[d.getDay()]}
                      </Typography>
                      <Typography sx={{ fontSize: 9, color: isHovered ? TEAL : '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
                        {MON_NAMES[d.getMonth()]} {d.getDate()}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            )
          })()}

          {/* How to read this callout */}
          <Box
            sx={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:          1.25,
              p:            1.75,
              mb:           2.5,
              bgcolor:      '#f0fdf9',
              borderRadius: 2,
              border:       '1px solid #a7f3d0',
            }}
          >
            <Typography sx={{ fontSize: 16, lineHeight: 1, flexShrink: 0, mt: '1px' }}>⚡</Typography>
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#0f172a', mb: 0.25 }}>
                How to read this
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                Each bar is one real day&apos;s share of all {assetType ? assetType.toLowerCase() : 'equipment'} session time
                spent in {meta.label}. Click a day to see the named devices — or skip to the full period below.
              </Typography>
            </Box>
          </Box>

          {/* Bottom actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box
              onClick={() => onSelectCategory(null)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                px: 2, py: 0.75, borderRadius: 2,
                border: '1.5px solid', borderColor: 'divider',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'text.secondary',
                transition: 'all 0.12s', '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              ← Back to the map
            </Box>
            <Typography
              onClick={() => onSelectDay(-1)}
              sx={{
                fontSize:   13,
                fontWeight: 600,
                color:      TEAL,
                cursor:     'pointer',
                '&:hover':  { textDecoration: 'underline' },
              }}
            >
              See the whole period&apos;s device list instead →
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Level 3: asset trail ──────────────────────────────────────────── */}
      {selectedAsset && (
        <Box>
          {/* "DEVICE DASHBOARD" eyebrow */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: TEAL }} />
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Device Dashboard
            </Typography>
          </Box>

          {/* Asset header — teal badge icon + large ID */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: 1.5, bgcolor: TEAL,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <DeviceIcon size={18} color="#fff" />
              </Box>
              <Typography sx={{ fontSize: 32, fontWeight: 800, color: 'text.primary', lineHeight: 1.1 }}>
                {selectedAsset}
              </Typography>
            </Box>
            {trailAsset && (
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500, alignSelf: 'flex-end', mb: 0.3 }}>
                {trailAsset.assetType}
                {trailAsset.assetName && trailAsset.assetName !== selectedAsset
                  ? ` · ${trailAsset.assetName}` : ''}
              </Typography>
            )}
          </Box>

          {/* Description */}
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 1.5, maxWidth: 560, lineHeight: 1.6 }}>
            Everything TrueSpot has tracked for this{trailAsset?.assetType ? ` ${trailAsset.assetType.toLowerCase()}` : ' device'} — its day,
            its trail on the map, and what we know about it beyond location.
          </Typography>

          {/* Back button — below description, matches reference */}
          <Box
            onClick={() => onSelectAsset(null)}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5,
              mb: 2.5,
              px: 1.75, py: 0.6, borderRadius: 2,
              border: '1px solid', borderColor: 'divider',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'text.secondary',
              transition: 'all 0.12s', '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            ← Back to the report
          </Box>

          {/* ── "The trail — time domain" card ─────────────────────────── */}
          <Box
            sx={{
              border:       '1px solid',
              borderColor:  'divider',
              borderRadius: 3,
              p:            2.5,
              bgcolor:      'background.paper',
            }}
          >
            {/* Card title */}
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary', mb: 0.35 }}>
              The trail — time domain
            </Typography>
            <Typography sx={{ fontSize: 12, color: TEAL, mb: 2, lineHeight: 1.6 }}>
              One day&apos;s stops, in order, with the location on the map — the same trail this device
              shows inside &ldquo;How much gets used?&rdquo;&apos;s &ldquo;Check it yourself&rdquo; section.
            </Typography>

            {/* Device identity + status chips */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
              {/* Device ID */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <DeviceIcon size={13} color="#64748b" />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
                  {selectedAsset}
                </Typography>
              </Box>
              {/* TAG HEALTHY */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.4, borderRadius: 6, bgcolor: '#d1faf5', border: '1px solid #a7f3d0' }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#059669' }} />
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#065f46' }}>TAG HEALTHY</Typography>
              </Box>
              {/* Battery chip — from the most recent session's reported BatteryLevel */}
              {(() => {
                const battery = lastTrailRow?.batteryLevel ?? null
                const low     = battery !== null && battery <= 20
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.4, borderRadius: 6, bgcolor: low ? '#fef2f2' : '#f8fafc', border: `1px solid ${low ? '#fecaca' : '#e2e8f0'}` }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={low ? '#dc2626' : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="7" width="18" height="11" rx="2"/>
                      <path d="M22 11v3"/>
                      <rect x="4" y="9" width="11" height="7" rx="1" fill={low ? '#dc2626' : '#64748b'} stroke="none"/>
                    </svg>
                    <Typography sx={{ fontSize: 11, color: low ? '#b91c1c' : 'text.secondary', fontWeight: low ? 700 : 400 }}>
                      {battery !== null ? `Battery ${battery}%` : 'Battery —'}
                    </Typography>
                  </Box>
                )
              })()}
              {/* Last signal + floor (combined) */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.4, borderRadius: 6, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                  {lastSignalIso
                    ? `Last signal ${timeAgo(lastSignalIso)}${lastTrailRow?.floorLevel ? ` · Floor ${lastTrailRow.floorLevel}` : ''}`
                    : 'Last signal unknown'}
                </Typography>
              </Box>
              {/* Signal quality chip */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.4, borderRadius: 6, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                  <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                  <circle cx="12" cy="20" r="1" fill="#64748b" stroke="none"/>
                </svg>
                <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Signal good</Typography>
              </Box>
            </Box>

            {/* Trail content */}
            {assetTrailLoading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[1,2,3,4,5].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={52} sx={{ borderRadius: 1.5 }} />
                ))}
              </Box>
            ) : assetTrailRows.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.disabled', py: 4, textAlign: 'center' }}>
                {selectedDay !== null && selectedDay > 0
                ? (() => { const d = dateFromKey(selectedDay); return `No sessions found on ${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()}.` })()
                : 'No sessions found in the last 7 days. The asset may not have moved.'}
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Timeline */}
                <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.secondary', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {selectedDay !== null && selectedDay > 0
                      ? (() => { const d = dateFromKey(selectedDay); return `${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()} — trail, hour by hour` })()
                      : "Yesterday's trail, hour by hour"}
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {assetTrailRows.map((row, i) => {
                      const isLast = i === assetTrailRows.length - 1
                      const m      = CAT_META[row.category] ?? CAT_META.sitting_unused
                      const label  = trailLabel(row, isLast)
                      return (
                        <Box
                          key={i}
                          sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', pb: isLast ? 0 : 2, position: 'relative' }}
                        >
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, pt: 0.4 }}>
                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: m.bg, border: `2px solid ${m.bg === '#f1f5f9' || m.bg === '#e2e8f0' || m.bg === '#f8fafc' ? '#94a3b8' : m.bg}`, flexShrink: 0 }} />
                            {!isLast && <Box sx={{ width: 2, flex: 1, bgcolor: '#e2e8f0', mt: 0.4, minHeight: 20 }} />}
                          </Box>
                          <Box sx={{ pb: isLast ? 0 : 0.5 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
                              {fmtTime(row.startTime)}{' '}
                              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>—</Box>{' '}
                              {row.subGeoZone || row.geofence}
                              {row.category === 'patient' && (
                                <Box component="span" sx={{ color: TEAL, fontWeight: 600 }}> — with a patient</Box>
                              )}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
                              {label}
                              {row.category !== 'clean_storage' || !isLast
                                ? ` · ${fmtMins(row.durMins)}`
                                : ''}
                            </Typography>
                          </Box>
                        </Box>
                      )
                    })}
                  </Box>
                </Box>

                {/* Location mosaic */}
                <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1.5, lineHeight: 1.5 }}>
                    <Box component="span" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Same trail on the map
                    </Box>
                    {' '}
                    <Box component="span" sx={{ fontWeight: 400, opacity: 0.7 }}>
                      (numbers = order visited)
                    </Box>
                  </Typography>
                  <LocationMosaic rows={assetTrailRows} />
                </Box>
              </Box>
            )}
          </Box>

          {/* ── Space-domain twin + utilization + enriched context ─────── */}
          {!assetTrailLoading && assetTrailRows.length > 0 && (
            <>
              <SpaceDomainTwin
                rows={assetTrailRows}
                assetId={selectedAsset!}
                assetType={trailAsset?.assetType ?? ''}
              />
              <DeviceUtilizationCard rows={assetTrailRows} />
              <EnrichedContextCard assetType={trailAsset?.assetType ?? ''} />

              {/* See it live link */}
              <Box sx={{ mt: 2, pb: 1 }}>
                <Typography
                  component="span"
                  sx={{ fontSize: 14, fontWeight: 700, color: TEAL, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                >
                  See it live in MedSpot 360 →
                </Typography>
              </Box>
            </>
          )}

        </Box>
      )}

      {/* ── Drill-down: asset list ─────────────────────────────────────────── */}
      {selectedCategory && meta && selectedDay !== null && !selectedAsset && (
        <>
          {/* Summary strip */}
          {(() => {
            const dayContext = selectedDay === -1
              ? 'over the full period'
              : (() => { const d = dateFromKey(selectedDay!); return `on ${DAY_NAMES[d.getDay()]}, ${MON_NAMES[d.getMonth()]} ${d.getDate()}` })()
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: 'text.primary' }}>
                  {meta.label}
                </Typography>
                {/* Filled teal badge in device list view */}
                <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: TEAL }}>
                  <Typography sx={{ fontSize: 9, fontWeight: 800, color: '#fff', letterSpacing: '0.07em' }}>
                    {meta.badge}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  Devices in <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{meta.label}</Box>{' '}{dayContext}
                </Typography>
              </Box>
            )
          })()}

          {/* Asset rows */}
          {categoryLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1,2,3,4,5].map((i) => (
                <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
              ))}
            </Box>
          ) : categoryAssets.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 4 }}>
              No assets found in this category for the current filters.
            </Typography>
          ) : (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              {categoryAssets.map((row) => (
                <AssetRow key={row.assetId} row={row} days={days} onSelect={() => onSelectAsset(row.assetId)} />
              ))}
            </Box>
          )}

          {/* Back buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
            <Box
              onClick={() => onSelectDay(null)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                px: 2, py: 0.75, borderRadius: 2,
                border: '1.5px solid', borderColor: 'divider',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'text.secondary',
                transition: 'all 0.12s', '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              ← Back to the chart
            </Box>
            <Box
              onClick={() => onSelectCategory(null)}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                px: 2, py: 0.75, borderRadius: 2,
                border: '1.5px solid', borderColor: 'divider',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'text.secondary',
                transition: 'all 0.12s', '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              ← Back to the map
            </Box>
            <NextLink
              href={`/dashboard/${product}/locationhistory/${clientId}`}
              style={{ textDecoration: 'none' }}
            >
              <Box
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 2, py: 0.75, borderRadius: 2,
                  border: '1.5px solid', borderColor: TEAL,
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: TEAL,
                  transition: 'all 0.12s', '&:hover': { bgcolor: '#f0fdf9' },
                }}
              >
                Advanced Location History →
              </Box>
            </NextLink>
          </Box>

          {/* Why this matters */}
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: TEAL, letterSpacing: '0.12em', textTransform: 'uppercase', mb: 0.75 }}>
              Why this matters
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.7 }}>
              These are real, named devices — not averages. The device list reflects the full period;
              day-level device filtering is a future step. If a device shown here is actually
              somewhere else, that&apos;s exactly the kind of thing to investigate.
            </Typography>
            {assetType && meta && (
              <Typography
                sx={{
                  fontSize:   12,
                  fontWeight: 600,
                  color:      TEAL,
                  mt:         1,
                  cursor:     'default',
                  display:    'inline-block',
                }}
              >
                See how {assetType.toLowerCase()} move through {meta.label} →
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
