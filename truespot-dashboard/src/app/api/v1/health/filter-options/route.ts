export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import {
  buildHealthFilterConditions,
  buildHealthDistinctWithFiltersQuery,
  type ActiveHealthFilters,
} from '@/utils/daxHealth'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId = searchParams.get('panelId')

  if (!clientId || !dashboardKey || !panelId) {
    return Response.json(
      { error: 'clientId, dashboardKey, and panelId are required' },
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

  const panel = dashboard.panels?.find((p) => p.id === panelId)
  if (!panel) {
    return Response.json({ error: `Panel "${panelId}" not found` }, { status: 404 })
  }

  const filterColumns = (panel.filter_columns ?? {}) as Record<string, string>
  const columnEntries = Object.entries(filterColumns)
  if (columnEntries.length === 0) return Response.json({})

  // Read active filter values from query params (for cascading behaviour)
  const activeFilters: ActiveHealthFilters = {
    lastSeenDate: searchParams.get('lastSeenDate') || undefined,
    department:   searchParams.get('department')   || undefined,
    assetName:    searchParams.get('assetName')    || undefined,
    floor:        searchParams.get('floor')         || undefined,
    geofence:     searchParams.get('geofence')      || undefined,
    tagId:        searchParams.get('tagId')         || undefined,
    assetId:      searchParams.get('assetId')       || undefined,
    exitsFilter:       searchParams.get('exitsFilter')       || undefined,
    outsideHospital:   searchParams.get('outsideHospital')   || undefined,
    excludeDepartment: searchParams.get('excludeDepartment') || undefined,
  }

  const hasActiveFilters = Object.values(activeFilters).some(Boolean)
  const ttl = hasActiveFilters ? 60 : CACHE_TTL_LOCATION_HISTORY

  const workspaceId = dashboard.workspace_name
    ? await resolveWorkspaceId(dashboard.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? '')

  if (!workspaceId) {
    return Response.json({ error: 'Workspace could not be resolved' }, { status: 500 })
  }

  try {
    const results = await Promise.all(
      columnEntries.map(([key, col]) => {
        const conditions = buildHealthFilterConditions(
          activeFilters,
          key as keyof ActiveHealthFilters
        )
        const query = buildHealthDistinctWithFiltersQuery(col, conditions)
        return executeQuery(dashboard.dataset_name, query, ttl, workspaceId)
      })
    )

    const options: Record<string, string[]> = {}
    columnEntries.forEach(([key], index) => {
      options[key] = (results[index] as Record<string, unknown>[])
        .map((row) => String(row['[value]'] ?? ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    })

    return Response.json(options)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
