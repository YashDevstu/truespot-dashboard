export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS, CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import {
  buildHealthKpiQuery,
  buildTimeSinceChartQuery,
  buildTopLocationsChartQuery,
  buildAssetCountChartQuery,
  buildMissingAssetsTableQuery,
  buildRefreshTimeQuery,
  type ActiveHealthFilters,
} from '@/utils/daxHealth'

type HealthQueryType =
  | 'kpis'
  | 'time-chart'
  | 'locations-chart'
  | 'asset-count-chart'
  | 'assets-table'
  | 'refresh-time'

interface HealthQueryBody {
  clientId: string
  dashboardKey: string
  queryType: HealthQueryType
  filters?: ActiveHealthFilters
}

export async function POST(request: NextRequest) {
  let body: HealthQueryBody
  try {
    body = (await request.json()) as HealthQueryBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, dashboardKey, queryType, filters = {} } = body

  if (!clientId || !dashboardKey || !queryType) {
    return Response.json(
      { error: 'clientId, dashboardKey, and queryType are required' },
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
    return Response.json(
      { error: `Dashboard "${dashboardKey}" not found for client "${clientId}"` },
      { status: 404 }
    )
  }

  const workspaceId = dashboard.workspace_name
    ? await resolveWorkspaceId(dashboard.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? '')

  if (!workspaceId) {
    return Response.json({ error: 'Workspace could not be resolved' }, { status: 500 })
  }

  let daxQuery: string
  let ttl: number

  switch (queryType) {
    case 'kpis':
      daxQuery = buildHealthKpiQuery(filters)
      ttl = CACHE_TTL_KPIS
      break
    case 'time-chart':
      daxQuery = buildTimeSinceChartQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'locations-chart':
      daxQuery = buildTopLocationsChartQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'asset-count-chart':
      daxQuery = buildAssetCountChartQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'assets-table':
      daxQuery = buildMissingAssetsTableQuery(filters)
      ttl = CACHE_TTL_LOCATION_HISTORY
      break
    case 'refresh-time':
      daxQuery = buildRefreshTimeQuery()
      ttl = CACHE_TTL_KPIS
      break
    default:
      return Response.json({ error: `Unknown queryType "${queryType}"` }, { status: 400 })
  }

  try {
    const rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl, workspaceId)
    return Response.json({ rows })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
