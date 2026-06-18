export const dynamic = 'force-dynamic'

import axios from 'axios'
import { POWERBI_API_BASE, REQUEST_TIMEOUT_MS } from '@/constants/api'
import { DatasetsResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'

interface CheckResult {
  status: 'ok' | 'fail'
  error?: string
}

interface FabricCheckResult extends CheckResult {
  datasetCount?: number
}

export async function GET() {
  const workspaceId = process.env.FABRIC_WORKSPACE_ID

  const [authCheck, fabricCheck] = await Promise.allSettled([
    checkAuth(),
    checkFabric(workspaceId),
  ])

  const auth: CheckResult =
    authCheck.status === 'fulfilled'
      ? authCheck.value
      : { status: 'fail', error: String(authCheck.reason) }

  const fabric: FabricCheckResult =
    fabricCheck.status === 'fulfilled'
      ? fabricCheck.value
      : { status: 'fail', error: String(fabricCheck.reason) }

  const overallOk = auth.status === 'ok' && fabric.status === 'ok'

  return Response.json(
    {
      status: overallOk ? 'ok' : 'degraded',
      checks: { auth, fabric },
      timestamp: new Date().toISOString(),
    },
    { status: overallOk ? 200 : 503 }
  )
}

async function checkAuth(): Promise<CheckResult> {
  try {
    await getAccessToken()
    return { status: 'ok' }
  } catch (err) {
    return { status: 'fail', error: String(err) }
  }
}

async function checkFabric(workspaceId: string | undefined): Promise<FabricCheckResult> {
  if (!workspaceId) {
    return { status: 'fail', error: 'FABRIC_WORKSPACE_ID is not set' }
  }

  try {
    const token = await getAccessToken()
    const response = await axios.get(`${POWERBI_API_BASE}/groups/${workspaceId}/datasets`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    })
    const { value } = DatasetsResponseSchema.parse(response.data)
    return { status: 'ok', datasetCount: value.length }
  } catch (err) {
    return { status: 'fail', error: String(err) }
  }
}
