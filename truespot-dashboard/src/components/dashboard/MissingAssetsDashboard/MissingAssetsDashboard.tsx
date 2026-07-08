'use client'

import { useState } from 'react'
import Image from 'next/image'
import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { useMissingAssetsData } from '@/hooks/useMissingAssetsData'
import DashboardHeader from '@/components/dashboard/DashboardHeader/DashboardHeader'
import HealthFilterSidebar from './HealthFilterSidebar'
import AssetKpiCards from './AssetKpiCards'
import AssetCharts from './AssetCharts'
import GeofenceFilterPills from './GeofenceFilterPills'
import LastSeenRangePills from './LastSeenRangePills'
import AssetsTable from './AssetsTable'

const TOP_BAR_H = 60

interface MissingAssetsDashboardProps {
  clientId: string
  dashboardKey: string
  product: string
  displayName: string
  dashboardLabel: string
}

export default function MissingAssetsDashboard({
  clientId,
  dashboardKey,
  product,
  displayName,
  dashboardLabel,
}: MissingAssetsDashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const {
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
  } = useMissingAssetsData(clientId, dashboardKey)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── Top bar: Logo — sticky, full width ────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          height: TOP_BAR_H,
          flexShrink: 0,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          px: 2.5,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          src="/images/TruespotHealth.webp"
          alt="TrueSpot Health"
          width={130}
          height={36}
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
          priority
        />

        {/* Thin animated progress bar at bottom of top bar — visible only while refreshing */}
        {refreshing && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              bgcolor: '#dbeafe',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                height: '100%',
                bgcolor: '#2563eb',
                '@keyframes progress': {
                  '0%':   { left: '-40%', width: '40%' },
                  '100%': { left: '100%', width: '40%' },
                },
                animation: 'progress 1.2s ease-in-out infinite',
                position: 'absolute',
              }}
            />
          </Box>
        )}
      </Box>

      {/* ── Content row: sidebar + main ───────────────────────────────────── */}
      <Box sx={{ display: 'flex', flex: 1, alignItems: 'flex-start' }}>

        {/* Filter sidebar */}
        <Box
          sx={{
            position: 'sticky',
            top: TOP_BAR_H,
            height: `calc(100vh - ${TOP_BAR_H}px)`,
            width: sidebarOpen ? 236 : 48,
            transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            flexShrink: 0,
            overflow: 'hidden',
            borderRight: '1px solid',
            borderColor: 'divider',
          }}
        >
          <HealthFilterSidebar
            filters={filters}
            filterOptions={filterOptions}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
          />
        </Box>

        {/* Main content */}
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
          {error && (
            <Alert severity="error">
              Unable to load data. Please refresh and try again.
            </Alert>
          )}

          {/* Breadcrumb — dev only; clients access via direct token URL, not the portal */}
          {process.env.NODE_ENV !== 'production' && (
            <Breadcrumbs
              separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
              sx={{ fontSize: 13, color: 'text.secondary' }}
            >
              <NextLink
                href={`/dashboard/${product}`}
                style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
              >
                {product.charAt(0).toUpperCase() + product.slice(1)}
              </NextLink>
              <NextLink
                href={`/dashboard/${product}/${dashboardKey}`}
                style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
              >
                {dashboardLabel}
              </NextLink>
              <Typography sx={{ fontSize: 13, color: 'text.primary', fontWeight: 600 }}>
                {displayName}
              </Typography>
            </Breadcrumbs>
          )}

          {/* Page heading + refresh */}
          <DashboardHeader
            clientName={displayName}
            dashboardLabel={dashboardLabel}
            lastRefresh={refreshTime || undefined}
            displayTimezone="America/Chicago"
            onRefresh={refresh}
          />

          {/* KPI cards */}
          <AssetKpiCards kpis={kpis} loading={loading} />

          {/* Geofence filter pills — between KPIs and charts */}
          {!loading && topLocationsData.length > 0 && (
            <GeofenceFilterPills
              topLocationsData={topLocationsData}
              activeGeofence={filters.geofence}
              onSelect={(g) => updateFilter('geofence', g)}
            />
          )}

          {/* Charts — bars are clickable and cross-filter the whole dashboard */}
          <AssetCharts
            timeSinceData={timeSinceData}
            topLocationsData={topLocationsData}
            assetCountData={assetCountData}
            loading={loading}
            activeHourGroup={filters.hourGroup}
            activeGeofence={filters.geofence}
            activeAssetName={filters.assetName}
            onTimeSinceClick={(v) => {
              const s = new Set(filters.hourGroup ? filters.hourGroup.split(',').map(x => x.trim()) : [])
              s.has(v) ? s.delete(v) : s.add(v)
              updateFilter('hourGroup', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onTimeSinceClear={() => updateFilter('hourGroup', undefined)}
            onLocationClick={(v) => {
              const s = new Set(filters.geofence ? filters.geofence.split(',').map(x => x.trim()) : [])
              s.has(v) ? s.delete(v) : s.add(v)
              updateFilter('geofence', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onLocationClear={() => updateFilter('geofence', undefined)}
            onAssetTypeClick={(v) => {
              const s = new Set(filters.assetName ? filters.assetName.split(',').map(x => x.trim()) : [])
              s.has(v) ? s.delete(v) : s.add(v)
              updateFilter('assetName', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onAssetTypeClear={() => updateFilter('assetName', undefined)}
          />

          {/* Last Seen Range pills — between charts and table */}
          {!loading && timeSinceData.length > 0 && (
            <LastSeenRangePills
              timeSinceData={timeSinceData}
              activeHourGroup={filters.hourGroup}
              onSelect={(hg) => updateFilter('hourGroup', hg)}
            />
          )}

          {/* Asset table — row click cross-filters entire dashboard */}
          <AssetsTable
            rows={tableRows}
            loading={loading}
            selectedAssetId={filters.assetId}
            onRowClick={(row) => updateFilter('assetId', row.assetId)}
            onClearSelection={() => updateFilter('assetId', undefined)}
          />
        </Box>
      </Box>
    </Box>
  )
}
