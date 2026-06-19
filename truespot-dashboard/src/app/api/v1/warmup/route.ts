export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { executeQuery } from '@/services/powerbi/queryService'
import { buildLocationHistoryQuery, DAY_TIME_CHUNKS } from '@/utils/dax'
import { getClientConfig } from '@/services/config/clientConfigService'
import { CACHE_TTL_LOCATION_HISTORY } from '@/constants/cache'

// Generates last 6 day labels in MM/DD/YY format matching [Last Seen-Local] date values
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

// Pre-fills the cache for all 28 time-chunk queries (7 days × 4 chunks) for a given dashboard.
// Called by Vercel Cron every 2 hours to ensure users always hit a warm cache.
async function warmDashboard(clientId: string, dashboardKey: string, panelId: string) {
  const config = getClientConfig(clientId)
  const dashboard = config.dashboards[dashboardKey]
  if (!dashboard) throw new Error(`Dashboard "${dashboardKey}" not found`)

  const dateLabels = ['Today', ...lastNDayLabels(6)]

  const queries = dateLabels.flatMap((dateSeen) =>
    DAY_TIME_CHUNKS.map((timeChunk) => ({
      dateSeen,
      timeChunk,
      daxQuery: buildLocationHistoryQuery({ dateSeen, timeChunk }),
    }))
  )

  const results = await Promise.allSettled(
    queries.map(({ daxQuery }) =>
      executeQuery(dashboard.dataset_name, daxQuery, CACHE_TTL_LOCATION_HISTORY)
    )
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  return { total: queries.length, succeeded, failed }
}

// POST /api/v1/warmup
// Body: { clientId: string, dashboardKey: string, panelId: string }
// Called by Vercel Cron — returns once all 28 chunk queries are cached
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-warmup-secret')
  if (process.env.WARMUP_SECRET && secret !== process.env.WARMUP_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { clientId?: string; dashboardKey?: string; panelId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId = 'carvision', dashboardKey = 'locationhistory', panelId = 'location-history-data' } = body

  try {
    const stats = await warmDashboard(clientId, dashboardKey, panelId)
    return Response.json({ status: 'done', ...stats })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
