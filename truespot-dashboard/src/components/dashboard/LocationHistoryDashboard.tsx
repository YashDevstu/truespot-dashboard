'use client'
import { useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { useFilters } from '@/hooks/useFilters'
import { usePanelQuery } from '@/hooks/usePanelQuery'
import FilterSidebar from './FilterSidebar'
import DashboardHeader from './DashboardHeader'
import KpiCard from './panels/KpiCard'
import DataTable from './panels/DataTable'

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

  const queryFilters = {
    dateSeen: filters.dateSeen || undefined,
    beaconId: filters.beaconId || undefined,
    geofence: filters.geofence || undefined,
    subGeoZone: filters.subGeoZone || undefined,
    floorLevel: filters.floorLevel || undefined,
    vin: filters.vin || undefined,
    stockNumber: filters.stockNumber || undefined,
    assetType: filters.assetType || undefined,
  }

  const kpiQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'last-refresh',
    filters: { ...queryFilters, _r: refreshToken },
  })

  const tableQuery = usePanelQuery({
    clientId,
    dashboardKey,
    panelId: 'location-history-data',
    filters: { ...queryFilters, _r: refreshToken },
  })

  const handleRefresh = useCallback(() => {
    setRefreshToken((t) => t + 1)
  }, [])

  const lastRefreshRow = kpiQuery.data?.rows?.[0]
  const lastRefreshValue = lastRefreshRow
    ? String(Object.values(lastRefreshRow)[0] ?? '')
    : undefined

  const tableRows = (tableQuery.data?.rows ?? []) as Record<string, unknown>[]
  const minDur = Number(filters.minDurationMinutes) || 1
  // minDur is used for the subtitle label; actual filtering happens server-side in the DAX query

  return (
    <Box sx={{ display: 'flex', gap: 2.5, height: '100%' }}>
      <FilterSidebar filters={filters} onFilterChange={setFilter} onReset={resetFilters} />

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <DashboardHeader
          clientName={displayName}
          dashboardLabel={dashboardLabel}
          lastRefresh={lastRefreshValue}
          onRefresh={handleRefresh}
        />

        {(kpiQuery.error || tableQuery.error) && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {kpiQuery.error ?? tableQuery.error}
          </Alert>
        )}

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
              loading={tableQuery.loading}
              error={null}
            />
          </Grid>
        </Grid>

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
              {filters.dateSeen || 'All Dates'} · {tableRows.length} records
              {minDur > 1 ? ` · min ${minDur}m` : ''}
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <DataTable
              rows={tableRows}
              loading={tableQuery.loading}
              error={tableQuery.error}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
