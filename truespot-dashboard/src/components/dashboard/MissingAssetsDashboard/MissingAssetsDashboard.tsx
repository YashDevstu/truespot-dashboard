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
import OutsideDeptFilter from './OutsideDeptFilter'

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

  const sidebarWidth = sidebarOpen ? 236 : 48

  return (
    <Box>

      {/* ── Top bar — fixed at top of viewport, always visible ────────────── */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          height: TOP_BAR_H,
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

      {/* ── Sidebar — position fixed so it's always visible during page scroll */}
      <Box
        sx={{
          position: 'fixed',
          top: TOP_BAR_H,
          left: 0,
          width: sidebarWidth,
          height: `calc(100vh - ${TOP_BAR_H}px)`,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 10,
          overflow: 'hidden',
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: '#f8fafc',
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

      {/* ── Main content — offset by fixed top bar + sidebar, normal page scroll */}
      <Box
        sx={{
          mt: `${TOP_BAR_H}px`,
          ml: `${sidebarWidth}px`,
          transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
            exportDisabled={loading || tableRows.length === 0}
            onExportExcel={async () => {
              const { exportHealthExcel } = await import('@/utils/exportHealthReport')
              await exportHealthExcel({
                clientName: displayName,
                dashboardLabel,
                refreshTime: refreshTime || undefined,
                filters,
                kpis,
                tableRows,
              })
            }}
          />

          {/* Outside My Department — exclude filter dropdown */}
          <OutsideDeptFilter
            options={filterOptions.department ?? []}
            selected={filters.excludeDepartment ? filters.excludeDepartment.split(',').map(s => s.trim()).filter(Boolean) : []}
            onChange={(vals) => updateFilter('excludeDepartment', vals.length > 0 ? vals.join(',') : undefined)}
          />

          {/* KPI cards — Active/Missing/Outside are clickable filters */}
          <AssetKpiCards
            kpis={kpis}
            loading={loading}
            activeHourGroup={filters.hourGroup}
            activeOutsideHospital={filters.outsideHospital}
            onActiveLt2hrClick={() => updateFilter('hourGroup', filters.hourGroup === 'Less than 2hr' ? undefined : 'Less than 2hr')}
            onMissing30dClick={() => updateFilter('hourGroup', filters.hourGroup === '30d+' ? undefined : '30d+')}
            onOutsideHospitalClick={() => updateFilter('outsideHospital', filters.outsideHospital === 'Yes' ? undefined : 'Yes')}
          />

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
              if (s.has(v)) s.delete(v); else s.add(v)
              updateFilter('hourGroup', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onTimeSinceClear={() => updateFilter('hourGroup', undefined)}
            onLocationClick={(v) => {
              const s = new Set(filters.geofence ? filters.geofence.split(',').map(x => x.trim()) : [])
              if (s.has(v)) s.delete(v); else s.add(v)
              updateFilter('geofence', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onLocationClear={() => updateFilter('geofence', undefined)}
            onAssetTypeClick={(v) => {
              const s = new Set(filters.assetName ? filters.assetName.split(',').map(x => x.trim()) : [])
              if (s.has(v)) s.delete(v); else s.add(v)
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
            onRowClick={(row) => {
              const s = new Set(filters.assetId ? filters.assetId.split(',').map(x => x.trim()).filter(Boolean) : [])
              if (s.has(row.assetId)) s.delete(row.assetId); else s.add(row.assetId)
              updateFilter('assetId', s.size === 0 ? undefined : Array.from(s).join(','))
            }}
            onClearSelection={() => updateFilter('assetId', undefined)}
          />
      </Box>
    </Box>
  )
}
