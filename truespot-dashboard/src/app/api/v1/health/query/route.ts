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

// The RefreshTimeLocal DAX table stores UTC-5 local time as a US-format string
// (e.g. "7/8/2026 6:03:11 AM") with no timezone indicator. This function attaches
// the explicit offset so the browser can compute "X ago" correctly regardless of
// the viewer's local timezone (e.g. IST users were seeing ~11h off).
function attachUTCOffset(usDateStr: string, offsetHours: number): string {
  const match = usDateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i)
  if (!match) return usDateStr
  const [, month, day, year, hourStr, min, sec, ampm] = match
  let h = parseInt(hourStr, 10)
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0
  const sign = offsetHours >= 0 ? '+' : '-'
  const abs = Math.abs(offsetHours)
  const offset = `${sign}${String(abs).padStart(2, '0')}:00`
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:${sec}${offset}`
}

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
    let rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl, workspaceId)

    // RefreshTimeLocal returns a US-format string with no timezone info (UTC-5 for BSA).
    // Attach the explicit offset so the browser computes "X ago" correctly.
    if (queryType === 'refresh-time' && rows.length > 0) {
      const raw = String((rows[0] as Record<string, unknown>)['[RefreshTime]'] ?? '')
      if (raw) rows = [{ '[RefreshTime]': attachUTCOffset(raw, -5) }]
    }

    return Response.json({ rows })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
