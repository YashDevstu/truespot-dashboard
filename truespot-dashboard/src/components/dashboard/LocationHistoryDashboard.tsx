'use client'
import { useState, useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import TimelineIcon from '@mui/icons-material/Timeline'
import { useFilters } from '@/hooks/useFilters'
import { usePanelQuery } from '@/hooks/usePanelQuery'
import { useProgressiveDatesQuery } from '@/hooks/useProgressiveDatesQuery'
import { useFilterOptions } from '@/hooks/useFilterOptions'
import FilterSidebar from './FilterSidebar'
import DashboardHeader from './DashboardHeader'
import KpiCard from './panels/KpiCard'
import DataTable from './panels/DataTable'
import JourneyTimeline from './panels/JourneyTimeline/JourneyTimeline'

interface Props {
  clientId: string
  dashboardKey: string
  displayName: string
  dashboardLabel: string
}

export default function LocationHistoryDashboard({
  clientId,
  dashboardKey,
  displayName,
  dashboardLabel,
}: Props) {
  const { filters, setFilter, resetFilters } = useFilters()
  const [refreshToken, setRefreshToken] = useState(0)

  const isAllDates = filters.dateSeen === 'all'

  // A "specific asset" filter means the user has narrowed to one beacon/vehicle.
  // This changes how "All Dates" queries are executed (see below).
  const hasAssetFilter = !!(filters.beaconId || filters.vin || filters.stockNumber)

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

  // ── Three distinct query modes ──────────────────────────────────────────────
  //
  // Mode A — "All Dates" with NO asset filter (progressive)
  //   → 8 parallel client requests, rows accumulate live, used for broad
  //     exploration of the full dataset (~700K rows)
  //
  // Mode B — "All Dates" WITH asset filter (single server-side request)
  //   → 1 client request with dateSeen='all'; the API route runs all
  //     date×chunk queries on the server and returns a small result set.
  //     Eliminates the 8-client-connection overhead that caused the freeze.
  //
  // Mode C — Specific date (single request, always)
  //   → 1 client request; the API runs 4 time-chunk queries for that date.
  //
  const useProgressiveMode = isAllDates && !hasAssetFilter // Mode A

  // Modes B and C both go through usePanelQuery (one request each)
  const singleQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters: {
      ...baseFilters,
      // Mode B passes 'all' so the server handles every date internally.
      // Mode C passes the specific date selected by the user.
      dateSeen: isAllDates ? 'all' : (filters.dateSeen || undefined),
    },
    enabled: !useProgressiveMode,
  })

  // Mode A only
  const progressiveQuery = useProgressiveDatesQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    baseFilters,
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
  })

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  const lastRefreshValue = kpiQuery.data?.rows?.[0]
    ? String(Object.values(kpiQuery.data.rows[0])[0] ?? '')
    : undefined

  // Return empty rows while the single query is loading so AG Grid never has
  // to process a stale large dataset before the filtered result arrives.
  const tableRows = useMemo(() => {
    if (useProgressiveMode) return progressiveQuery.rows
    if (singleQuery.loading) return []
    return (singleQuery.data?.rows ?? []) as Record<string, unknown>[]
  }, [useProgressiveMode, progressiveQuery.rows, singleQuery.loading, singleQuery.data?.rows])

  const tableLoading = useProgressiveMode ? progressiveQuery.loading : singleQuery.loading
  const tableError = useProgressiveMode ? null : singleQuery.error

  const dateLabel =
    filters.dateSeen === 'all' || !filters.dateSeen ? 'All Dates' : filters.dateSeen

  const subtitleText = (() => {
    if (useProgressiveMode && progressiveQuery.loading) {
      return `Loading ${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} dates · ${tableRows.length.toLocaleString()} records so far…`
    }
    if (tableLoading) return `${dateLabel} · Loading…`
    return `${dateLabel} · ${tableRows.length.toLocaleString()} records`
  })()

  const selectedAsset = filters.beaconId || filters.vin || filters.stockNumber || undefined
  const timelineRows = selectedAsset && !tableLoading ? tableRows : []

  return (
    <Box sx={{ display: 'flex', gap: 2.5, height: '100%' }}>
      <FilterSidebar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        filterOptions={filterOptions}
      />

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <DashboardHeader
          clientName={displayName}
          dashboardLabel={dashboardLabel}
          lastRefresh={lastRefreshValue}
          onRefresh={handleRefresh}
        />

        {tableError && <Alert severity="error">{tableError}</Alert>}
        {kpiQuery.error && <Alert severity="error">{kpiQuery.error}</Alert>}

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

        {selectedAsset ? (
          <JourneyTimeline rows={timelineRows} selectedAsset={selectedAsset} />
        ) : (
          <Paper
            variant="outlined"
            sx={{ p: 2.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2, color: 'text.disabled' }}
          >
            <TimelineIcon sx={{ fontSize: 28 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Journey Timeline
              </Typography>
              <Typography variant="caption">
                Filter by Beacon ID, VIN, or Stock Number to view that asset&apos;s journey timeline.
              </Typography>
            </Box>
          </Paper>
        )}

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
              {subtitleText}
            </Typography>
          </Box>

          {/* Progress bar only shown in progressive mode (unfiltered All Dates) */}
          {useProgressiveMode && progressiveQuery.loading && (
            <LinearProgress
              variant="determinate"
              value={(progressiveQuery.loadedDates / progressiveQuery.totalDates) * 100}
              sx={{ height: 3 }}
            />
          )}

          <Box sx={{ flex: 1 }}>
            <DataTable
              rows={tableRows}
              loading={tableLoading && tableRows.length === 0}
              error={tableError}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
