// exportHealthLocationReport.ts — BSA Location History Excel export
// Dynamically imported — never runs server-side.
// Uses xlsx-js-style (drop-in xlsx fork with full cell styling).

import type { HLLocationRow, HLKpiData } from '@/hooks/useHealthLocationData'
import type { ActiveHealthLocationFilters } from '@/utils/daxHealthLocation'
import { formatDurationMins } from '@/components/dashboard/HealthLocationDashboard/HealthLocationKpiCards'

export interface HLExportParams {
  clientName:    string
  dashboardLabel: string
  refreshTime?:  string
  filters:       ActiveHealthLocationFilters
  kpis:          HLKpiData | null
  locationRows:  HLLocationRow[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtNow(): string {
  return new Date().toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Chicago',
  })
}

function fmtRefreshTime(ts: string | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short', timeZone: 'America/Chicago',
  })
}

function buildFilename(clientName: string): string {
  const d     = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const safe  = clientName.replace(/[^a-zA-Z0-9]/g, '')
  return `TrueSpot_${safe}_LocationHistory_${stamp}.xlsx`
}

// ── XLSX style helpers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyXLSX = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WS = Record<string, any>

const CLR = {
  blue:    '2563EB',
  blueDk:  '1D4ED8',
  blueLt:  'DBEAFE',
  blueBg:  'EFF6FF',
  slate900:'0F172A',
  slate700:'334155',
  slate500:'64748B',
  slate300:'CBD5E1',
  slate200:'E2E8F0',
  slate100:'F1F5F9',
  slate50: 'F8FAFC',
  white:   'FFFFFF',
  green:   '16A34A',
  orange:  'EA580C',
  amber:   'D97706',
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
    font: { name: 'Calibri', sz: font.sz ?? 10, bold: !!font.bold, italic: !!font.italic, color: { rgb: font.color } },
    fill: fill ? { fgColor: { rgb: fill } } : undefined,
    alignment: align ? { horizontal: align.h ?? 'left', vertical: align.v ?? 'center', wrapText: !!align.wrap } : undefined,
    border: border ?? undefined,
  }
}

function cell(v: AnyXLSX, t: string, s: AnyXLSX): AnyXLSX { return { v, t, s } }
function sCell(v: string, s: AnyXLSX)  { return cell(v, 's', s) }
function nCell(v: number, s: AnyXLSX)  { return cell(v, 'n', s) }

function setCell(ws: WS, col: number, row: number, c: AnyXLSX) {
  const addr = numToCol(col) + row
  ws[addr] = c
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

// ── Sheet 1: Summary ──────────────────────────────────────────────────────────

function buildSummarySheet(params: HLExportParams): WS {
  const { clientName, dashboardLabel, refreshTime, filters, kpis } = params
  const ws: WS = {}
  let r = 1

  // Title block
  const titleS = mkS({ sz: 18, bold: true, color: CLR.white }, CLR.blue, { h: 'left', v: 'center' })
  const subtitleS = mkS({ sz: 11, color: CLR.white }, CLR.blue, { h: 'left', v: 'center' })

  setCell(ws, 0, r, sCell('TrueSpot Health', titleS))
  setCell(ws, 1, r, sCell('', titleS))
  setCell(ws, 2, r, sCell('', titleS))
  setCell(ws, 3, r, sCell('', titleS))
  mergeCells(ws, 0, r, 3, r)
  r++

  setCell(ws, 0, r, sCell(`${clientName} · ${dashboardLabel}`, subtitleS))
  mergeCells(ws, 0, r, 3, r)
  r++
  setCell(ws, 0, r, sCell(`Exported: ${fmtNow()}`, mkS({ sz: 9, italic: true, color: CLR.white }, CLR.blue)))
  mergeCells(ws, 0, r, 3, r)
  r++

  // Data refresh
  r++
  setCell(ws, 0, r, sCell('Data Refresh', mkS({ bold: true, color: CLR.slate700 }, CLR.slate100, undefined, allB(CLR.slate300))))
  setCell(ws, 1, r, sCell(fmtRefreshTime(refreshTime), mkS({ color: CLR.slate700 }, CLR.white, undefined, allB(CLR.slate300))))
  mergeCells(ws, 1, r, 3, r)
  r++

  // Active filters
  r++
  setCell(ws, 0, r, sCell('ACTIVE FILTERS', mkS({ sz: 9, bold: true, color: CLR.slate500 }, CLR.slate50)))
  mergeCells(ws, 0, r, 3, r)
  r++

  const filterRows: [string, string][] = [
    ['Date',              filters.dateSeen              ?? 'All'],
    ['Geofence',          filters.geofence              ?? 'All'],
    ['Sub Geo Zone',      filters.subGeoZone            ?? 'All'],
    ['Floor Level',       filters.floorLevel            ?? 'All'],
    ['Asset Type',        filters.assetType             ?? 'All'],
    ['TrueTag ID',        filters.beaconId              ?? 'All'],
    ['Asset ID',          filters.vin                   ?? 'All'],
    ['Asset Name',        filters.assetName             ?? 'All'],
    ['Min Duration (min)',filters.minDurationMinutes != null ? String(filters.minDurationMinutes) : '0 (show all)'],
    ['Known Geofences Only', filters.excludeUnknownGeofence ? 'Yes' : 'No'],
  ]

  const labelS = mkS({ sz: 10, color: CLR.slate700 }, CLR.slate50, undefined, allB(CLR.slate200))
  const valueS = mkS({ sz: 10, color: CLR.slate900 }, CLR.white, undefined, allB(CLR.slate200))

  for (const [label, value] of filterRows) {
    setCell(ws, 0, r, sCell(label, labelS))
    setCell(ws, 1, r, sCell(value, valueS))
    mergeCells(ws, 1, r, 3, r)
    r++
  }

  // KPIs
  r++
  setCell(ws, 0, r, sCell('KPI SUMMARY', mkS({ sz: 9, bold: true, color: CLR.slate500 }, CLR.slate50)))
  mergeCells(ws, 0, r, 3, r)
  r++

  const kpiLabelS = mkS({ sz: 10, color: CLR.slate700 }, CLR.slate50, undefined, allB(CLR.slate200))
  const kpiValS   = mkS({ sz: 11, bold: true, color: CLR.blue }, CLR.white, undefined, allB(CLR.slate200))

  if (kpis) {
    const kpiRows: [string, string][] = [
      ['Total Tags',         String(kpis.totalTags)],
      ['Geofences Visited',  String(kpis.geofencesVisited)],
      ['Time Tracked',       formatDurationMins(kpis.timeTrackedMins)],
      ['Unknown Zone Time',  formatDurationMins(kpis.unknownZoneMins)],
    ]
    for (const [label, value] of kpiRows) {
      setCell(ws, 0, r, sCell(label, kpiLabelS))
      setCell(ws, 1, r, sCell(value, kpiValS))
      mergeCells(ws, 1, r, 3, r)
      r++
    }
  }

  ws['!ref'] = `A1:D${r}`
  ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 18 }, { wch: 18 }]
  ws['!rows'] = [{ hpt: 28 }, { hpt: 20 }, { hpt: 16 }]
  return ws
}

// ── Sheet 2: Location Points ───────────────────────────────────────────────────

const COLUMNS = [
  { header: 'First Seen',   key: 'firstSeen'    as const, w: 22 },
  { header: 'Last Seen',    key: 'lastSeen'     as const, w: 22 },
  { header: 'Duration',     key: 'durationMins' as const, w: 14 },
  { header: 'Floor',        key: 'floor'        as const, w: 12 },
  { header: 'Geofence',     key: 'geofence'     as const, w: 22 },
  { header: 'Sub Geo Zone', key: 'subGeoZone'   as const, w: 26 },
  { header: 'Asset ID',     key: 'assetId'      as const, w: 14 },
  { header: 'Asset Name',   key: 'assetName'    as const, w: 22 },
  { header: 'Tag ID',       key: 'tagId'        as const, w: 16 },
  { header: 'Asset Type',   key: 'assetType'    as const, w: 22 },
]

function durationColor(mins: number): string {
  if (mins <   120) return CLR.green
  if (mins <  1440) return '65A30D'
  if (mins < 10080) return CLR.amber
  return CLR.orange
}

function buildDataSheet(rows: HLLocationRow[]): WS {
  const ws: WS = {}
  const HEADER_ROW = 1

  // Header
  const hdrS = mkS({ sz: 10, bold: true, color: CLR.white }, CLR.blue, { h: 'center', v: 'center' }, allB(CLR.blueDk))
  COLUMNS.forEach((col, ci) => {
    setCell(ws, ci, HEADER_ROW, sCell(col.header, hdrS))
  })

  // Data rows
  const baseS   = mkS({ sz: 10, color: CLR.slate900 }, CLR.white, { v: 'center' }, btmB(CLR.slate200))
  const altS    = mkS({ sz: 10, color: CLR.slate900 }, CLR.slate50, { v: 'center' }, btmB(CLR.slate200))
  const monoS   = mkS({ sz: 9,  color: CLR.slate700 }, CLR.white, { v: 'center' }, btmB(CLR.slate200))
  const monoAltS= mkS({ sz: 9,  color: CLR.slate700 }, CLR.slate50, { v: 'center' }, btmB(CLR.slate200))

  rows.forEach((row, ri) => {
    const r    = HEADER_ROW + 1 + ri
    const even = ri % 2 === 0
    const bg   = even ? baseS : altS
    const mono = even ? monoS : monoAltS

    COLUMNS.forEach((col, ci) => {
      if (col.key === 'firstSeen' || col.key === 'lastSeen') {
        setCell(ws, ci, r, sCell(fmtDatetime(row[col.key]), bg))
      } else if (col.key === 'durationMins') {
        const durS = mkS({ sz: 10, bold: true, color: durationColor(row.durationMins) }, even ? CLR.white : CLR.slate50, { v: 'center' }, btmB(CLR.slate200))
        setCell(ws, ci, r, sCell(formatDurationMins(row.durationMins), durS))
      } else if (col.key === 'assetId' || col.key === 'tagId') {
        setCell(ws, ci, r, sCell(row[col.key] || '—', mono))
      } else if (col.key === 'geofence') {
        const isUnknown = row.geofence === 'Unknown Geofence'
        const geoS = mkS({ sz: 10, bold: true, color: isUnknown ? CLR.orange : CLR.slate900 }, even ? CLR.white : CLR.slate50, { v: 'center' }, btmB(CLR.slate200))
        setCell(ws, ci, r, sCell(row.geofence || '—', geoS))
      } else {
        setCell(ws, ci, r, sCell((row[col.key] as string) || '—', bg))
      }
    })
  })

  const lastRow = HEADER_ROW + rows.length
  ws['!ref']  = `A1:${numToCol(COLUMNS.length - 1)}${lastRow}`
  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.w }))
  ws['!rows'] = [{ hpt: 22 }]  // header row height
  return ws
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function exportHealthLocationExcel(params: HLExportParams): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx-js-style')

  const wb = XLSX.utils.book_new()
  wb.Props = { Title: `${params.clientName} Location History`, Author: 'TrueSpot' }

  XLSX.utils.book_append_sheet(wb, buildSummarySheet(params),           'Summary')
  XLSX.utils.book_append_sheet(wb, buildDataSheet(params.locationRows), 'Location Points')

  XLSX.writeFile(wb, buildFilename(params.clientName))
}
