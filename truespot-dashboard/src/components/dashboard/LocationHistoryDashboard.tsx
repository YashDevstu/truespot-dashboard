'use client'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useFilters } from '@/hooks/useFilters'
import { usePanelQuery } from '@/hooks/usePanelQuery'
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery'
import { useProgressiveDatesQuery } from '@/hooks/useProgressiveDatesQuery'
import { useFilterOptions } from '@/hooks/useFilterOptions'
import { buildGeofenceColorMap } from '@/utils/geofenceColors'
import FilterSidebar from './FilterSidebar'
import DateQuickFilter from './DateQuickFilter'
import DashboardHeader from './DashboardHeader'
import KpiCard from './panels/KpiCard'
import DataTable from './panels/DataTable'
import JourneyTimeline, { type VehicleLane } from './panels/JourneyTimeline/JourneyTimeline'
import AssetStatCards from './panels/AssetStatCards'
import LocationsVisitedTable from './panels/LocationsVisitedTable'
import SelectedAssetCard from './SelectedAssetCard'
import dynamic from 'next/dynamic'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import type { MapMarker, RouteSegment, StopFocus, MapStop } from './panels/MapPanel/MapPanel'
import { parsePings, mergeConsecutiveStops } from '@/utils/stops'
import { toTitleCase } from '@/utils/formatters'
const MapPanel = dynamic(() => import('./panels/MapPanel/MapPanel'), { ssr: false })

interface Props {
  clientId: string
  dashboardKey: string
  displayName: string
  dashboardLabel: string
  azureMapsKey?: string
}

const TIMELINE_MAX_ROWS = 5_000
const DOT_COLORS = ['#4285F4', '#9C27B0', '#4CAF50', '#FF5722', '#00BCD4', '#FF9800', '#E91E63', '#607D8B']

export default function LocationHistoryDashboard({
  clientId,
  dashboardKey,
  displayName,
  dashboardLabel,
  azureMapsKey,
}: Props) {
  const { filters, setFilter, resetFilters } = useFilters()
  const [refreshToken, setRefreshToken] = useState(0)
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null)
  // Holds the raw timelineRows ref so callbacks declared early can read the latest value
  const timelineRowsRef = useRef<Record<string, unknown>[]>([])

  // Map from table-row startMs → merged stop index (sort-order independent).
  // Exact match works because the table now also uses mergeConsecutiveStops,
  // so stop.startMs === mergedStop.startMs by construction.
  const handleTableRowSelect = useCallback((startMs: number | null) => {
    if (startMs === null) { setSelectedStopIndex(null); return }
    const stops = mergeConsecutiveStops(parsePings(timelineRowsRef.current))
    const idx = stops.findIndex((s) => s.startMs === startMs)
    setSelectedStopIndex(idx >= 0 ? idx : null)
  }, [])

  // Parse comma-separated date selection; empty / 'all' = show all 8 dates
  const selectedDates: string[] | null = (() => {
    const raw = filters.dateSeen?.trim()
    if (!raw || raw === 'all') return null
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  })()
  const isAllDates = selectedDates === null
  const isMultiDate = selectedDates !== null && selectedDates.length > 1
  const isSingleDate = selectedDates !== null && selectedDates.length === 1

  // Trim needed because comma-separated multi-values are never empty after join
  const hasAssetFilter = !!(filters.beaconId?.trim() || filters.vin?.trim() || filters.stockNumber?.trim())

  const baseFilters = {
    beaconId: filters.beaconId || undefined,
    geofence: filters.geofence || undefined,
    subGeoZone: filters.subGeoZone || undefined,
    floorLevel: filters.floorLevel || undefined,
    vin: filters.vin || undefined,
    stockNumber: filters.stockNumber || undefined,
    assetType: filters.assetType || undefined,
    minDurationMinutes: filters.minDurationMinutes ? Number(filters.minDurationMinutes) : undefined,
    _r: refreshToken,
  }

  // ── Query modes ────────────────────────────────────────────────────────────
  // Progressive (parallel per-date fetches) when:
  //   • all dates + no asset filter (avoids single 700K-row query)
  //   • multiple specific dates selected (any filter state)
  const useProgressiveMode = (isAllDates && !hasAssetFilter) || isMultiDate

  const selectedAsset = filters.beaconId || filters.vin || filters.stockNumber || undefined

  // Vehicle-selected query: full data needed for timeline + map + locations table.
  // Only enabled when an asset filter is active (no pagination — data is already small).
  const singleQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters: {
      ...baseFilters,
      dateSeen: isAllDates ? 'all' : isSingleDate ? selectedDates![0] : undefined,
    },
    enabled: !useProgressiveMode && !!selectedAsset,
  })

  // Browse query: server-side TOPN pagination for the no-asset explore table.
  // Sends limit+1 rows to detect hasMore without changing QueryResponse schema.
  const paginatedQuery = usePaginatedQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    baseFilters,
    dateSeen: isAllDates ? undefined : isSingleDate ? selectedDates![0] : undefined,
    enabled: !useProgressiveMode && !selectedAsset,
  })

  const progressiveQuery = useProgressiveDatesQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    baseFilters,
    // For all-dates mode, pass no override (hook uses full 8-day list).
    // For multi-date selection, pass only the chosen dates.
    dateLabels: isMultiDate ? selectedDates! : undefined,
    enabled: useProgressiveMode,
  })

  const kpiQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'last-refresh',
    filters: { _r: refreshToken },
  })

  const { options: filterOptions } = useFilterOptions({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters,
  })

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  const lastRefreshValue = kpiQuery.data?.rows?.[0]
    ? String(Object.values(kpiQuery.data.rows[0])[0] ?? '')
    : undefined

  const tableRows = useMemo(() => {
    if (useProgressiveMode) return progressiveQuery.rows
    if (selectedAsset) {
      if (singleQuery.loading) return []
      return (singleQuery.data?.rows ?? []) as Record<string, unknown>[]
    }
    return paginatedQuery.rows
  }, [useProgressiveMode, progressiveQuery.rows, selectedAsset, singleQuery.loading, singleQuery.data?.rows, paginatedQuery.rows])

  const tableLoading = useProgressiveMode
    ? progressiveQuery.loading
    : selectedAsset
    ? singleQuery.loading
    : paginatedQuery.loading
  const tableError = useProgressiveMode ? null : selectedAsset ? singleQuery.error : null

  // Cold-start auto-select: on first page load fire a single 1-row query to get
  // the most-recently-seen VIN for Today, then select it immediately.
  // This is faster and more reliable than waiting for the 100-row browse table.
  const didAutoSelect = useRef(false)
  useEffect(() => {
    if (didAutoSelect.current) return
    // If the URL already has an asset filter (e.g. bookmark / back-nav), skip
    if (filters.vin || filters.beaconId || filters.stockNumber) {
      didAutoSelect.current = true
      return
    }
    didAutoSelect.current = true   // prevent double-fire in StrictMode
    fetch('/api/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        dashboardKey,
        panelId: 'location-history-data',
        filters: { dateSeen: 'Today', limit: 1 },
      }),
    })
      .then((r) => r.json())
      .then((json: { rows?: Record<string, unknown>[] }) => {
        const vin = String(json.rows?.[0]?.['[VIN]'] ?? '').trim()
        if (vin) setFilter('vin', vin)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey])

  const dateLabel = isAllDates
    ? 'All Dates'
    : isSingleDate
    ? selectedDates![0]
    : `${selectedDates!.length} dates selected`

  const subtitleText = (() => {
    if (useProgressiveMode && progressiveQuery.loading) {
      const ctx = isMultiDate ? `${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} selected dates` : `${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} dates`
      return `Loading ${ctx} · ${tableRows.length.toLocaleString()} records so far…`
    }
    if (tableLoading) return `${dateLabel} · Loading…`
    return `${dateLabel} · ${tableRows.length.toLocaleString()} records`
  })()

  // ── Rows for timeline + locations table ───────────────────────────────────
  // All rows for the selected asset, capped at TIMELINE_MAX_ROWS to keep the
  // main thread responsive. "All Dates" passes all 8 days combined — no
  // per-day filtering so the user sees the full picture.
  const timelineRows = useMemo(() => {
    if (!selectedAsset || tableLoading) return []
    if (tableRows.length > TIMELINE_MAX_ROWS) return []
    return tableRows
  }, [selectedAsset, tableLoading, tableRows])

  // Keep ref in sync so handleTableRowSelect always reads the latest rows
  timelineRowsRef.current = timelineRows

  const timelineTooLarge = !!(selectedAsset && !tableLoading && tableRows.length > TIMELINE_MAX_ROWS)

  // All timeline rows passed directly — no single-day slice.
  const singleDayRows = timelineRows

  // startMs of the currently selected merged stop — used to highlight the matching
  // table row regardless of the table's current sort order
  const selectedStopStartMs = useMemo(() => {
    if (selectedStopIndex === null || timelineRows.length === 0) return null
    const stops = mergeConsecutiveStops(parsePings(timelineRows))
    return stops[selectedStopIndex]?.startMs ?? null
  }, [selectedStopIndex, timelineRows])

  // Shared colour map — build once from sorted geofences so both components agree
  const sharedColorMap = useMemo(() => {
    const geos = [...singleDayRows]
      .sort((a, b) => {
        const sa = String(a['[StartTime]'] ?? '')
        const sb = String(b['[StartTime]'] ?? '')
        return sa < sb ? -1 : sa > sb ? 1 : 0
      })
      .map((r) => String(r['[Geofence]'] ?? ''))
    return buildGeofenceColorMap(geos)
  }, [singleDayRows])

  // When 2+ values of VIN, Beacon ID, or Stock Number are selected, build one
  // timeline lane per selected identifier. First multi-select field wins.
  const vehicleLanes = useMemo((): VehicleLane[] | undefined => {
    if (timelineRows.length === 0) return undefined

    const split = (v: string | undefined) =>
      v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []

    const vins    = split(filters.vin)
    const beacons = split(filters.beaconId)
    const stocks  = split(filters.stockNumber)

    let keys: string[]
    let rowKey: string
    let makeLabel: (key: string, first: Record<string, unknown> | undefined) => string

    if (vins.length >= 2) {
      keys = vins; rowKey = '[VIN]'
      makeLabel = (key, first) => {
        const yr = first ? String(first['[Year]']  ?? '') : ''
        const mo = first ? toTitleCase(String(first['[Model]'] ?? '')) : ''
        return yr && mo ? `${yr} ${mo}` : key.slice(-8)
      }
    } else if (beacons.length >= 2) {
      keys = beacons; rowKey = '[BeaconId]'
      makeLabel = (key, first) => {
        const yr = first ? String(first['[Year]']  ?? '') : ''
        const mo = first ? toTitleCase(String(first['[Model]'] ?? '')) : ''
        return yr && mo ? `${yr} ${mo}` : key
      }
    } else if (stocks.length >= 2) {
      keys = stocks; rowKey = '[StockNumber]'
      makeLabel = (key, first) => {
        const yr = first ? String(first['[Year]']  ?? '') : ''
        const mo = first ? toTitleCase(String(first['[Model]'] ?? '')) : ''
        return yr && mo ? `${yr} ${mo}` : `#${key}`
      }
    } else {
      return undefined
    }

    return keys
      .map((key, idx) => {
        const rows  = timelineRows.filter((r) => String(r[rowKey] ?? '') === key)
        const first = rows[0]
        return { label: makeLabel(key, first), dotColor: DOT_COLORS[idx % DOT_COLORS.length], rows }
      })
      .filter((l) => l.rows.length > 0)
  }, [filters.vin, filters.beaconId, filters.stockNumber, timelineRows])

  // Most-recent position per vehicle — used to render the Azure Maps panel.
  // Colors mirror the vehicleLanes dotColors so map markers match the timeline.
  const mapMarkers = useMemo((): MapMarker[] => {
    if (!selectedAsset || timelineRows.length === 0) return []

    const todayStr = new Date().toDateString()
    // A position is "live" only when viewing Today's data AND the session's
    // EndTime falls on today. Using EndTime (not StartTime) because overnight
    // records start yesterday but end today — LastSeenDateDefault also uses EndTime.
    const isTodayFilter = isAllDates || !filters.dateSeen || filters.dateSeen === 'Today' || (selectedDates?.includes('Today') ?? false)
    const isLiveRow = (r: Record<string, unknown>) => {
      if (!isTodayFilter) return false
      const v = r['[EndTime]'] ?? r['[StartTime]']
      if (!v) return false
      const d = new Date(String(v))
      return !isNaN(d.getTime()) && d.toDateString() === todayStr
    }

    const parseTime = (r: Record<string, unknown>) => {
      const v = r['[StartTime]']
      if (!v) return -Infinity
      const ms = new Date(String(v)).getTime()
      return isNaN(ms) ? -Infinity : ms
    }

    const validCoords = (r: Record<string, unknown>) => {
      const lat = Number(r['[Latitude]']  ?? 0)
      const lng = Number(r['[Longitude]'] ?? 0)
      return isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)
        ? { lat, lng } : null
    }

    // Most-recent row WITH valid coordinates from a set of rows
    const bestWithCoords = (rows: Record<string, unknown>[]) => {
      let bestRow: Record<string, unknown> | undefined
      let bestTime = -Infinity
      for (const r of rows) {
        if (!validCoords(r)) continue          // skip rows with no GPS
        const t = parseTime(r)
        if (t > bestTime) { bestTime = t; bestRow = r }
      }
      return bestRow
    }

    // Multi-vehicle: derive one marker per lane (colors already assigned)
    const resolveAssetType = (row: Record<string, unknown>): 'Vehicle' | 'Key' | 'Mixed' => {
      const v = String(row['[AssetType]'] ?? 'Vehicle').toLowerCase()
      return v === 'key' ? 'Key' : 'Vehicle'
    }

    if (vehicleLanes && vehicleLanes.length > 0) {
      return vehicleLanes.flatMap((lane) => {
        const bestRow = bestWithCoords(lane.rows)
        if (!bestRow) return []
        const { lat, lng } = validCoords(bestRow)!
        return [{
          lat, lng,
          label:       lane.label,
          geofence:    String(bestRow['[Geofence]']    ?? ''),
          subGeoZone:  String(bestRow['[SubGeoZone]']  ?? ''),
          dotColor:    lane.dotColor,
          lastSeenAt:  String(bestRow['[StartTime]']   ?? ''),
          vin:         String(bestRow['[VIN]']          ?? ''),
          stockNumber: String(bestRow['[StockNumber]'] ?? ''),
          isLive:      isLiveRow(bestRow),
          assetType:   resolveAssetType(bestRow),
        }]
      })
    }

    // Single vehicle: most recent row with valid coordinates
    const bestRow = bestWithCoords(timelineRows)
    if (!bestRow) return []
    const { lat, lng } = validCoords(bestRow)!
    const yr = String(bestRow['[Year]'] ?? '')
    const mo = toTitleCase(String(bestRow['[Model]'] ?? ''))
    return [{
      lat, lng,
      label:       yr && mo ? `${yr} ${mo}` : String(bestRow['[VIN]'] ?? '').slice(-8),
      geofence:    String(bestRow['[Geofence]']    ?? ''),
      subGeoZone:  String(bestRow['[SubGeoZone]']  ?? ''),
      dotColor:    DOT_COLORS[0],
      lastSeenAt:  String(bestRow['[StartTime]']   ?? ''),
      vin:         String(bestRow['[VIN]']          ?? ''),
      stockNumber: String(bestRow['[StockNumber]'] ?? ''),
      isLive:      isLiveRow(bestRow),
      assetType:   resolveAssetType(bestRow),
    }]
  }, [selectedAsset, timelineRows, vehicleLanes, azureMapsKey])

  // Route trail: geofence-colored contiguous segments so trail colors match Journey Timeline bar
  const routeLines = useMemo((): RouteSegment[] => {
    if (!selectedAsset || timelineRows.length === 0) return []

    // Haversine distance in metres between two lat/lng points
    const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
      const R  = 6_371_000
      const φ1 = (a.lat * Math.PI) / 180
      const φ2 = (b.lat * Math.PI) / 180
      const Δφ = ((b.lat - a.lat) * Math.PI) / 180
      const Δλ = ((b.lng - a.lng) * Math.PI) / 180
      const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
    }

    // Skip GPS pings that are within MIN_MOVE_M metres of the previous kept point.
    // Eliminates the parking-lot spiderweb while preserving real movement paths.
    const MIN_MOVE_M = 6
    const simplify = <T extends { lat: number; lng: number }>(pts: T[]): T[] => {
      if (pts.length === 0) return []
      const out: T[] = [pts[0]]
      for (let i = 1; i < pts.length - 1; i++) {
        if (distM(out[out.length - 1], pts[i]) >= MIN_MOVE_M) out.push(pts[i])
      }
      // Always include the final point so the trail ends at the true last position
      if (pts.length > 1) out.push(pts[pts.length - 1])
      return out
    }

    const toGpsPoints = (rows: Record<string, unknown>[]) =>
      rows
        .map((r) => ({
          lat:      Number(r['[Latitude]']  ?? 0),
          lng:      Number(r['[Longitude]'] ?? 0),
          t:        new Date(String(r['[StartTime]'] ?? '')).getTime(),
          geofence: String(r['[Geofence]'] ?? ''),
        }))
        .filter((c) => isFinite(c.lat) && isFinite(c.lng) && !(c.lat === 0 && c.lng === 0) && !isNaN(c.t))
        .sort((a, b) => a.t - b.t)

    if (vehicleLanes && vehicleLanes.length > 0) {
      // Multi-vehicle: one solid color per vehicle lane
      return vehicleLanes
        .map((lane) => ({
          coords: simplify(toGpsPoints(lane.rows)).map(({ lat, lng }) => ({ lat, lng })),
          color:  lane.dotColor,
        }))
        .filter((l) => l.coords.length >= 2)
    }

    // Single vehicle: simplify then split into contiguous runs by geofence.
    // Each run's color matches the Journey Timeline bar block for that geofence.
    const pts = simplify(toGpsPoints(timelineRows))
    if (pts.length < 2) return []

    const segments: RouteSegment[] = []
    let run = [pts[0]]

    for (let i = 1; i < pts.length; i++) {
      if (pts[i].geofence === run[0].geofence) {
        run.push(pts[i])
      } else {
        // Share the boundary coordinate so adjacent segments connect with no gap
        segments.push({
          coords: run.map(({ lat, lng }) => ({ lat, lng })),
          color:  sharedColorMap.get(run[0].geofence) ?? '#9e9e9e',
        })
        run = [run[run.length - 1], pts[i]]
      }
    }
    segments.push({
      coords: run.map(({ lat, lng }) => ({ lat, lng })),
      color:  sharedColorMap.get(run[0].geofence) ?? '#9e9e9e',
    })

    return segments.filter((s) => s.coords.length >= 2)
  }, [selectedAsset, timelineRows, vehicleLanes, sharedColorMap])

  // Stop focus: fly the map to the selected journey segment's location
  const stopFocus = useMemo((): StopFocus | null => {
    if (selectedStopIndex === null || timelineRows.length === 0) return null

    const stops = mergeConsecutiveStops(parsePings(timelineRows))
    const stop  = stops[selectedStopIndex]
    if (!stop) return null

    // Find the first row in the stop's time window that has valid GPS
    const row = timelineRows.find((r) => {
      const t   = new Date(String(r['[StartTime]'] ?? '')).getTime()
      const lat = Number(r['[Latitude]']  ?? 0)
      const lng = Number(r['[Longitude]'] ?? 0)
      return (
        t >= stop.startMs && t <= stop.endMs &&
        String(r['[Geofence]'] ?? '') === stop.geofence &&
        isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)
      )
    })
    if (!row) return null

    const yr = String(row['[Year]']  ?? '')
    const mo = toTitleCase(String(row['[Model]'] ?? ''))
    return {
      lat:        Number(row['[Latitude]']),
      lng:        Number(row['[Longitude]']),
      label:      yr && mo ? `${yr} ${mo}` : String(row['[VIN]'] ?? '').slice(-8),
      geofence:   stop.geofence,
      subGeoZone: stop.subGeoZone,
      startMs:    stop.startMs,
      endMs:      stop.endMs,
      assetType:  stop.assetType,
    }
  }, [selectedStopIndex, timelineRows])

  // Numbered stop waypoints for the map — one per merged consecutive stop, positioned
  // at the first GPS ping within that stop's time window. Works for both single and multi-vehicle.
  const mapStops = useMemo((): MapStop[] => {
    if (!selectedAsset || timelineRows.length === 0) return []
    const stops = mergeConsecutiveStops(parsePings(timelineRows))
    return stops.reduce<MapStop[]>((acc, stop, idx) => {
      const row = timelineRows.find((r) => {
        const t   = new Date(String(r['[StartTime]'] ?? '')).getTime()
        const lat = Number(r['[Latitude]']  ?? 0)
        const lng = Number(r['[Longitude]'] ?? 0)
        return (
          t >= stop.startMs && t <= stop.endMs &&
          String(r['[Geofence]'] ?? '') === stop.geofence &&
          isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)
        )
      })
      if (!row) return acc
      acc.push({
        lat:        Number(row['[Latitude]']),
        lng:        Number(row['[Longitude]']),
        geofence:   stop.geofence,
        subGeoZone: stop.subGeoZone,
        color:      sharedColorMap.get(stop.geofence) ?? '#9e9e9e',
        index:      idx,
        startMs:    stop.startMs,
        endMs:      stop.endMs,
        assetType:  stop.assetType,
      })
      return acc
    }, [])
  }, [selectedAsset, timelineRows, vehicleLanes, sharedColorMap])

  // Caption text for AssetStatCards
  const datePeriod = isAllDates
    ? 'last 8 days'
    : isSingleDate && selectedDates![0] === 'Today'
    ? 'today'
    : isSingleDate
    ? `on ${selectedDates![0]}`
    : `over ${selectedDates!.length} dates`

  const singleDayPeriod = datePeriod

  const handleExportPdf = async () => {
    const { exportPdf } = await import('@/utils/exportReport')
    await exportPdf({ clientName: displayName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset: selectedAsset || undefined, datePeriod })
  }

  const handleExportExcel = async () => {
    const { exportExcel } = await import('@/utils/exportReport')
    await exportExcel({ clientName: displayName, dashboardLabel, dateLabel, filters, tableRows, selectedAsset: selectedAsset || undefined, datePeriod })
  }

  // Label above the timeline bar
  const journeyDateLabel = isAllDates
    ? 'ALL DATES JOURNEY'
    : isSingleDate && selectedDates![0] === 'Today'
    ? "TODAY'S JOURNEY"
    : isSingleDate
    ? `${selectedDates![0]} JOURNEY`
    : `${selectedDates!.length} DATES JOURNEY`

  // Show Live badge when Today's data is included
  const showLive = isAllDates || (selectedDates?.includes('Today') ?? false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'flex-start' }}>
      {/* ── Left sidebar ───────────────────────────────────────────────────── */}
      <FilterSidebar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        filterOptions={filterOptions}
      />

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: '#f8fafc',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 2.5,
        }}
      >
          {/* Alerts */}
          {tableError && <Alert severity="error">Unable to load data. Please refresh and try again.</Alert>}
          {kpiQuery.error && <Alert severity="error">Unable to load data. Please refresh and try again.</Alert>}

          {/* Page heading */}
          <DashboardHeader
            clientName={displayName}
            dashboardLabel={dashboardLabel}
            lastRefresh={lastRefreshValue}
            onRefresh={handleRefresh}
            onExportExcel={handleExportExcel}
          />

          {/* Date quick-filter pills */}
          <DateQuickFilter
            value={filters.dateSeen ?? ''}
            onChange={(v) => setFilter('dateSeen', v)}
          />


          {/* ── Asset selected: stat cards + timeline + locations table ─── */}
          {selectedAsset ? (
            <>
              {/* Stat cards */}
              {(tableLoading || singleDayRows.length > 0) && (
                <AssetStatCards rows={singleDayRows} datePeriod={singleDayPeriod} showLive={showLive} loading={tableLoading} />
              )}

              {/* Journey timeline */}
              {timelineTooLarge ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
                >
                  <TimelineIcon sx={{ fontSize: 28 }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
                    <Typography variant="caption">
                      {tableRows.length.toLocaleString()} records — add a date or geofence filter to view the timeline.
                    </Typography>
                  </Box>
                </Paper>
              ) : (
                <JourneyTimeline
                  rows={singleDayRows}
                  colorMap={sharedColorMap}
                  dateLabel={journeyDateLabel}
                  selectedIndex={selectedStopIndex}
                  onSelectIndex={setSelectedStopIndex}
                  vehicleLanes={vehicleLanes}
                  loading={tableLoading}
                />
              )}

              {/* Selected asset card */}
              {!timelineTooLarge && singleDayRows.length > 0 && (
                <SelectedAssetCard rows={singleDayRows} />
              )}

              {/* Map — last known positions + route trail */}
              {!timelineTooLarge && azureMapsKey && (
                <MapPanel
                  markers={mapMarkers}
                  subscriptionKey={azureMapsKey}
                  routeLines={routeLines}
                  stopFocus={stopFocus}
                  stops={mapStops}
                  onStopClick={setSelectedStopIndex}
                  loading={tableLoading}
                />
              )}

              {/* Locations visited table */}
              {!timelineTooLarge && (
                <LocationsVisitedTable
                  rows={singleDayRows}
                  colorMap={sharedColorMap}
                  showLive={showLive}
                  selectedStartMs={selectedStopStartMs}
                  onSelectRow={handleTableRowSelect}
                  loading={tableLoading}
                />
              )}

              {/* Fall back to AG Grid when rows exceed the cap */}
              {timelineTooLarge && (
                <Box
                  sx={{
                    flex: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="h6">Location History</Typography>
                    <Typography variant="caption" color="text.secondary">{subtitleText}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <DataTable
                      rows={tableRows}
                      loading={tableLoading && tableRows.length === 0}
                      error={tableError}
                    />
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <>
              {/* ── No asset: KPI cards + timeline placeholder + AG Grid ── */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiCard
                    title="Last Refresh"
                    row={kpiQuery.data?.rows?.[0]}
                    loading={kpiQuery.loading}
                    error={kpiQuery.error}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <KpiCard
                    title="Records"
                    row={{ Count: tableRows.length }}
                    loading={tableLoading && tableRows.length === 0}
                    error={null}
                  />
                </Grid>
              </Grid>

              {/* Timeline placeholder */}
              <Paper
                variant="outlined"
                sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
              >
                <TimelineIcon sx={{ fontSize: 28 }} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Journey Timeline</Typography>
                  <Typography variant="caption">
                    Filter by Beacon ID, VIN, or Stock Number to view that asset&apos;s journey timeline.
                  </Typography>
                </Box>
              </Paper>

              {/* Full AG Grid table — server-side paginated browse */}
              <Box
                sx={{
                  flex: 1,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6">Location History</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {tableLoading && tableRows.length === 0
                      ? `${dateLabel} · Loading…`
                      : paginatedQuery.hasMore
                      ? `${dateLabel} · ${tableRows.length.toLocaleString()} records loaded · more available`
                      : `${dateLabel} · ${tableRows.length.toLocaleString()} records`}
                  </Typography>
                </Box>

                {useProgressiveMode && progressiveQuery.loading && (
                  <LinearProgress
                    variant="determinate"
                    value={(progressiveQuery.loadedDates / progressiveQuery.totalDates) * 100}
                    sx={{ height: 3 }}
                  />
                )}

                <Box sx={{ flex: 1 }}>
                  {!tableLoading && tableRows.length === 0 ? (
                    <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                      <SearchOffIcon sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.4 }} />
                      <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        No records found
                      </Typography>
                      <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', maxWidth: 340 }}>
                        No location records match the current filters for <strong>{dateLabel}</strong>. Try adjusting your filters or selecting a different date range.
                      </Typography>
                    </Box>
                  ) : (
                    <DataTable
                      rows={tableRows}
                      loading={tableLoading && tableRows.length === 0}
                      error={tableError}
                      hasMore={!useProgressiveMode ? paginatedQuery.hasMore : undefined}
                      onLoadMore={!useProgressiveMode ? paginatedQuery.loadMore : undefined}
                    />
                  )}
                </Box>
              </Box>
            </>
          )}
      </Box>
    </Box>
  )
}
