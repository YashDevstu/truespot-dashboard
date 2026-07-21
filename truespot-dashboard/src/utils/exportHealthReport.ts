// exportHealthReport.ts — BSA Missing Assets Excel export
// Dynamically imported from ExportButton — never runs server-side.
// Uses xlsx-js-style (drop-in xlsx fork with full cell styling).

import type { MissingAssetRow, HealthKpiData } from '@/hooks/useMissingAssetsData'
import type { ActiveHealthFilters } from '@/utils/daxHealth'

export interface HealthExportParams {
  clientName: string
  dashboardLabel: string
  refreshTime?: string
  filters: ActiveHealthFilters
  kpis: HealthKpiData | null
  tableRows: MissingAssetRow[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' })
}

function fmtNow(): string { return fmtDate(Date.now()) }

function fmtRefreshTime(ts: string | undefined): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZoneName: 'short',
    timeZone: 'America/Chicago',
  })
}

function fmtDuration(hours: number): string {
  if (!hours) return '—'
  const totalMinutes = Math.round(hours * 60)
  const d = Math.floor(totalMinutes / (24 * 60))
  const h = Math.floor((totalMinutes % (24 * 60)) / 60)
  const m = totalMinutes % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function buildFilename(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `TrueSpot_BSA_MissingAssets_${stamp}.xlsx`
}

// ── Color palette (6-char hex, no alpha) ─────────────────────────────────────

const CLR = {
  blue:     '2563EB',
  blueDk:   '1D4ED8',
  blueLt:   'EFF6FF',
  slate900: '0F172A',
  slate800: '1E293B',
  slate700: '334155',
  slate600: '475569',
  slate500: '64748B',
  slate400: '94A3B8',
  slate300: 'CBD5E1',
  slate200: 'E2E8F0',
  slate100: 'F1F5F9',
  slate50:  'F8FAFC',
  white:    'FFFFFF',
  green:    '15803D',
  green50:  'F0FDF4',
  red:      'DC2626',
  red50:    'FEF2F2',
  orange:   'EA580C',
  orange50: 'FFF7ED',
  amber:    'D97706',
  amber100: 'FEF3C7',
}

// ── Style builder ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyXLSX = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WS = Record<string, any>

function thin(rgb: string) { return { style: 'thin', color: { rgb } } }
function allB(rgb: string) { return { top: thin(rgb), bottom: thin(rgb), left: thin(rgb), right: thin(rgb) } }
function btmB(rgb: string) { return { bottom: thin(rgb) } }

function mkS(
  font: { sz?: number; bold?: boolean; italic?: boolean; color: string },
  fill?: string,
  align?: { h?: string; v?: string; indent?: number; wrap?: boolean },
  border?: AnyXLSX,
): AnyXLSX {
  return {
    font: { name: 'Calibri', sz: font.sz ?? 10, bold: !!font.bold, italic: !!font.italic, color: { rgb: font.color } },
    ...(fill ? { fill: { patternType: 'solid', fgColor: { rgb: fill } } } : {}),
    alignment: {
      horizontal: align?.h ?? 'left',
      vertical:   align?.v ?? 'center',
      ...(align?.indent ? { indent: align.indent } : {}),
      ...(align?.wrap   ? { wrapText: true }       : {}),
    },
    ...(border ? { border } : {}),
  }
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function setCell(ws: WS, XLSX: AnyXLSX, row: number, col: number, v: string | number | null, s: AnyXLSX) {
  const ref = XLSX.utils.encode_cell({ r: row, c: col })
  ws[ref] = { v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s }
}

function spanCells(ws: WS, XLSX: AnyXLSX, merges: AnyXLSX[], row: number, c1: number, c2: number, v: string | number | null, s: AnyXLSX) {
  setCell(ws, XLSX, row, c1, v, s)
  for (let c = c1 + 1; c <= c2; c++) setCell(ws, XLSX, row, c, null, s)
  merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } })
}

// ── Filter summary ────────────────────────────────────────────────────────────

const FILTER_LABELS: Partial<Record<keyof ActiveHealthFilters, string>> = {
  department:       'Department',
  excludeDepartment:'Excluded Departments',
  assetName:        'Asset Name',
  floor:            'Floor',
  geofence:         'Geofence',
  tagId:            'Tag ID',
  assetId:          'Asset ID',
  exitsFilter:      'Exits Filter',
  hourGroup:        'Last Seen Range',
  outsideHospital:  'Outside Hospital',
  lastSeenDate:     'Last Seen Date',
}

function buildFilterRows(filters: ActiveHealthFilters): [string, string][] {
  const rows: [string, string][] = []
  for (const [key, label] of Object.entries(FILTER_LABELS) as [keyof ActiveHealthFilters, string][]) {
    const val = filters[key]
    if (!val) continue
    rows.push([label, val.split(',').map(s => s.trim()).filter(Boolean).join(' + ')])
  }
  return rows.length > 0 ? rows : [['No filters applied', '—']]
}

// ── Department breakdown (computed from tableRows) ────────────────────────────

interface DeptBreakdown {
  dept: string
  total: number
  active: number
  missing30d: number
  outside: number
}

function buildDeptBreakdown(rows: MissingAssetRow[]): DeptBreakdown[] {
  const map = new Map<string, DeptBreakdown>()
  for (const r of rows) {
    const dept = r.department || '(No Department)'
    if (!map.has(dept)) map.set(dept, { dept, total: 0, active: 0, missing30d: 0, outside: 0 })
    const d = map.get(dept)!
    d.total++
    if (r.hourGroup === 'Less than 2hr') d.active++
    if (r.hoursMissing >= 720) d.missing30d++
    if (r.outsideHospital === 'Yes') d.outside++
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 1 — SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function buildSummarySheet(
  XLSX: AnyXLSX,
  params: HealthExportParams,
  filterRows: [string, string][],
  deptBreakdown: DeptBreakdown[],
): WS {
  const { clientName, dashboardLabel, refreshTime, kpis } = params
  const ws: WS = {}
  const merges: AnyXLSX[] = []
  const rowHeights: AnyXLSX[] = []
  const LAST_C = 4
  let r = 0

  function set(row: number, col: number, v: string | number | null, s: AnyXLSX) {
    setCell(ws, XLSX, row, col, v, s)
  }
  function span(row: number, c1: number, c2: number, v: string | number | null, s: AnyXLSX) {
    spanCells(ws, XLSX, merges, row, c1, c2, v, s)
  }
  function h(row: number, hpt: number) {
    while (rowHeights.length <= row) rowHeights.push({})
    rowHeights[row] = { hpt }
  }
  function sectionHeader(row: number, label: string) {
    span(row, 0, LAST_C, label, mkS({ sz: 8, bold: true, color: CLR.slate500 }, CLR.slate100, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
    h(row, 16)
  }

  // ── Banner ───────────────────────────────────────────────────────────────
  span(r, 0, LAST_C, 'TRUESPOT HEALTH', mkS({ sz: 20, bold: true, color: CLR.white }, CLR.blue, { h: 'left', indent: 2 }))
  h(r, 46); r++
  span(r, 0, LAST_C, dashboardLabel, mkS({ sz: 10, color: CLR.slate300 }, CLR.slate800, { h: 'left', indent: 2 }))
  h(r, 20); r++
  h(r, 10); r++ // spacer

  // ── Report Details ───────────────────────────────────────────────────────
  sectionHeader(r, 'REPORT DETAILS'); r++

  const meta: [string, string][] = [
    ['Client',        clientName],
    ['Generated',     fmtNow()],
    ['Data As Of',    fmtRefreshTime(refreshTime)],
  ]
  for (const [label, value] of meta) {
    set(r, 0, label, mkS({ sz: 10, bold: true, color: CLR.slate700 }, undefined, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
    set(r, 1, value, mkS({ sz: 10, color: CLR.slate900 }, undefined, { h: 'left', indent: 1 }, btmB(CLR.slate200)))
    for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 10, color: CLR.slate900 }, undefined, undefined, btmB(CLR.slate200)))
    merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
    h(r, 18); r++
  }

  // ── KPI cards ────────────────────────────────────────────────────────────
  h(r, 10); r++
  sectionHeader(r, 'SUMMARY STATISTICS'); r++

  // Labels
  const kpiLabels = ['TOTAL ASSETS', 'ACTIVE < 2HR', 'MISSING 30D+', 'OUTSIDE HOSPITAL', 'NOT SEEN > 1 DAY']
  for (let c = 0; c < 5; c++) {
    set(r, c, kpiLabels[c], mkS({ sz: 8, bold: true, color: CLR.slate400 }, CLR.slate50, { h: 'center' }, allB(CLR.slate200)))
  }
  h(r, 16); r++

  // Values
  const total      = kpis?.totalAssets     ?? 0
  const activeLt2  = kpis?.activeLt2hr     ?? 0
  const missing30  = kpis?.missing30d      ?? 0
  const outside    = kpis?.outsideHospital ?? 0
  const notSeen1d  = total - activeLt2

  const kpiColors = [CLR.slate900, CLR.green, CLR.red, CLR.orange, CLR.amber]
  const kpiBgs    = [undefined, CLR.green50, CLR.red50, CLR.orange50, CLR.amber100]
  const kpiValues = [total, activeLt2, missing30, outside, notSeen1d]

  for (let c = 0; c < 5; c++) {
    set(r, c, kpiValues[c],
      mkS({ sz: 22, bold: true, color: kpiColors[c] }, kpiBgs[c], { h: 'center', v: 'center' }, allB(CLR.slate200)))
  }
  h(r, 52); r++

  // ── Applied Filters ──────────────────────────────────────────────────────
  h(r, 10); r++
  sectionHeader(r, 'APPLIED FILTERS'); r++

  // Column headers
  set(r, 0, 'FILTER', mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 1 }, allB(CLR.slate700)))
  set(r, 1, 'VALUE',  mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 1 }, allB(CLR.slate700)))
  for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, undefined, allB(CLR.slate700)))
  merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
  h(r, 18); r++

  for (let i = 0; i < filterRows.length; i++) {
    const [key, val] = filterRows[i]
    const bg = i % 2 === 1 ? CLR.slate50 : undefined
    set(r, 0, key, mkS({ sz: 9, bold: true, color: CLR.slate700 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
    set(r, 1, val, mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
    for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 9, color: CLR.slate900 }, bg, undefined, allB(CLR.slate200)))
    merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
    h(r, 18); r++
  }

  // ── Department Breakdown ─────────────────────────────────────────────────
  if (deptBreakdown.length > 0) {
    h(r, 10); r++
    sectionHeader(r, 'BY DEPARTMENT'); r++

    const dHdrs = ['DEPARTMENT', 'TOTAL', 'ACTIVE < 2HR', 'MISSING 30D+', 'OUTSIDE HOSP']
    for (let c = 0; c < 5; c++) {
      set(r, c, dHdrs[c], mkS({ sz: 9, bold: true, color: CLR.white }, CLR.blue, { h: c === 0 ? 'left' : 'center', indent: c === 0 ? 1 : 0 }, allB(CLR.blueDk)))
    }
    h(r, 18); r++

    for (let i = 0; i < deptBreakdown.length; i++) {
      const { dept, total: t, active, missing30d, outside: out } = deptBreakdown[i]
      const bg = i % 2 === 1 ? CLR.slate50 : undefined
      set(r, 0, dept,      mkS({ sz: 9, bold: true, color: CLR.slate700 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
      set(r, 1, t,         mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'center'            }, allB(CLR.slate200)))
      set(r, 2, active,    mkS({ sz: 9, bold: true,  color: CLR.green   }, bg, { h: 'center'            }, allB(CLR.slate200)))
      set(r, 3, missing30d,mkS({ sz: 9, bold: missing30d > 0, color: missing30d > 0 ? CLR.red : CLR.slate400 }, bg, { h: 'center' }, allB(CLR.slate200)))
      set(r, 4, out,       mkS({ sz: 9, bold: out > 0, color: out > 0 ? CLR.orange : CLR.slate400 }, bg, { h: 'center' }, allB(CLR.slate200)))
      h(r, 17); r++
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  h(r, 14); r++
  span(r, 0, LAST_C,
    `TrueSpot Health  |  Confidential  |  Prepared for ${clientName}  |  ${fmtNow()}`,
    mkS({ sz: 8, italic: true, color: CLR.slate400 }, CLR.slate50, { h: 'center' }))
  h(r, 16)

  ws['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: LAST_C } })
  ws['!merges'] = merges
  ws['!rows']   = rowHeights
  ws['!cols']   = [{ wch: 26 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 22 }]
  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 2 — ASSET LIST
// ─────────────────────────────────────────────────────────────────────────────

function buildAssetSheet(XLSX: AnyXLSX, rows: MissingAssetRow[]): WS {
  const HEADERS = [
    '#', 'DEPARTMENT', 'ASSET NAME', 'ASSET ID', 'TAG ID',
    'LAST SEEN', 'DURATION MISSING', 'FLOOR', 'LAST GEOFENCE',
    'SUB LOCATION', 'OUTSIDE HOSP', 'ASSET TYPE', 'RANGE',
  ]
  const LAST_C = HEADERS.length - 1

  const aoa: AnyXLSX[][] = [
    ['MISSING ASSETS REPORT', ...Array(LAST_C).fill(null)],
    HEADERS,
    ...rows.map((row, i) => [
      i + 1,
      row.department    || '—',
      row.assetName     || '—',
      row.assetId       || '—',
      row.tagId         || '—',
      row.lastSeen      || '—',
      fmtDuration(row.hoursMissing),
      row.floor         || '—',
      row.geofence      || '—',
      row.subLocation   || '—',
      row.outsideHospital || '—',
      row.assetType     || '—',
      row.hourGroup     || '—',
    ]),
  ]

  const ws: WS = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: LAST_C } }]
  ws['!rows'] = [{ hpt: 32 }, { hpt: 22 }, ...rows.map(() => ({ hpt: 17 }))]
  ws['!cols'] = [
    { wch: 5  }, // #
    { wch: 22 }, // Department
    { wch: 24 }, // Asset Name
    { wch: 14 }, // Asset ID
    { wch: 16 }, // Tag ID
    { wch: 20 }, // Last Seen
    { wch: 18 }, // Duration
    { wch: 10 }, // Floor
    { wch: 28 }, // Geofence
    { wch: 26 }, // Sub Location
    { wch: 14 }, // Outside
    { wch: 20 }, // Asset Type
    { wch: 16 }, // Range
  ]
  ws['!views']      = [{ state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3' }]
  ws['!autofilter'] = { ref: `B2:${XLSX.utils.encode_col(LAST_C)}2` }

  // Banner
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = mkS({ sz: 13, bold: true, color: CLR.white }, CLR.blue, { h: 'left', indent: 2 })
  }

  // Header row
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 1, c })
    if (!ws[ref]) ws[ref] = { v: HEADERS[c], t: 's' }
    ws[ref].s = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800,
      { h: c === 0 ? 'center' : 'left', indent: c === 0 ? 0 : 1 },
      { ...btmB(CLR.blue), left: thin(CLR.slate700), right: thin(CLR.slate700) })
  }

  // Data rows
  const HOUR_GROUP_COLOR: Record<string, string> = {
    'Less than 2hr': CLR.green,
    '2hr-24hr':      '65A30D',
    '1d-7d':         CLR.amber,
    '7d-30d':        'EA580C',
    '30d+':          CLR.red,
  }

  for (let i = 0; i < rows.length; i++) {
    const r   = i + 2
    const alt = i % 2 === 1
    const bg  = alt ? CLR.slate50 : undefined
    const row = rows[i]

    for (let c = 0; c <= LAST_C; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) ws[ref] = { v: '', t: 's' }

      if (c === 0) {
        ws[ref].s = mkS({ sz: 9, color: CLR.slate400 }, bg, { h: 'center' }, { bottom: thin(CLR.slate200), right: thin(CLR.slate200) })
      } else if (c === 6) {
        // Duration — colored by hour group
        const col = HOUR_GROUP_COLOR[row.hourGroup ?? ''] ?? CLR.slate900
        ws[ref].s = mkS({ sz: 10, bold: true, color: col }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      } else if (c === 10) {
        // Outside Hospital
        const isYes = row.outsideHospital === 'Yes'
        ws[ref].s = mkS({ sz: 9, bold: isYes, color: isYes ? CLR.orange : CLR.slate400 }, isYes ? CLR.orange50 : bg, { h: 'center' }, btmB(CLR.slate200))
      } else if (c === 12) {
        // Range
        const col = HOUR_GROUP_COLOR[row.hourGroup ?? ''] ?? CLR.slate500
        ws[ref].s = mkS({ sz: 9, color: col }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      } else if (c === 2) {
        // Asset Name — bold
        ws[ref].s = mkS({ sz: 10, bold: true, color: CLR.slate800 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      } else {
        ws[ref].s = mkS({ sz: 10, color: CLR.slate700 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      }
    }
  }

  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export async function exportHealthExcel(params: HealthExportParams): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx-js-style')

  const filterRows    = buildFilterRows(params.filters)
  const deptBreakdown = buildDeptBreakdown(params.tableRows)

  const wb = XLSX.utils.book_new()

  const summaryWs = buildSummarySheet(XLSX, params, filterRows, deptBreakdown)
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  const assetWs = buildAssetSheet(XLSX, params.tableRows)
  XLSX.utils.book_append_sheet(wb, assetWs, 'Missing Assets')

  XLSX.writeFile(wb, buildFilename())
}
