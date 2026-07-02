// exportReport.ts — dynamically imported from ExportButton; never runs server-side
// jspdf / jspdf-autotable are used by exportPdf
// xlsx-js-style is used by exportExcel (drop-in xlsx fork with full cell styling)
import type { LocationHistoryFilters } from '@/hooks/useFilters'
import { parsePings, mergeConsecutiveStops } from '@/utils/stops'
import { toTitleCase } from '@/utils/formatters'

export interface ExportParams {
  clientName: string
  dashboardLabel: string
  dateLabel: string
  filters: LocationHistoryFilters
  tableRows: Record<string, unknown>[]
  selectedAsset?: string
  datePeriod?: string
}

// ── internal formatters ───────────────────────────────────────────────────────

function parseMs(val: unknown): number | null {
  if (!val) return null
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.getTime()
}

function fmtDateOnly(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}

function fmtTimeOnly(ms: number): string {
  const d = new Date(ms)
  let h = d.getHours()
  const min = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${min} ${ampm}`
}

function fmtDateTime(val: unknown): string {
  const ms = parseMs(val)
  if (ms === null) return '—'
  return `${fmtDateOnly(ms)} ${fmtTimeOnly(ms)}`
}

function fmtDuration(minutes: number): string {
  if (minutes < 1) return '<1m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function resolveToday(label: string): string {
  return label === 'Today' ? fmtDateOnly(Date.now()) : label
}

function buildFilename(clientName: string, dateLabel: string, ext: 'pdf' | 'xlsx'): string {
  const d = new Date()
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return `TrueSpot_${safe(clientName)}_${safe(resolveToday(dateLabel))}_${yyyymmdd}.${ext}`
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── filter summary ────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<keyof LocationHistoryFilters, string> = {
  beaconId:           'Beacon ID',
  dateSeen:           'Date Seen',
  geofence:           'Geofence',
  subGeoZone:         'Sub Geo Zone',
  floorLevel:         'Floor Level',
  minDurationMinutes: 'Min Stop Duration',
  vin:                'VIN',
  stockNumber:        'Stock Number',
  assetType:          'Asset Type',
}

export function buildFilterRows(filters: LocationHistoryFilters): [string, string][] {
  const rows: [string, string][] = []
  for (const key of Object.keys(FILTER_LABELS) as (keyof LocationHistoryFilters)[]) {
    const val = filters[key]
    if (!val) continue
    if (key === 'minDurationMinutes' && (val === '0' || val === '')) continue
    const displayVal = val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (key === 'dateSeen' ? resolveToday(s) : s))
      .join(' + ')
    rows.push([FILTER_LABELS[key], displayVal])
  }
  return rows.length > 0 ? rows : [['No filters applied', '—']]
}

// ── stats ─────────────────────────────────────────────────────────────────────

function mergedIntervalMinutes(rows: Record<string, unknown>[]): number {
  const intervals: [number, number][] = []
  for (const r of rows) {
    const s = parseMs(r['[StartTime]'])
    const e = parseMs(r['[EndTime]'])
    if (s !== null && e !== null && e > s) intervals.push([s, e])
  }
  intervals.sort((a, b) => a[0] - b[0])
  let totalMs = 0
  let curS = -Infinity, curE = -Infinity
  for (const [s, e] of intervals) {
    if (s > curE) {
      if (curE > curS) totalMs += curE - curS
      curS = s; curE = e
    } else {
      curE = Math.max(curE, e)
    }
  }
  if (curE > curS) totalMs += curE - curS
  return Math.round(totalMs / 60_000)
}

// Used by PDF export
interface PdfStats { totalStops: string; uniqueGeofences: string; totalTimeTracked: string; currentZone: string }
function buildStats(rows: Record<string, unknown>[]): PdfStats | null {
  if (rows.length === 0) return null
  const stops = mergeConsecutiveStops(parsePings(rows))
  const uniqueGeos = new Set(rows.map((r) => String(r['[Geofence]'] ?? ''))).size
  const totalMins = mergedIntervalMinutes(rows)
  const latest = [...rows].sort((a, b) => (parseMs(b['[StartTime]']) ?? 0) - (parseMs(a['[StartTime]']) ?? 0))[0]
  const subZone  = String(latest?.['[SubGeoZone]'] ?? '')
  const geofence = String(latest?.['[Geofence]'] ?? '')
  return {
    totalStops: String(stops.length),
    uniqueGeofences: String(uniqueGeos),
    totalTimeTracked: fmtDuration(totalMins),
    currentZone: subZone ? `${geofence} · ${subZone}` : (geofence || '—'),
  }
}

// Used by Excel export — returns typed values
interface ExcelStats {
  totalStops: number
  uniqueGeofences: number
  totalTimeTracked: string
  currentZone: string
}
function buildExcelStats(rows: Record<string, unknown>[]): ExcelStats | null {
  if (rows.length === 0) return null
  const stops = mergeConsecutiveStops(parsePings(rows))
  const geoSet = new Set<string>()
  let latest = rows[0]
  let latestTime = parseMs(rows[0]?.['[StartTime]']) ?? 0
  for (const r of rows) {
    geoSet.add(String(r['[Geofence]'] ?? ''))
    const t = parseMs(r['[StartTime]']) ?? 0
    if (t > latestTime) { latestTime = t; latest = r }
  }
  const subZone  = String(latest?.['[SubGeoZone]'] ?? '').trim()
  const geofence = String(latest?.['[Geofence]']   ?? '').trim()
  return {
    totalStops: stops.length,
    uniqueGeofences: geoSet.size,
    totalTimeTracked: fmtDuration(mergedIntervalMinutes(rows)),
    currentZone: subZone ? `${geofence} · ${subZone}` : (geofence || '—'),
  }
}

// ── table builders for PDF ────────────────────────────────────────────────────

interface TableData { headers: string[]; body: string[][] }

function buildStopsRows(rows: Record<string, unknown>[]): TableData {
  const headers = ['#', 'Vehicle', 'Geofence', 'Sub Zone', 'Floor Level', 'Date', 'Start', 'End', 'Duration']
  const floorMap   = new Map<number, string>()
  const vehicleMap = new Map<number, string>()
  for (const r of rows) {
    const ms = parseMs(r['[StartTime]'])
    if (ms === null) continue
    if (!floorMap.has(ms))   floorMap.set(ms, String(r['[FloorLevel]'] ?? ''))
    if (!vehicleMap.has(ms)) {
      const make   = String(r['[Make]']  ?? '')
      const model  = String(r['[Model]'] ?? '')
      const year   = String(r['[Year]']  ?? '')
      const beacon = String(r['[BeaconId]'] ?? '')
      vehicleMap.set(ms, make && model ? `${make} ${model}${year ? ` '${year.slice(-2)}` : ''}` : (beacon || '—'))
    }
  }
  const stops = mergeConsecutiveStops(parsePings(rows))
  const body = stops.map((stop, i) => [
    String(i + 1),
    vehicleMap.get(stop.startMs) ?? '—',
    stop.geofence   || '—',
    stop.subGeoZone || '—',
    floorMap.get(stop.startMs) ?? '—',
    fmtDateOnly(stop.startMs),
    fmtTimeOnly(stop.startMs),
    fmtTimeOnly(stop.endMs),
    fmtDuration(stop.totalMinutes),
  ])
  return { headers, body }
}

function buildRawRows(rows: Record<string, unknown>[]): TableData {
  const headers = [
    'Make', 'Model', 'Year', 'Geofence', 'Sub Zone', 'Floor Level',
    'First Seen', 'Last Seen', 'Duration', 'Beacon ID', 'VIN', 'Stock #', 'Asset Type', 'Battery',
  ]
  const body = rows.map((r) => [
    String(r['[Make]']        ?? ''),
    String(r['[Model]']       ?? ''),
    String(r['[Year]']        ?? ''),
    String(r['[Geofence]']    ?? ''),
    String(r['[SubGeoZone]']  ?? ''),
    String(r['[FloorLevel]']  ?? ''),
    fmtDateTime(r['[StartTime]']),
    fmtDateTime(r['[EndTime]']),
    fmtDuration(Number(r['[MinutesDiff]'] ?? 0)),
    String(r['[BeaconId]']    ?? ''),
    String(r['[VIN]']         ?? ''),
    String(r['[StockNumber]'] ?? ''),
    String(r['[AssetType]']   ?? ''),
    r['[BatteryLevel]'] != null ? `${Number(r['[BatteryLevel]']).toFixed(0)}%` : '—',
  ])
  return { headers, body }
}

// ── vehicle breakdown (multi-VIN) ────────────────────────────────────────────

interface VehicleBreakdown {
  vehicle: string
  stops: number
  geofences: number
  totalMinutes: number
}

function buildVehicleBreakdowns(stopRows: ExcelStopRow[]): VehicleBreakdown[] {
  const map = new Map<string, { stops: ExcelStopRow[]; geoSet: Set<string> }>()
  for (const row of stopRows) {
    if (!map.has(row.vehicle)) map.set(row.vehicle, { stops: [], geoSet: new Set() })
    const v = map.get(row.vehicle)!
    v.stops.push(row)
    v.geoSet.add(row.geofence)
  }
  return Array.from(map.entries()).map(([vehicle, { stops, geoSet }]) => ({
    vehicle,
    stops:        stops.length,
    geofences:    geoSet.size,
    totalMinutes: stops.reduce((sum, s) => sum + s.totalMinutes, 0),
  }))
}

// ── typed data builders for Excel ────────────────────────────────────────────

interface ExcelStopRow {
  num: number
  vehicle: string
  geofence: string
  subZone: string
  floorLevel: string
  assetType: string
  date: Date
  start: Date
  end: Date
  totalMinutes: number
  durationStr: string
}

function buildExcelStopRows(rows: Record<string, unknown>[]): ExcelStopRow[] {
  const floorMap   = new Map<number, string>()
  const vehicleMap = new Map<number, string>()
  const assetMap   = new Map<number, string>()

  for (const r of rows) {
    const ms = parseMs(r['[StartTime]'])
    if (ms === null) continue
    if (!floorMap.has(ms))   floorMap.set(ms, String(r['[FloorLevel]'] ?? ''))
    if (!assetMap.has(ms))   assetMap.set(ms, String(r['[AssetType]']  ?? 'Vehicle'))
    if (!vehicleMap.has(ms)) {
      const make   = toTitleCase(String(r['[Make]']  ?? ''))
      const model  = toTitleCase(String(r['[Model]'] ?? ''))
      const year   = String(r['[Year]']  ?? '')
      const beacon = String(r['[BeaconId]'] ?? '')
      vehicleMap.set(ms, make && model ? `${make} ${model}${year ? ` '${year.slice(-2)}` : ''}` : (beacon || '—'))
    }
  }

  return mergeConsecutiveStops(parsePings(rows)).map((stop, i) => ({
    num:          i + 1,
    vehicle:      vehicleMap.get(stop.startMs) ?? '—',
    geofence:     stop.geofence   || '—',
    subZone:      stop.subGeoZone || '—',
    floorLevel:   floorMap.get(stop.startMs) ?? '—',
    assetType:    assetMap.get(stop.startMs) ?? 'Vehicle',
    date:         new Date(stop.startMs),
    start:        new Date(stop.startMs),
    end:          new Date(stop.endMs),
    totalMinutes: stop.totalMinutes,
    durationStr:  fmtDuration(stop.totalMinutes),
  }))
}

interface ExcelRawRow {
  make: string; model: string; year: string
  vin: string; stockNumber: string; beaconId: string; assetType: string
  geofence: string; subZone: string; floorLevel: string
  date: Date | null; start: Date | null; end: Date | null
  durationMinutes: number; durationStr: string
  battery: string
}

function buildExcelRawRows(rows: Record<string, unknown>[]): ExcelRawRow[] {
  return rows.map((r) => {
    const sMs = parseMs(r['[StartTime]'])
    const eMs = parseMs(r['[EndTime]'])
    return {
      make:            toTitleCase(String(r['[Make]']        ?? '')),
      model:           toTitleCase(String(r['[Model]']       ?? '')),
      year:            String(r['[Year]']        ?? ''),
      vin:             String(r['[VIN]']         ?? ''),
      stockNumber:     String(r['[StockNumber]'] ?? ''),
      beaconId:        String(r['[BeaconId]']    ?? ''),
      assetType:       String(r['[AssetType]']   ?? ''),
      geofence:        String(r['[Geofence]']    ?? ''),
      subZone:         String(r['[SubGeoZone]']  ?? ''),
      floorLevel:      String(r['[FloorLevel]']  ?? ''),
      date:            sMs !== null ? new Date(sMs) : null,
      start:           sMs !== null ? new Date(sMs) : null,
      end:             eMs !== null ? new Date(eMs) : null,
      durationMinutes: Number(r['[MinutesDiff]'] ?? 0),
      durationStr:     fmtDuration(Number(r['[MinutesDiff]'] ?? 0)),
      battery:         r['[BatteryLevel]'] != null ? `${Number(r['[BatteryLevel]']).toFixed(0)}%` : '—',
    }
  })
}

// ── xlsx-js-style sheet builders ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyXLSX = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WS = Record<string, any>

// Color palette — 6-char hex (xlsx-js-style format, no alpha prefix)
const CLR = {
  blue:     'DC2626',
  blueDk:   'B91C1C',
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
  green:    '16A34A',
  green50:  'F0FDF4',
  amber:    'D97706',
  amber100: 'FEF3C7',
}

function thin(rgb: string) { return { style: 'thin', color: { rgb } } }
function allB(rgb: string) { return { top: thin(rgb), bottom: thin(rgb), left: thin(rgb), right: thin(rgb) } }
function btmB(rgb: string) { return { bottom: thin(rgb) } }
function btmRB(rgb: string) { return { bottom: thin(rgb), right: thin(rgb) } }
function lftBtmB(rgb: string) { return { left: thin(rgb), bottom: thin(rgb) } }

// Style builder shorthand
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

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY SHEET
// ─────────────────────────────────────────────────────────────────────────────
function buildSummarySheet(
  XLSX: AnyXLSX,
  clientName: string,
  dashboardLabel: string,
  dateLabel: string,
  filterRows: [string, string][],
  stats: ExcelStats | null,
  now: Date,
  vehicleBreakdowns: VehicleBreakdown[] = [],
): WS {
  const ws: WS = {}
  const merges: AnyXLSX[] = []
  const rowHeights: AnyXLSX[] = []

  // 4 equal columns: A-D
  const LAST_C = 3
  let r = 0

  function set(row: number, col: number, v: string | number | null, s: AnyXLSX) {
    const ref = XLSX.utils.encode_cell({ r: row, c: col })
    ws[ref] = { v: v ?? '', t: typeof v === 'number' ? 'n' : 's', s }
  }

  function span(row: number, c1: number, c2: number, v: string | number | null, s: AnyXLSX) {
    set(row, c1, v, s)
    for (let c = c1 + 1; c <= c2; c++) set(row, c, null, s)
    merges.push({ s: { r: row, c: c1 }, e: { r: row, c: c2 } })
  }

  function h(row: number, hpt: number) {
    while (rowHeights.length <= row) rowHeights.push({})
    rowHeights[row] = { hpt }
  }

  // ── Row 0: Brand banner ──────────────────────────────────────────────────
  span(r, 0, LAST_C, 'TRUESPOT', mkS({ sz: 20, bold: true, color: CLR.white }, CLR.blue, { h: 'left', indent: 2 }))
  h(r, 46); r++

  // ── Row 1: Sub-banner ────────────────────────────────────────────────────
  span(r, 0, LAST_C, dashboardLabel, mkS({ sz: 10, color: CLR.slate300 }, CLR.slate800, { h: 'left', indent: 2 }))
  h(r, 20); r++

  // ── Row 2: Spacer ────────────────────────────────────────────────────────
  h(r, 10); r++

  // ── Row 3: REPORT DETAILS section header ─────────────────────────────────
  span(r, 0, LAST_C, 'REPORT DETAILS',
    mkS({ sz: 8, bold: true, color: CLR.slate500 }, CLR.slate100, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
  h(r, 16); r++

  // ── Rows 4–6: Metadata ───────────────────────────────────────────────────
  const meta: [string, string][] = [
    ['Client',      clientName],
    ['Date Range',  resolveToday(dateLabel)],
    ['Generated',   `${fmtDateOnly(now.getTime())} ${fmtTimeOnly(now.getTime())}`],
  ]
  for (const [label, value] of meta) {
    set(r, 0, label, mkS({ sz: 10, bold: true, color: CLR.slate700 }, undefined, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
    set(r, 1, value, mkS({ sz: 10, color: CLR.slate900 }, undefined, { h: 'left', indent: 1 }, btmB(CLR.slate200)))
    for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 10, color: CLR.slate900 }, undefined, { h: 'left' }, btmB(CLR.slate200)))
    merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
    h(r, 18); r++
  }

  // ── Spacer ───────────────────────────────────────────────────────────────
  h(r, 10); r++

  // ── APPLIED FILTERS section ──────────────────────────────────────────────
  span(r, 0, LAST_C, 'APPLIED FILTERS',
    mkS({ sz: 8, bold: true, color: CLR.slate500 }, CLR.slate100, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
  h(r, 16); r++

  // Filter column headers
  set(r, 0, 'FILTER', mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 1 }, allB(CLR.slate700)))
  set(r, 1, 'VALUE',  mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 1 }, allB(CLR.slate700)))
  for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left' }, allB(CLR.slate700)))
  merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
  h(r, 18); r++

  // Filter data rows
  for (let i = 0; i < filterRows.length; i++) {
    const [key, val] = filterRows[i]
    const alt = i % 2 === 1
    const bg = alt ? CLR.slate50 : undefined
    set(r, 0, key, mkS({ sz: 9, bold: true, color: CLR.slate700 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
    set(r, 1, val, mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
    for (let c = 2; c <= LAST_C; c++) set(r, c, null, mkS({ sz: 9, color: CLR.slate900 }, bg, { h: 'left' }, allB(CLR.slate200)))
    merges.push({ s: { r, c: 1 }, e: { r, c: LAST_C } })
    h(r, 18); r++
  }

  // ── SUMMARY STATS section (if asset selected) ─────────────────────────────
  if (stats) {
    h(r, 12); r++ // spacer

    span(r, 0, LAST_C, 'SUMMARY STATS',
      mkS({ sz: 8, bold: true, color: CLR.slate500 }, CLR.slate100, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
    h(r, 16); r++

    const isMultiVehicle = vehicleBreakdowns.length > 1

    // KPI label row
    const kpiLabels = ['TOTAL STOPS', 'UNIQUE GEOFENCES', 'TIME TRACKED', isMultiVehicle ? 'ACTIVE VEHICLES' : 'CURRENT ZONE']
    for (let c = 0; c < 4; c++) {
      set(r, c, kpiLabels[c], mkS({ sz: 8, bold: true, color: CLR.slate400 }, CLR.slate50, { h: 'center' }, allB(CLR.slate200)))
    }
    h(r, 16); r++

    // KPI value row
    const kpiVals: (string | number)[] = [
      stats.totalStops,
      stats.uniqueGeofences,
      stats.totalTimeTracked,
      isMultiVehicle ? vehicleBreakdowns.length : stats.currentZone,
    ]
    for (let c = 0; c < 4; c++) {
      const isAccent = c === 3
      const sz = (!isMultiVehicle && isAccent) ? 14 : 22
      const color = isAccent ? (isMultiVehicle ? CLR.blue : CLR.green) : CLR.slate900
      const bgFill = isAccent ? (isMultiVehicle ? 'EFF6FF' : CLR.green50) : undefined
      set(r, c, kpiVals[c],
        mkS({ sz, bold: true, color },
          bgFill,
          { h: 'center', v: 'center', ...(!isMultiVehicle && isAccent ? { wrap: true } : {}) },
          allB(CLR.slate200)))
    }
    h(r, 58); r++

    // ── Per-vehicle breakdown table (multi-vehicle only) ─────────────────────
    if (isMultiVehicle) {
      h(r, 12); r++ // spacer

      span(r, 0, LAST_C, 'VEHICLE BREAKDOWN',
        mkS({ sz: 8, bold: true, color: CLR.slate500 }, CLR.slate100, { h: 'left', indent: 2 }, btmB(CLR.slate200)))
      h(r, 16); r++

      // Column headers
      const brkHdrs = ['VEHICLE', 'STOPS', 'GEOFENCES', 'TIME TRACKED']
      for (let c = 0; c < 4; c++) {
        set(r, c, brkHdrs[c], mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 1 }, allB(CLR.slate700)))
      }
      h(r, 18); r++

      // One row per vehicle
      for (let i = 0; i < vehicleBreakdowns.length; i++) {
        const vb = vehicleBreakdowns[i]
        const alt = i % 2 === 1
        const bg = alt ? CLR.slate50 : undefined
        const totalMins = vb.totalMinutes
        const hrs  = Math.floor(totalMins / 60)
        const mins = totalMins % 60
        const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`

        set(r, 0, vb.vehicle,   mkS({ sz: 9, bold: true, color: CLR.slate700 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
        set(r, 1, vb.stops,     mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'center'           }, allB(CLR.slate200)))
        set(r, 2, vb.geofences, mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'center'           }, allB(CLR.slate200)))
        set(r, 3, timeStr,      mkS({ sz: 9,             color: CLR.slate900 }, bg, { h: 'left', indent: 1 }, allB(CLR.slate200)))
        h(r, 18); r++
      }
    }
  }

  // ── Spacer + confidential footer ─────────────────────────────────────────
  h(r, 14); r++
  span(r, 0, LAST_C,
    `TrueSpot  |  Confidential  |  Prepared for ${clientName}  |  ${fmtDateOnly(now.getTime())}`,
    mkS({ sz: 8, italic: true, color: CLR.slate400 }, CLR.slate50, { h: 'center' }))
  h(r, 16)

  ws['!ref']    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: LAST_C } })
  ws['!merges'] = merges
  ws['!rows']   = rowHeights
  ws['!cols']   = [{ wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 46 }]

  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// STOPS SHEET (Locations Visited)
// ─────────────────────────────────────────────────────────────────────────────
function buildStopsSheet(XLSX: AnyXLSX, stopRows: ExcelStopRow[], vehicleName?: string): WS {
  const HEADERS = ['#', 'VEHICLE', 'GEOFENCE', 'SUB ZONE', 'FLOOR LEVEL', 'DATE', 'START', 'END', 'DURATION']
  const NUM_COLS = HEADERS.length
  const LAST_C   = NUM_COLS - 1
  const bannerTitle = vehicleName ? `LOCATIONS VISITED  ·  ${vehicleName}` : 'LOCATIONS VISITED'

  // Build AOA: row 0 = banner, row 1 = headers, rows 2+ = data
  const aoa: AnyXLSX[][] = [
    [bannerTitle, ...Array(LAST_C).fill(null)],
    HEADERS,
    ...stopRows.map((s) => [
      s.num, s.vehicle, s.geofence, s.subZone, s.floorLevel,
      s.date, s.start, s.end, s.durationStr,
    ]),
  ]

  const ws: WS = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

  // ── Merges ────────────────────────────────────────────────────────────────
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: LAST_C } }]

  // ── Row heights ───────────────────────────────────────────────────────────
  ws['!rows'] = [
    { hpt: 32 }, // banner
    { hpt: 22 }, // column headers
    ...stopRows.map(() => ({ hpt: 18 })),
  ]

  // ── Column widths ─────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 5  }, // #
    { wch: 20 }, // Vehicle
    { wch: 26 }, // Geofence
    { wch: 24 }, // Sub Zone
    { wch: 14 }, // Floor Level
    { wch: 11 }, // Date
    { wch: 10 }, // Start
    { wch: 10 }, // End
    { wch: 11 }, // Duration
  ]

  // ── Freeze panes: banner + header rows ───────────────────────────────────
  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3' }]

  // ── Auto-filter on header row ─────────────────────────────────────────────
  ws['!autofilter'] = { ref: `B2:${XLSX.utils.encode_col(LAST_C)}2` }

  // ── Style: banner row (r=0) ───────────────────────────────────────────────
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = mkS({ sz: 12, bold: true, color: CLR.white }, CLR.blue, { h: c === 0 ? 'left' : 'left', indent: 2 })
  }

  // ── Style: header row (r=1) ───────────────────────────────────────────────
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 1, c })
    if (!ws[ref]) ws[ref] = { v: HEADERS[c], t: 's' }
    const align = c === 0 ? 'center' : c === LAST_C ? 'right' : 'left'
    ws[ref].s = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.slate800,
      { h: align, indent: c === 0 ? 0 : 1 },
      { ...btmB(CLR.blue), left: thin(CLR.slate700), right: thin(CLR.slate700) })
  }

  // ── Style: data rows (r=2+) ───────────────────────────────────────────────
  for (let i = 0; i < stopRows.length; i++) {
    const r   = i + 2
    const alt = i % 2 === 1
    const bg  = alt ? CLR.slate50 : undefined
    const stop = stopRows[i]

    for (let c = 0; c <= LAST_C; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) ws[ref] = { v: '', t: 's' }

      // Apply date/time number formats
      if (c === 5 && ws[ref].t === 'd') ws[ref].z = 'mm/dd/yy'
      if ((c === 6 || c === 7) && ws[ref].t === 'd') ws[ref].z = 'h:mm AM/PM'

      // Apply cell style
      if (c === 0) {
        // Row number — centered, muted
        ws[ref].s = mkS({ sz: 9, color: CLR.slate400 }, bg, { h: 'center' }, btmRB(CLR.slate200))
      } else if (c === LAST_C) {
        // Duration — right-aligned, bold; amber if >2h
        const isLong = stop.totalMinutes >= 120
        ws[ref].s = mkS(
          { sz: 10, bold: true, color: isLong ? CLR.amber : CLR.slate900 },
          isLong ? CLR.amber100 : bg,
          { h: 'right', indent: 1 },
          lftBtmB(CLR.slate200),
        )
      } else if (c === 5 || c === 6 || c === 7) {
        // Date / Start / End — slightly muted
        ws[ref].s = mkS({ sz: 10, color: CLR.slate600 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      } else {
        ws[ref].s = mkS({ sz: 10, color: CLR.slate900 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      }
    }
  }

  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// RAW DATA SHEET
// ─────────────────────────────────────────────────────────────────────────────
function buildRawDataSheet(XLSX: AnyXLSX, rawRows: ExcelRawRow[], sheetIndex: number, totalSheets: number): WS {
  const HEADERS = [
    '#', 'MAKE', 'MODEL', 'YEAR', 'VIN', 'STOCK #', 'BEACON ID', 'ASSET TYPE',
    'GEOFENCE', 'SUB ZONE', 'FLOOR LEVEL', 'DATE', 'START', 'END', 'DURATION', 'BATTERY',
  ]
  const NUM_COLS = HEADERS.length
  const LAST_C   = NUM_COLS - 1
  const title    = totalSheets > 1
    ? `LOCATION HISTORY DATA  (Part ${sheetIndex + 1} of ${totalSheets})`
    : 'LOCATION HISTORY DATA'

  const aoa: AnyXLSX[][] = [
    [title, ...Array(LAST_C).fill(null)],
    HEADERS,
    ...rawRows.map((row, i) => [
      i + 1,
      row.make, row.model, row.year,
      row.vin, row.stockNumber, row.beaconId, row.assetType,
      row.geofence, row.subZone, row.floorLevel,
      row.date, row.start, row.end,
      row.durationStr, row.battery,
    ]),
  ]

  const ws: WS = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })

  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: LAST_C } }]

  ws['!rows'] = [
    { hpt: 28 }, // banner
    { hpt: 22 }, // headers
    ...rawRows.map(() => ({ hpt: 17 })),
  ]

  ws['!cols'] = [
    { wch: 5  }, // #
    { wch: 10 }, // Make
    { wch: 14 }, // Model
    { wch: 6  }, // Year
    { wch: 20 }, // VIN
    { wch: 10 }, // Stock #
    { wch: 14 }, // Beacon ID
    { wch: 10 }, // Asset Type
    { wch: 24 }, // Geofence
    { wch: 20 }, // Sub Zone
    { wch: 12 }, // Floor Level
    { wch: 11 }, // Date
    { wch: 10 }, // Start
    { wch: 10 }, // End
    { wch: 10 }, // Duration
    { wch: 8  }, // Battery
  ]

  ws['!views'] = [{ state: 'frozen', xSplit: 0, ySplit: 2, topLeftCell: 'A3' }]
  ws['!autofilter'] = { ref: `B2:${XLSX.utils.encode_col(LAST_C)}2` }

  // Banner row
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) ws[ref] = { v: '', t: 's' }
    ws[ref].s = mkS({ sz: 11, bold: true, color: CLR.white }, CLR.slate800, { h: 'left', indent: 2 })
  }

  // Header row
  for (let c = 0; c <= LAST_C; c++) {
    const ref = XLSX.utils.encode_cell({ r: 1, c })
    if (!ws[ref]) ws[ref] = { v: HEADERS[c], t: 's' }
    ws[ref].s = mkS({ sz: 9, bold: true, color: CLR.white }, CLR.blue,
      { h: c === 0 ? 'center' : 'left', indent: c === 0 ? 0 : 1 },
      { ...btmB(CLR.blueDk), left: thin(CLR.blueDk), right: thin(CLR.blueDk) })
  }

  // Data rows
  for (let i = 0; i < rawRows.length; i++) {
    const r   = i + 2
    const alt = i % 2 === 1
    const bg  = alt ? CLR.slate50 : undefined
    const row = rawRows[i]

    for (let c = 0; c <= LAST_C; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) ws[ref] = { v: '', t: 's' }

      // Date/time number formats (col 11=Date, 12=Start, 13=End)
      if (c === 11 && ws[ref].t === 'd') ws[ref].z = 'mm/dd/yy'
      if ((c === 12 || c === 13) && ws[ref].t === 'd') ws[ref].z = 'h:mm AM/PM'

      if (c === 0) {
        ws[ref].s = mkS({ sz: 9, color: CLR.slate400 }, bg, { h: 'center' }, btmRB(CLR.slate200))
      } else if (c === 14) {
        // Duration — bold, amber if long
        const isLong = row.durationMinutes >= 120
        ws[ref].s = mkS(
          { sz: 10, bold: true, color: isLong ? CLR.amber : CLR.slate700 },
          isLong ? CLR.amber100 : bg,
          { h: 'right', indent: 1 },
          lftBtmB(CLR.slate200),
        )
      } else if (c === 15) {
        // Battery — centered
        ws[ref].s = mkS({ sz: 10, color: CLR.slate600 }, bg, { h: 'center' }, btmB(CLR.slate200))
      } else if (c === 11 || c === 12 || c === 13) {
        ws[ref].s = mkS({ sz: 10, color: CLR.slate600 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      } else {
        ws[ref].s = mkS({ sz: 10, color: CLR.slate900 }, bg, { h: 'left', indent: 1 }, btmB(CLR.slate200))
      }
    }
  }

  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT (main entry)
// ─────────────────────────────────────────────────────────────────────────────

const EXCEL_SHEET_MAX = 1_048_575

// Excel sheet names: max 31 chars, no \ / : * ? [ ] ' and not blank
function sanitizeSheetName(raw: string, usedNames: Set<string>): string {
  let name = raw
    .replace(/[\\/:*?[\]'"]/g, '')  // strip all XML/Excel-invalid chars incl apostrophe
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
  if (!name) name = 'Sheet'
  if (!usedNames.has(name)) { usedNames.add(name); return name }
  for (let i = 2; i <= 99; i++) {
    const suffix = ` (${i})`
    const candidate = name.slice(0, 31 - suffix.length) + suffix
    if (!usedNames.has(candidate)) { usedNames.add(candidate); return candidate }
  }
  return name
}

export async function exportExcel(params: ExportParams): Promise<void> {
  const { clientName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset } = params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx-js-style')

  const now              = new Date()
  const filterRows       = buildFilterRows(filters)
  const stats            = selectedAsset ? buildExcelStats(tableRows) : null
  const stopRows         = selectedAsset ? buildExcelStopRows(tableRows) : []
  const vehicleBreakdowns = buildVehicleBreakdowns(stopRows)
  const rawRows          = buildExcelRawRows(tableRows)
  const rawChunks        = chunkArray(rawRows, EXCEL_SHEET_MAX)

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Summary ───────────────────────────────────────────────────────
  const ws1 = buildSummarySheet(XLSX, clientName, dashboardLabel, dateLabel, filterRows, stats, now, vehicleBreakdowns)
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  // ── Stops sheets: one per vehicle when multi-vehicle, else single combined ──
  if (stopRows.length > 0) {
    if (vehicleBreakdowns.length > 1) {
      // Group by vehicle and create one tab per vehicle
      const byVehicle = new Map<string, ExcelStopRow[]>()
      for (const row of stopRows) {
        if (!byVehicle.has(row.vehicle)) byVehicle.set(row.vehicle, [])
        byVehicle.get(row.vehicle)!.push(row)
      }
      const usedNames = new Set<string>(['Summary'])
      for (const [vehicle, rows] of byVehicle.entries()) {
        const sheetName = sanitizeSheetName(vehicle, usedNames)
        const ws = buildStopsSheet(XLSX, rows, vehicle)
        XLSX.utils.book_append_sheet(wb, ws, sheetName)
      }
    } else {
      const ws2 = buildStopsSheet(XLSX, stopRows)
      XLSX.utils.book_append_sheet(wb, ws2, 'Stops')
    }
  }

  // ── Sheet 3+: Raw Data (auto-split if >1M rows) ────────────────────────────
  rawChunks.forEach((chunk, idx) => {
    const sheetName = rawChunks.length > 1 ? `Raw Data (${idx + 1})` : 'Raw Data'
    const ws = buildRawDataSheet(XLSX, chunk, idx, rawChunks.length)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })

  // ── Write and trigger browser download ────────────────────────────────────
  const filename = buildFilename(clientName, dateLabel, 'xlsx')
  XLSX.writeFile(wb, filename)
}

// ── PDF export ────────────────────────────────────────────────────────────────

type RGB = [number, number, number]
const BRAND_BLUE:   RGB = [0,   82,  164]
const HEADER_GRAY:  RGB = [248, 250, 252]
const TEXT_DARK:    RGB = [30,  41,  59]
const TEXT_MUTED:   RGB = [100, 116, 139]
const BORDER_GRAY:  RGB = [226, 232, 240]
const ACCENT_GREEN: RGB = [39,  174, 96]
const SLATE_700:    RGB = [51,  65,  85]

const PDF_ROW_CAP = 50_000
type DocWithTable = { lastAutoTable: { finalY: number } }

export async function exportPdf(params: ExportParams): Promise<void> {
  const { clientName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset } = params

  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc    = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const PAGE_W = doc.internal.pageSize.getWidth()
  const PAGE_H = doc.internal.pageSize.getHeight()
  const ML = 14, MR = 14
  const TOTAL_PG = '{totalPages}'

  doc.setProperties({ title: `TrueSpot Export – ${clientName}` })

  const drawFooter = () => {
    const pgNum = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
      .getCurrentPageInfo().pageNumber
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...TEXT_MUTED)
    doc.text('TrueSpot  |  Confidential', ML, PAGE_H - 8)
    doc.text(`Page ${pgNum} of ${TOTAL_PG}`, PAGE_W - MR, PAGE_H - 8, { align: 'right' })
    doc.setDrawColor(...BORDER_GRAY)
    doc.setLineWidth(0.2)
    doc.line(ML, PAGE_H - 12, PAGE_W - MR, PAGE_H - 12)
  }

  const now = new Date()
  const generatedAt = `${fmtDateOnly(now.getTime())} ${fmtTimeOnly(now.getTime())}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...BRAND_BLUE)
  doc.text('TrueSpot', ML, 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(dashboardLabel, ML, 33)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const chipW = doc.getTextWidth(clientName) + 6
  doc.setFillColor(...BRAND_BLUE)
  doc.roundedRect(ML, 36, chipW, 5.5, 1, 1, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text(clientName, ML + 3, 40)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Generated: ${generatedAt}`, PAGE_W - MR, 26, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_DARK)
  doc.text(resolveToday(dateLabel), PAGE_W - MR, 33, { align: 'right' })

  doc.setDrawColor(...BORDER_GRAY)
  doc.setLineWidth(0.3)
  doc.line(ML, 45, PAGE_W - MR, 45)
  drawFooter()

  const filterRows = buildFilterRows(filters)
  autoTable(doc, {
    startY: 49,
    head: [['APPLIED FILTERS', '']],
    body: filterRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 }, textColor: TEXT_DARK },
    headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: TEXT_MUTED }, 1: { cellWidth: 'auto' } },
    tableWidth: 125,
    margin: { left: ML, right: MR, top: 12 },
    alternateRowStyles: { fillColor: HEADER_GRAY },
    tableLineColor: BORDER_GRAY,
    tableLineWidth: 0.2,
    didDrawPage: drawFooter,
  })

  const pdfStats = selectedAsset ? buildStats(tableRows) : null
  if (pdfStats) {
    const statsY = (doc as unknown as DocWithTable).lastAutoTable.finalY + 7
    autoTable(doc, {
      startY: statsY,
      head: [['STOPS', 'UNIQUE GEOFENCES', 'TOTAL TIME TRACKED', 'CURRENT ZONE']],
      body: [[pdfStats.totalStops, pdfStats.uniqueGeofences, pdfStats.totalTimeTracked, pdfStats.currentZone]],
      theme: 'plain',
      headStyles: { fillColor: HEADER_GRAY, textColor: TEXT_MUTED, fontStyle: 'bold', fontSize: 7, halign: 'center', cellPadding: { top: 3, bottom: 2, left: 3, right: 3 } },
      bodyStyles: { fontSize: 15, fontStyle: 'bold', halign: 'center', textColor: TEXT_DARK, cellPadding: { top: 5, bottom: 5, left: 3, right: 3 } },
      columnStyles: { 3: { textColor: ACCENT_GREEN } },
      tableWidth: 'auto',
      margin: { left: ML, right: MR, top: 12 },
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.2,
      didDrawPage: drawFooter,
    })
  }

  const stopsData = selectedAsset ? buildStopsRows(tableRows) : null
  if (stopsData && stopsData.body.length > 0) {
    const prevY  = (doc as unknown as DocWithTable).lastAutoTable.finalY
    const titleY = prevY + 9
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT_DARK)
    doc.text('LOCATIONS VISITED', ML, titleY)
    autoTable(doc, {
      startY: titleY + 3,
      head: [stopsData.headers],
      body: stopsData.body,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, overflow: 'linebreak', textColor: TEXT_DARK },
      headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: HEADER_GRAY },
      columnStyles: {
        0: { cellWidth: 9,  halign: 'center', textColor: TEXT_MUTED },
        1: { cellWidth: 30 },
        2: { cellWidth: 42 },
        3: { cellWidth: 38 },
        4: { cellWidth: 20 },
        5: { cellWidth: 18 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 },
        8: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: ML, right: MR, top: 12 },
      tableLineColor: BORDER_GRAY,
      tableLineWidth: 0.2,
      didDrawPage: drawFooter,
    })
  }

  const rawData  = buildRawRows(tableRows)
  const isCapped = rawData.body.length > PDF_ROW_CAP
  const rawBody  = isCapped ? rawData.body.slice(0, PDF_ROW_CAP) : rawData.body

  const prevY2  = (doc as unknown as DocWithTable).lastAutoTable?.finalY ?? 49
  const hasRoom = PAGE_H - prevY2 > 55
  if (!hasRoom) doc.addPage()
  const rawSectionY = hasRoom ? prevY2 + 9 : 12

  if (isCapped) {
    const noteText = `Note: Export limited to ${PDF_ROW_CAP.toLocaleString()} of ${rawData.body.length.toLocaleString()} records. Apply date, asset, or geofence filters to export a specific subset.`
    doc.setFillColor(254, 243, 199)
    doc.rect(ML, rawSectionY, PAGE_W - ML - MR, 8, 'F')
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(133, 77, 14)
    doc.text(noteText, ML + 3, rawSectionY + 5, { maxWidth: PAGE_W - ML - MR - 6 })
  }

  const rawTitleY = isCapped ? rawSectionY + 11 : rawSectionY
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT_DARK)
  doc.text('LOCATION HISTORY DATA', ML, rawTitleY)

  autoTable(doc, {
    startY: rawTitleY + 3,
    head: [rawData.headers],
    body: rawBody,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, overflow: 'ellipsize', textColor: TEXT_DARK },
    headStyles: { fillColor: SLATE_700, textColor: [255, 255, 255] as RGB, fontStyle: 'bold', fontSize: 6.5, cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 } },
    alternateRowStyles: { fillColor: HEADER_GRAY },
    columnStyles: {
      0: { cellWidth: 14 }, 1: { cellWidth: 18 }, 2: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 32 }, 4: { cellWidth: 28 }, 5: { cellWidth: 12 },
      6: { cellWidth: 26 }, 7: { cellWidth: 26 }, 8: { cellWidth: 16, halign: 'right' },
      9: { cellWidth: 20 }, 10: { cellWidth: 32 }, 11: { cellWidth: 14 },
      12: { cellWidth: 14 }, 13: { cellWidth: 10, halign: 'center' },
    },
    margin: { left: 10, right: 10, top: 12 },
    tableLineColor: BORDER_GRAY,
    tableLineWidth: 0.2,
    didDrawPage: drawFooter,
  })

  doc.putTotalPages(TOTAL_PG)
  doc.save(buildFilename(clientName, dateLabel, 'pdf'))
}
