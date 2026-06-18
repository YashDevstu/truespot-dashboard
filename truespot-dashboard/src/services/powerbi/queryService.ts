import 'server-only'
import axios from 'axios'
import { POWERBI_API_BASE, QUERY_TIMEOUT_MS } from '@/constants/api'
import { ExecuteQueriesResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'
import { resolveDatasetId } from '@/services/powerbi/datasetResolver'
import { getOrSet } from '@/services/cache/cacheService'

export async function executeQuery(
  datasetName: string,
  daxQuery: string,
  ttlSeconds: number
): Promise<Record<string, unknown>[]> {
  const workspaceId = process.env.FABRIC_WORKSPACE_ID
  if (!workspaceId) throw new Error('FABRIC_WORKSPACE_ID is not set')

  return getOrSet(
    `query:${datasetName}:${daxQuery}`,
    ttlSeconds,
    async () => {
      const [token, datasetId] = await Promise.all([
        getAccessToken(),
        resolveDatasetId(datasetName),
      ])

      let response
      try {
        response = await axios.post(
          `${POWERBI_API_BASE}/groups/${workspaceId}/datasets/${datasetId}/executeQueries`,
          {
            queries: [{ query: daxQuery }],
            serializerSettings: { includeNulls: true },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: QUERY_TIMEOUT_MS,
          }
        )
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const detail = JSON.stringify(err.response?.data ?? err.message)
          throw new Error(`Power BI API ${err.response?.status ?? 'error'}: ${detail}`)
        }
        throw err
      }

      const parsed = ExecuteQueriesResponseSchema.parse(response.data)
      return parsed.results[0]?.tables[0]?.rows ?? []
    }
  )
}
