export const dynamic = 'force-dynamic'
export const maxDuration = 300

import type { NextRequest } from 'next/server'
import { getClientConfig } from '@/services/config/clientConfigService'
import { executeQuery } from '@/services/powerbi/queryService'
import { resolveWorkspaceId } from '@/services/powerbi/workspaceService'
import { CACHE_TTL_KPIS, CACHE_TTL_CHARTS } from '@/constants/cache'
import {
  buildIHUtilisationQuery,
  buildIHFloorDistributionQuery,
  buildIHCleaningLoopQuery,
  buildIHHidingSpotsQuery,
  buildIHBuildingOptionsQuery,
  buildIHBuildingOptionsLHQuery,
  buildIHAssetTypeOptionsQuery,
  buildIHAssetTypeOptionsLHQuery,
  buildIHAssetTypeUtilisationQuery,
  buildIHWeeklyTrendQuery,
  buildIHWeeklyTrendGFQuery,
  buildIHLocationCategoryQuery,
  buildIHLocationCategoryGFQuery,
  buildIHCategoryAssetsQuery,
  buildIHCategoryAssetsGFQuery,
  buildIHFloorReadinessQuery,
  buildIHFloorReadinessByTypeQuery,
  buildIHFloorAssetsQuery,
  buildIHFloorHourlyQuery,
  buildIHAssetTrailQuery,
  buildIHHourlyQuery,
  buildIHRefreshTimeQuery,
  buildIHUtilisationLHQuery,
  buildIHAssetTypeUtilisationLHQuery,
  buildIHHourlyLHQuery,
  buildIHRefreshTimeLHQuery,
  buildIHPeakUtilisationLHQuery,
  buildIHUtilisationGFQuery,
  buildIHUtilisationHoursGFQuery,
  buildIHHourlyByDayGFQuery,
  buildIHAssetTypeUtilisationGFQuery,
  buildIHHidingSpotsGFQuery,
  buildIHRefreshTimeGFQuery,
  buildIHPeakUtilisationGFQuery,
  buildIHDailyPeakGFQuery,
  buildIHCategoryDailyQuery,
  buildIHCategoryDailyGFQuery,
  type InsightHubFilters,
} from '@/utils/daxInsightHub'
import type { FloorParConfig } from '@/types/dashboard'

type IHQueryType =
  | 'utilisation'
  | 'peak-utilisation'
  | 'hourly-utilisation'
  | 'daily-peak'
  | 'floor-distribution'
  | 'floor-readiness'
  | 'floor-readiness-by-type'
  | 'floor-daily-trend'
  | 'floor-assets'
  | 'floor-hourly'
  | 'asset-trail'
  | 'cleaning-loop'
  | 'hiding-spots'
  | 'asset-type-options'
  | 'floor-options'
  | 'department-options'
  | 'building-options'
  | 'asset-type-utilisation'
  | 'weekly-trend'
  | 'location-category-summary'
  | 'location-category-assets'
  | 'location-category-daily'
  | 'refresh-time'

interface IHQueryBody {
  clientId:     string
  dashboardKey: string
  queryType:    IHQueryType
  filters?:     InsightHubFilters
  dayOffset?:   number  // for hourly-by-day: 0=today, 1=yesterday (default), …, 6
}

// ── LH-based detection helper ────────────────────────────────────────────────
// Returns true when the insighthub dashboard shares the same workspace+dataset
// as the locationhistory dashboard — meaning it only has AppendFinal, no Post-Aggregate.

function isLHBased(
  dashboard: { workspace_name?: string; dataset_name: string },
  lhDash:    { workspace_name?: string; dataset_name: string } | undefined,
): boolean {
  if (!lhDash) return false
  return (
    lhDash.dataset_name   === dashboard.dataset_name &&
    lhDash.workspace_name === dashboard.workspace_name
  )
}

// ── Par resolution ────────────────────────────────────────────────────────────
// Resolves par for a given (floor, assetType) pair using the priority:
//   1. floors[floor].by_type[assetType]  — most specific
//   2. floors[floor].par                 — floor-level default
//   3. parConfig.default                 — global fallback

function resolveFloorPar(
  floor:     string,
  assetType: string | undefined,
  parConfig: FloorParConfig,
): number {
  const PAR_DEFAULT = parConfig.default ?? 5
  const floorCfg   = parConfig.floors?.[floor]
  if (!floorCfg) return PAR_DEFAULT
  if (assetType && floorCfg.by_type?.[assetType] !== undefined) {
    return floorCfg.by_type[assetType]!
  }
  return floorCfg.par ?? PAR_DEFAULT
}

// ── Floor readiness server-side computation ───────────────────────────────────
// DAX returns (Floor, Date, VIN) triples — one row per unique combination so
// each asset is counted once per floor per day. We group by (floor, date),
// count VINs (= distinct assets that day), then apply par thresholds.
// assetType is the active filter value — used to pick the correct per-type par.

function computeFloorReadiness(
  rawRows:   Record<string, unknown>[],
  parConfig: FloorParConfig,
  assetType: string | undefined,
): Record<string, unknown>[] {
  const TIGHT_PCT = parConfig.tight_pct ?? 0.7

  // Group: floor → date → Set<VIN>
  const byFloor = new Map<string, Map<string, Set<string>>>()
  const allVINs  = new Set<string>()

  for (const row of rawRows) {
    const floor = String(row['[Floor]'] ?? '').trim()
    const date  = String(row['[Date]']  ?? '').trim()
    const vin   = String(row['[VIN]']   ?? '').trim()
    if (!floor || !date || !vin) continue
    allVINs.add(vin)
    if (!byFloor.has(floor)) byFloor.set(floor, new Map())
    const dateMap = byFloor.get(floor)!
    if (!dateMap.has(date)) dateMap.set(date, new Set())
    dateMap.get(date)!.add(vin)
  }

  const totalVINs = allVINs.size
  const result: Record<string, unknown>[] = []

  for (const [floor, dateMap] of byFloor) {
    const par      = resolveFloorPar(floor, assetType, parConfig)
    const tightMin = par * TIGHT_PCT

    let daysEnough = 0, daysTight = 0, daysShort = 0
    let totalCount = 0, minCount = Infinity

    for (const vinSet of dateMap.values()) {
      const count = vinSet.size
      totalCount += count
      minCount    = Math.min(minCount, count)
      if (count >= par)       daysEnough++
      else if (count >= tightMin) daysTight++
      else                    daysShort++
    }

    const totalDays = dateMap.size
    const avgCount  = totalDays > 0 ? Math.round(totalCount / totalDays) : 0

    // Floor status: short if ran short 2+ days; tight if short once or tight 3+ days
    const status: 'enough' | 'tight' | 'short' =
      daysShort >= 2              ? 'short' :
      daysShort >= 1 || daysTight >= 3 ? 'tight' :
      'enough'

    result.push({
      '[Floor]':      floor,
      '[Status]':     status,
      '[Par]':        par,
      '[DaysEnough]': daysEnough,
      '[DaysTight]':  daysTight,
      '[DaysShort]':  daysShort,
      '[TotalDays]':  totalDays,
      '[AvgCount]':   avgCount,
      '[MinCount]':   minCount === Infinity ? 0 : minCount,
      '[TotalVINs]':  totalVINs,
    })
  }

  return result
}

// Aggregates (AssetType, Floor, Date, VIN) tuples into per-asset-type floor stats.
// resolveFloorPar is called per (floor, assetType) so each type gets the correct par.
function computeFloorReadinessByType(
  rawRows: Record<string, unknown>[],
  parConfig: FloorParConfig,
): Record<string, unknown>[] {
  const TIGHT_PCT = parConfig.tight_pct ?? 0.7

  // byType → floor → date → Set<VIN>
  const byType = new Map<string, Map<string, Map<string, Set<string>>>>()
  const vinsByType = new Map<string, Set<string>>()

  for (const row of rawRows) {
    const assetType = String(row['[AssetType]'] ?? '').trim()
    const floor     = String(row['[Floor]']     ?? '').trim()
    const date      = String(row['[Date]']      ?? '').trim()
    const vin       = String(row['[VIN]']       ?? '').trim()
    if (!assetType || !floor || !date || !vin) continue

    if (!byType.has(assetType)) byType.set(assetType, new Map())
    const byFloor = byType.get(assetType)!
    if (!byFloor.has(floor)) byFloor.set(floor, new Map())
    const byDate = byFloor.get(floor)!
    if (!byDate.has(date)) byDate.set(date, new Set())
    byDate.get(date)!.add(vin)

    if (!vinsByType.has(assetType)) vinsByType.set(assetType, new Set())
    vinsByType.get(assetType)!.add(vin)
  }

  const result: Record<string, unknown>[] = []

  for (const [assetType, byFloor] of byType) {
    let enoughFloors = 0, tightFloors = 0, shortFloors = 0
    let totalFloorDays = 0, metFloorDays = 0

    for (const [floor, byDate] of byFloor) {
      const par      = resolveFloorPar(floor, assetType, parConfig)
      const tightMin = par * TIGHT_PCT
      let daysEnough = 0, daysTight = 0, daysShort = 0

      for (const vinSet of byDate.values()) {
        const count = vinSet.size
        if (count >= par)           daysEnough++
        else if (count >= tightMin) daysTight++
        else                        daysShort++
      }

      const totalDays = byDate.size
      totalFloorDays += totalDays
      metFloorDays   += daysEnough

      const status: 'enough' | 'tight' | 'short' =
        daysShort >= 2              ? 'short' :
        daysShort >= 1 || daysTight >= 3 ? 'tight' :
        'enough'

      if (status === 'enough') enoughFloors++
      else if (status === 'tight') tightFloors++
      else shortFloors++
    }

    const totalFloors = byFloor.size
    const pctMet = totalFloorDays > 0 ? Math.round((metFloorDays / totalFloorDays) * 100) : 0

    result.push({
      '[AssetType]':    assetType,
      '[TotalFloors]':  totalFloors,
      '[EnoughFloors]': enoughFloors,
      '[TightFloors]':  tightFloors,
      '[ShortFloors]':  shortFloors,
      '[PctMet]':       pctMet,
      '[TotalVINs]':    vinsByType.get(assetType)?.size ?? 0,
    })
  }

  // Sort by pctMet descending
  return result.sort((a, b) => (b['[PctMet]'] as number) - (a['[PctMet]'] as number))
}

// Aggregates (Floor, Date, VIN) tuples into per-day pctMet values.
// Same raw data as computeFloorReadiness but grouped by date instead of floor.
function computeFloorDailyTrend(
  rawRows:   Record<string, unknown>[],
  parConfig: FloorParConfig,
  assetType: string | undefined,
): Record<string, unknown>[] {
  // byDate → floor → Set<VIN>
  const byDate = new Map<string, Map<string, Set<string>>>()

  for (const row of rawRows) {
    const floor = String(row['[Floor]'] ?? '').trim()
    const date  = String(row['[Date]']  ?? '').trim()
    const vin   = String(row['[VIN]']   ?? '').trim()
    if (!floor || !date || !vin) continue
    if (!byDate.has(date)) byDate.set(date, new Map())
    const floorMap = byDate.get(date)!
    if (!floorMap.has(floor)) floorMap.set(floor, new Set())
    floorMap.get(floor)!.add(vin)
  }

  const result: Record<string, unknown>[] = []

  for (const [date, floorMap] of byDate) {
    let enoughFloors = 0
    const totalFloors = floorMap.size

    for (const [floor, vinSet] of floorMap) {
      const par = resolveFloorPar(floor, assetType, parConfig)
      if (vinSet.size >= par) enoughFloors++
    }

    const pctMet = totalFloors > 0 ? Math.round((enoughFloors / totalFloors) * 100) : 0
    result.push({
      '[Date]':         date,
      '[PctMet]':       pctMet,
      '[EnoughFloors]': enoughFloors,
      '[TotalFloors]':  totalFloors,
    })
  }

  // Return chronological order
  return result.sort((a, b) => String(a['[Date]']).localeCompare(String(b['[Date]'])))
}

export async function POST(request: NextRequest) {
  let body: IHQueryBody
  try {
    body = (await request.json()) as IHQueryBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, dashboardKey, queryType, filters = {}, dayOffset = 1 } = body

  if (!clientId || !dashboardKey || !queryType) {
    return Response.json(
      { error: 'clientId, dashboardKey, and queryType are required' },
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

  const workspaceId = dashboard.workspace_name
    ? await resolveWorkspaceId(dashboard.workspace_name)
    : (process.env.FABRIC_WORKSPACE_ID ?? '')

  if (!workspaceId) {
    return Response.json({ error: 'Workspace could not be resolved' }, { status: 500 })
  }

  const isGeofenceBased = dashboard.classification === 'geofence'

  let daxQuery: string
  let ttl: number

  switch (queryType) {
    case 'utilisation': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHUtilisationLHQuery(filters), CACHE_TTL_KPIS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      if (isGeofenceBased) {
        // Count-based snapshot from Post-Aggregate + hours-based % from AppendFinal
        try {
          const rows = await executeQuery(dashboard.dataset_name, buildIHUtilisationGFQuery(filters), CACHE_TTL_KPIS, workspaceId)
          const lhDash = clientConfig.dashboards['locationhistory']
          if (lhDash) {
            const lhWorkspaceId = lhDash.workspace_name
              ? await resolveWorkspaceId(lhDash.workspace_name)
              : (process.env.FABRIC_WORKSPACE_ID ?? '')
            try {
              const hoursRows = await executeQuery(lhDash.dataset_name, buildIHUtilisationHoursGFQuery(filters), CACHE_TTL_KPIS, lhWorkspaceId)
              if (rows.length > 0 && hoursRows.length > 0) {
                rows[0]['[HoursBasedPct]'] = hoursRows[0]['[HoursBasedPct]']
              }
            } catch { /* hours query failure is non-fatal — % falls back to count-based */ }
          }
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      daxQuery = buildIHUtilisationQuery(filters)
      ttl = CACHE_TTL_KPIS
      break
    }
    case 'peak-utilisation': {
      // GF clients (Halifax): use 5-zone patient definition — consistent with all other GF queries.
      // Non-GF LH clients: use 18-zone patientCondLH() definition.
      // Pure Post-Aggregate clients with no locationhistory dashboard return empty (hook falls back to withPatient).
      const lhDash = clientConfig.dashboards['locationhistory']
      if (lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        const peakQuery = isGeofenceBased
          ? buildIHPeakUtilisationGFQuery(filters)
          : buildIHPeakUtilisationLHQuery(filters)
        try {
          const rows = await executeQuery(lhDash.dataset_name, peakQuery, CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      // No location history at all — return empty so hook falls back to withPatient count
      return Response.json({ rows: [] })
    }
    case 'hourly-utilisation': {
      const lhDash = clientConfig.dashboards['locationhistory']
      // GF clients (Halifax): per-day hourly from AppendFinal — shows real session history
      if (isGeofenceBased && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHHourlyByDayGFQuery(filters, dayOffset), CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      // Pure LH clients (BSA subset): average hourly across last 7 days from AppendFinal
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHHourlyLHQuery(filters), CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      // Post-Aggregate clients (BSA): snapshot-based hourly
      daxQuery = buildIHHourlyQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'daily-peak': {
      // Returns up to 7 rows: max concurrent VINs in GF patient zones per calendar day.
      // Non-GF clients return empty — UI keeps showing WeeklyTrendChart for them.
      if (!isGeofenceBased) return Response.json({ rows: [] })
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) return Response.json({ rows: [] })
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')
      try {
        const rows = await executeQuery(lhDash.dataset_name, buildIHDailyPeakGFQuery(filters), CACHE_TTL_CHARTS, lhWorkspaceId)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-distribution':
      daxQuery = buildIHFloorDistributionQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'cleaning-loop':
      // Halifax Post-Aggregate has no HourGrp/HourGrpSort columns — skip rather than error
      if (isGeofenceBased) return Response.json({ rows: [] })
      daxQuery = buildIHCleaningLoopQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'hiding-spots':
      daxQuery = isGeofenceBased ? buildIHHidingSpotsGFQuery(filters) : buildIHHidingSpotsQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    case 'asset-type-options': {
      // Clients whose insighthub dataset lives in the Location History Portal
      // (e.g. Halifax) have AppendFinal but no Post-Aggregate table.
      // Detect by checking if the insighthub workspace matches the LH workspace.
      const lhDash = clientConfig.dashboards['locationhistory']
      const isLHBased =
        lhDash &&
        lhDash.dataset_name === dashboard.dataset_name &&
        lhDash.workspace_name === dashboard.workspace_name

      if (isLHBased && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHAssetTypeOptionsLHQuery(), CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }

      daxQuery = buildIHAssetTypeOptionsQuery()
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'floor-options': {
      // Return distinct floor values.
      // Strategy:
      //   1. GF clients (Halifax): Post-Aggregate[Floor] in insighthub workspace (same table as utilisation).
      //      Fall back to AppendFinal[Floor Level] in locationhistory workspace if that fails.
      //   2. LH-based non-GF clients (same workspace as locationhistory): AppendFinal[Floor Level].
      //   3. Post-Aggregate-only clients: Post-Aggregate[Floor] in insighthub workspace.
      const lhDash = clientConfig.dashboards['locationhistory']
      if (isGeofenceBased) {
        // Try Post-Aggregate[Floor] first (same table as utilisation query)
        const paDax = `EVALUATE\nSELECTCOLUMNS(\n  FILTER(\n    DISTINCT(SELECTCOLUMNS('Post-Aggregate', "value", 'Post-Aggregate'[Floor])),\n    NOT ISBLANK([value]) && [value] <> ""\n  ),\n  "value", [value]\n)\nORDER BY [value] ASC`
        try {
          const rows = await executeQuery(dashboard.dataset_name, paDax, CACHE_TTL_CHARTS, workspaceId)
          if (rows.length > 0) return Response.json({ rows })
        } catch { /* fall through to AppendFinal */ }
        // Fallback: AppendFinal[Floor Level] in locationhistory workspace
        if (lhDash) {
          const lhWorkspaceId = lhDash.workspace_name
            ? await resolveWorkspaceId(lhDash.workspace_name)
            : (process.env.FABRIC_WORKSPACE_ID ?? '')
          const lhDax = `EVALUATE\nSELECTCOLUMNS(\n  FILTER(\n    DISTINCT(SELECTCOLUMNS(AppendFinal, "value", AppendFinal[Floor Level])),\n    NOT ISBLANK([value]) && [value] <> "" && [value] <> "Unknown"\n  ),\n  "value", [value]\n)\nORDER BY [value] ASC`
          try {
            const rows = await executeQuery(lhDash.dataset_name, lhDax, CACHE_TTL_CHARTS, lhWorkspaceId)
            return Response.json({ rows })
          } catch (err) {
            return Response.json({ error: String(err) }, { status: 500 })
          }
        }
        return Response.json({ rows: [] })
      }
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        const lhDax = `EVALUATE\nSELECTCOLUMNS(\n  FILTER(\n    DISTINCT(SELECTCOLUMNS(AppendFinal, "value", AppendFinal[Floor Level])),\n    NOT ISBLANK([value]) && [value] <> ""\n  ),\n  "value", [value]\n)\nORDER BY [value] ASC`
        try {
          const rows = await executeQuery(lhDash.dataset_name, lhDax, CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      // Post-Aggregate-only clients
      daxQuery = `EVALUATE\nSELECTCOLUMNS(\n  FILTER(\n    DISTINCT(SELECTCOLUMNS('Post-Aggregate', "value", 'Post-Aggregate'[Floor])),\n    NOT ISBLANK([value]) && [value] <> ""\n  ),\n  "value", [value]\n)\nORDER BY [value] ASC`
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'department-options': {
      // Distinct values of Post-Aggregate[My Department] from the insighthub workspace.
      // Applies to all client types — always queries the insighthub dataset directly.
      daxQuery = `EVALUATE\nSELECTCOLUMNS(\n  FILTER(\n    DISTINCT(SELECTCOLUMNS('Post-Aggregate', "value", 'Post-Aggregate'[My Department])),\n    NOT ISBLANK([value]) && [value] <> ""\n  ),\n  "value", [value]\n)\nORDER BY [value] ASC`
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'building-options': {
      // GF clients (Halifax): try Post-Aggregate[Building] from insighthub workspace first.
      // Fall back to AppendFinal[Building] from locationhistory workspace.
      // LH-based non-GF clients: use AppendFinal[Building] directly.
      const lhDash = clientConfig.dashboards['locationhistory']
      if (isGeofenceBased) {
        try {
          const rows = await executeQuery(dashboard.dataset_name, buildIHBuildingOptionsQuery(), CACHE_TTL_CHARTS, workspaceId)
          if (rows.length > 0) return Response.json({ rows })
        } catch { /* fall through to AppendFinal */ }
        if (lhDash) {
          const lhWorkspaceId = lhDash.workspace_name
            ? await resolveWorkspaceId(lhDash.workspace_name)
            : (process.env.FABRIC_WORKSPACE_ID ?? '')
          try {
            const rows = await executeQuery(lhDash.dataset_name, buildIHBuildingOptionsLHQuery(), CACHE_TTL_CHARTS, lhWorkspaceId)
            return Response.json({ rows })
          } catch (err) {
            return Response.json({ error: String(err) }, { status: 500 })
          }
        }
        return Response.json({ rows: [] })
      }
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHBuildingOptionsLHQuery(), CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      daxQuery = buildIHBuildingOptionsQuery()
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'asset-type-utilisation': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHAssetTypeUtilisationLHQuery(filters), CACHE_TTL_CHARTS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      daxQuery = isGeofenceBased ? buildIHAssetTypeUtilisationGFQuery(filters) : buildIHAssetTypeUtilisationQuery(filters)
      ttl = CACHE_TTL_CHARTS
      break
    }
    case 'weekly-trend':
    case 'location-category-summary':
    case 'location-category-assets': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      let lhDax: string
      if (queryType === 'weekly-trend')                    lhDax = isGeofenceBased ? buildIHWeeklyTrendGFQuery(filters) : buildIHWeeklyTrendQuery(filters)
      else if (queryType === 'location-category-summary')  lhDax = isGeofenceBased ? buildIHLocationCategoryGFQuery(filters) : buildIHLocationCategoryQuery(filters)
      else                                                 lhDax = isGeofenceBased ? buildIHCategoryAssetsGFQuery(filters) : buildIHCategoryAssetsQuery(filters)

      try {
        const rows = await executeQuery(lhDash.dataset_name, lhDax, CACHE_TTL_CHARTS, lhWorkspaceId)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'location-category-daily': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')
      const lhDax = isGeofenceBased
        ? buildIHCategoryDailyGFQuery(filters)
        : buildIHCategoryDailyQuery(filters)
      try {
        const rows = await executeQuery(lhDash.dataset_name, lhDax, CACHE_TTL_CHARTS, lhWorkspaceId)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-readiness': {
      // Queries AppendFinal in the Location History workspace.
      // Returns (Floor, Date, VIN) triples; server computes per-floor status
      // using par levels configured in the insighthub dashboard's floor_par.
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rawRows  = await executeQuery(
          lhDash.dataset_name,
          buildIHFloorReadinessQuery(filters),
          CACHE_TTL_CHARTS,
          lhWorkspaceId,
        )
        const parConfig: FloorParConfig = dashboard.floor_par ?? { default: 5, tight_pct: 0.7 }
        const rows = computeFloorReadiness(rawRows, parConfig, filters.assetType)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-readiness-by-type': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rawRows  = await executeQuery(
          lhDash.dataset_name,
          buildIHFloorReadinessByTypeQuery(),
          CACHE_TTL_CHARTS,
          lhWorkspaceId,
        )
        const parConfig: FloorParConfig = dashboard.floor_par ?? { default: 5, tight_pct: 0.7 }
        const rows = computeFloorReadinessByType(rawRows, parConfig)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-daily-trend': {
      // Reuses the same (Floor, Date, VIN) data as floor-readiness but aggregated per day.
      // Returns one row per day: { Date, PctMet, EnoughFloors, TotalFloors }.
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rawRows  = await executeQuery(
          lhDash.dataset_name,
          buildIHFloorReadinessQuery(filters),
          CACHE_TTL_CHARTS,
          lhWorkspaceId,
        )
        const parConfig: FloorParConfig = dashboard.floor_par ?? { default: 5, tight_pct: 0.7 }
        const rows = computeFloorDailyTrend(rawRows, parConfig, filters.assetType)
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-assets': {
      // Returns the most-recent session per VIN seen on the specified floor in the last 48 hours.
      // Server deduplicates because DAX TOPN returns multiple rows per VIN (one per session).
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      if (!filters.floor) {
        return Response.json({ error: 'floor filter is required for floor-assets' }, { status: 400 })
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rawRows = await executeQuery(
          lhDash.dataset_name,
          buildIHFloorAssetsQuery(filters.floor, filters.assetType),
          CACHE_TTL_CHARTS,
          lhWorkspaceId,
        )
        // Deduplicate: rows are sorted by LastSeen DESC, so the first occurrence of each VIN is the most recent session
        const seen = new Set<string>()
        const rows = rawRows.filter((row) => {
          const vin = String(row['[VIN]'] ?? '').trim()
          if (!vin || seen.has(vin)) return false
          seen.add(vin)
          return true
        })
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'floor-hourly': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      if (!filters.floor) {
        return Response.json({ error: 'floor filter is required for floor-hourly' }, { status: 400 })
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rows = await executeQuery(
          lhDash.dataset_name,
          buildIHFloorHourlyQuery(filters.floor, filters.assetType),
          CACHE_TTL_CHARTS,
          lhWorkspaceId,
        )
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'asset-trail': {
      // Returns all sessions for the specified VIN over the last 48 hours, sorted by PrevSeen ASC.
      const lhDash = clientConfig.dashboards['locationhistory']
      if (!lhDash) {
        return Response.json(
          { error: 'Location History dashboard not configured for this client' },
          { status: 404 }
        )
      }
      if (!filters.vin) {
        return Response.json({ error: 'vin filter is required for asset-trail' }, { status: 400 })
      }
      const lhWorkspaceId = lhDash.workspace_name
        ? await resolveWorkspaceId(lhDash.workspace_name)
        : (process.env.FABRIC_WORKSPACE_ID ?? '')

      try {
        const rows = await executeQuery(
          lhDash.dataset_name,
          buildIHAssetTrailQuery(filters),
          0,  // no cache — trail is always fresh for a specific asset
          lhWorkspaceId,
        )
        return Response.json({ rows })
      } catch (err) {
        return Response.json({ error: String(err) }, { status: 500 })
      }
    }
    case 'refresh-time': {
      const lhDash = clientConfig.dashboards['locationhistory']
      if (isLHBased(dashboard, lhDash) && lhDash) {
        const lhWorkspaceId = lhDash.workspace_name
          ? await resolveWorkspaceId(lhDash.workspace_name)
          : (process.env.FABRIC_WORKSPACE_ID ?? '')
        try {
          const rows = await executeQuery(lhDash.dataset_name, buildIHRefreshTimeLHQuery(), CACHE_TTL_KPIS, lhWorkspaceId)
          return Response.json({ rows })
        } catch (err) {
          return Response.json({ error: String(err) }, { status: 500 })
        }
      }
      daxQuery = isGeofenceBased ? buildIHRefreshTimeGFQuery() : buildIHRefreshTimeQuery()
      ttl = CACHE_TTL_KPIS
      break
    }
    default:
      return Response.json({ error: `Unknown queryType "${queryType}"` }, { status: 400 })
  }

  try {
    const rows = await executeQuery(dashboard.dataset_name, daxQuery, ttl, workspaceId)
    return Response.json({ rows })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
