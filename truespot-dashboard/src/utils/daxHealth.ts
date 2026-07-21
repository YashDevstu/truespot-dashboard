// DAX query builders for the TrueSpot Health product (BSA semantic model).
// All queries target the 'Post-Aggregate' table in the BSA semantic model.
// Table name requires single quotes in DAX because of the hyphen in "Post-Aggregate".
// Do NOT import or modify dax.ts — that file is CarVision/Automotive-specific.

function sanitize(value: string): string {
  return value.replace(/["\\]/g, '')
}

function buildInCondition(column: string, values: string[]): string {
  if (values.length === 1) return `${column} = "${sanitize(values[0])}"`
  return `${column} IN {${values.map((v) => `"${sanitize(v)}"`).join(', ')}}`
}

// Values are joined with a bare "," by the filter sidebar from exact distinct-value
// selections (never free-typed), so no whitespace-trimming is needed on the split —
// trimming here used to silently corrupt real data values that carry meaningful
// leading/trailing whitespace (e.g. a Post-Aggregate[Name] of " Sigma Spectrum IV
// 3003690" with a leading space), making the filter compare against a value that
// no row actually has and always return zero rows.
export function parseHealthMultiValue(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').filter(Boolean)
}

// ── Filter types ───────────────────────────────────────────────────────────────

export interface ActiveHealthFilters {
  lastSeenDate?: string       // FORMAT('Post-Aggregate'[LastSeenDateDefault], "MM/DD/YYYY") — string comparison works on DATE column; comma-separated multi
  department?: string         // 'Post-Aggregate'[My Department] — include only these (comma-separated)
  excludeDepartment?: string  // 'Post-Aggregate'[My Department] — exclude these (NOT IN, comma-separated)
  assetName?: string          // 'Post-Aggregate'[Name]
  floor?: string              // 'Post-Aggregate'[Floor]
  geofence?: string           // 'Post-Aggregate'[Geofence]
  tagId?: string              // 'Post-Aggregate'[Beaconid]
  assetId?: string            // 'Post-Aggregate'[VIN]
  exitsFilter?: string        // 'Post-Aggregate'[Exits and Non Exits] — "Exit" | "Non-Exit"
  hourGroup?: string          // 'Post-Aggregate'[HourGrp] — e.g. "Less than 2hr", "30d+", or comma-separated multi
  outsideHospital?: string    // 'Post-Aggregate'[Outside/Inside] — "Yes" | "No"
}

// Standard IN-filter columns. excludeDepartment uses NOT IN logic — handled separately below.
const HEALTH_FILTER_COLUMNS: Partial<Record<keyof ActiveHealthFilters, string>> = {
  lastSeenDate:    "FORMAT('Post-Aggregate'[LastSeenDateDefault], \"MM/DD/YYYY\")",
  department:      "'Post-Aggregate'[My Department]",
  assetName:       "'Post-Aggregate'[Name]",
  floor:           "'Post-Aggregate'[Floor]",
  geofence:        "'Post-Aggregate'[Geofence]",
  tagId:           "'Post-Aggregate'[Beaconid]",
  assetId:         "'Post-Aggregate'[VIN]",
  exitsFilter:     "'Post-Aggregate'[Exits and Non Exits]",
  hourGroup:       "'Post-Aggregate'[HourGrp]",
  outsideHospital: "'Post-Aggregate'[Outside/Inside]",
}

// ── Condition builder ──────────────────────────────────────────────────────────

// Returns an array of DAX filter conditions for the active health filters.
// Pass excludeKey to omit one filter — used for cascading dropdown behaviour so each
// dropdown shows all options compatible with every OTHER active filter, not its own.
export function buildHealthFilterConditions(
  filters: ActiveHealthFilters,
  excludeKey?: keyof ActiveHealthFilters
): string[] {
  const conditions: string[] = []

  // Standard IN filters
  for (const [key, column] of Object.entries(HEALTH_FILTER_COLUMNS) as [keyof ActiveHealthFilters, string][]) {
    if (key === excludeKey) continue
    const values = parseHealthMultiValue(filters[key])
    if (values.length === 0) continue
    conditions.push(buildInCondition(column, values))
  }

  // excludeDepartment — NOT IN logic: show all departments except the selected ones.
  // Skipped only when fetching 'excludeDepartment' options (OutsideDeptFilter uses that key,
  // which gets all departments). The 'department' sidebar dropdown correctly respects this
  // condition so excluded departments disappear from the include filter.
  if (filters.excludeDepartment && excludeKey !== 'excludeDepartment') {
    const values = parseHealthMultiValue(filters.excludeDepartment)
    if (values.length > 0) {
      const list = values.map((v) => `"${sanitize(v)}"`).join(', ')
      conditions.push(`NOT ('Post-Aggregate'[My Department] IN {${list}})`)
    }
  }

  return conditions
}

function buildSourceTable(conditions: string[]): string {
  if (conditions.length === 0) return "'Post-Aggregate'"
  return `FILTER('Post-Aggregate', ${conditions.join(' && ')})`
}

// ── KPI counts query ───────────────────────────────────────────────────────────

// Returns one row: TotalAssets, ActiveLt2hr, Missing30d, OutsideHospital.
// All four counts respect the currently active filters.
export function buildHealthKpiQuery(filters: ActiveHealthFilters): string {
  const conditions = buildHealthFilterConditions(filters)

  const countAll =
    conditions.length === 0
      ? `COUNTROWS('Post-Aggregate')`
      : `COUNTROWS(FILTER('Post-Aggregate', ${conditions.join(' && ')}))`

  const countWhere = (extra: string): string => {
    const all = conditions.length > 0 ? [...conditions, extra] : [extra]
    return `COUNTROWS(FILTER('Post-Aggregate', ${all.join(' && ')}))`
  }

  return `EVALUATE
ROW(
  "TotalAssets",     ${countAll},
  "ActiveLt2hr",     ${countWhere(`'Post-Aggregate'[HourGrp] = "Less than 2hr"`)},
  "Missing30d",      ${countWhere(`'Post-Aggregate'[Not seen since] >= 720`)},
  "OutsideHospital", ${countWhere(`'Post-Aggregate'[Outside/Inside] = "Yes"`)}
)`
}

// ── Chart queries ──────────────────────────────────────────────────────────────

// Time Since Last Seen — excludes its own filter (hourGroup) so pills always show
// all 5 ranges regardless of which is selected (BI "exclude-self" pattern).
// Response columns: Post-Aggregate[HourGrp], Post-Aggregate[HourGrpSort], [Count]
export function buildTimeSinceChartQuery(filters: ActiveHealthFilters): string {
  const source = buildSourceTable(buildHealthFilterConditions(filters, 'hourGroup'))

  // Counts RefreshDate, not VIN — VIN can be blank for some rows (Halifax has
  // 525 blank-VIN rows total, 152 in "Less than 2hr" alone), and COUNTX skips
  // blank evaluations, silently undercounting. RefreshDate is confirmed never
  // blank for any row in the table (unlike the group-by column itself, which
  // can be blank for its own "unknown" bucket — e.g. 7 rows with blank
  // Geofence, 525 with blank Name — so counting the group key isn't safe
  // either), so it's a reliable universal row-counter.
  return `EVALUATE
GROUPBY(
  ${source},
  'Post-Aggregate'[HourGrp],
  'Post-Aggregate'[HourGrpSort],
  "Count", COUNTX(CURRENTGROUP(), 'Post-Aggregate'[RefreshDate])
)
ORDER BY 'Post-Aggregate'[HourGrpSort] ASC`
}

// Top Locations — excludes its own filter (geofence) so all locations remain visible
// in the geofence pills when one is selected.
// Response columns: Post-Aggregate[Geofence], [Count]
export function buildTopLocationsChartQuery(
  filters: ActiveHealthFilters,
  topN = 500
): string {
  const source = buildSourceTable(buildHealthFilterConditions(filters, 'geofence'))

  // Counts RefreshDate, not Geofence/VIN — see buildTimeSinceChartQuery for why.
  return `EVALUATE
TOPN(
  ${topN},
  GROUPBY(
    ${source},
    'Post-Aggregate'[Geofence],
    "Count", COUNTX(CURRENTGROUP(), 'Post-Aggregate'[RefreshDate])
  ),
  [Count], 0
)
ORDER BY [Count] DESC`
}

// Asset Count by Name — excludes its own filter (assetName) so all asset types
// remain visible in the chart when one is selected.
// Response columns: Post-Aggregate[Name], [Count]
export function buildAssetCountChartQuery(
  filters: ActiveHealthFilters,
  topN = 500
): string {
  const source = buildSourceTable(buildHealthFilterConditions(filters, 'assetName'))

  // Counts RefreshDate, not Name/VIN — see buildTimeSinceChartQuery for why.
  // Halifax has 525 blank-Name rows; Power BI surfaces these as a "(Blank)"
  // bucket rather than dropping them, so this needs to appear too, not
  // silently vanish from the chart.
  return `EVALUATE
TOPN(
  ${topN},
  GROUPBY(
    ${source},
    'Post-Aggregate'[Name],
    "Count", COUNTX(CURRENTGROUP(), 'Post-Aggregate'[RefreshDate])
  ),
  [Count], 0
)
ORDER BY [Count] DESC`
}

// ── Main assets table query ────────────────────────────────────────────────────

// Returns all filtered assets ordered by DaysMissing descending (most missing first).
// Capped at maxRows to stay within the 100K row API limit.
// Response column keys use bracket notation: [Department], [AssetName], etc.
export function buildMissingAssetsTableQuery(
  filters: ActiveHealthFilters,
  maxRows = 10000
): string {
  const source = buildSourceTable(buildHealthFilterConditions(filters))

  return `EVALUATE
TOPN(
  ${maxRows},
  SELECTCOLUMNS(
    ${source},
    "Department",      'Post-Aggregate'[My Department],
    "AssetName",       'Post-Aggregate'[Name],
    "AssetId",         'Post-Aggregate'[VIN],
    "TagId",           'Post-Aggregate'[Beaconid],
    "LastSeen",        'Post-Aggregate'[LastSeen CST],
    "DaysMissing",     'Post-Aggregate'[Not seen since],
    "Floor",           'Post-Aggregate'[Floor],
    "Geofence",        'Post-Aggregate'[Geofence],
    "SubLocation",     'Post-Aggregate'[SubGeo],
    "OutsideHospital", 'Post-Aggregate'[Outside/Inside],
    "HourGroup",       'Post-Aggregate'[HourGrp],
    "HourGroupSort",   'Post-Aggregate'[HourGrpSort],
    "AssetType",       'Post-Aggregate'[AssetType]
  ),
  [DaysMissing], 0
)`
}

// ── Filter dropdown distinct query ─────────────────────────────────────────────

// Returns distinct non-blank values for one column, filtered by all OTHER active
// filters (cascading behaviour). Pass the DAX column reference as tableColumn.
export function buildHealthDistinctWithFiltersQuery(
  tableColumn: string,
  conditions: string[]
): string {
  const source =
    conditions.length > 0
      ? `FILTER('Post-Aggregate', ${conditions.join(' && ')})`
      : "'Post-Aggregate'"
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(SELECTCOLUMNS(${source}, "value", ${tableColumn})), NOT ISBLANK([value])), "value", [value])`
}

// ── Refresh time query ─────────────────────────────────────────────────────────

export function buildRefreshTimeQuery(): string {
  return `EVALUATE SELECTCOLUMNS(RefreshTimeLocal, "RefreshTime", RefreshTimeLocal[RefreshTimeLocal])`
}
