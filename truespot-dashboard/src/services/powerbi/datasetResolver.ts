import 'server-only'
import axios from 'axios'
import { POWERBI_API_BASE, REQUEST_TIMEOUT_MS } from '@/constants/api'
import { CACHE_TTL_DATASETS } from '@/constants/cache'
import { DatasetsResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'
import { getOrSet } from '@/services/cache/cacheService'
import { withRetry } from '@/utils/retry'

async function fetchDatasets(workspaceId: string) {
  const token = await getAccessToken()

  const response = await withRetry(() =>
    axios.get(`${POWERBI_API_BASE}/groups/${workspaceId}/datasets`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    })
  )

  return DatasetsResponseSchema.parse(response.data).value
}

export async function resolveDatasetId(datasetName: string, workspaceId?: string): Promise<string> {
  const resolvedWorkspaceId = workspaceId ?? process.env.FABRIC_WORKSPACE_ID
  if (!resolvedWorkspaceId) throw new Error('FABRIC_WORKSPACE_ID is not set')

  const datasets = await getOrSet(
    `datasets:${resolvedWorkspaceId}`,
    CACHE_TTL_DATASETS,
    () => fetchDatasets(resolvedWorkspaceId)
  )

  const match = datasets.find((d) => d.name === datasetName)
  if (!match) {
    throw new Error(
      `Dataset "${datasetName}" not found in workspace ${resolvedWorkspaceId}. Check dataset_name in client config matches the exact name in Fabric.`
    )
  }

  return match.id
}
