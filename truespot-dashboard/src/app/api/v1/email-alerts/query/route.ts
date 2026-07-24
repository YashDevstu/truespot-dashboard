export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_CHARTS } from '@/constants/cache'
import { buildEmailAlertRowsQuery } from '@/utils/daxEmailAlerts'

interface EmailAlertsQueryBody {
  clientId: string
  dashboardKey: string
}

export async function POST(request: NextRequest) {
  let body: EmailAlertsQueryBody
  try {
    body = (await request.json()) as EmailAlertsQueryBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, dashboardKey } = body

  if (!clientId || !dashboardKey) {
    return Response.json(
      { error: 'clientId and dashboardKey are required' },
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

  if (!dashboard.mail_table || !dashboard.mail_no_assets_column) {
    return Response.json(
      { error: `Dashboard "${dashboardKey}" is missing mail_table/mail_no_assets_column config` },
      { status: 500 }
    )
  }

  const workspaceId = dashboard.workspace_name
    ? await resolveWorkspaceId(dashboard.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? '')

  if (!workspaceId) {
    return Response.json({ error: 'Workspace could not be resolved' }, { status: 500 })
  }

  const daxQuery = buildEmailAlertRowsQuery(
    dashboard.mail_table,
    dashboard.mail_no_assets_column,
    dashboard.mail_has_utc_columns,
    dashboard.mail_utc_correction_minutes
  )

  try {
    const rows = await executeQuery(dashboard.dataset_name, daxQuery, CACHE_TTL_CHARTS, workspaceId)
    return Response.json({ rows })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
