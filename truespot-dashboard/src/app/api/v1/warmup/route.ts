export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import axios from 'axios'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildLocationHistoryQuery, DAY_TIME_CHUNKS } from '@/utils/dax'
import { getClientConfig } from '@/services/config/clientConfigService'
import { getAccessToken } from '@/services/auth/msalService'
import { resolveDatasetId } from '@/services/powerbi/datasetResolver'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'
import { POWERBI_API_BASE, QUERY_TIMEOUT_MS } from '@/constants/api'

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

// A trivial DAX query that forces the semantic model to load into memory.
// Power BI / Fabric unloads idle models after ~1 hour; the first real query
// then pays a 30–120s "model cold start" penalty. Pinging first eliminates
// that penalty from the main data queries below.
async function pingModel(datasetName: string, workspaceId: string): Promise<void> {
  const [token, datasetId] = await Promise.all([
    getAccessToken(),
    resolveDatasetId(datasetName, workspaceId),
  ])
  const url = `${POWERBI_API_BASE}/groups/${workspaceId}/datasets/${datasetId}/executeQueries`
  await axios.post(
    url,
    { queries: [{ query: 'EVALUATE ROW("Ping", 1)' }], serializerSettings: { includeNulls: false } },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: QUERY_TIMEOUT_MS }
  )
}

async function warmDashboard(clientId: string, dashboardKey: string) {
  const config = getClientConfig(clientId)
  const dashboard = config.dashboards[dashboardKey]
  if (!dashboard) throw new Error(`Dashboard "${dashboardKey}" not found`)

  const workspaceId = dashboard.workspace_name
    ? await resolveWorkspaceId(dashboard.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? (() => { throw new Error('FABRIC_WORKSPACE_ID is not set') })())

  // Wake the model first so all 28 data queries hit a warm engine
  await pingModel(dashboard.dataset_name, workspaceId)

  const dateLabels = ['Today', ...lastNDayLabels(7)]
  const queries = dateLabels.flatMap((dateSeen) =>
    DAY_TIME_CHUNKS.map((timeChunk) =>
      buildLocationHistoryQuery({ dateSeen, timeChunk })
    )
  )

  const results = await Promise.allSettled(
    queries.map((daxQuery) =>
      executeQuery(dashboard.dataset_name, daxQuery, CACHE_TTL_LOCATION_HISTORY, workspaceId)
    )
  )

  return {
    total: queries.length,
    succeeded: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length,
  }
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-warmup-secret')
  if (process.env.WARMUP_SECRET && secret !== process.env.WARMUP_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { clientId?: string; dashboardKey?: string } = {}
  try {
    body = await request.json()
  } catch {
    // body is optional — defaults apply
  }

  const { clientId = 'carvision', dashboardKey = 'locationhistory' } = body

  try {
    const stats = await warmDashboard(clientId, dashboardKey)
    return Response.json({ status: 'done', ...stats })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
