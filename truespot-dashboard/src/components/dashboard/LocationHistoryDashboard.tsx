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

function uniqueValues(rows: Record<string, unknown>[], field: string): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const v = row[field]
    if (v !== null && v !== undefined && String(v).trim() !== '') seen.add(String(v))
  }
  return [...seen].sort((a, b) => a.localeCompare(b))
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

  const singleDateQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters: { ...baseFilters, dateSeen: filters.dateSeen || undefined },
    enabled: !isAllDates,
  })

  const progressiveQuery = useProgressiveDatesQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    baseFilters,
    enabled: isAllDates,
  })

  const kpiQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'last-refresh',
    filters: { _r: refreshToken },
  })

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  const lastRefreshRow = kpiQuery.data?.rows?.[0]
  const lastRefreshValue = lastRefreshRow
    ? String(Object.values(lastRefreshRow)[0] ?? '')
    : undefined

  const tableRows = useMemo(
    () =>
      isAllDates
        ? progressiveQuery.rows
        : ((singleDateQuery.data?.rows ?? []) as Record<string, unknown>[]),
    [isAllDates, progressiveQuery.rows, singleDateQuery.data?.rows]
  )

  const tableLoading = isAllDates ? progressiveQuery.loading : singleDateQuery.loading
  const tableError = isAllDates ? null : singleDateQuery.error

  const progressPct = isAllDates
    ? (progressiveQuery.loadedDates / progressiveQuery.totalDates) * 100
    : 0

  const dateLabel =
    filters.dateSeen === 'all' || !filters.dateSeen ? 'All Dates' : filters.dateSeen

  const subtitleText =
    isAllDates && progressiveQuery.loading
      ? `Loading ${progressiveQuery.loadedDates}/${progressiveQuery.totalDates} dates · ${tableRows.length.toLocaleString()} records so far…`
      : `${dateLabel} · ${tableRows.length.toLocaleString()} records`

  const filterOptions = useMemo(
    () => ({
      geofence: uniqueValues(tableRows, '[Geofence]'),
      subGeoZone: uniqueValues(tableRows, '[SubGeoZone]'),
      floorLevel: uniqueValues(tableRows, '[FloorLevel]'),
      beaconId: uniqueValues(tableRows, '[BeaconId]'),
      vin: uniqueValues(tableRows, '[VIN]'),
      stockNumber: uniqueValues(tableRows, '[StockNumber]'),
      assetType: uniqueValues(tableRows, '[AssetType]'),
    }),
    [tableRows]
  )

  // The first active asset filter becomes the timeline's asset label
  const selectedAsset = filters.beaconId || filters.vin || filters.stockNumber || undefined

  // Pass rows to the timeline only once the current query has settled.
  // While a query is loading, tableRows may still contain the previous (unfiltered)
  // dataset which can be 700K+ rows — spreading that into Math.max() overflows the stack.
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

        {/* Journey Timeline — shows asset journey when BeaconId / VIN / Stock Number is filtered */}
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

        {/* Location History data table */}
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

          {isAllDates && progressiveQuery.loading && (
            <LinearProgress variant="determinate" value={progressPct} sx={{ height: 3 }} />
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
