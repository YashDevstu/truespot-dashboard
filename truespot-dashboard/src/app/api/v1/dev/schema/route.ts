import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { POWERBI_API_BASE, REQUEST_TIMEOUT_MS } from '@/constants/api'
import { getAccessToken } from '@/services/auth/msalService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { resolveDatasetId } from '@/services/powerbi/datasetResolver'

// Dev-only schema discovery route — DELETE after use.
// Probes known table names via TOPN(1) DAX queries to discover column structure.
//
// GET /api/v1/dev/schema?workspace=Health+-+Egress+Asset+Activity&dataset=Egress+Asset+Activity+-+BSA
// ?tables=PAgg,HealthAsset,Duration+at+Loc1,MidNightTime,AppendFinal,LocationChanged,Recovered

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const workspaceName = req.nextUrl.searchParams.get('workspace')
  const datasetName   = req.nextUrl.searchParams.get('dataset')
  const tablesParam   = req.nextUrl.searchParams.get('tables')

  if (!workspaceName) {
    return NextResponse.json({ error: 'Missing ?workspace= parameter' }, { status: 400 })
  }

  // If no dataset specified — just list datasets in the workspace
  if (!datasetName) {
    const token = await getAccessToken()
    const workspaceId = await resolveWorkspaceId(workspaceName)
    const r = await axios.get(`${POWERBI_API_BASE}/groups/${workspaceId}/datasets`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: REQUEST_TIMEOUT_MS,
    })
    return NextResponse.json({ workspace: workspaceName, workspaceId, datasets: r.data.value.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })) })
  }

  // In verify mode: run specific sanity-check queries instead of table probes
  const verify = req.nextUrl.searchParams.get('verify') === '1'

  try {
    const [token, workspaceId] = await Promise.all([
      getAccessToken(),
      resolveWorkspaceId(workspaceName),
    ])

    const resolvedDatasetId = await resolveDatasetId(datasetName, workspaceId)

    const url = `${POWERBI_API_BASE}/groups/${workspaceId}/datasets/${resolvedDatasetId}/executeQueries`
    const post = (query: string) =>
      axios.post(
        url,
        { queries: [{ query }], serializerSettings: { includeNulls: true } },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: REQUEST_TIMEOUT_MS }
      )

    if (verify) {
      // Sanity checks — verify data completeness and accuracy
      const checks = await Promise.allSettled([
        // 1. Distinct AssetStatus values
        post(`EVALUATE DISTINCT(SELECTCOLUMNS(AppendFinal, "AssetStatus", AppendFinal[AssetStatus]))`),
        // 2. Total distinct assets (VINs) in AppendFinal
        post(`EVALUATE ROW("TotalAssets", DISTINCTCOUNT(AppendFinal[VIN]))`),
        // 3. Asset count by AssetStatus
        post(`EVALUATE GROUPBY(AppendFinal, AppendFinal[AssetStatus], "Count", COUNTX(CURRENTGROUP(), AppendFinal[VIN]))`),
        // 4. Sample of DISTINCT SubGeoZone values (top 20 by frequency)
        post(`EVALUATE TOPN(20, GROUPBY(AppendFinal, AppendFinal[SubGeoZone], "Count", COUNTX(CURRENTGROUP(), AppendFinal[VIN])), [Count], 0)`),
        // 5. Distinct AssetType values + counts
        post(`EVALUATE GROUPBY(AppendFinal, AppendFinal[AssetType], "Count", COUNTX(CURRENTGROUP(), AppendFinal[VIN]))`),
        // 6. Total row count in AppendFinal
        post(`EVALUATE ROW("RowCount", COUNTROWS(AppendFinal))`),
        // 7. Compare: total distinct VINs in HealthAsset (the master list) vs AppendFinal
        post(`EVALUATE ROW("HealthAssetCount", DISTINCTCOUNT(HealthAsset[AssetId]))`),
      ])

      const labels = ['distinctAssetStatus', 'totalDistinctAssets', 'countByStatus', 'topSubGeoZones', 'assetTypes', 'totalRows', 'healthAssetMasterCount']
      const results = checks.map((r, i) => ({
        check: labels[i],
        status: r.status,
        rows: r.status === 'fulfilled' ? (r.value.data?.results?.[0]?.tables?.[0]?.rows ?? []) : [],
        error: r.status === 'rejected' ? String(r.reason) : undefined,
      }))

      return NextResponse.json({ workspace: workspaceName, dataset: datasetName, verificationChecks: results })
    }

    // Tables to probe — pass via ?tables= or use defaults
    const tablesToProbe = tablesParam
      ? tablesParam.split(',').map((t) => t.trim())
      : ['PAgg', 'HealthAsset', 'Duration at Loc1', 'MidNightTime', 'AppendFinal',
         'LocationChanged', 'Recovered', 'RecoveredAssets', 'Location History', 'Maintenance', 'Post-Aggregate-csv']

    // Probe each table — TOPN(3) returns a few rows so we can see column names and sample values
    const results = await Promise.all(
      tablesToProbe.map(async (table) => {
        try {
          const r = await post(`EVALUATE TOPN(3, '${table}')`)
          const rows: Record<string, unknown>[] = r.data?.results?.[0]?.tables?.[0]?.rows ?? []
          const columns = rows.length > 0 ? Object.keys(rows[0]) : []
          return { table, status: 'ok', columns, sampleRows: rows }
        } catch (err: unknown) {
          const msg = axios.isAxiosError(err)
            ? (err.response?.data?.error?.pbi?.error?.details?.[0]?.detail?.value ?? err.message)
            : String(err)
          return { table, status: 'error', error: msg, columns: [] }
        }
      })
    )

    return NextResponse.json({
      workspace: workspaceName,
      workspaceId,
      dataset: datasetName,
      datasetId: resolvedDatasetId,
      tables: results,
    })
  } catch (err: unknown) {
    const detail = axios.isAxiosError(err)
      ? JSON.stringify(err.response?.data ?? err.message)
      : String(err)
    return NextResponse.json({ error: detail }, { status: 500 })
  }
}
