export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildDistinctQuery } from '@/utils/dax'
import { getOrSet } from '@/services/cache/cacheService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'

// GET /api/v1/filter-options?clientId=X&dashboardKey=Y&panelId=Z
//
// Returns the distinct values for every column listed in the panel's
// filter_columns config, fetched server-side and cached in Redis.
// No client-side computation over large datasets is needed.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId = searchParams.get('panelId')

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
  if (!dashboard) {
    return Response.json({ error: `Dashboard "${dashboardKey}" not found` }, { status: 404 })
  }

  const panel = dashboard.panels.find((p) => p.id === panelId)
  if (!panel) {
    return Response.json({ error: `Panel "${panelId}" not found` }, { status: 404 })
  }

  const filterColumns = panel.filter_columns ?? {}
  const columnEntries = Object.entries(filterColumns)

  if (columnEntries.length === 0) {
    return Response.json({})
  }

  const cacheKey = `fopt:${clientId}:${dashboardKey}:${panelId}`

  try {
    const options = await getOrSet<Record<string, string[]>>(
      cacheKey,
      CACHE_TTL_LOCATION_HISTORY,
      async () => {
        // Run all DISTINCT queries in parallel — each returns a tiny result set
        const results = await Promise.all(
          columnEntries.map(([, tableColumn]) =>
            executeQuery(
              dashboard.dataset_name,
              buildDistinctQuery(tableColumn),
              CACHE_TTL_LOCATION_HISTORY
            )
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
