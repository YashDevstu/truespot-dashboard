export const dynamic = 'force-dynamic'
export const maxDuration = 120

import type { NextRequest } from 'next/server'
import { PanelType } from '@/constants/dashboard'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS } from '@/constants/cache'
import { QueryRequestSchema, type QueryResponse } from '@/types/api'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildMeasureQuery, buildLocationHistoryQuery } from '@/utils/dax'

function ttlForPanelType(type: PanelType): number {
  switch (type) {
    case PanelType.LINE_CHART:
    case PanelType.BAR_CHART:
      return CACHE_TTL_CHARTS
    default:
      return CACHE_TTL_KPIS
  }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = QueryRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 })
  }

  const { clientId, dashboardKey, panelId, filters } = parsed.data

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 })
  }

  const dashboard = clientConfig.dashboards[dashboardKey]
  if (!dashboard) {
    return Response.json(
      { error: `Dashboard "${dashboardKey}" not found for client "${clientId}"` },
      { status: 404 }
    )
  }

  const panel = dashboard.panels.find((p) => p.id === panelId)
  if (!panel) {
    return Response.json(
      { error: `Panel "${panelId}" not found in dashboard "${dashboardKey}"` },
      { status: 404 }
    )
  }

  try {
    let daxQuery: string

    if (panel.type === PanelType.DATA_TABLE || panel.type === PanelType.JOURNEY_TIMELINE) {
      daxQuery = buildLocationHistoryQuery({
        dateSeen: filters?.dateSeen,
        beaconId: filters?.beaconId,
        geofence: filters?.geofence,
        subGeoZone: filters?.subGeoZone,
        floorLevel: filters?.floorLevel,
        vin: filters?.vin,
        stockNumber: filters?.stockNumber,
        assetType: filters?.assetType,
      })
    } else if (panel.measure) {
      daxQuery = buildMeasureQuery(panel.measure)
    } else {
      return Response.json(
        { error: `Panel "${panelId}" has no measure configured` },
        { status: 400 }
      )
    }

    const ttl = ttlForPanelType(panel.type)
    const rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl)
    const response: QueryResponse = { rows, refreshedAt: null }
    return Response.json(response)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
