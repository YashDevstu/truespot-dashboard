export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS, CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import { CLIENT_FACILITY_TIME_ZONE, DEFAULT_FACILITY_TIME_ZONE } from '@/constants/timezones'
import { getUtcOffsetHours } from '@/utils/formatters'
import {
  buildHLKpiQuery,
  buildHLGeofenceSummaryQuery,
  buildHLLocationPointsQuery,
  buildHLLocationPointsCountQuery,
  buildHLLocationPointsPageQuery,
  buildHLRefreshTimeQuery,
  buildHLLatestAssetQuery,
  HL_DEFAULT_PAGE_SIZE,
  type ActiveHealthLocationFilters,
} from '@/utils/daxHealthLocation'

// Location History's refresh time is stored per-facility as a bare local-time string
// with no timezone indicator. Attach the correct, DST-aware offset for that facility's
// own timezone so browsers compute "X ago" correctly regardless of viewer timezone —
// a single hardcoded offset (BSA's Central Time) mislabeled and mistimed Halifax's
// Eastern-time refresh, which also shifts relative to Central across DST transitions.
function attachUTCOffset(raw: string, timeZone: string): string {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i)
  if (!match) return raw
  const [, month, day, year, hourStr, min, sec, ampm] = match
  let h = parseInt(hourStr, 10)
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0
  const offsetHours = getUtcOffsetHours(timeZone, Number(year), Number(month), Number(day), h, Number(min), Number(sec))
  const sign = offsetHours >= 0 ? '+' : '-'
  const abs = Math.abs(offsetHours)
  const offset = `${sign}${String(abs).padStart(2, '0')}:00`
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(h).padStart(2, '0')}:${min}:${sec}${offset}`
}

type HLQueryType =
  | 'kpis'
  | 'geofence-summary'
  | 'location-points'
  | 'location-points-count'
  | 'location-points-page'
  | 'refresh-time'
  | 'latest-asset'

interface HLQueryBody {
  clientId: string
  dashboardKey: string
  queryType: HLQueryType
  filters?: ActiveHealthLocationFilters
  page?: number
  pageSize?: number
}

export async function POST(request: NextRequest) {
  let body: HLQueryBody
  try {
    body = (await request.json()) as HLQueryBody
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
      daxQuery = buildHLKpiQuery(filters)
      ttl = CACHE_TTL_KPIS
      break
    case 'geofence-summary':
      daxQuery = buildHLGeofenceSummaryQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'location-points':
      daxQuery = buildHLLocationPointsQuery(filters)
      ttl = CACHE_TTL_LOCATION_HISTORY
      break
    case 'location-points-count':
      daxQuery = buildHLLocationPointsCountQuery(filters)
      ttl = CACHE_TTL_LOCATION_HISTORY
      break
    case 'location-points-page':
      daxQuery = buildHLLocationPointsPageQuery(
        filters,
        body.page ?? 1,
        body.pageSize ?? HL_DEFAULT_PAGE_SIZE
      )
      ttl = CACHE_TTL_LOCATION_HISTORY
      break
    case 'refresh-time':
      daxQuery = buildHLRefreshTimeQuery()
      ttl = CACHE_TTL_KPIS
      break
    case 'latest-asset':
      daxQuery = buildHLLatestAssetQuery(filters)
      ttl = CACHE_TTL_KPIS
      break
    default:
      return Response.json({ error: `Unknown queryType "${queryType}"` }, { status: 400 })
  }

  try {
    let rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl, workspaceId)

    if (queryType === 'refresh-time' && rows.length > 0) {
      const raw = String((rows[0] as Record<string, unknown>)['[RefreshTime]'] ?? '')
      const tz  = CLIENT_FACILITY_TIME_ZONE[clientId] ?? DEFAULT_FACILITY_TIME_ZONE
      if (raw) rows = [{ '[RefreshTime]': attachUTCOffset(raw, tz) }]
    }

    return Response.json({ rows })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
