export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildDistinctQuery, buildDistinctWithFiltersQuery, buildCascadeConditions, type ActiveFilters } from '@/utils/dax'
import { getOrSet } from '@/services/cache/cacheService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'

// GET /api/v1/filter-options?clientId=X&dashboardKey=Y&panelId=Z[&geofence=X&vin=Y&...]
//
// Without active filters → returns full distinct value lists (cached).
// With active filters    → returns cross-filtered lists matching Power BI behaviour:
//   each dropdown only shows values that exist under the currently active selections,
//   but excludes its OWN filter so the dropdown never empties itself.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId    = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId     = searchParams.get('panelId')

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

  // Collect whichever filter values the client is currently applying
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

  // No active filters → use the long-lived cached full list
  if (!hasActiveFilters) {
    const cacheKey = `fopt:${clientId}:${dashboardKey}:${panelId}`
    try {
      const options = await getOrSet<Record<string, string[]>>(
        cacheKey,
        CACHE_TTL_LOCATION_HISTORY,
        async () => {
          const results = await Promise.all(
            columnEntries.map(([, col]) =>
              executeQuery(dashboard.dataset_name, buildDistinctQuery(col), CACHE_TTL_LOCATION_HISTORY)
            )
          )
          const built: Record<string, string[]> = {}
          columnEntries.forEach(([key], i) => {
            built[key] = results[i]
              .map((row) => String(row['[value]'] ?? ''))
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b))
          })
          return built
        }
      )
      return Response.json(options)
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 })
    }
  }

  // Active filters present → cascade: each column is filtered by all OTHER active selections.
  // Short TTL since results depend on the specific combination of active filters.
  const filterHash = JSON.stringify(activeFilters)
  const cacheKey = `fopt-cascade:${clientId}:${dashboardKey}:${panelId}:${filterHash}`

  try {
    const options = await getOrSet<Record<string, string[]>>(
      cacheKey,
      60, // 60-second TTL for cascaded results
      async () => {
        const results = await Promise.all(
          columnEntries.map(([key, col]) => {
            // Exclude this column's own filter so its dropdown never collapses to 1 item
            const conditions = buildCascadeConditions(activeFilters, key as keyof ActiveFilters)
            const dax = buildDistinctWithFiltersQuery(col, conditions)
            return executeQuery(dashboard.dataset_name, dax, 60)
          })
        )
        const built: Record<string, string[]> = {}
        columnEntries.forEach(([key], i) => {
          built[key] = results[i]
            .map((row) => String(row['[value]'] ?? ''))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
        })
        return built
      }
    )
    return Response.json(options)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
