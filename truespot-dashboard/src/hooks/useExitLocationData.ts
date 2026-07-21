'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Response types ──────────────────────────────────────────────────────────────

export interface ExitAssetRow {
  vin:        string
  assetName:  string
  assetType:  string
  geofence:   string
  subGeoZone: string
  department: string
  firstSeen:  string
  last24:     boolean
}

export interface MonitoredExitRow {
  geofence:   string
  subGeoZone: string
}

export interface ExitLocationFiltersState {
  assetType?: string
}

// ── Row parsers ──────────────────────────────────────────────────────────────────

function parseExitAssetRow(row: Record<string, unknown>): ExitAssetRow {
  return {
    vin:        String(row['[VIN]']            ?? ''),
    assetName:  String(row['[AssetName]']      ?? ''),
    assetType:  String(row['[AssetType]']      ?? ''),
    geofence:   String(row['[Geofence]']       ?? ''),
    subGeoZone: String(row['[SubGeoZone]']     ?? ''),
    department: String(row['[DepartmentName]'] ?? ''),
    firstSeen:  String(row['[FirstSeen]']      ?? ''),
    last24:     Number(row['[Last24]']         ?? 0) === 1,
  }
}

function parseMonitoredExitRow(row: Record<string, unknown>): MonitoredExitRow {
  return {
    geofence:   String(row['[Geofence]']   ?? ''),
    subGeoZone: String(row['[SubGeoZone]'] ?? ''),
  }
}

async function postQuery(
  clientId: string,
  dashboardKey: string,
  queryType: string,
  filters: ExitLocationFiltersState,
  signal: AbortSignal
): Promise<Record<string, unknown>[]> {
  const res = await fetch('/api/v1/exit-location/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ clientId, dashboardKey, queryType, filters }),
    signal,
  })
  const data = (await res.json()) as { rows?: Record<string, unknown>[]; error?: string }
  if (data.error) throw new Error(data.error)
  return data.rows ?? []
}

// ── Hook ──────────────────────────────────────────────────────────────────────────

export function useExitLocationData(clientId: string, dashboardKey: string) {
  const [filters, setFilters] = useState<ExitLocationFiltersState>({})
  const [exitAssets, setExitAssets]           = useState<ExitAssetRow[]>([])
  const [monitoredExits, setMonitoredExits]   = useState<MonitoredExitRow[]>([])
  const [assetTypeOptions, setAssetTypeOptions] = useState<string[]>([])
  const [refreshTime, setRefreshTime]         = useState('')
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)

  const fetchRef = useRef<AbortController | null>(null)

  const refetch = useCallback(() => {
    fetchRef.current?.abort()
    const ctrl = new AbortController()
    fetchRef.current = ctrl
    setLoading(true)
    setError(null)

    Promise.all([
      postQuery(clientId, dashboardKey, 'exit-assets', filters, ctrl.signal),
      postQuery(clientId, dashboardKey, 'monitored-exits', {}, ctrl.signal),
      postQuery(clientId, dashboardKey, 'refresh-time', {}, ctrl.signal),
    ])
      .then(([assetRows, exitRows, refreshRows]) => {
        if (ctrl.signal.aborted) return
        setExitAssets(assetRows.map(parseExitAssetRow))
        setMonitoredExits(exitRows.map(parseMonitoredExitRow))
        setRefreshTime(String(refreshRows[0]?.['[RefreshTime]'] ?? ''))
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
  }, [clientId, dashboardKey, filters])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch()
    return () => fetchRef.current?.abort()
  }, [refetch])

  // Asset type options — fetched once, independent of the current filter selection
  useEffect(() => {
    const ctrl = new AbortController()
    postQuery(clientId, dashboardKey, 'asset-type-options', {}, ctrl.signal)
      .then((rows) => {
        if (ctrl.signal.aborted) return
        setAssetTypeOptions(rows.map((r) => String(r['[value]'] ?? '')).filter(Boolean))
      })
      .catch(() => { if (!ctrl.signal.aborted) setAssetTypeOptions([]) })
    return () => ctrl.abort()
  }, [clientId, dashboardKey])

  return {
    filters,
    setFilters,
    exitAssets,
    monitoredExits,
    assetTypeOptions,
    refreshTime,
    loading,
    error,
    refetch,
  }
}
