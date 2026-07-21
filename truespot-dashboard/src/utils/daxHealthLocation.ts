// DAX query builders for TrueSpot Health — Location History product.
// Workspace: "Health - Location History Portal" | Dataset: "BSA" (per client)
// Table: AppendFinal — same structure as the Automotive AppendFinal table.
//
// Key column mapping (confirmed via Fabric schema + Power BI data comparison):
//   First Seen at Location  → AppendFinal[Last Seen-Local]      (EARLIER / session start)
//   Last Seen at Location   → AppendFinal[PreviousLastSeenNew_] (LATER  / session end)
//   Duration                → DATEDIFF([Last Seen-Local], [PreviousLastSeenNew_], MINUTE)
//   Note: column names are misleading — "Last Seen-Local" is the session START.
//   Date filter             → AppendFinal[LastSeenDateDefault]
//   Asset ID                → AppendFinal[VIN]
//   Tag ID / TrueTag        → AppendFinal[BeaconId]
//   Asset Name              → AppendFinal[Name]
//   Refresh time            → RefreshDateTime[RefreshTime]

const T = 'AppendFinal'

// Session duration in minutes — same formula as Automotive
const DURATION_DAX = `DATEDIFF(${T}[Last Seen-Local], ${T}[PreviousLastSeenNew_], MINUTE)`

// Exclude negative-duration rows only (data anomalies where end < start).
// Zero-duration rows (sessions < 1 minute) are valid and included.
const BASE_CONDITION = `${DURATION_DAX} >= 0`

function sanitize(val: string): string {
  return val.replace(/["\\]/g, '')
}

function buildInCondition(column: string, values: string[]): string {
  if (values.length === 1) return `${column} = "${sanitize(values[0])}"`
  return `${column} IN {${values.map((v) => `"${sanitize(v)}"`).join(', ')}}`
}

// No trim on the split — see parseHealthMultiValue in daxHealth.ts for why:
// values come from exact distinct-value selections joined with a bare ",", and
// trimming can silently corrupt a real value that has meaningful whitespace.
export function parseHLMultiValue(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').filter(Boolean)
}

// ── Filter types ───────────────────────────────────────────────────────────────

export interface ActiveHealthLocationFilters {
  dateSeen?:              string   // AppendFinal[LastSeenDateDefault] — "Today", "7/9/2026", etc.
  geofence?:              string   // comma-separated geofence names
  subGeoZone?:            string   // comma-separated sub-geofence names
  floorLevel?:            string   // comma-separated floor levels
  beaconId?:              string   // comma-separated TrueTag IDs (BeaconId column)
  assetType?:             string   // comma-separated asset types
  vin?:                   string   // comma-separated Asset IDs (VIN column)
  assetName?:             string   // comma-separated asset names (Name column)
  minDurationMinutes?:    number   // bounce filter — minimum session duration
  excludeUnknownGeofence?: boolean // Geofences Visited card — exclude Unknown Geofence rows
}

// Column map used for cascading filter-options queries
const FILTER_COLUMNS: Partial<Record<keyof ActiveHealthLocationFilters, string>> = {
  dateSeen:  `${T}[LastSeenDateDefault]`,
  geofence:  `${T}[Geofence]`,
  subGeoZone:`${T}[SubGeoZone]`,
  floorLevel:`${T}[Floor Level]`,
  beaconId:  `${T}[BeaconId]`,
  assetType: `${T}[AssetType]`,
  vin:       `${T}[VIN]`,
  assetName: `${T}[Name]`,
}

// ── Condition builder ──────────────────────────────────────────────────────────

export function buildHealthLocationConditions(
  filters: ActiveHealthLocationFilters,
  excludeKey?: keyof ActiveHealthLocationFilters
): string[] {
  const conditions: string[] = [BASE_CONDITION]

  const apply = (key: keyof ActiveHealthLocationFilters, column: string) => {
    if (key === excludeKey) return
    const vals = parseHLMultiValue(filters[key] as string | undefined)
    if (vals.length === 0 || (key === 'dateSeen' && vals[0] === 'all')) return
    conditions.push(buildInCondition(column, vals))
  }

  apply('dateSeen',   `${T}[LastSeenDateDefault]`)
  apply('geofence',   `${T}[Geofence]`)
  apply('subGeoZone', `${T}[SubGeoZone]`)
  apply('floorLevel', `${T}[Floor Level]`)
  apply('beaconId',   `${T}[BeaconId]`)
  apply('assetType',  `${T}[AssetType]`)
  apply('vin',        `${T}[VIN]`)
  apply('assetName',  `${T}[Name]`)

  if (filters.minDurationMinutes && excludeKey !== 'minDurationMinutes') {
    conditions.push(`${DURATION_DAX} >= ${filters.minDurationMinutes}`)
  }

  if (filters.excludeUnknownGeofence) {
    conditions.push(`${T}[Geofence] <> "Unknown Geofence"`)
  }

  return conditions
}

// FILTER(AppendFinal, cond1 && cond2 ...) — used inside EVALUATE expressions
function filteredSource(conditions: string[]): string {
  if (conditions.length === 0) return T
  return `FILTER(\n    ${T},\n    ${conditions.join('\n    && ')}\n  )`
}

// ── Distinct value queries (for filter-options cascading dropdowns) ─────────────

export function buildHLDistinctQuery(tableColumn: string): string {
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(${tableColumn}), NOT ISBLANK(${tableColumn})), "value", ${tableColumn})`
}

export function buildHLDistinctWithFiltersQuery(tableColumn: string, conditions: string[]): string {
  const source =
    conditions.length > 0
      ? `FILTER(${T}, ${conditions.join(' && ')})`
      : T
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(SELECTCOLUMNS(${source}, "value", ${tableColumn})), NOT ISBLANK([value])), "value", [value])`
}

// ── KPI query — four metrics in one EVALUATE ROW ──────────────────────────────

export function buildHLKpiQuery(filters: ActiveHealthLocationFilters): string {
  const conds = buildHealthLocationConditions(filters)
  const unknownConds = [...conds, `${T}[Geofence] = "Unknown Geofence"`]
  const knownGeoConds = [...conds, `${T}[Geofence] <> "Unknown Geofence"`]

  const withFilter = (condList: string[]) =>
    condList.length > 0 ? `, FILTER(${T}, ${condList.join(' && ')})` : ''

  return `EVALUATE
ROW(
  "TotalTags", CALCULATE(DISTINCTCOUNT(${T}[BeaconId])${withFilter(conds)}),
  "GeofencesVisited", CALCULATE(DISTINCTCOUNT(${T}[Geofence])${withFilter(knownGeoConds)}),
  "TimeTrackedMins", CALCULATE(SUMX(${T}, ${DURATION_DAX})${withFilter(conds)}),
  "UnknownZoneMins", CALCULATE(SUMX(${T}, ${DURATION_DAX})${withFilter(unknownConds)})
)`
}

// ── Geofence summary — cumulative time per location ───────────────────────────
// Uses SUMMARIZE + ADDCOLUMNS + SELECTCOLUMNS instead of GROUPBY/CURRENTGROUP
// because the Execute Queries REST API returns grouped columns as
// [Table].[Column] rather than [Column], breaking the row parser.
// CALCULATE(..., FILTER(T, conds)) re-applies the active conditions per geofence
// within the ADDCOLUMNS row context so each aggregate is correctly scoped.

export function buildHLGeofenceSummaryQuery(filters: ActiveHealthLocationFilters): string {
  const conds = buildHealthLocationConditions(filters)
  // SUMMARIZECOLUMNS correctly scopes each measure to (currentGeofence ∩ filterTable)
  // without the CALCULATE filter-override problem that ADDCOLUMNS+SUMMARIZE suffers from.
  // SELECTCOLUMNS renames AppendFinal[Geofence] → plain [Geofence] for the row parser.
  const filterArg = conds.length > 0
    ? `\n    FILTER(${T}, ${conds.join(' && ')}),`
    : ''

  return `EVALUATE
SELECTCOLUMNS(
  SUMMARIZECOLUMNS(
    ${T}[Geofence],${filterArg}
    "CumulativeMins", CALCULATE(SUMX(${T}, ${DURATION_DAX})),
    "FirstSeen",      CALCULATE(MIN(${T}[Last Seen-Local])),
    "LastSeen",       CALCULATE(MAX(${T}[PreviousLastSeenNew_]))
  ),
  "Geofence",       ${T}[Geofence],
  "CumulativeMins", [CumulativeMins],
  "FirstSeen",      [FirstSeen],
  "LastSeen",       [LastSeen]
)
ORDER BY [CumulativeMins] DESC`
}

// ── Location points table — full export query ────────────────────────────────
// Used ONLY for Excel export (needs all rows). Table display uses the paginated
// variants below (buildHLLocationPointsCountQuery + buildHLLocationPointsPageQuery).
// TOPN ordered by FirstSeen ASC — avoids the bias where ORDER BY LastSeen DESC
// dropped known-geofence sessions that ended before the model refresh time.
export const HL_LOCATION_POINTS_CAP = 10000

export function buildHLLocationPointsQuery(
  filters: ActiveHealthLocationFilters,
  limit = HL_LOCATION_POINTS_CAP
): string {
  const conds = buildHealthLocationConditions(filters)
  const src = filteredSource(conds)

  return `EVALUATE
TOPN(
  ${limit},
  SELECTCOLUMNS(
    ${src},
    "FirstSeen",    ${T}[Last Seen-Local],
    "LastSeen",     ${T}[PreviousLastSeenNew_],
    "DurationMins", ${DURATION_DAX},
    "Floor",        ${T}[Floor Level],
    "Geofence",     ${T}[Geofence],
    "SubGeoZone",   ${T}[SubGeoZone],
    "AssetId",      ${T}[VIN],
    "AssetName",    ${T}[Name],
    "TagId",        ${T}[BeaconId],
    "AssetType",    ${T}[AssetType]
  ),
  [FirstSeen], 1, [AssetId], 1
)`
}

// ── Location points — server-side pagination ─────────────────────────────────

export const HL_DEFAULT_PAGE_SIZE = 25

// Returns total row count for the current filters — drives pagination controls.
export function buildHLLocationPointsCountQuery(filters: ActiveHealthLocationFilters): string {
  const conds = buildHealthLocationConditions(filters)
  const src = filteredSource(conds)
  return `EVALUATE ROW("Count", COUNTROWS(${src}))`
}

// Returns exactly one page of rows using TOPN+EXCEPT offset pagination.
// EXCEPT(TOPN(offset+limit, ...), TOPN(offset, ...)) yields rows [offset+1 … offset+limit].
// The outer TOPN re-orders the EXCEPT result so the page arrives sorted by (FirstSeen, AssetId) ASC.
//
// CRITICAL: secondary sort [AssetId] makes TOPN deterministic when many sessions share the same
// FirstSeen timestamp (e.g. midnight start for long-running sessions). Without it, TOPN(50) and
// TOPN(25) pick different arbitrary subsets from tied rows, so EXCEPT returns 0 results.
// With the composite key (FirstSeen, AssetId), TOPN(25) is always a strict subset of TOPN(50).
export function buildHLLocationPointsPageQuery(
  filters: ActiveHealthLocationFilters,
  page: number,
  pageSize: number
): string {
  const conds = buildHealthLocationConditions(filters)
  const src = filteredSource(conds)
  const offset = (page - 1) * pageSize

  const cols = `SELECTCOLUMNS(
    ${src},
    "FirstSeen",    ${T}[Last Seen-Local],
    "LastSeen",     ${T}[PreviousLastSeenNew_],
    "DurationMins", ${DURATION_DAX},
    "Floor",        ${T}[Floor Level],
    "Geofence",     ${T}[Geofence],
    "SubGeoZone",   ${T}[SubGeoZone],
    "AssetId",      ${T}[VIN],
    "AssetName",    ${T}[Name],
    "TagId",        ${T}[BeaconId],
    "AssetType",    ${T}[AssetType]
  )`

  // Composite sort: (FirstSeen ASC, AssetId ASC) — deterministic even when timestamps tie.
  const ORDER = `[FirstSeen], 1, [AssetId], 1`

  if (offset === 0) {
    return `EVALUATE\nTOPN(\n  ${pageSize},\n  ${cols},\n  ${ORDER}\n)`
  }

  return `EVALUATE
TOPN(
  ${pageSize},
  EXCEPT(
    TOPN(${offset + pageSize}, ${cols}, ${ORDER}),
    TOPN(${offset}, ${cols}, ${ORDER})
  ),
  ${ORDER}
)`
}

// ── Latest asset — most-recently-seen VIN, for cold-start auto-select ────────
// TOPN(1, ..., [LastSeen], 0) picks the single max-LastSeen row; with N=1 the
// output-order caveat that applies to larger TOPN calls doesn't matter here.
export function buildHLLatestAssetQuery(filters: ActiveHealthLocationFilters): string {
  const conds = buildHealthLocationConditions(filters)
  const src = filteredSource(conds)
  return `EVALUATE
TOPN(
  1,
  SELECTCOLUMNS(
    ${src},
    "AssetId",  ${T}[VIN],
    "LastSeen", ${T}[PreviousLastSeenNew_]
  ),
  [LastSeen], 0
)`
}

// ── Refresh time ──────────────────────────────────────────────────────────────

export function buildHLRefreshTimeQuery(): string {
  return `EVALUATE ROW("RefreshTime", [Last Refresh])`
}

// ── Batch distinct query (N columns → 1 API call) ─────────────────────────────

export function buildHLBatchDistinctQuery(
  entries: [string, string][],
  activeFilters: ActiveHealthLocationFilters
): { dax: string; keys: string[] } {
  const parts: string[] = []
  const keys: string[] = []
  for (const [key, col] of entries) {
    const conds = buildHealthLocationConditions(activeFilters, key as keyof ActiveHealthLocationFilters)
    parts.push(buildHLDistinctWithFiltersQuery(col, conds))
    keys.push(key)
  }
  return { dax: parts.join('\n'), keys }
}

// Export filter column map for use by API routes
export { FILTER_COLUMNS as HL_FILTER_COLUMNS }
