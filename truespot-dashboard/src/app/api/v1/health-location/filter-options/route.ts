export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import {
  buildHealthLocationConditions,
  buildHLDistinctWithFiltersQuery,
  type ActiveHealthLocationFilters,
} from '@/utils/daxHealthLocation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const clientId    = searchParams.get('clientId')
  const dashboardKey = searchParams.get('dashboardKey')
  const panelId     = searchParams.get('panelId')

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

  // Read active filter values from query params for cascading behaviour
  const activeFilters: ActiveHealthLocationFilters = {
    dateSeen:           searchParams.get('dateSeen')   || undefined,
    geofence:           searchParams.get('geofence')   || undefined,
    subGeoZone:         searchParams.get('subGeoZone') || undefined,
    floorLevel:         searchParams.get('floorLevel') || undefined,
    beaconId:           searchParams.get('beaconId')   || undefined,
    assetType:          searchParams.get('assetType')  || undefined,
    vin:                searchParams.get('vin')         || undefined,
    assetName:          searchParams.get('assetName')  || undefined,
    minDurationMinutes: Number(searchParams.get('minDurationMinutes') || 0) || undefined,
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
        const conditions = buildHealthLocationConditions(
          activeFilters,
          key as keyof ActiveHealthLocationFilters
        )
        const query = buildHLDistinctWithFiltersQuery(col, conditions)
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
