export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeBatchQuery } from '@/services/powerbi/queryService'
import { buildBatchDistinctQuery, type ActiveFilters } from '@/utils/dax'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'

// GET /api/v1/filter-options?clientId=X&dashboardKey=Y&panelId=Z[&vin=A,B&geofence=X&...]
//
// Batches all filter-column DISTINCT queries into a SINGLE Power BI API call.
// One DAX string contains one EVALUATE per column; the API returns each result
// as results[0].tables[i]. Reduces N round-trips to 1 regardless of column count.
//
// Each EVALUATE excludes that column's own active filter (cascade behaviour) so
// the dropdown shows all compatible options, not just the already-selected value.
// Multi-value filters are comma-separated: vin=VIN1,VIN2 → DAX IN {"VIN1","VIN2"}.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId     = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId      = searchParams.get('panelId')

  if (!clientId || !dashboardKey || !panelId) {
    return Response.json(
      { error: 'clientId, dashboardKey and panelId query params are required' },
      { status: 400 }
    )
  }

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch {
    return Response.json({ error: `Client "${clientId}" not found` }, { status: 404 })
  }

  const dashboard = clientConfig.dashboards[dashboardKey]
  if (!dashboard) return Response.json({ error: `Dashboard "${dashboardKey}" not found` }, { status: 404 })

  const panel = dashboard.panels.find((p) => p.id === panelId)
  if (!panel) return Response.json({ error: `Panel "${panelId}" not found` }, { status: 404 })

  const filterColumns = panel.filter_columns ?? {}
  const columnEntries = Object.entries(filterColumns) as [string, string][]
  if (columnEntries.length === 0) return Response.json({})

  // Active filter values from the client (comma-separated for multi-select)
  const activeFilters: ActiveFilters = {
    dateSeen:    searchParams.get('dateSeen')    ?? undefined,
    geofence:    searchParams.get('geofence')    ?? undefined,
    subGeoZone:  searchParams.get('subGeoZone')  ?? undefined,
    floorLevel:  searchParams.get('floorLevel')  ?? undefined,
    beaconId:    searchParams.get('beaconId')    ?? undefined,
    assetType:   searchParams.get('assetType')   ?? undefined,
    vin:         searchParams.get('vin')         ?? undefined,
    stockNumber: searchParams.get('stockNumber') ?? undefined,
  }

  const hasActiveFilters = Object.values(activeFilters).some(Boolean)
  // Short TTL when filters are active; long TTL for the full uncascaded lists.
  const ttl = hasActiveFilters ? 60 : CACHE_TTL_LOCATION_HISTORY

  const { dax, keys } = buildBatchDistinctQuery(columnEntries, activeFilters)

  try {
    const allTables = await executeBatchQuery(dashboard.dataset_name, dax, ttl)

    const options: Record<string, string[]> = {}
    keys.forEach((key, i) => {
      options[key] = (allTables[i] ?? [])
        .map((row) => String(row['[value]'] ?? ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    })

    return Response.json(options)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
