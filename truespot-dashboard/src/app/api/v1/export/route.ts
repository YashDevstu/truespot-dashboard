export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { executeQuery } from '@/services/powerbi/queryService'
import { DAY_TIME_CHUNKS, buildMeasureQuery, type TimeChunk } from '@/utils/dax'
import { getClientConfig } from '@/services/config/clientConfigService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'

// Builds a location history query identical to buildLocationHistoryQuery but
// adds a "DateLabel" column (AppendFinal[LastSeenDateDefault]) so the exported
// rows carry the date label used for filtering in the file-based client project.
function buildExportQuery(dateSeen: string, timeChunk: TimeChunk, assetStatusColumn = 'AssetStatus'): string {
  const { startFraction, endFraction } = timeChunk
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    AppendFinal,
    AppendFinal[${assetStatusColumn}] <> "Sold"
    && AppendFinal[${assetStatusColumn}] <> "Archieved"
    && DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE) > 0
    && AppendFinal[Make] <> "zz_manualentry"
    && AppendFinal[LastSeenDateDefault] = "${dateSeen}"
    && MOD(AppendFinal[Last Seen-Local], 1) >= ${startFraction}
    && MOD(AppendFinal[Last Seen-Local], 1) < ${endFraction}
  ),
  "Geofence", AppendFinal[Geofence],
  "SubGeoZone", AppendFinal[SubGeoZone],
  "StartTime", AppendFinal[Last Seen-Local],
  "EndTime", AppendFinal[PreviousLastSeenNew_],
  "MinutesDiff", DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE),
  "BeaconId", AppendFinal[BeaconId],
  "VIN", AppendFinal[VIN Updated],
  "StockNumber", AppendFinal[StockNumber],
  "AssetType", AppendFinal[AssetType],
  "FloorLevel", AppendFinal[Floor Level],
  "BatteryLevel", AppendFinal[BatteryLevel],
  "Make", AppendFinal[Make],
  "Model", AppendFinal[Model],
  "Year", AppendFinal[Year],
  "Latitude", AppendFinal[Latitude],
  "Longitude", AppendFinal[Longitude],
  "DateLabel", AppendFinal[LastSeenDateDefault]
)`
}

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

// POST /api/v1/export?clientId=carvision&dashboardKey=locationhistory
//
// Developer-only route. Queries the last 8 days + Today from the Semantic
// Model and returns the merged row array as JSON for use in truespot-client.
//
// Usage:
//   1. POST this endpoint while truespot-dashboard is running locally
//   2. Save the response JSON
//   3. Split into location-history.json (rows array) and meta.json
//   4. Drop both files into truespot-client/src/data/{clientId}/
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const clientId     = searchParams.get('clientId')     ?? 'carvision'
  const dashboardKey = searchParams.get('dashboardKey') ?? 'locationhistory'

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 404 })
  }

  const dashboard = clientConfig.dashboards[dashboardKey]
  if (!dashboard) {
    return Response.json({ error: `Dashboard "${dashboardKey}" not found` }, { status: 404 })
  }

  const dateLabels = ['Today', ...lastNDayLabels(7)]

  try {
    // Fetch all date × chunk combinations in parallel (32 queries),
    // each chunk independently cached by the main project's cache layer.
    const chunkResults = await Promise.allSettled(
      dateLabels.flatMap((dateSeen) =>
        DAY_TIME_CHUNKS.map((timeChunk) =>
          executeQuery(
            dashboard.dataset_name,
            buildExportQuery(dateSeen, timeChunk, dashboard.asset_status_column),
            CACHE_TTL_LOCATION_HISTORY
          )
        )
      )
    )

    const rows = chunkResults
      .filter((r): r is PromiseFulfilledResult<Record<string, unknown>[]> => r.status === 'fulfilled')
      .flatMap((r) => r.value)

    // Fetch the Last Refresh KPI measure
    let lastRefresh: string | null = null
    const kpiPanel = dashboard.panels?.find((p) => p.measure === '[Last Refresh]')
    if (kpiPanel?.measure) {
      try {
        const kpiRows = await executeQuery(
          dashboard.dataset_name,
          buildMeasureQuery(kpiPanel.measure),
          300
        )
        lastRefresh = String(kpiRows[0]?.['[Value]'] ?? '')
      } catch {
        // non-fatal — export still works without the KPI
      }
    }

    return Response.json({
      rows,
      lastRefresh,
      exportedAt: new Date().toISOString(),
      totalRows: rows.length,
      datesCovered: dateLabels,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
