// TEMPORARY DEV ROUTE — delete after schema discovery
// GET /api/v1/dev/subgeo?clientId=halifax
// Returns distinct SubGeoZone values from AppendFinal with session counts,
// sorted by count DESC so we can build the location-category mapping.

export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'

const DAX = `EVALUATE
TOPN(
  200,
  SELECTCOLUMNS(
    FILTER(
      GROUPBY(
        ADDCOLUMNS(
          FILTER(
            AppendFinal,
            DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE) > 0 &&
            AppendFinal[Last Seen-Local] >= TODAY() - 30
          ),
          "__Mins", DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE)
        ),
        AppendFinal[SubGeoZone],
        AppendFinal[Geofence],
        "__Sessions",  COUNTX(CURRENTGROUP(), AppendFinal[VIN]),
        "__TotalMins", SUMX(CURRENTGROUP(), [__Mins])
      ),
      [__Sessions] > 0
    ),
    "SubGeoZone", AppendFinal[SubGeoZone],
    "Geofence",   AppendFinal[Geofence],
    "Sessions",   [__Sessions],
    "TotalMins",  [__TotalMins]
  ),
  [Sessions], DESC
)`

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return Response.json({ error: 'clientId query param required' }, { status: 400 })
  }

  let clientConfig
  try {
    clientConfig = getClientConfig(clientId)
  } catch {
    return Response.json({ error: `Client "${clientId}" not found` }, { status: 404 })
  }

  const lhDash = clientConfig.dashboards['locationhistory']
  if (!lhDash) {
    return Response.json({ error: 'No locationhistory dashboard configured for this client' }, { status: 404 })
  }

  const workspaceId = lhDash.workspace_name
    ? await resolveWorkspaceId(lhDash.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? '')

  if (!workspaceId) {
    return Response.json({ error: 'Workspace could not be resolved' }, { status: 500 })
  }

  try {
    const rows = await executeQuery(lhDash.dataset_name, DAX, 0, workspaceId)
    const result = rows.map((r) => ({
      subGeoZone: String(r['[SubGeoZone]'] ?? ''),
      geofence:   String(r['[Geofence]']   ?? ''),
      sessions:   Number(r['[Sessions]']   ?? 0),
      totalMins:  Number(r['[TotalMins]']  ?? 0),
    }))
    return Response.json({ count: result.length, rows: result })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
