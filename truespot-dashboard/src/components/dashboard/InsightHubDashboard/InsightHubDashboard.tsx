'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { useInsightHubData } from '@/hooks/useInsightHubData'
import InsightHubNav, { REPORT_LABELS } from './InsightHubNav'
import HowMuchGetsUsed from './reports/HowMuchGetsUsed'
import EnoughOnEveryFloor from './reports/EnoughOnEveryFloor'
import TheCleaningLoop from './reports/TheCleaningLoop'
import TheHidingSpots from './reports/TheHidingSpots'
import PreventiveMaintenanceStatus from './reports/PreventiveMaintenanceStatus'
import ComingSoonPlaceholder from './shared/ComingSoonPlaceholder'

const TOP_H      = 56
const FILTER_H   = 44
const HEADER_H   = TOP_H + FILTER_H
const NAV_W_OPEN = 240
const NAV_W_SHUT = 60
const TEAL       = '#0d9488'

// Both reports are fully built but held back from clients for now — flip to
// true to re-enable once ready.
const CLEANING_LOOP_ENABLED = false
const HIDING_SPOTS_ENABLED  = false

interface InsightHubDashboardProps {
  clientId:        string
  dashboardKey:    string
  product:         string
  displayName:     string
  dashboardLabel:  string
  classification?:  string
  spareBuffer?:     number
  unitValue?:       number
  configuredTypes?: string[]
}

export default function InsightHubDashboard({
  clientId,
  dashboardKey,
  product,
  displayName,
  dashboardLabel,
  classification,
  spareBuffer,
  unitValue,
  configuredTypes,
}: InsightHubDashboardProps) {
  void dashboardLabel

  const isGeofenceBased = classification === 'geofence'

  const {
    activeReport,
    selectReport,
    filters,
    updateFilter,
    refresh,
    dayOffset,
    setDayOffset,
    utilization,
    peakData,
    dailyPeakRows,
    assetTypeUtilization,
    hourlyRows,
    weeklyTrend,
    locationCategories,
    categoryAssets,
    selectedCategory,
    selectCategory,
    categoryLoading,
    categoryDailyRows,
    categoryDailyLoading,
    selectedDay,
    setSelectedDay,
    selectedAsset,
    setSelectedAsset,
    assetTrailRows,
    assetTrailLoading,
    floorAssetType,
    setFloorAssetType,
    floorReadiness,
    floorReadinessByType,
    cleaningRows,
    hidingSpotRows,
    assetTypeOptions,
    floorOptions,
    departmentOptions,
    buildingOptions,
    optionsLoading,
    refreshTime,
    loading,
    error,
  } = useInsightHubData(clientId, dashboardKey)

  const [navCollapsed, setNavCollapsed] = useState(false)
  const navW = navCollapsed ? NAV_W_SHUT : NAV_W_OPEN

  const reportLabel = REPORT_LABELS[activeReport]

  return (
    <Box sx={{ bgcolor: '#fff', minHeight: '100vh' }}>

      {/* ── Top bar — full width, highest z-index, sits above sidebar ───────── */}
      <Box
        component="header"
        sx={{
          position: 'fixed',
          top:      0,
          left:     0,
          right:    0,
          zIndex:   35,
          bgcolor:  '#fff',
        }}
      >
        {/* Row 1 — report nav + client identity */}
        <Box
          sx={{
            height:       TOP_H,
            borderBottom: '1px solid #e4eaf0',
            display:      'flex',
            alignItems:   'center',
            px:           3,
            gap:          2,
          }}
        >
          {/* Logo — always visible regardless of sidebar state */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0, pr: 2, mr: 1, borderRight: '1px solid #e4eaf0' }}>
            <svg width="20" height="24" viewBox="0 0 24 28" fill="none">
              <path d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 19 9 19s9-12.25 9-19c0-4.97-4.03-9-9-9z" fill={TEAL}/>
              <circle cx="12" cy="9" r="3.5" fill="white"/>
            </svg>
            <Box sx={{ lineHeight: 1.2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#0f172a', letterSpacing: '0.05em', lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                TrueSpot
              </Typography>
              <Typography sx={{ fontSize: 8, fontWeight: 600, color: TEAL, letterSpacing: '0.12em', textTransform: 'uppercase', mt: '2px', whiteSpace: 'nowrap' }}>
                Health · Insight Hub
              </Typography>
            </Box>
          </Box>

          {/* Left: "All reports › Active report" breadcrumb-style */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize:   13,
                fontWeight: 500,
                color:      '#94a3b8',
                cursor:     'default',
                whiteSpace: 'nowrap',
              }}
            >
              All reports
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#e2e8f0', fontWeight: 300 }}>›</Typography>
            <Box
              sx={{
                display:      'flex',
                alignItems:   'center',
                gap:          0.5,
                px:           1.25,
                py:           0.4,
                borderRadius: 6,
                border:       `1.5px solid ${TEAL}`,
                bgcolor:      `${TEAL}0f`,
              }}
            >
              <Typography
                sx={{
                  fontSize:   13,
                  fontWeight: 600,
                  color:      TEAL,
                  whiteSpace: 'nowrap',
                }}
              >
                {reportLabel}
              </Typography>
              {/* dropdown chevron */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5l3 3 3-3" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Box>
          </Box>

          {/* Right: client name text + initials circle */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>
              {displayName}
            </Typography>
            <Box
              sx={{
                width:          32,
                height:         32,
                borderRadius:   '50%',
                bgcolor:        '#0c1a27',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                flexShrink:     0,
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>
                {displayName.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Row 2 — filter bar */}
        <Box
          sx={{
            height:       FILTER_H,
            borderBottom: '1px solid #e4eaf0',
            display:      'flex',
            alignItems:   'center',
            px:           3,
            gap:          1,
            bgcolor:      '#fafbfc',
          }}
        >
          {/* "FILTERS" label */}
          <Typography
            sx={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: '0.1em',
              color:         '#94a3b8',
              textTransform: 'uppercase',
              flexShrink:    0,
            }}
          >
            Filters
          </Typography>

          {/* Divider */}
          <Box sx={{ width: '1px', height: 16, bgcolor: '#e2e8f0', flexShrink: 0, mx: 0.5 }} />

          {/* ── Asset (live dropdown) ── */}
          <Select
            value={filters.assetType ?? ''}
            displayEmpty
            size="small"
            disabled={optionsLoading}
            onChange={(e) => { const v = e.target.value || undefined; updateFilter('assetType', v); setFloorAssetType(v ?? 'Pumps'); refresh() }}
            sx={{
              height:     30,
              bgcolor:    filters.assetType ? '#f0fdf9' : '#fff',
              borderRadius: '20px',
              flexShrink: 0,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: filters.assetType ? TEAL : '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px !important', display: 'flex', alignItems: 'center', gap: '5px' },
            }}
            renderValue={(v) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {/* grid icon */}
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="4.5" height="4.5" rx="1" fill={filters.assetType ? TEAL : '#94a3b8'}/>
                  <rect x="7.5" y="1" width="4.5" height="4.5" rx="1" fill={filters.assetType ? TEAL : '#94a3b8'} opacity=".6"/>
                  <rect x="1" y="7.5" width="4.5" height="4.5" rx="1" fill={filters.assetType ? TEAL : '#94a3b8'} opacity=".6"/>
                  <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" fill={filters.assetType ? TEAL : '#94a3b8'} opacity=".35"/>
                </svg>
                {optionsLoading
                  ? <span style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</span>
                  : v
                    ? <span style={{ fontSize: 12 }}>
                        <span style={{ color: '#64748b', fontWeight: 500 }}>Asset </span>
                        <span style={{ color: TEAL, fontWeight: 700 }}>{v as string}</span>
                      </span>
                    : <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>Asset: All</span>
                }
              </Box>
            )}
          >
            <MenuItem value="" sx={{ fontSize: 12, color: 'text.secondary' }}><em>All asset types</em></MenuItem>
            {assetTypeOptions.map((t) => (
              <MenuItem key={t} value={t} sx={{ fontSize: 12 }}>{t}</MenuItem>
            ))}
          </Select>

          {/* ── When (live dropdown) ── */}
          <Select
            value={filters.days ?? 7}
            size="small"
            onChange={(e) => { updateFilter('days', e.target.value as number); refresh() }}
            sx={{
              height: 30, bgcolor: filters.days && filters.days !== 7 ? '#f0fdf9' : '#fff',
              borderRadius: '20px', flexShrink: 0,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: filters.days && filters.days !== 7 ? TEAL : '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px !important', display: 'flex', alignItems: 'center', gap: '5px' },
            }}
            renderValue={(v) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5.5" stroke={filters.days && filters.days !== 7 ? TEAL : '#94a3b8'} strokeWidth="1.2"/>
                  <path d="M6.5 3.5V6.5l2 1.5" stroke={filters.days && filters.days !== 7 ? TEAL : '#94a3b8'} strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>When </span>
                <span style={{ fontSize: 12, color: filters.days && filters.days !== 7 ? TEAL : '#1e293b', fontWeight: 600 }}>
                  {v === 7 ? 'Last 7 days' : v === 30 ? 'Last 30 days' : 'Last 90 days'}
                </span>
              </Box>
            )}
          >
            <MenuItem value={7}  sx={{ fontSize: 12 }}>Last 7 days</MenuItem>
            <MenuItem value={30} sx={{ fontSize: 12 }}>Last 30 days</MenuItem>
            <MenuItem value={90} sx={{ fontSize: 12 }}>Last 90 days</MenuItem>
          </Select>

          {/* ── Floor (live dropdown) ── */}
          <Select
            value={filters.floor ?? ''}
            displayEmpty
            size="small"
            disabled={optionsLoading}
            onChange={(e) => { updateFilter('floor', e.target.value || undefined); refresh() }}
            sx={{
              height: 30, bgcolor: filters.floor ? '#f0fdf9' : '#fff',
              borderRadius: '20px', flexShrink: 0,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: filters.floor ? TEAL : '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px !important', display: 'flex', alignItems: 'center', gap: '5px' },
            }}
            renderValue={(v) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 3.5h9M2 6.5h9M2 9.5h9" stroke={filters.floor ? TEAL : '#94a3b8'} strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Floor </span>
                <span style={{ fontSize: 12, color: filters.floor ? TEAL : '#1e293b', fontWeight: 600 }}>
                  {(v as string) || 'All floors'}
                </span>
              </Box>
            )}
          >
            <MenuItem value="" sx={{ fontSize: 12, color: 'text.secondary' }}><em>All floors</em></MenuItem>
            {floorOptions.map((f) => (
              <MenuItem key={f} value={f} sx={{ fontSize: 12 }}>{f}</MenuItem>
            ))}
          </Select>

          {/* ── Building (live dropdown) ── */}
          {buildingOptions.length > 0 && (
            <Select
              value={filters.building ?? ''}
              displayEmpty
              size="small"
              disabled={optionsLoading}
              onChange={(e) => { updateFilter('building', e.target.value || undefined); refresh() }}
              sx={{
                height: 30, bgcolor: filters.building ? '#f0fdf9' : '#fff',
                borderRadius: '20px', flexShrink: 0,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: filters.building ? TEAL : '#e2e8f0' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
                '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px !important', display: 'flex', alignItems: 'center', gap: '5px' },
              }}
              renderValue={(v) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="2" y="3" width="9" height="9" rx="1" stroke={filters.building ? TEAL : '#94a3b8'} strokeWidth="1.2"/>
                    <path d="M5 12V8h3v4" stroke={filters.building ? TEAL : '#94a3b8'} strokeWidth="1.2" strokeLinecap="round"/>
                    <rect x="4" y="5" width="1.5" height="1.5" rx=".3" fill={filters.building ? TEAL : '#94a3b8'}/>
                    <rect x="7.5" y="5" width="1.5" height="1.5" rx=".3" fill={filters.building ? TEAL : '#94a3b8'}/>
                  </svg>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Building </span>
                  <span style={{ fontSize: 12, color: filters.building ? TEAL : '#1e293b', fontWeight: 600 }}>
                    {(v as string) || 'All'}
                  </span>
                </Box>
              )}
            >
              <MenuItem value="" sx={{ fontSize: 12, color: 'text.secondary' }}><em>All buildings</em></MenuItem>
              {buildingOptions.map((b) => (
                <MenuItem key={b} value={b} sx={{ fontSize: 12 }}>{b}</MenuItem>
              ))}
            </Select>
          )}

          {/* ── Dept (live dropdown) ── */}
          <Select
            value={filters.department ?? ''}
            displayEmpty
            size="small"
            disabled={optionsLoading}
            onChange={(e) => { updateFilter('department', e.target.value || undefined); refresh() }}
            sx={{
              height: 30, bgcolor: filters.department ? '#f0fdf9' : '#fff',
              borderRadius: '20px', flexShrink: 0,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: filters.department ? TEAL : '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: TEAL },
              '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px !important', display: 'flex', alignItems: 'center', gap: '5px' },
            }}
            renderValue={(v) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="4.5" r="2" stroke={filters.department ? TEAL : '#94a3b8'} strokeWidth="1.2"/>
                  <path d="M2 11c0-2.2 2-4 4.5-4S11 8.8 11 11" stroke={filters.department ? TEAL : '#94a3b8'} strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Dept </span>
                <span style={{ fontSize: 12, color: filters.department ? TEAL : '#1e293b', fontWeight: 600 }}>
                  {(v as string) || 'All'}
                </span>
              </Box>
            )}
          >
            <MenuItem value="" sx={{ fontSize: 12, color: 'text.secondary' }}><em>All departments</em></MenuItem>
            {departmentOptions.map((d) => (
              <MenuItem key={d} value={d} sx={{ fontSize: 12 }}>{d}</MenuItem>
            ))}
          </Select>

          {/* Right: hint */}
          <Typography sx={{ fontSize: 11.5, color: '#94a3b8', ml: 'auto', flexShrink: 0, fontStyle: 'italic' }}>
            Changing the asset type re-renders every card
          </Typography>
        </Box>
      </Box>

      {/* ── Sidebar — starts below header, not behind it ─────────────────────── */}
      <Box
        component="nav"
        sx={{
          position:   'fixed',
          top:        HEADER_H,
          left:       0,
          width:      navW,
          height:     `calc(100vh - ${HEADER_H}px)`,
          zIndex:     30,
          overflowY:  'auto',
          overflowX:  'hidden',
          bgcolor:    '#fff',
          boxShadow:  '1px 0 0 0 #e8eef4',
          transition: 'width 0.2s ease',
        }}
      >
        <InsightHubNav
          activeReport={activeReport}
          onSelectReport={selectReport}
          refreshTime={refreshTime}
          displayName={displayName}
          collapsed={navCollapsed}
          onToggleCollapse={() => setNavCollapsed((c) => !c)}
        />
      </Box>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <Box
        component="main"
        sx={{
          ml:         `${navW}px`,
          transition: 'margin-left 0.2s ease',
          mt:         `${HEADER_H}px`,
          minHeight:  `calc(100vh - ${HEADER_H}px)`,
          p:          { xs: 3, sm: 4 },
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            Unable to load data — please refresh and try again.
          </Alert>
        )}

        {activeReport === 'utilization' && (
          <HowMuchGetsUsed
            clientId={clientId}
            dashboardKey={dashboardKey}
            product={product}
            data={utilization}
            peakData={peakData}
            spareBuffer={spareBuffer}
            unitValue={unitValue}
            isGeofenceBased={isGeofenceBased}
            dayOffset={dayOffset}
            onSetDayOffset={setDayOffset}
            dailyPeakRows={dailyPeakRows}
            assetType={filters.assetType}
            days={filters.days ?? 7}
            displayName={displayName}
            loading={loading}
            assetTypeUtilization={assetTypeUtilization}
            hourlyRows={hourlyRows}
            weeklyTrend={weeklyTrend}
            locationCategories={locationCategories}
            categoryAssets={categoryAssets}
            selectedCategory={selectedCategory}
            categoryLoading={categoryLoading}
            categoryDailyRows={categoryDailyRows}
            categoryDailyLoading={categoryDailyLoading}
            selectedDay={selectedDay}
            selectedAsset={selectedAsset}
            assetTrailRows={assetTrailRows}
            assetTrailLoading={assetTrailLoading}
            onSelectAssetType={(t) => { updateFilter('assetType', t); refresh() }}
            onSelectCategory={selectCategory}
            onSelectDay={setSelectedDay}
            onSelectAsset={setSelectedAsset}
          />
        )}

        {activeReport === 'floor-distribution' && (
          <EnoughOnEveryFloor
            rows={floorReadiness}
            byTypeRows={floorReadinessByType}
            assetType={floorAssetType}
            loading={loading}
            onSelectAssetType={(t) => { setFloorAssetType(t ?? 'Pumps') }}
            clientId={clientId}
            dashboardKey={dashboardKey}
            product={product}
            unitValue={unitValue}
            configuredTypes={configuredTypes}
          />
        )}

        {activeReport === 'preventive-maintenance' && <PreventiveMaintenanceStatus />}

        {/* Both reports below are fully built (see TheCleaningLoop.tsx /
            TheHidingSpots.tsx) but intentionally held back from clients for now —
            flip the flag to re-enable once ready, no need to touch the render logic. */}
        {activeReport === 'cleaning-loop' && (
          CLEANING_LOOP_ENABLED ? (
            <TheCleaningLoop
              rows={cleaningRows}
              assetType={filters.assetType}
              loading={loading}
            />
          ) : (
            <ComingSoonPlaceholder
              eyebrow="The Cleaning Loop"
              description="This report will show how long assets sit in cleaning zones before returning to service. Check back soon."
            />
          )
        )}

        {activeReport === 'hiding-spots' && (
          HIDING_SPOTS_ENABLED ? (
            <TheHidingSpots
              rows={hidingSpotRows}
              assetType={filters.assetType}
              loading={loading}
            />
          ) : (
            <ComingSoonPlaceholder
              eyebrow="The Hiding Spots"
              description="This report will rank the locations where idle assets pile up most often. Check back soon."
            />
          )
        )}
      </Box>
    </Box>
  )
}
