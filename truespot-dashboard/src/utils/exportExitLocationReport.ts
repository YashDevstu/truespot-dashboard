// exportExitLocationReport.ts — Halifax Exit Location Portal Excel export
// Dynamically imported — never runs server-side.
// Uses xlsx-js-style, same as the other Health exports — full cell styling,
// branded banner, KPI summary, and a styled asset table.

import type { ExitAssetRow, MonitoredExitRow } from '@/hooks/useExitLocationData'

export interface ExitLocationExportParams {
  clientName:       string
  refreshTime?:     string
  dwell:            'new' | 'dwelling' | 'all'
  assets:           ExitAssetRow[]
  monitoredExits:   MonitoredExitRow[]
  // DST-aware label computed by the caller (e.g. "Daily at 2:00 PM EDT") — this
  // module never hardcodes EST/EDT since the correct one depends on the current
  // season, not a fixed string.
  refreshCadence?:  string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return iso
  const [, y, mo, d, h, mi] = m
  const hour   = Number(h)
  const ampm   = hour >= 12 ? 'PM' : 'AM'
  const h12    = hour % 12 || 12
  return `${Number(mo)}/${Number(d)}/${y} ${h12}:${mi} ${ampm}`
}

function fmtNow(): string {
  return new Date().toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
  })
}

function buildFilename(clientName: string): string {
  const d     = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const safe  = clientName.replace(/[^a-zA-Z0-9]/g, '')
  return `TrueSpot_${safe}_ExitLocation_${stamp}.xlsx`
}

// ── XLSX style helpers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyXLSX = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WS = Record<string, any>

const CLR = {
  teal:     '0D9488',
  tealDk:   '0F766E',
  tealBg:   'F0FDFA',
  slate900: '0F172A',
  slate700: '334155',
  slate500: '64748B',
  slate300: 'CBD5E1',
  slate200: 'E2E8F0',
  slate100: 'F1F5F9',
  slate50:  'F8FAFC',
  white:    'FFFFFF',
  red:      'DC2626',
  redBg:    'FEF2F2',
  redBorder:'FCA5A5',
  amber:    'D97706',
  amberBg:  'FFFBEB',
}

function thin(rgb: string) { return { style: 'thin', color: { rgb } } }
function allB(rgb: string) { return { top: thin(rgb), bottom: thin(rgb), left: thin(rgb), right: thin(rgb) } }
function btmB(rgb: string) { return { bottom: thin(rgb) } }

function mkS(
  font: { sz?: number; bold?: boolean; italic?: boolean; color: string },
  fill?: string,
  align?: { h?: string; v?: string; wrap?: boolean },
  border?: AnyXLSX,
): AnyXLSX {
  return {
    font:      { name: 'Calibri', sz: font.sz ?? 10, bold: !!font.bold, italic: !!font.italic, color: { rgb: font.color } },
    fill:      fill ? { fgColor: { rgb: fill } } : undefined,
    alignment: align ? { horizontal: align.h ?? 'left', vertical: align.v ?? 'center', wrapText: !!align.wrap } : undefined,
    border:    border ?? undefined,
  }
}

function cell(v: AnyXLSX, t: string, s: AnyXLSX): AnyXLSX { return { v, t, s } }
function sCell(v: string, s: AnyXLSX) { return cell(v, 's', s) }
function nCell(v: number, s: AnyXLSX) { return cell(v, 'n', s) }

function setCell(ws: WS, col: number, row: number, c: AnyXLSX) {
  ws[numToCol(col) + row] = c
}

function numToCol(n: number): string {
  let s = ''
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 }
  return s
}

function mergeCells(ws: WS, c1: number, r1: number, c2: number, r2: number) {
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { c: c1, r: r1 - 1 }, e: { c: c2, r: r2 - 1 } })
}

// Solid dark section divider bar — reads as a structured report section break
// rather than a pale label sitting in empty space.
function sectionHeader(ws: WS, r: number, label: string) {
  const s = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate700, { h: 'left', v: 'center' })
  for (let c = 0; c < 4; c++) setCell(ws, c, r, sCell(c === 0 ? label : '', s))
  mergeCells(ws, 0, r, 3, r)
}

// A "Label / Count / % of total" rollup table — used for the Department and
// Asset Type breakdowns. Counts are real numeric cells (not text) so the
// numbers stay usable for SUM/AVERAGE in Excel, not just display.
function rollupTable(ws: WS, startRow: number, rows: [string, number][], total: number): number {
  let r = startRow
  const hdrS = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.teal, { h: 'left', v: 'center' }, allB(CLR.tealDk))
  const hdrNumS = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.teal, { h: 'center', v: 'center' }, allB(CLR.tealDk))
  setCell(ws, 0, r, sCell('Name', hdrS))
  setCell(ws, 1, r, sCell('Count', hdrNumS))
  setCell(ws, 2, r, sCell('% of Total', hdrNumS)); mergeCells(ws, 2, r, 3, r)
  r++

  rows.forEach(([name, count], i) => {
    const even = i % 2 === 0
    const bg   = even ? CLR.white : CLR.slate50
    const labelS = mkS({ sz: 10, color: CLR.slate900 }, bg, { h: 'left', v: 'center' }, btmB(CLR.slate200))
    const numS   = mkS({ sz: 10, bold: true, color: CLR.teal }, bg, { h: 'center', v: 'center' }, btmB(CLR.slate200))
    const pctS   = mkS({ sz: 10, color: CLR.slate700 }, bg, { h: 'center', v: 'center' }, btmB(CLR.slate200))
    setCell(ws, 0, r, sCell(name, labelS))
    setCell(ws, 1, r, nCell(count, numS))
    setCell(ws, 2, r, sCell(total > 0 ? `${Math.round((count / total) * 100)}%` : '—', pctS)); mergeCells(ws, 2, r, 3, r)
    r++
  })
  return r
}

// Groups assets by a key, sorted by count descending — shared by the
// Department and Asset Type rollups.
function groupCounts(assets: ExitAssetRow[], key: 'department' | 'assetType'): [string, number][] {
  const counts = new Map<string, number>()
  for (const a of assets) {
    const label = a[key] || 'Unspecified'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

// ── Sheet 1: Summary ──────────────────────────────────────────────────────────

function buildSummarySheet(params: ExitLocationExportParams): WS {
  const { clientName, refreshTime, dwell, assets, monitoredExits } = params
  const ws: WS = {}
  let r = 1

  const titleS    = mkS({ sz: 18, bold: true, color: CLR.white }, CLR.teal, { h: 'left', v: 'center' })
  const subtitleS = mkS({ sz: 11, color: CLR.white }, CLR.teal, { h: 'left', v: 'center' })

  for (let c = 0; c < 4; c++) setCell(ws, c, r, sCell(c === 0 ? 'TrueSpot Health — Exit Location Portal' : '', titleS))
  mergeCells(ws, 0, r, 3, r)
  r++

  setCell(ws, 0, r, sCell(clientName, subtitleS))
  mergeCells(ws, 0, r, 3, r)
  r++
  setCell(ws, 0, r, sCell(`Exported: ${fmtNow()}`, mkS({ sz: 9, italic: true, color: CLR.white }, CLR.teal)))
  mergeCells(ws, 0, r, 3, r)
  r++

  // Data refresh
  r++
  setCell(ws, 0, r, sCell('Data Refresh', mkS({ bold: true, color: CLR.slate700 }, CLR.slate100, undefined, allB(CLR.slate300))))
  setCell(ws, 1, r, sCell(refreshTime || '—', mkS({ color: CLR.slate700 }, CLR.white, undefined, allB(CLR.slate300))))
  mergeCells(ws, 1, r, 3, r)
  r++
  setCell(ws, 0, r, sCell('Refresh Cadence', mkS({ bold: true, color: CLR.slate700 }, CLR.slate100, undefined, allB(CLR.slate300))))
  setCell(ws, 1, r, sCell(params.refreshCadence || '—', mkS({ color: CLR.slate700 }, CLR.white, undefined, allB(CLR.slate300))))
  mergeCells(ws, 1, r, 3, r)
  r++

  // Report scope
  r++
  sectionHeader(ws, r, 'REPORT SCOPE')
  r++
  setCell(ws, 0, r, sCell('Review Window', mkS({ sz: 10, color: CLR.slate700 }, CLR.slate50, undefined, allB(CLR.slate200))))
  const dwellLabel = dwell === 'all' ? 'All Exits (Previous 24 Hours + Longer)' : dwell === 'new' ? 'Previous 24 Hours' : 'Longer Than 24 Hours'
  setCell(ws, 1, r, sCell(dwellLabel, mkS({ sz: 10, color: CLR.slate900 }, CLR.white, undefined, allB(CLR.slate200))))
  mergeCells(ws, 1, r, 3, r)
  r++

  // KPI summary
  r++
  sectionHeader(ws, r, 'KPI SUMMARY')
  r++

  const activeLocations = new Set(assets.map((a) => `${a.geofence}::${a.subGeoZone}`)).size
  const newCount = assets.filter((a) => a.last24).length

  const kpiLabelS = mkS({ sz: 10, color: CLR.slate700 }, CLR.slate50, undefined, allB(CLR.slate200))
  const kpiValS   = mkS({ sz: 11, bold: true, color: CLR.teal }, CLR.white, undefined, allB(CLR.slate200))

  const kpiRows: [string, number | string][] = [
    ['Assets at Exits',        assets.length],
    ['Exit Locations Active',  `${activeLocations} of ${monitoredExits.length} monitored`],
    ['New in Last 24h',        newCount],
  ]
  for (const [label, value] of kpiRows) {
    setCell(ws, 0, r, sCell(label, kpiLabelS))
    setCell(ws, 1, r, typeof value === 'number' ? nCell(value, kpiValS) : sCell(value, kpiValS))
    mergeCells(ws, 1, r, 3, r)
    r++
  }

  // By Department — who to follow up with, ranked by how many of their
  // assets are currently sitting at an exit.
  r++
  sectionHeader(ws, r, 'ASSETS AT EXITS — BY DEPARTMENT')
  r++
  r = rollupTable(ws, r, groupCounts(assets, 'department'), assets.length)

  // By Asset Type — is this a routine pattern (carts/ladders near a service
  // exit) or a genuine concern (clinical equipment near an exit)?
  r++
  sectionHeader(ws, r, 'ASSETS AT EXITS — BY ASSET TYPE')
  r++
  r = rollupTable(ws, r, groupCounts(assets, 'assetType'), assets.length)

  ws['!ref']  = `A1:D${r}`
  ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 18 }, { wch: 18 }]
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 16 }]
  return ws
}

// ── Sheet 2: Assets At Exits ───────────────────────────────────────────────────

const ASSET_COLUMNS = [
  { header: 'Asset Name',        key: 'assetName'  as const, w: 32 },
  { header: 'Geofence',          key: 'geofence'   as const, w: 22 },
  { header: 'Sub Geo Zone',      key: 'subGeoZone' as const, w: 30 },
  { header: 'Department',        key: 'department' as const, w: 18 },
  { header: 'Asset Type',        key: 'assetType'  as const, w: 20 },
  { header: 'VIN',               key: 'vin'        as const, w: 16 },
  { header: 'Time at Exit',      key: 'firstSeen'  as const, w: 20 },
  { header: 'Status',            key: 'last24'     as const, w: 16 },
]

function buildAssetSheet(rows: ExitAssetRow[]): WS {
  const ws: WS = {}
  const HEADER_ROW = 1

  const hdrS = mkS({ sz: 10, bold: true, color: CLR.white }, CLR.teal, { h: 'center', v: 'center' }, allB(CLR.tealDk))
  ASSET_COLUMNS.forEach((col, ci) => setCell(ws, ci, HEADER_ROW, sCell(col.header, hdrS)))

  const sorted = [...rows].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))

  sorted.forEach((row, ri) => {
    const r    = HEADER_ROW + 1 + ri
    const even = ri % 2 === 0
    const bg   = even ? CLR.white : CLR.slate50
    const baseS = mkS({ sz: 10, color: CLR.slate900 }, bg, { v: 'center' }, btmB(CLR.slate200))
    const monoS = mkS({ sz: 9,  color: CLR.slate700 }, bg, { v: 'center' }, btmB(CLR.slate200))
    const geoS  = mkS({ sz: 10, bold: true, color: CLR.slate900 }, bg, { v: 'center' }, btmB(CLR.slate200))
    const nameS = mkS({ sz: 10, bold: true, color: row.last24 ? CLR.amber : CLR.slate900 }, bg, { v: 'center' }, btmB(CLR.slate200))
    const statS = mkS({ sz: 10, bold: true, color: row.last24 ? CLR.amber : CLR.teal }, row.last24 ? CLR.amberBg : CLR.tealBg, { h: 'center', v: 'center' }, allB(row.last24 ? 'FDE68A' : '99F6E4'))

    ASSET_COLUMNS.forEach((col, ci) => {
      if (col.key === 'firstSeen')     setCell(ws, ci, r, sCell(fmtDatetime(row.firstSeen), baseS))
      else if (col.key === 'vin')      setCell(ws, ci, r, sCell(row.vin || '—', monoS))
      else if (col.key === 'geofence') setCell(ws, ci, r, sCell(row.geofence || '—', geoS))
      else if (col.key === 'assetName')setCell(ws, ci, r, sCell(row.assetName || '—', nameS))
      else if (col.key === 'department') setCell(ws, ci, r, sCell(row.department || '—', baseS))
      else if (col.key === 'last24')   setCell(ws, ci, r, sCell(row.last24 ? 'New (<24h)' : 'Dwelling (>24h)', statS))
      else                             setCell(ws, ci, r, sCell(row[col.key] as string || '—', baseS))
    })
  })

  const lastRow = HEADER_ROW + sorted.length
  const lastCol = numToCol(ASSET_COLUMNS.length - 1)
  ws['!ref']       = `A1:${lastCol}${lastRow}`
  ws['!cols']      = ASSET_COLUMNS.map((c) => ({ wch: c.w }))
  ws['!rows']      = [{ hpt: 22 }]
  ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` }
  return ws
}

// ── Sheet 3: Monitored Exits ────────────────────────────────────────────────────

function buildMonitoredExitsSheet(monitoredExits: MonitoredExitRow[], assets: ExitAssetRow[]): WS {
  const ws: WS = {}
  const HEADER_ROW = 1
  const activeKeys = new Set(assets.map((a) => `${a.geofence}::${a.subGeoZone}`))

  const cols = [
    { header: 'Geofence',     w: 24 },
    { header: 'Sub Geo Zone', w: 32 },
    { header: 'Status',       w: 18 },
  ]

  const hdrS = mkS({ sz: 10, bold: true, color: CLR.white }, CLR.teal, { h: 'center', v: 'center' }, allB(CLR.tealDk))
  cols.forEach((col, ci) => setCell(ws, ci, HEADER_ROW, sCell(col.header, hdrS)))

  monitoredExits.forEach((ex, ri) => {
    const r      = HEADER_ROW + 1 + ri
    const even   = ri % 2 === 0
    const bg     = even ? CLR.white : CLR.slate50
    const active = activeKeys.has(`${ex.geofence}::${ex.subGeoZone}`)
    const baseS  = mkS({ sz: 10, color: CLR.slate900 }, bg, { v: 'center' }, btmB(CLR.slate200))
    const statS  = mkS(
      { sz: 10, bold: true, color: active ? CLR.red : CLR.slate500 },
      active ? CLR.redBg : bg,
      { h: 'center', v: 'center' },
      allB(active ? CLR.redBorder : CLR.slate200)
    )

    setCell(ws, 0, r, sCell(ex.geofence, baseS))
    setCell(ws, 1, r, sCell(ex.subGeoZone, baseS))
    setCell(ws, 2, r, sCell(active ? 'Active detection' : 'No current activity', statS))
  })

  const lastRow = HEADER_ROW + monitoredExits.length
  const lastCol = numToCol(cols.length - 1)
  ws['!ref']        = `A1:${lastCol}${lastRow}`
  ws['!cols']       = cols.map((c) => ({ wch: c.w }))
  ws['!rows']       = [{ hpt: 22 }]
  ws['!autofilter'] = { ref: `A1:${lastCol}${lastRow}` }
  return ws
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function exportExitLocationExcel(params: ExitLocationExportParams): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx-js-style')

  const wb = XLSX.utils.book_new()
  wb.Props = { Title: `${params.clientName} Exit Location Portal`, Author: 'TrueSpot' }

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(params), 'Summary')
  XLSX.utils.book_append_sheet(wb, buildAssetSheet(params.assets), 'Assets At Exits')
  XLSX.utils.book_append_sheet(wb, buildMonitoredExitsSheet(params.monitoredExits, params.assets), 'Monitored Exits')

  XLSX.writeFile(wb, buildFilename(params.clientName))
}
