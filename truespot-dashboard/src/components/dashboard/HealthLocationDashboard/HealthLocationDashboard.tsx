'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { useHealthLocationData } from '@/hooks/useHealthLocationData'
import { CLIENT_FACILITY_TIME_ZONE, DEFAULT_FACILITY_TIME_ZONE } from '@/constants/timezones'
import DashboardHeader from '@/components/dashboard/DashboardHeader/DashboardHeader'
import DateQuickFilter from '@/components/dashboard/DateQuickFilter'
import HealthLocationFilterSidebar from './HealthLocationFilterSidebar'
import HealthLocationKpiCards from './HealthLocationKpiCards'
import GeofenceSummaryPanel from './GeofenceSummaryPanel'
import LocationPointsTable, { locationRowKey } from './LocationPointsTable'
import type { HLLocationRow } from '@/hooks/useHealthLocationData'

const TOP_BAR_H = 60

interface HealthLocationDashboardProps {
  clientId:       string
  dashboardKey:   string
  product:        string
  displayName:    string
  dashboardLabel: string
}

export default function HealthLocationDashboard({
  clientId,
  dashboardKey,
  product,
  displayName,
  dashboardLabel,
}: HealthLocationDashboardProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedRows, setSelectedRows] = useState<HLLocationRow[]>([])

  const {
    filters,
    updateFilter,
    resetFilters,
    refresh,
    kpis,
    geofenceSummary,
    locationRows,
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
  } = useHealthLocationData(clientId, dashboardKey)

  // Deep-link support: a row clicked elsewhere in the app (e.g. Exit Location
  // Portal) can link here with ?vin=... to jump straight to that asset's trail.
  const searchParams = useSearchParams()
  const didApplyDeepLink = useRef(false)
  useEffect(() => {
    if (didApplyDeepLink.current) return
    didApplyDeepLink.current = true
    const vin = searchParams.get('vin')
    if (vin) updateFilter('vin', vin)
  }, [searchParams, updateFilter])

  const sidebarWidth = sidebarOpen ? 236 : 48

  // Set of row keys — drives row highlighting in the table
  const selectedRowKeys = useMemo(
    () => new Set(selectedRows.map(locationRowKey)),
    [selectedRows]
  )

  // When rows are selected, compute KPIs and geofence summary directly from the
  // selected rows (client-side, instant) so the cards reflect exactly what was clicked —
  // not all records that happen to share the same field values.
  const effectiveKpis = useMemo(() => {
    if (selectedRows.length === 0) return kpis
    const unknownRows = selectedRows.filter((r) => r.geofence === 'Unknown Geofence')
    return {
      totalTags:        new Set(selectedRows.map((r) => r.tagId || r.assetId).filter(Boolean)).size,
      geofencesVisited: new Set(selectedRows.filter((r) => r.geofence !== 'Unknown Geofence').map((r) => r.geofence).filter(Boolean)).size,
      timeTrackedMins:  selectedRows.reduce((s, r) => s + r.durationMins, 0),
      unknownZoneMins:  unknownRows.reduce((s, r) => s + r.durationMins, 0),
    }
  }, [selectedRows, kpis])

  const effectiveGeofenceSummary = useMemo(() => {
    if (selectedRows.length === 0) return geofenceSummary
    const map = new Map<string, { cumulativeMins: number; firstSeen: string; lastSeen: string }>()
    for (const r of selectedRows) {
      const cur = map.get(r.geofence)
      if (cur) {
        cur.cumulativeMins += r.durationMins
        if (r.firstSeen < cur.firstSeen) cur.firstSeen = r.firstSeen
        if (r.lastSeen  > cur.lastSeen)  cur.lastSeen  = r.lastSeen
      } else {
        map.set(r.geofence, { cumulativeMins: r.durationMins, firstSeen: r.firstSeen, lastSeen: r.lastSeen })
      }
    }
    return [...map.entries()]
      .map(([geofence, v]) => ({ geofence, ...v }))
      .sort((a, b) => b.cumulativeMins - a.cumulativeMins)
  }, [selectedRows, geofenceSummary])

  // Wrappers that also clear the row selection when the user changes filters externally
  const handleFilterChange = useCallback(
    (key: Parameters<typeof updateFilter>[0], value: Parameters<typeof updateFilter>[1]) => {
      setSelectedRows([])
      updateFilter(key, value)
    },
    [updateFilter]
  )
  const handleResetFilters = useCallback(() => {
    setSelectedRows([])
    resetFilters()
  }, [resetFilters])

  // Toggle a single row in/out of the selection — KPIs compute client-side, no API refetch.
  // Works across pages: selected rows from other pages stay in the set until explicitly removed.
  const handleRowClick = useCallback((row: HLLocationRow) => {
    const key = locationRowKey(row)
    setSelectedRows((prev) =>
      prev.some((r) => locationRowKey(r) === key)
        ? prev.filter((r) => locationRowKey(r) !== key)
        : [...prev, row]
    )
  }, [])

  // Clears only the row selection (keeps all filters). Used by Time Tracked card
  // when rows are selected — "click to clear" should mean "deselect rows", not reset everything.
  const handleClearRowSelection = useCallback(() => setSelectedRows([]), [])

  return (
    <Box>

      {/* ── Top bar — fixed ───────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 20,
          height: TOP_BAR_H,
          bgcolor: 'background.paper',
          borderBottom: '1px solid', borderColor: 'divider',
          px: 2.5,
          display: 'flex', alignItems: 'center',
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

        {/* Animated refresh progress bar */}
        {refreshing && (
          <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, bgcolor: '#dbeafe', overflow: 'hidden' }}>
            <Box
              sx={{
                height: '100%', bgcolor: '#2563eb', position: 'absolute',
                '@keyframes progress': { '0%': { left: '-40%', width: '40%' }, '100%': { left: '100%', width: '40%' } },
                animation: 'progress 1.2s ease-in-out infinite',
              }}
            />
          </Box>
        )}
      </Box>

      {/* ── Sidebar — fixed below top bar ────────────────────────────────────── */}
      <Box
        sx={{
          position: 'fixed',
          top: TOP_BAR_H, left: 0,
          width: sidebarWidth,
          height: `calc(100vh - ${TOP_BAR_H}px)`,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 10,
          overflow: 'hidden',
          borderRight: '1px solid', borderColor: 'divider',
          bgcolor: '#f8fafc',
        }}
      >
        <HealthLocationFilterSidebar
          filters={filters}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
        />
      </Box>

      {/* ── Main content — offset by fixed top bar + sidebar ─────────────────── */}
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
          <Alert severity="error">Unable to load data. Please refresh and try again.</Alert>
        )}

        {/* Breadcrumb — dev only */}
        {process.env.NODE_ENV !== 'production' && (
          <Breadcrumbs
            separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
            sx={{ fontSize: 13, color: 'text.secondary' }}
          >
            <NextLink
              href={`/dashboard/${product}/${clientId}`}
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
            >
              {displayName}
            </NextLink>
            <Typography sx={{ fontSize: 13, color: 'text.primary', fontWeight: 600 }}>
              {dashboardLabel}
            </Typography>
          </Breadcrumbs>
        )}

        {/* Page heading */}
        <DashboardHeader
          clientName={displayName}
          dashboardLabel={dashboardLabel}
          lastRefresh={refreshTime || undefined}
          displayTimezone={CLIENT_FACILITY_TIME_ZONE[clientId] ?? DEFAULT_FACILITY_TIME_ZONE}
          onRefresh={refresh}
          exportDisabled={totalRows === 0}
          onExportExcel={async () => {
            const { exportHealthLocationExcel } = await import('@/utils/exportHealthLocationReport')
            const allRows = await fetchAllRowsForExport()
            await exportHealthLocationExcel({
              clientName:    displayName,
              dashboardLabel,
              refreshTime:   refreshTime || undefined,
              filters,
              kpis:          effectiveKpis,
              locationRows:  allRows,
            })
          }}
        />

        {/* Date quick-filter — Today / Yesterday / Last 7 days / Custom range */}
        <DateQuickFilter
          value={filters.dateSeen ?? ''}
          onChange={(v) => handleFilterChange('dateSeen', v === 'all' ? undefined : v || undefined)}
        />

        {/* KPI cards */}
        <HealthLocationKpiCards
          kpis={effectiveKpis}
          loading={loading}
          activeGeofence={filters.geofence}
          isKnownOnly={!!filters.excludeUnknownGeofence}
          hasRowSelection={selectedRows.length > 0}
          onGeofencesVisited={() =>
            handleFilterChange('excludeUnknownGeofence', filters.excludeUnknownGeofence ? undefined : true)
          }
          onTimeTracked={selectedRows.length > 0 ? handleClearRowSelection : handleResetFilters}
          onUnknownZoneTime={() => {
            const isUnknownOnly = filters.geofence === 'Unknown Geofence'
            handleFilterChange('geofence', isUnknownOnly ? undefined : 'Unknown Geofence')
          }}
        />

        {/* Two-column layout: Geofence summary (left) + Location points table (right) */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '370px 1fr' },
            // Explicit row track so the row actually fills the container's height —
            // without this, "auto" row sizing ignores height on the container and
            // children's height:100% can't resolve, pushing content (like the
            // pagination footer) out below the visible area.
            gridTemplateRows: '1fr',
            gap: 2.5,
            alignItems: 'stretch',
            // Single clamped value (not separate height + maxHeight) — a browser's
            // grid "auto" row-track algorithm resolves one definite value reliably,
            // but two competing height properties produced inconsistent results
            // across browser zoom levels (100vh is recomputed in CSS px per zoom),
            // which is why the pagination footer disappeared only at 100% zoom.
            // Floor 480px keeps it usable on short viewports; ceiling 760px stops
            // it stretching past what the rows need on tall viewports.
            height: 'clamp(480px, calc(100vh - 334px), 760px)',
          }}
        >
          <GeofenceSummaryPanel
            rows={effectiveGeofenceSummary}
            loading={loading}
            activeGeofence={filters.geofence}
            onSelect={(g) => handleFilterChange('geofence', g)}
            hasRowSelection={selectedRows.length > 0}
          />
          <LocationPointsTable
            rows={locationRows}
            loading={tableLoading}
            selectedRowKeys={selectedRowKeys}
            onRowClick={handleRowClick}
            onClearSelection={handleClearRowSelection}
            page={page}
            pageSize={pageSize}
            totalRows={totalRows}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
        </Box>
      </Box>
    </Box>
  )
}
