'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { InsightHubFilters } from '@/utils/daxInsightHub'

// ── Report IDs ─────────────────────────────────────────────────────────────────

export type InsightHubReport =
  | 'utilization'
  | 'floor-distribution'
  | 'preventive-maintenance'
  | 'cleaning-loop'
  | 'hiding-spots'

// ── Response types ─────────────────────────────────────────────────────────────

export interface IHUtilizationData {
  total:          number
  withPatient:    number
  cleaning:       number
  hardToFind:     number
  exit?:          number  // GF clients only — folds into sittingUnused when absent
  sittingUnused:  number
  hoursBasedPct?: number  // hours-based avg-day utilization % (GF clients only)
}

export interface IHPeakData {
  count: number
  hour:  number
  day:   number
  month: number
  year:  number
}

export interface IHDailyPeakRow {
  dateKey:   number  // DAY + MONTH×100 + YEAR×10000
  day:       number
  month:     number
  year:      number
  peakCount: number
}

export interface IHFloorStatusRow {
  floor:      string
  status:     'enough' | 'tight' | 'short'
  par:        number
  daysEnough: number
  daysTight:  number
  daysShort:  number
  totalDays:  number
  avgCount:   number
  minCount:   number
  totalVINs:  number
}

export interface IHFloorReadinessByTypeRow {
  assetType:    string
  totalFloors:  number
  enoughFloors: number
  tightFloors:  number
  shortFloors:  number
  pctMet:       number
  totalVINs:    number
}

export interface IHCleaningRow {
  hourGrp:     string
  hourGrpSort: number
  count:       number
}

export interface IHHidingSpotRow {
  subGeo: string
  floor:  string
  count:  number
}

export interface IHHourlyRow {
  hour:        number
  withPatient: number
  total:       number
  pct:         number
}

export interface IHWeeklyRow {
  weekNum:     number
  year:        number
  total:       number
  withPatient: number
  pct:         number
}

export interface IHLocationCategoryRow {
  category:   string
  totalMins:  number
  assetCount: number
  pct:        number
}

export interface IHCategoryDailyRow {
  dateKey:    number
  day:        number
  month:      number
  year:       number
  pct:        number
  assetCount: number
}

export interface IHCategoryAssetRow {
  assetId:   string
  assetName: string
  assetType: string
  totalMins: number
  lastSeen:  string
  homeFloor: string
}

export interface IHAssetTrailRow {
  startTime:     string
  durMins:       number
  subGeoZone:    string
  geofence:      string
  floorLevel:    string
  category:      string
  assetName:     string
  assetType:     string
  batteryLevel:  number | null  // 0-100, null if not reported for this session
}

export interface IHAssetTypeRow {
  assetType:    string
  total:        number
  withPatient:  number
  cleaning:     number
  hardToFind:   number
  sittingUnused: number
}

// ── Row parsers ────────────────────────────────────────────────────────────────

function parseUtilization(rows: Record<string, unknown>[]): IHUtilizationData | null {
  if (rows.length === 0) return null
  const r = rows[0]
  const total         = Number(r['[Total]']       ?? 0)
  const withPatient   = Number(r['[WithPatient]'] ?? 0)
  const cleaning      = Number(r['[Cleaning]']    ?? 0)
  const hardToFind    = Number(r['[HardToFind]']  ?? 0)
  const exit          = r['[Exit]'] != null ? Number(r['[Exit]']) : undefined
  const hoursBasedPct = r['[HoursBasedPct]'] != null ? Number(r['[HoursBasedPct]']) : undefined
  return {
    total,
    withPatient,
    cleaning,
    hardToFind,
    exit,
    sittingUnused: Math.max(0, total - withPatient - cleaning - hardToFind - (exit ?? 0)),
    hoursBasedPct,
  }
}

function parseFloorStatusRows(rows: Record<string, unknown>[]): IHFloorStatusRow[] {
  return rows.map((r) => ({
    floor:      String(r['[Floor]']      ?? ''),
    status:     (String(r['[Status]']    ?? 'enough')) as 'enough' | 'tight' | 'short',
    par:        Number(r['[Par]']        ?? 5),
    daysEnough: Number(r['[DaysEnough]'] ?? 0),
    daysTight:  Number(r['[DaysTight]']  ?? 0),
    daysShort:  Number(r['[DaysShort]']  ?? 0),
    totalDays:  Number(r['[TotalDays]']  ?? 0),
    avgCount:   Number(r['[AvgCount]']   ?? 0),
    minCount:   Number(r['[MinCount]']   ?? 0),
    totalVINs:  Number(r['[TotalVINs]']  ?? 0),
  })).filter((r) => r.floor && r.floor !== '')
}

function parseFloorReadinessByTypeRows(rows: Record<string, unknown>[]): IHFloorReadinessByTypeRow[] {
  return rows.map((r) => ({
    assetType:    String(r['[AssetType]']    ?? ''),
    totalFloors:  Number(r['[TotalFloors]']  ?? 0),
    enoughFloors: Number(r['[EnoughFloors]'] ?? 0),
    tightFloors:  Number(r['[TightFloors]']  ?? 0),
    shortFloors:  Number(r['[ShortFloors]']  ?? 0),
    pctMet:       Number(r['[PctMet]']       ?? 0),
    totalVINs:    Number(r['[TotalVINs]']    ?? 0),
  })).filter((r) => r.assetType)
}

function parseCleaningRows(rows: Record<string, unknown>[]): IHCleaningRow[] {
  return rows.map((r) => ({
    hourGrp:     String(r['[HourGrp]']     ?? ''),
    hourGrpSort: Number(r['[HourGrpSort]'] ?? 0),
    count:       Number(r['[Count]']       ?? 0),
  })).filter((r) => r.hourGrp)
}

function parseWeeklyRows(rows: Record<string, unknown>[]): IHWeeklyRow[] {
  return rows.map((r) => {
    const total       = Number(r['[Total]']       ?? 0)
    const withPatient = Number(r['[WithPatient]'] ?? 0)
    return {
      weekNum:     Number(r['[WeekNum]'] ?? 0),
      year:        Number(r['[Year]']    ?? 0),
      total,
      withPatient,
      pct: total > 0 ? (withPatient / total) * 100 : 0,
    }
  }).filter((r) => r.weekNum > 0 && r.year > 0)
}

// Largest-remainder rounding: rounding each share independently (Math.round on
// each one) can drift the displayed total to 99% or 101% depending on which
// way each value happened to round — verified in production (37+50+1+3+10
// summed to 101 against a "Total 100%" label). Rounding every value down first,
// then handing the leftover points to whichever values had the largest
// fractional remainder, guarantees the set always sums to exactly 100.
function roundPercentagesTo100(values: number[]): number[] {
  const floors    = values.map((v) => Math.floor(v))
  const remainder = values.map((v, i) => ({ i, r: v - floors[i] }))
  let deficit     = 100 - floors.reduce((s, v) => s + v, 0)
  remainder.sort((a, b) => b.r - a.r)
  const result = [...floors]
  for (let k = 0; k < remainder.length && deficit > 0; k++) {
    result[remainder[k].i] += 1
    deficit--
  }
  return result
}

// TotalMins is only present for the 7-day-total query; the busiest-hour query
// (buildIHLocationCategoryPeakGFQuery) returns AssetCount only. Percentage falls
// back to an asset-count share when no minutes data is present.
function parseLocationCategoryRows(rows: Record<string, unknown>[]): IHLocationCategoryRow[] {
  const parsed = rows.map((r) => ({
    category:   String(r['[Category]']   ?? 'other'),
    totalMins:  Number(r['[TotalMins]']  ?? 0),
    assetCount: Number(r['[AssetCount]'] ?? 0),
    pct:        0,
  })).filter((r) => r.totalMins > 0 || r.assetCount > 0)
  const totalMinsAll  = parsed.reduce((s, r) => s + r.totalMins,  0)
  const totalCountAll = parsed.reduce((s, r) => s + r.assetCount, 0)
  const rawPcts = parsed.map((r) =>
    totalMinsAll > 0
      ? (r.totalMins / totalMinsAll) * 100
      : totalCountAll > 0 ? (r.assetCount / totalCountAll) * 100 : 0
  )
  const rounded = rawPcts.length > 0 ? roundPercentagesTo100(rawPcts) : []
  return parsed.map((r, i) => ({ ...r, pct: rounded[i] ?? 0 }))
}

function parseCategoryAssetRows(rows: Record<string, unknown>[]): IHCategoryAssetRow[] {
  return rows.map((r) => ({
    assetId:   String(r['[AssetId]']   ?? ''),
    assetName: String(r['[AssetName]'] ?? ''),
    assetType: String(r['[AssetType]'] ?? ''),
    totalMins: Number(r['[TotalMins]'] ?? 0),
    lastSeen:  String(r['[LastSeen]']  ?? ''),
    homeFloor: String(r['[HomeFloor]'] ?? ''),
  })).filter((r) => r.assetId)
}

function parseCategoryDailyRows(rows: Record<string, unknown>[]): IHCategoryDailyRow[] {
  return rows.map((r) => {
    const dateKey   = Number(r['[DateKey]']   ?? 0)
    const totalMins = Number(r['[TotalMins]'] ?? 0)
    const catMins   = Number(r['[CatMins]']   ?? 0)
    return {
      dateKey,
      day:        dateKey % 100,
      month:      Math.floor(dateKey / 100) % 100,
      year:       Math.floor(dateKey / 10000),
      pct:        totalMins > 0 ? (catMins / totalMins) * 100 : 0,
      assetCount: Number(r['[AssetCount]'] ?? 0),
    }
  }).filter((r) => r.dateKey > 0)
}

function parseAssetTrailRows(rows: Record<string, unknown>[]): IHAssetTrailRow[] {
  return rows
    .map((r) => {
      const rawBattery = r['[BatteryLevel]']
      const batteryNum = rawBattery != null ? Number(rawBattery) : NaN
      return {
        startTime:    String(r['[StartTime]']  ?? ''),
        durMins:      Number(r['[DurMins]']    ?? 0),
        subGeoZone:   String(r['[SubGeoZone]'] ?? ''),
        geofence:     String(r['[Geofence]']   ?? ''),
        floorLevel:   String(r['[FloorLevel]'] ?? ''),
        category:     String(r['[Category]']   ?? 'other'),
        assetName:    String(r['[AssetName]']  ?? ''),
        assetType:    String(r['[AssetType]']  ?? ''),
        batteryLevel: Number.isFinite(batteryNum) ? batteryNum : null,
      }
    })
    .filter((r) => r.startTime && r.durMins > 0)
}

function parseHourlyRows(rows: Record<string, unknown>[]): IHHourlyRow[] {
  return rows.map((r) => {
    const hour        = Number(r['[Hour]']        ?? 0)
    const withPatient = Number(r['[WithPatient]'] ?? 0)
    const total       = Number(r['[Total]']       ?? 0)
    return {
      hour,
      withPatient,
      total,
      pct: total > 0 ? (withPatient / total) * 100 : 0,
    }
  }).sort((a, b) => a.hour - b.hour)
}

function parseAssetTypeRows(rows: Record<string, unknown>[]): IHAssetTypeRow[] {
  return rows.map((r) => {
    const total       = Number(r['[Total]']       ?? 0)
    const withPatient = Number(r['[WithPatient]'] ?? 0)
    const cleaning    = Number(r['[Cleaning]']    ?? 0)
    const hardToFind  = Number(r['[HardToFind]']  ?? 0)
    return {
      assetType:    String(r['[AssetType]'] ?? ''),
      total,
      withPatient,
      cleaning,
      hardToFind,
      sittingUnused: Math.max(0, total - withPatient - cleaning - hardToFind),
    }
  }).filter((r) => r.assetType && r.total > 0)
}

function parseHidingSpotRows(rows: Record<string, unknown>[]): IHHidingSpotRow[] {
  return rows.map((r) => ({
    subGeo: String(r['[SubGeo]'] ?? ''),
    floor:  String(r['[Floor]']  ?? ''),
    count:  Number(r['[Count]']  ?? 0),
  })).filter((r) => r.subGeo && r.count > 0)
}

// ── API helper ─────────────────────────────────────────────────────────────────

function parseDailyPeakRows(rows: Record<string, unknown>[]): IHDailyPeakRow[] {
  return rows.map((r) => {
    const dateKey = Number(r['[DateKey]'] ?? 0)
    return {
      dateKey,
      day:       dateKey % 100,
      month:     Math.floor(dateKey / 100) % 100,
      year:      Math.floor(dateKey / 10000),
      peakCount: Number(r['[PeakCount]'] ?? 0),
    }
  }).filter((r) => r.peakCount > 0)
}

async function postIHQuery(
  clientId: string,
  dashboardKey: string,
  queryType: string,
  filters: InsightHubFilters,
  signal: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const response = await fetch('/api/v1/insight-hub/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, dashboardKey, queryType, filters }),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Insight Hub query "${queryType}" failed: ${text}`)
  }
  const data = await response.json()
  return (data.rows ?? []) as Record<string, unknown>[]
}

// ── Main hook ──────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300

export function useInsightHubData(clientId: string, dashboardKey: string) {
  const [activeReport, setActiveReport] = useState<InsightHubReport>('utilization')
  const [filters, setFilters]           = useState<InsightHubFilters>({ assetType: 'Pumps' })
  const [dayOffset, setDayOffset]       = useState(1)

  const [utilization,          setUtilization]          = useState<IHUtilizationData | null>(null)
  const [peakData,             setPeakData]             = useState<IHPeakData | null>(null)
  const [dailyPeakRows,        setDailyPeakRows]        = useState<IHDailyPeakRow[]>([])
  const [assetTypeUtilization, setAssetTypeUtilization] = useState<IHAssetTypeRow[]>([])
  const [hourlyRows,           setHourlyRows]           = useState<IHHourlyRow[]>([])
  const [weeklyTrend,          setWeeklyTrend]          = useState<IHWeeklyRow[]>([])
  const [locationCategories,   setLocationCategories]   = useState<IHLocationCategoryRow[]>([])
  const [categoryAssets,       setCategoryAssets]       = useState<IHCategoryAssetRow[]>([])
  const [selectedCategory,     setSelectedCategory]     = useState<string | null>(null)
  const [categoryLoading,      setCategoryLoading]      = useState(false)
  const [categoryDailyRows,    setCategoryDailyRows]    = useState<IHCategoryDailyRow[]>([])
  const [categoryDailyLoading, setCategoryDailyLoading] = useState(false)
  const [selectedDay,          setSelectedDay]          = useState<number | null>(null)
  const [selectedAsset,        setSelectedAsset]        = useState<string | null>(null)
  const [assetTrailRows,       setAssetTrailRows]       = useState<IHAssetTrailRow[]>([])
  const [assetTrailLoading,    setAssetTrailLoading]    = useState(false)
  const [floorAssetType,         setFloorAssetType]         = useState<string>('Pumps')
  const [floorReadiness,         setFloorReadiness]         = useState<IHFloorStatusRow[]>([])
  const [floorReadinessByType,   setFloorReadinessByType]   = useState<IHFloorReadinessByTypeRow[]>([])
  const [cleaningRows,         setCleaningRows]         = useState<IHCleaningRow[]>([])
  const [hidingSpotRows,       setHidingSpotRows]       = useState<IHHidingSpotRow[]>([])

  // Seeded with the initial filter default ('Pumps') so the Asset Type <Select>
  // always has a matching option on the very first render — otherwise MUI logs
  // an out-of-range warning for the gap between mount and the options fetch
  // resolving (a real network round-trip, not just a debounce delay).
  const [assetTypeOptions,  setAssetTypeOptions]  = useState<string[]>(['Pumps'])
  const [floorOptions,      setFloorOptions]      = useState<string[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([])
  const [buildingOptions,   setBuildingOptions]   = useState<string[]>([])
  const [optionsLoading,    setOptionsLoading]    = useState(true)

  const [refreshTime, setRefreshTime] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const abortRef           = useRef<AbortController | null>(null)
  const debounceRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refresh time doesn't depend on any filter — fetched once on mount.
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    postIHQuery(clientId, dashboardKey, 'refresh-time', {}, signal)
      .then((rows) => {
        if (signal.aborted || rows.length === 0) return
        setRefreshTime(String(rows[0]['[RefreshTime]'] ?? ''))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [clientId, dashboardKey])

  // Filter dropdown options — cascading, like Power BI: each dropdown is
  // scoped by every OTHER currently-active filter (the server excludes the
  // dropdown's own filter key so picking a floor narrows the asset-type list,
  // picking an asset type narrows the floor list, etc., instead of every
  // dropdown always showing the full unfiltered list regardless of what else
  // is selected). Debounced on re-fetches (filter changes), but NOT on the very
  // first fetch on mount — debouncing the initial load just adds pure delay
  // before the pre-selected default becomes a valid option, with nothing to
  // coalesce yet.
  const optionsDebounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitialOptionsFetch   = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    if (optionsDebounceRef.current) clearTimeout(optionsDebounceRef.current)

    const run = () => {
      Promise.allSettled([
        postIHQuery(clientId, dashboardKey, 'asset-type-options', filters, signal),
        postIHQuery(clientId, dashboardKey, 'floor-options',      filters, signal),
        postIHQuery(clientId, dashboardKey, 'department-options', filters, signal),
        postIHQuery(clientId, dashboardKey, 'building-options',   filters, signal),
      ]).then(([atResult, foResult, doResult, boResult]) => {
        if (signal.aborted) return

        let newAssetTypeOptions:  string[] | null = null
        let newFloorOptions:      string[] | null = null
        let newDepartmentOptions: string[] | null = null
        let newBuildingOptions:   string[] | null = null

        if (atResult.status === 'fulfilled') {
          newAssetTypeOptions = atResult.value.map((r) => String(r['[value]'] ?? '')).filter(Boolean).sort()
          setAssetTypeOptions(newAssetTypeOptions)
        } else {
          console.error('[InsightHub] asset-type-options failed:', atResult.reason)
        }
        if (foResult.status === 'fulfilled') {
          newFloorOptions = foResult.value.map((r) => String(r['[value]'] ?? '')).filter(Boolean).sort()
          setFloorOptions(newFloorOptions)
        } else {
          console.error('[InsightHub] floor-options failed:', foResult.reason)
        }
        if (doResult.status === 'fulfilled') {
          newDepartmentOptions = doResult.value.map((r) => String(r['[value]'] ?? '')).filter(Boolean).sort()
          setDepartmentOptions(newDepartmentOptions)
        } else {
          console.error('[InsightHub] department-options failed:', doResult.reason)
        }
        if (boResult.status === 'fulfilled') {
          newBuildingOptions = boResult.value.map((r) => String(r['[value]'] ?? '')).filter(Boolean).sort()
          setBuildingOptions(newBuildingOptions)
        } else {
          console.error('[InsightHub] building-options failed:', boResult.reason)
        }

        // Auto-clear: if a cascading update makes the currently-selected value(s)
        // for a filter no longer valid, drop just those values instead of leaving
        // an impossible selection in place (which is what triggers MUI's
        // out-of-range warning for a real reason, not just a timing gap).
        const pruneInvalid = (current: string | undefined, validOptions: string[] | null): string | undefined => {
          if (!current || !validOptions) return current
          const kept = current.split(',').map((v) => v.trim()).filter((v) => v && validOptions.includes(v))
          return kept.length > 0 ? kept.join(',') : undefined
        }
        setFilters((prev) => {
          const assetType  = pruneInvalid(prev.assetType,  newAssetTypeOptions)
          const floor      = pruneInvalid(prev.floor,      newFloorOptions)
          const department = pruneInvalid(prev.department, newDepartmentOptions)
          const building    = pruneInvalid(prev.building,   newBuildingOptions)
          // Bail out with the SAME object reference when nothing was actually
          // pruned — this effect depends on `filters`, so returning a new object
          // unconditionally here would retrigger it every time and loop forever.
          if (
            assetType === prev.assetType && floor === prev.floor &&
            department === prev.department && building === prev.building
          ) {
            return prev
          }
          return { ...prev, assetType, floor, department, building }
        })

        setOptionsLoading(false)
      })
    }

    if (!didInitialOptionsFetch.current) {
      didInitialOptionsFetch.current = true
      run()
    } else {
      optionsDebounceRef.current = setTimeout(run, 300)
    }

    return () => {
      controller.abort()
      if (optionsDebounceRef.current) clearTimeout(optionsDebounceRef.current)
    }
  }, [clientId, dashboardKey, filters])

  const fetchReport = useCallback(
    (report: InsightHubReport, currentFilters: InsightHubFilters) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        setLoading(true)
        setError(null)

        // No data source exists yet — skip the fetch entirely rather than
        // hitting the API with a queryType the backend doesn't recognize.
        if (report === 'preventive-maintenance') {
          setLoading(false)
          return
        }

        try {
          if (report === 'utilization') {
            const { assetType: _assetType, ...filtersWithoutType } = currentFilters
            void _assetType
            const [utilizationResult, peakResult, atResult, weeklyResult, catResult, hourlyResult, dailyPeakResult] = await Promise.allSettled([
              postIHQuery(clientId, dashboardKey, 'utilization',               currentFilters,     signal),
              postIHQuery(clientId, dashboardKey, 'peak-utilization',          currentFilters,     signal),
              postIHQuery(clientId, dashboardKey, 'asset-type-utilization',    filtersWithoutType, signal),
              postIHQuery(clientId, dashboardKey, 'weekly-trend',              currentFilters,     signal),
              postIHQuery(clientId, dashboardKey, 'location-category-summary', currentFilters,     signal),
              postIHQuery(clientId, dashboardKey, 'hourly-utilization',        currentFilters,     signal),
              postIHQuery(clientId, dashboardKey, 'daily-peak',                currentFilters,     signal),
            ])
            if (signal.aborted) return
            if (utilizationResult.status === 'fulfilled')
              setUtilization(parseUtilization(utilizationResult.value))
            if (peakResult.status === 'fulfilled' && peakResult.value.length > 0) {
              const r     = peakResult.value[0]
              const count = Number(r['[PeakCount]'] ?? 0)
              if (count > 0) {
                setPeakData({
                  count,
                  hour:  Number(r['[PeakHour]']  ?? 0),
                  day:   Number(r['[PeakDay]']   ?? 1),
                  month: Number(r['[PeakMonth]'] ?? 1),
                  year:  Number(r['[PeakYear]']  ?? new Date().getFullYear()),
                })
              } else {
                setPeakData(null)
              }
            } else {
              setPeakData(null)
            }
            if (atResult.status === 'fulfilled')
              setAssetTypeUtilization(parseAssetTypeRows(atResult.value))
            if (weeklyResult.status === 'fulfilled')
              setWeeklyTrend(parseWeeklyRows(weeklyResult.value))
            if (catResult.status === 'fulfilled')
              setLocationCategories(parseLocationCategoryRows(catResult.value))
            if (hourlyResult.status === 'fulfilled')
              setHourlyRows(parseHourlyRows(hourlyResult.value))
            if (dailyPeakResult.status === 'fulfilled')
              setDailyPeakRows(parseDailyPeakRows(dailyPeakResult.value))
            if (utilizationResult.status === 'rejected')
              throw utilizationResult.reason
          } else {
            if (report === 'floor-distribution') {
              const [readinessResult, byTypeResult] = await Promise.allSettled([
                postIHQuery(clientId, dashboardKey, 'floor-readiness',        currentFilters, signal),
                postIHQuery(clientId, dashboardKey, 'floor-readiness-by-type', {},            signal),
              ])
              if (signal.aborted) return
              if (readinessResult.status === 'fulfilled')
                setFloorReadiness(parseFloorStatusRows(readinessResult.value))
              if (byTypeResult.status === 'fulfilled')
                setFloorReadinessByType(parseFloorReadinessByTypeRows(byTypeResult.value))
              if (readinessResult.status === 'rejected') throw readinessResult.reason
            } else {
            const queryType = report
            const rows = await postIHQuery(clientId, dashboardKey, queryType, currentFilters, signal)
            if (signal.aborted) return

            switch (report) {
              case 'cleaning-loop':
                setCleaningRows(parseCleaningRows(rows))
                break
              case 'hiding-spots':
                setHidingSpotRows(parseHidingSpotRows(rows))
                break
            }
            } // end else (non-floor-distribution reports)
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') setError(String(err))
        } finally {
          if (!signal.aborted) setLoading(false)
        }
      }, DEBOUNCE_MS)
    },
    [clientId, dashboardKey]
  )

  useEffect(() => {
    const effectiveFilters = activeReport === 'floor-distribution'
      ? { ...filters, assetType: floorAssetType }
      : filters
    fetchReport(activeReport, effectiveFilters)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activeReport, filters, floorAssetType, fetchReport])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Level 2: fetch daily breakdown when a category is selected
  useEffect(() => {
    if (!selectedCategory) return
    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      setCategoryDailyLoading(true)
      try {
        const rows = await postIHQuery(
          clientId, dashboardKey, 'location-category-daily',
          { ...filters, category: selectedCategory },
          signal
        )
        if (!signal.aborted) setCategoryDailyRows(parseCategoryDailyRows(rows))
      } catch {
        // silent
      } finally {
        if (!signal.aborted) setCategoryDailyLoading(false)
      }
    })()

    return () => {
      controller.abort()
      setCategoryDailyRows([])
      setCategoryDailyLoading(false)
    }
  }, [selectedCategory, clientId, dashboardKey, filters])

  // Level 3: fetch asset list when a day is picked (or whole-period mode: selectedDay = -1)
  useEffect(() => {
    if (!selectedCategory || selectedDay === null) return
    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      setCategoryLoading(true)
      try {
        // selectedDay === -1 means "full period" → no dateKey; a positive value is an exact day
        const dayFilter = selectedDay !== null && selectedDay > 0 ? { dateKey: selectedDay } : {}
        const rows = await postIHQuery(
          clientId, dashboardKey, 'location-category-assets',
          { ...filters, category: selectedCategory, ...dayFilter },
          signal
        )
        if (!signal.aborted) setCategoryAssets(parseCategoryAssetRows(rows))
      } catch {
        // silent — drill-down failure doesn't break the page
      } finally {
        if (!signal.aborted) setCategoryLoading(false)
      }
    })()

    return () => {
      controller.abort()
      setCategoryAssets([])
      setCategoryLoading(false)
    }
  }, [selectedCategory, selectedDay, clientId, dashboardKey, filters])

  useEffect(() => {
    if (!selectedAsset) return

    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      setAssetTrailLoading(true)
      try {
        const dayFilter = selectedDay !== null && selectedDay > 0 ? { dateKey: selectedDay } : {}
        const rows = await postIHQuery(
          clientId, dashboardKey, 'asset-trail',
          { ...filters, vin: selectedAsset, ...dayFilter },
          signal
        )
        if (!signal.aborted) setAssetTrailRows(parseAssetTrailRows(rows))
      } catch {
        // silent — trail failure doesn't break the page
      } finally {
        if (!signal.aborted) setAssetTrailLoading(false)
      }
    })()

    return () => {
      controller.abort()
      setAssetTrailRows([])
      setAssetTrailLoading(false)
    }
  }, [selectedAsset, selectedDay, clientId, dashboardKey, filters])

  const selectReport = useCallback((report: InsightHubReport) => {
    setActiveReport(report)
  }, [])

  // Clears selectedDay whenever the category changes so Level 2 always shows first
  const selectCategory = useCallback((cat: string | null) => {
    setSelectedCategory(cat)
    setSelectedDay(null)
  }, [])

  const updateFilter = useCallback(
    (key: keyof InsightHubFilters, value: string | number | undefined) => {
      setFilters((prev) => {
        const next = { ...prev }
        if (value !== undefined && value !== '') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(next as any)[key] = key === 'days' ? Number(value) : value
        } else {
          delete next[key]
        }
        return next
      })
    },
    []
  )

  const refresh = useCallback(() => {
    const effectiveFilters = activeReport === 'floor-distribution'
      ? { ...filters, assetType: floorAssetType }
      : filters
    fetchReport(activeReport, effectiveFilters)
  }, [fetchReport, activeReport, filters, floorAssetType])

  return {
    activeReport,
    selectReport,
    filters,
    updateFilter,
    refresh,
    dayOffset,
    setDayOffset,
    utilization,
    peakData,
    dailyPeakRows,
    assetTypeUtilization,
    hourlyRows,
    weeklyTrend,
    locationCategories,
    categoryAssets,
    selectedCategory,
    setSelectedCategory,
    selectCategory,
    categoryLoading,
    categoryDailyRows,
    categoryDailyLoading,
    selectedDay,
    setSelectedDay,
    selectedAsset,
    setSelectedAsset,
    assetTrailRows,
    assetTrailLoading,
    floorAssetType,
    setFloorAssetType,
    floorReadiness,
    floorReadinessByType,
    cleaningRows,
    hidingSpotRows,
    assetTypeOptions,
    floorOptions,
    departmentOptions,
    buildingOptions,
    optionsLoading,
    refreshTime,
    loading,
    error,
  }
}
