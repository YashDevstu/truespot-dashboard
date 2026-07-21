export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS } from '@/constants/cache'
import {
  buildExitAssetsQuery,
  buildMonitoredExitsQuery,
  buildExitAssetTypeOptionsQuery,
  buildExitRefreshTimeQuery,
  type ExitLocationFilters,
} from '@/utils/daxExitLocation'

type ExitLocationQueryType =
  | 'exit-assets'
  | 'monitored-exits'
  | 'asset-type-options'
  | 'refresh-time'

interface ExitLocationQueryBody {
  clientId: string
  dashboardKey: string
  queryType: ExitLocationQueryType
  filters?: ExitLocationFilters
  dwell?: 'new' | 'dwelling'
}

export async function POST(request: NextRequest) {
  let body: ExitLocationQueryBody
  try {
    body = (await request.json()) as ExitLocationQueryBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, dashboardKey, queryType, filters = {}, dwell } = body

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
    case 'exit-assets':
      daxQuery = buildExitAssetsQuery(filters, dwell)
      ttl = CACHE_TTL_CHARTS
      break
    case 'monitored-exits':
      daxQuery = buildMonitoredExitsQuery()
      ttl = CACHE_TTL_CHARTS
      break
    case 'asset-type-options':
      daxQuery = buildExitAssetTypeOptionsQuery()
      ttl = CACHE_TTL_CHARTS
      break
    case 'refresh-time':
      daxQuery = buildExitRefreshTimeQuery()
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
