export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { PanelType } from '@/constants/dashboard'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS, CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import { QueryRequestSchema, type QueryResponse } from '@/types/api'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildMeasureQuery, buildLocationHistoryQuery, DAY_TIME_CHUNKS } from '@/utils/dax'

function ttlForPanelType(type: PanelType): number {
  switch (type) {
    case PanelType.DATA_TABLE:
    case PanelType.JOURNEY_TIMELINE:
      return CACHE_TTL_LOCATION_HISTORY
    case PanelType.LINE_CHART:
    case PanelType.BAR_CHART:
      return CACHE_TTL_CHARTS
    default:
      return CACHE_TTL_KPIS
  }
}

// Generates last N date labels in the format stored in LastSeenDateDefault (MM/DD/YY)
function lastNDayLabels(n: number): string[] {
  const labels: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    labels.push(`${mm}/${dd}/${yy}`)
  }
  return labels
}

// Fetch a single date by splitting into 4 parallel 6-hour chunks to stay under 15 MB per call.
// Each chunk is independently cached so repeat requests within the TTL are instant.
async function fetchDateChunked(
  datasetName: string,
  dateSeen: string,
  baseFilters: Record<string, unknown>,
  ttl: number
): Promise<Record<string, unknown>[]> {
  const chunkRows = await Promise.all(
    DAY_TIME_CHUNKS.map((timeChunk) => {
      const q = buildLocationHistoryQuery({ ...baseFilters, dateSeen, timeChunk } as Parameters<typeof buildLocationHistoryQuery>[0])
      return executeQuery(datasetName, q, ttl)
    })
  )
  return chunkRows.flat()
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
    const ttl = ttlForPanelType(panel.type)

    if (panel.type === PanelType.DATA_TABLE || panel.type === PanelType.JOURNEY_TIMELINE) {
      const baseFilters = {
        beaconId: filters?.beaconId,
        geofence: filters?.geofence,
        subGeoZone: filters?.subGeoZone,
        floorLevel: filters?.floorLevel,
        vin: filters?.vin,
        stockNumber: filters?.stockNumber,
        assetType: filters?.assetType,
        minDurationMinutes: filters?.minDurationMinutes,
      }

      // Paginated mode: single TOPN query, no chunking needed.
      // TOPN already caps the result so the 15 MB per-call limit is not a concern.
      if (filters?.limit !== undefined) {
        const q = buildLocationHistoryQuery({
          ...baseFilters,
          dateSeen: filters.dateSeen ?? undefined,
          limit: filters.limit,
          cursor: filters.cursor ?? undefined,
        })
        const rows = await executeQuery(dashboard.dataset_name, q, ttl)
        return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
      }

      if (filters?.dateSeen && filters.dateSeen !== 'all') {
        // Single date: 4 parallel 6-hour chunks → each chunk < 15 MB → merge
        const rows = await fetchDateChunked(dashboard.dataset_name, filters.dateSeen, baseFilters, ttl)
        return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
      }

      // All Dates: 7 days × 4 chunks = 28 parallel queries → merge
      // Each of the 28 queries is independently cached
      const dateLabels = ['Today', ...lastNDayLabels(7)]
      const allChunkResults = await Promise.all(
        dateLabels.map((dateSeen) =>
          fetchDateChunked(dashboard.dataset_name, dateSeen, baseFilters, ttl)
        )
      )
      const rows = allChunkResults.flat()
      return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
    }

    if (panel.measure) {
      const daxQuery = buildMeasureQuery(panel.measure)
      const rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl)
      return Response.json({ rows, refreshedAt: null } satisfies QueryResponse)
    }

    return Response.json(
      { error: `Panel "${panelId}" has no measure configured` },
      { status: 400 }
    )
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
