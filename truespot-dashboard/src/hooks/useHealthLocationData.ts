'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ActiveHealthLocationFilters } from '@/utils/daxHealthLocation'
import { HL_DEFAULT_PAGE_SIZE } from '@/utils/daxHealthLocation'

// ── Response types ─────────────────────────────────────────────────────────────

export interface HLKpiData {
  totalTags:        number
  geofencesVisited: number
  timeTrackedMins:  number
  unknownZoneMins:  number
}

export interface HLGeofenceRow {
  geofence:       string
  cumulativeMins: number
  firstSeen:      string
  lastSeen:       string
}

export interface HLLocationRow {
  firstSeen:    string
  lastSeen:     string
  durationMins: number
  floor:        string
  geofence:     string
  subGeoZone:   string
  assetId:      string
  assetName:    string
  tagId:        string
  assetType:    string
}

// ── Row parsers ────────────────────────────────────────────────────────────────

function parseKpiRow(row: Record<string, unknown>): HLKpiData {
  return {
    totalTags:        Number(row['[TotalTags]']        ?? 0),
    geofencesVisited: Number(row['[GeofencesVisited]'] ?? 0),
    timeTrackedMins:  Number(row['[TimeTrackedMins]']  ?? 0),
    unknownZoneMins:  Number(row['[UnknownZoneMins]']  ?? 0),
  }
}

function parseGeofenceRow(row: Record<string, unknown>): HLGeofenceRow {
  return {
    geofence:       String(row['[Geofence]']       ?? ''),
    cumulativeMins: Number(row['[CumulativeMins]'] ?? 0),
    firstSeen:      String(row['[FirstSeen]']      ?? ''),
    lastSeen:       String(row['[LastSeen]']       ?? ''),
  }
}

export function parseLocationRow(row: Record<string, unknown>): HLLocationRow {
  return {
    firstSeen:    String(row['[FirstSeen]']    ?? ''),
    lastSeen:     String(row['[LastSeen]']     ?? ''),
    durationMins: Number(row['[DurationMins]'] ?? 0),
    floor:        String(row['[Floor]']        ?? ''),
    geofence:     String(row['[Geofence]']     ?? ''),
    subGeoZone:   String(row['[SubGeoZone]']   ?? ''),
    assetId:      String(row['[AssetId]']      ?? ''),
    assetName:    String(row['[AssetName]']    ?? ''),
    tagId:        String(row['[TagId]']        ?? ''),
    assetType:    String(row['[AssetType]']    ?? ''),
  }
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function postHLQuery(
  clientId: string,
  dashboardKey: string,
  queryType: string,
  filters: ActiveHealthLocationFilters,
  signal: AbortSignal,
  page?: number,
  pageSize?: number
): Promise<Record<string, unknown>[]> {
  const response = await fetch('/api/v1/health-location/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, dashboardKey, queryType, filters, page, pageSize }),
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`Health-location query "${queryType}" failed: ${text}`)
  }
  const data = await response.json()
  return (data.rows ?? []) as Record<string, unknown>[]
}

async function fetchHLFilterOptions(
  clientId: string,
  dashboardKey: string,
  filters: ActiveHealthLocationFilters,
  signal: AbortSignal
): Promise<Record<string, string[]>> {
  const params = new URLSearchParams({ clientId, dashboardKey, panelId: 'location-points' })
  if (filters.dateSeen)           params.set('dateSeen',           filters.dateSeen)
  if (filters.geofence)           params.set('geofence',           filters.geofence)
  if (filters.subGeoZone)         params.set('subGeoZone',         filters.subGeoZone)
  if (filters.floorLevel)         params.set('floorLevel',         filters.floorLevel)
  if (filters.beaconId)           params.set('beaconId',           filters.beaconId)
  if (filters.assetType)          params.set('assetType',          filters.assetType)
  if (filters.vin)                params.set('vin',                filters.vin)
  if (filters.assetName)          params.set('assetName',          filters.assetName)
  if (filters.minDurationMinutes) params.set('minDurationMinutes', String(filters.minDurationMinutes))

  const response = await fetch(`/api/v1/health-location/filter-options?${params}`, { signal })
  if (!response.ok) throw new Error('Failed to fetch health-location filter options')
  return response.json()
}

// ── Main hook ──────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300

export function useHealthLocationData(clientId: string, dashboardKey: string) {
  const [filters, setFilters] = useState<ActiveHealthLocationFilters>({ dateSeen: 'Today' })

  // Fast data — KPIs, geofence summary, filter options, refresh time
  const [kpis, setKpis]                       = useState<HLKpiData | null>(null)
  const [geofenceSummary, setGeofenceSummary] = useState<HLGeofenceRow[]>([])
  const [filterOptions, setFilterOptions]     = useState<Record<string, string[]>>({})
  const [refreshTime, setRefreshTime]         = useState<string>('')

  // Table data — server-side paginated
  const [locationRows, setLocationRows] = useState<HLLocationRow[]>([])
  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(HL_DEFAULT_PAGE_SIZE)
  const [totalRows,    setTotalRows]    = useState(0)

  // Loading states — separate so KPIs render before table finishes
  const [loading,      setLoading]      = useState(true)
  const [tableLoading, setTableLoading] = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const hasData     = useRef(false)
  const abortRef    = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs so goToPage / changePageSize always use current values without
  // being in useCallback dep arrays (avoids recreating on every filter change).
  const filtersRef  = useRef<ActiveHealthLocationFilters>(filters)
  const pageSizeRef = useRef(HL_DEFAULT_PAGE_SIZE)
  filtersRef.current  = filters
  pageSizeRef.current = pageSize

  const fetchAllData = useCallback(
    (currentFilters: ActiveHealthLocationFilters) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(async () => {
        if (hasData.current) {
          setRefreshing(true)
        } else {
          setLoading(true)
          setTableLoading(true)
        }
        setError(null)

        // ── Phase 1: fast queries (KPIs, geofence summary, filters, refresh) ──
        const fastResults = await Promise.allSettled([
          postHLQuery(clientId, dashboardKey, 'kpis',             currentFilters, signal),
          postHLQuery(clientId, dashboardKey, 'geofence-summary', currentFilters, signal),
          fetchHLFilterOptions(clientId, dashboardKey, currentFilters, signal),
          postHLQuery(clientId, dashboardKey, 'refresh-time',     currentFilters, signal),
        ])

        if (signal.aborted) return

        const [kpiResult, geoResult, filterResult, refreshResult] = fastResults

        if (kpiResult.status === 'fulfilled' && kpiResult.value.length > 0)
          setKpis(parseKpiRow(kpiResult.value[0]))

        if (geoResult.status === 'fulfilled')
          setGeofenceSummary(geoResult.value.map(parseGeofenceRow).filter((r) => r.geofence))

        if (filterResult.status === 'fulfilled')
          setFilterOptions(filterResult.value)

        if (refreshResult.status === 'fulfilled' && refreshResult.value.length > 0)
          setRefreshTime(String(refreshResult.value[0]['[RefreshTime]'] ?? ''))

        setLoading(false)
        setRefreshing(false)
        hasData.current = true

        const firstFastFailure = fastResults.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
        if (firstFastFailure) setError(String(firstFastFailure.reason))

        // ── Phase 2: count + page 1 of location points ─────────────────────────
        // Both run in parallel — count drives pagination controls, page 1 fills the table.
        const ps = pageSizeRef.current
        try {
          const [countResult, pageResult] = await Promise.allSettled([
            postHLQuery(clientId, dashboardKey, 'location-points-count', currentFilters, signal),
            postHLQuery(clientId, dashboardKey, 'location-points-page',  currentFilters, signal, 1, ps),
          ])
          if (signal.aborted) return

          if (countResult.status === 'fulfilled' && countResult.value.length > 0)
            setTotalRows(Number(countResult.value[0]['[Count]'] ?? 0))

          if (pageResult.status === 'fulfilled')
            setLocationRows(pageResult.value.map(parseLocationRow))
          else if (pageResult.status === 'rejected' && (pageResult.reason as Error).name !== 'AbortError')
            setError(String(pageResult.reason))

          setPage(1)
        } catch (err) {
          if ((err as Error).name !== 'AbortError') setError(String(err))
        } finally {
          if (!signal.aborted) setTableLoading(false)
        }
      }, DEBOUNCE_MS)
    },
    [clientId, dashboardKey]
  )

  useEffect(() => {
    fetchAllData(filters)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, fetchAllData])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Navigate to a different page — only refetches the table rows, not KPIs / count.
  const goToPage = useCallback(async (p: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setTableLoading(true)
    try {
      const rows = await postHLQuery(
        clientId, dashboardKey, 'location-points-page',
        filtersRef.current, signal, p, pageSizeRef.current
      )
      if (signal.aborted) return
      setLocationRows(rows.map(parseLocationRow))
      setPage(p)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(String(err))
    } finally {
      if (!signal.aborted) setTableLoading(false)
    }
  }, [clientId, dashboardKey])

  // Change rows-per-page — resets to page 1 and refetches.
  const changePageSize = useCallback(async (ps: number) => {
    pageSizeRef.current = ps
    setPageSize(ps)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setTableLoading(true)
    try {
      const rows = await postHLQuery(
        clientId, dashboardKey, 'location-points-page',
        filtersRef.current, signal, 1, ps
      )
      if (signal.aborted) return
      setLocationRows(rows.map(parseLocationRow))
      setPage(1)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(String(err))
    } finally {
      if (!signal.aborted) setTableLoading(false)
    }
  }, [clientId, dashboardKey])

  // Fetch the full dataset (all rows, no pagination) — used by the Excel export.
  // The location-points query type returns TOPN(10 000) ordered by FirstSeen ASC,
  // which covers virtually all realistic date-filtered datasets.
  const fetchAllRowsForExport = useCallback(async (): Promise<HLLocationRow[]> => {
    const response = await fetch('/api/v1/health-location/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, dashboardKey,
        queryType: 'location-points',
        filters: filtersRef.current,
      }),
    })
    if (!response.ok) throw new Error('Export fetch failed')
    const data = await response.json()
    return ((data.rows ?? []) as Record<string, unknown>[]).map(parseLocationRow)
  }, [clientId, dashboardKey])

  const updateFilter = useCallback(
    (key: keyof ActiveHealthLocationFilters, value: string | number | boolean | undefined) => {
      setFilters((prev) => {
        const next = { ...prev }
        if (value !== undefined && value !== '') {
          (next as Record<string, unknown>)[key] = value
        } else {
          delete (next as Record<string, unknown>)[key]
        }
        return next
      })
    },
    []
  )

  const resetFilters = useCallback(() => setFilters({ dateSeen: 'Today' }), [])

  // Cold-start auto-select: on first page load, default the Asset ID filter to the
  // most-recently-seen VIN so the dashboard opens scoped to one asset instead of
  // the full unfiltered fleet. Skipped if the URL/state already has an asset filter
  // (bookmark / back-nav) — mirrors the CarVision LocationHistoryDashboard pattern.
  const didAutoSelectAsset = useRef(false)
  useEffect(() => {
    if (didAutoSelectAsset.current) return
    if (filters.vin || filters.beaconId || filters.assetName) {
      didAutoSelectAsset.current = true
      return
    }
    didAutoSelectAsset.current = true
    const controller = new AbortController()
    postHLQuery(clientId, dashboardKey, 'latest-asset', filters, controller.signal)
      .then((rows) => {
        const vin = String(rows[0]?.['[AssetId]'] ?? '').trim()
        if (vin) updateFilter('vin', vin)
      })
      .catch(() => {})
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey])

  const applyFilters = useCallback(
    (updates: Partial<Record<keyof ActiveHealthLocationFilters, string | number | boolean | undefined>>) => {
      setFilters((prev) => {
        const next = { ...prev }
        for (const [k, v] of Object.entries(updates)) {
          const key = k as keyof ActiveHealthLocationFilters
          if (v !== undefined && v !== '') {
            (next as Record<string, unknown>)[key] = v
          } else {
            delete (next as Record<string, unknown>)[key]
          }
        }
        return next
      })
    },
    []
  )

  const refresh = useCallback(() => {
    hasData.current = false
    fetchAllData(filters)
  }, [fetchAllData, filters])

  return {
    filters,
    updateFilter,
    applyFilters,
    resetFilters,
    refresh,
    kpis,
    geofenceSummary,
    locationRows,
    // Pagination
    page,
    pageSize,
    totalRows,
    goToPage,
    changePageSize,
    fetchAllRowsForExport,
    filterOptions,
    refreshTime,
    loading,
    tableLoading,
    refreshing,
    error,
  }
}
