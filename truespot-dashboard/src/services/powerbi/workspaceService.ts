import 'server-only'
import axios from 'axios'
import { POWERBI_API_BASE, REQUEST_TIMEOUT_MS } from '@/constants/api'
import { CACHE_TTL_DATASETS } from '@/constants/cache'
import { WorkspacesResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'
import { getOrSet } from '@/services/cache/cacheService'
import { withRetry } from '@/utils/retry'

async function fetchWorkspaces() {
  const token = await getAccessToken()

  const response = await withRetry(() =>
    axios.get(`${POWERBI_API_BASE}/groups`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    })
  )

  return WorkspacesResponseSchema.parse(response.data).value
}

export async function resolveWorkspaceId(workspaceName: string): Promise<string> {
  const workspaces = await getOrSet(
    'workspaces:all',
    CACHE_TTL_DATASETS,
    fetchWorkspaces
  )

  const match = workspaces.find((w) => w.name === workspaceName)
  if (!match) {
    throw new Error(
      `Workspace "${workspaceName}" not found. Check workspace_name in dashboard config matches the exact name in Fabric.`
    )
  }

  return match.id
}
