'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ActiveHealthFilters } from '@/utils/daxHealth'

// ── Response types ─────────────────────────────────────────────────────────────

export interface HealthKpiData {
  totalAssets: number
  activeLt2hr: number
  missing30d: number
  outsideHospital: number
}

export interface MissingAssetRow {
  department: string
  assetName: string
  assetId: string
  tagId: string
  lastSeen: string
  hoursMissing: number
  floor: string
  geofence: string
  subLocation: string
  outsideHospital: string
  hourGroup: string
  hourGroupSort: string
  assetType: string
}

export interface ChartDataPoint {
  label: string
  count: number
  sortKey?: string
}

// ── Row parsers ────────────────────────────────────────────────────────────────

function parseTableRow(row: Record<string, unknown>): MissingAssetRow {
  return {
    department:      String(row['[Department]']      ?? ''),
    assetName:       String(row['[AssetName]']       ?? ''),
    assetId:         String(row['[AssetId]']         ?? ''),
    tagId:           String(row['[TagId]']           ?? ''),
    lastSeen:        String(row['[LastSeen]']        ?? ''),
    hoursMissing:    Number(row['[DaysMissing]']     ?? 0),
    floor:           String(row['[Floor]']           ?? ''),
    geofence:        String(row['[Geofence]']        ?? ''),
    subLocation:     String(row['[SubLocation]']     ?? ''),
    outsideHospital: String(row['[OutsideHospital]'] ?? ''),
    hourGroup:       String(row['[HourGroup]']       ?? ''),
    hourGroupSort:   String(row['[HourGroupSort]']   ?? '0'),
    assetType:       String(row['[AssetType]']       ?? ''),
  }
}

function parseKpiRow(row: Record<string, unknown>): HealthKpiData {
  return {
    totalAssets:     Number(row['[TotalAssets]']     ?? 0),
    activeLt2hr:     Number(row['[ActiveLt2hr]']     ?? 0),
    missing30d:      Number(row['[Missing30d]']      ?? 0),
    outsideHospital: Number(row['[OutsideHospital]'] ?? 0),
  }
}

function parseTimeSinceRow(row: Record<string, unknown>): ChartDataPoint {
  return {
    label:   String(row['Post-Aggregate[HourGrp]']     ?? ''),
    sortKey: String(row['Post-Aggregate[HourGrpSort]'] ?? '0'),
    count:   Number(row['[Count]']                     ?? 0),
  }
}

// Blank Geofence/Name rows are real data (Halifax has 7 blank-Geofence and
// 525 blank-Name rows) — labeled "(Blank)" to match how Power BI surfaces
// them, rather than silently dropping them from the chart.
function parseLocationsRow(row: Record<string, unknown>): ChartDataPoint {
  return {
    label: String(row['Post-Aggregate[Geofence]'] ?? '(Blank)'),
    count: Number(row['[Count]']                  ?? 0),
  }
}

function parseAssetCountRow(row: Record<string, unknown>): ChartDataPoint {
  return {
    label: String(row['Post-Aggregate[Name]'] ?? '(Blank)'),
    count: Number(row['[Count]']              ?? 0),
  }
}

// ── API helpers (abort-signal aware) ──────────────────────────────────────────

async function postHealthQuery(
  clientId: string,
  dashboardKey: string,
  queryType: string,
  filters: ActiveHealthFilters,
  signal: AbortSignal
): Promise<Record<string, unknown>[]> {
  const response = await fetch('/api/v1/health/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, dashboardKey, queryType, filters }),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Health query "${queryType}" failed: ${text}`)
  }
  const data = await response.json()
  return (data.rows ?? []) as Record<string, unknown>[]
}

async function fetchHealthFilterOptions(
  clientId: string,
  dashboardKey: string,
  panelId: string,
  filters: ActiveHealthFilters,
  signal: AbortSignal
): Promise<Record<string, string[]>> {
  const params = new URLSearchParams({ clientId, dashboardKey, panelId })
  if (filters.lastSeenDate) params.set('lastSeenDate', filters.lastSeenDate)
  if (filters.department)   params.set('department',   filters.department)
  if (filters.assetName)    params.set('assetName',    filters.assetName)
  if (filters.floor)        params.set('floor',        filters.floor)
  if (filters.geofence)     params.set('geofence',     filters.geofence)
  if (filters.tagId)        params.set('tagId',        filters.tagId)
  if (filters.assetId)      params.set('assetId',      filters.assetId)
  if (filters.exitsFilter)        params.set('exitsFilter',        filters.exitsFilter)
  if (filters.outsideHospital)    params.set('outsideHospital',    filters.outsideHospital)
  if (filters.excludeDepartment)  params.set('excludeDepartment',  filters.excludeDepartment)

  const response = await fetch(`/api/v1/health/filter-options?${params}`, { signal })
  if (!response.ok) throw new Error('Failed to fetch health filter options')
  return response.json()
}

// ── Main hook ──────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300

export function useMissingAssetsData(clientId: string, dashboardKey: string) {
  const [filters, setFilters] = useState<ActiveHealthFilters>({})

  // Data state — never cleared on filter change (stale-while-revalidate)
  const [kpis, setKpis] = useState<HealthKpiData | null>(null)
  const [timeSinceData, setTimeSinceData] = useState<ChartDataPoint[]>([])
  const [topLocationsData, setTopLocationsData] = useState<ChartDataPoint[]>([])
  const [assetCountData, setAssetCountData] = useState<ChartDataPoint[]>([])
  const [tableRows, setTableRows] = useState<MissingAssetRow[]>([])
  const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({})
  const [refreshTime, setRefreshTime] = useState<string>('')

  // loading = true only on first load (no data yet) — shows skeletons
  // refreshing = true on subsequent filter changes — shows subtle indicator, keeps old data
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tracks whether we've ever loaded data successfully
  const hasData = useRef(false)

  // AbortController ref — cancels the previous in-flight request batch
  const abortRef = useRef<AbortController | null>(null)

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAllData = useCallback(
    (currentFilters: ActiveHealthFilters) => {
      // Cancel the previous in-flight request batch immediately
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      // Debounce: wait 300ms before firing — prevents fetch on every rapid click
      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        // First load → show skeletons. Subsequent → keep old data, show subtle spinner.
        if (hasData.current) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }
        setError(null)

        try {
          const results = await Promise.allSettled([
            postHealthQuery(clientId, dashboardKey, 'kpis',               currentFilters, signal),
            postHealthQuery(clientId, dashboardKey, 'time-chart',         currentFilters, signal),
            postHealthQuery(clientId, dashboardKey, 'locations-chart',    currentFilters, signal),
            postHealthQuery(clientId, dashboardKey, 'asset-count-chart',  currentFilters, signal),
            postHealthQuery(clientId, dashboardKey, 'assets-table',       currentFilters, signal),
            fetchHealthFilterOptions(clientId, dashboardKey, 'assets-table', currentFilters, signal),
            postHealthQuery(clientId, dashboardKey, 'refresh-time',       currentFilters, signal),
          ])

          // If this fetch was superseded by a newer one, discard results
          if (signal.aborted) return

          const [kpiResult, timeResult, locResult, assetResult, tableResult, filterResult, refreshResult] = results

          if (kpiResult.status === 'fulfilled' && kpiResult.value.length > 0)
            setKpis(parseKpiRow(kpiResult.value[0]))

          if (timeResult.status === 'fulfilled')
            setTimeSinceData(timeResult.value.map(parseTimeSinceRow))

          if (locResult.status === 'fulfilled')
            setTopLocationsData(locResult.value.map(parseLocationsRow))

          if (assetResult.status === 'fulfilled')
            setAssetCountData(assetResult.value.map(parseAssetCountRow))

          if (tableResult.status === 'fulfilled')
            setTableRows(tableResult.value.map(parseTableRow))

          if (filterResult.status === 'fulfilled')
            setFilterOptions(filterResult.value)

          if (refreshResult.status === 'fulfilled' && refreshResult.value.length > 0)
            setRefreshTime(String(refreshResult.value[0]['[RefreshTime]'] ?? ''))

          hasData.current = true

          const firstFailure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
          if (firstFailure) setError(String(firstFailure.reason))
        } catch (err) {
          // AbortError is expected when a newer request supersedes this one — not an error
          if ((err as Error).name !== 'AbortError') {
            setError(String(err))
          }
        } finally {
          if (!signal.aborted) {
            setLoading(false)
            setRefreshing(false)
          }
        }
      }, DEBOUNCE_MS)
    },
    [clientId, dashboardKey]
  )

  // Re-fetch whenever filters change (debounced + aborted inside fetchAllData)
  useEffect(() => {
    fetchAllData(filters)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters, fetchAllData])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const updateFilter = useCallback(
    (key: keyof ActiveHealthFilters, value: string | undefined) => {
      setFilters((prev) => {
        const next = { ...prev }
        if (value) {
          next[key] = value
        } else {
          delete next[key]
        }
        return next
      })
    },
    []
  )

  const resetFilters = useCallback(() => setFilters({}), [])

  const refresh = useCallback(() => {
    hasData.current = false  // force full skeleton reload on manual refresh
    fetchAllData(filters)
  }, [fetchAllData, filters])

  return {
    filters,
    updateFilter,
    resetFilters,
    refresh,
    kpis,
    timeSinceData,
    topLocationsData,
    assetCountData,
    tableRows,
    filterOptions,
    refreshTime,
    loading,
    refreshing,
    error,
  }
}
