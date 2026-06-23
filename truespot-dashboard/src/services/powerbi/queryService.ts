import 'server-only'
import axios from 'axios'
import { POWERBI_API_BASE, QUERY_TIMEOUT_MS } from '@/constants/api'
import { ExecuteQueriesResponseSchema } from '@/types/powerbi'
import { getAccessToken } from '@/services/auth/msalService'
import { resolveDatasetId } from '@/services/powerbi/datasetResolver'
import { getOrSet } from '@/services/cache/cacheService'
import { CACHE_TTL_EMPTY_ROWS } from '@/constants/cache'
import { withRetry } from '@/utils/retry'

async function callPowerBI(
  datasetName: string,
  daxQuery: string
): Promise<Record<string, unknown>[][]> {
  const workspaceId = process.env.FABRIC_WORKSPACE_ID
  if (!workspaceId) throw new Error('FABRIC_WORKSPACE_ID is not set')

  const [token, datasetId] = await Promise.all([
    getAccessToken(),
    resolveDatasetId(datasetName),
  ])

  const url = `${POWERBI_API_BASE}/groups/${workspaceId}/datasets/${datasetId}/executeQueries`
  const body = {
    queries: [{ query: daxQuery }],
    serializerSettings: { includeNulls: true },
  }

  try {
    const response = await withRetry(() =>
      axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: QUERY_TIMEOUT_MS,
      })
    )
    const parsed = ExecuteQueriesResponseSchema.parse(response.data)
    return parsed.results[0]?.tables.map((t) => t.rows) ?? []
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const detail = JSON.stringify(err.response?.data ?? err.message)
      throw new Error(`Power BI API error: ${detail}`)
    }
    throw err
  }
}

// Single EVALUATE — returns the first result table.
export async function executeQuery(
  datasetName: string,
  daxQuery: string,
  ttlSeconds: number
): Promise<Record<string, unknown>[]> {
  return getOrSet(`query:${datasetName}:${daxQuery}`, ttlSeconds, async () => {
    const tables = await callPowerBI(datasetName, daxQuery)
    return tables[0] ?? []
  }, CACHE_TTL_EMPTY_ROWS)
}

// Multiple EVALUATEs in one API call — returns one row-array per EVALUATE.
// Reduces N API round-trips (one per filter column) down to 1.
export async function executeBatchQuery(
  datasetName: string,
  daxQuery: string,
  ttlSeconds: number
): Promise<Record<string, unknown>[][]> {
  return getOrSet(`batchq:${datasetName}:${daxQuery}`, ttlSeconds, async () => {
    return callPowerBI(datasetName, daxQuery)
  })
}
