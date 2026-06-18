import 'server-only'
import axios from 'axios'
import { POWERBI_API_BASE, REQUEST_TIMEOUT_MS } from '@/constants/api'
import { CACHE_TTL_DATASETS } from '@/constants/cache'
import { DatasetsResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'
import { getOrSet } from '@/services/cache/cacheService'

async function fetchDatasets(workspaceId: string) {
  const token = await getAccessToken()

  const response = await axios.get(
    `${POWERBI_API_BASE}/groups/${workspaceId}/datasets`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    }
  )

  return DatasetsResponseSchema.parse(response.data).value
}

export async function resolveDatasetId(datasetName: string): Promise<string> {
  const workspaceId = process.env.FABRIC_WORKSPACE_ID
  if (!workspaceId) throw new Error('FABRIC_WORKSPACE_ID is not set')

  const datasets = await getOrSet(
    `datasets:${workspaceId}`,
    CACHE_TTL_DATASETS,
    () => fetchDatasets(workspaceId)
  )

  const match = datasets.find((d) => d.name === datasetName)
  if (!match) {
    throw new Error(
      `Dataset "${datasetName}" not found in workspace ${workspaceId}. Check dataset_name in client config matches the exact name in Fabric.`
    )
  }

  return match.id
}
