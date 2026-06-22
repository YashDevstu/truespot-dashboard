export function buildMeasureQuery(measure: string): string {
  return `EVALUATE ROW("Value", ${measure})`
}

// Returns all distinct non-blank values for a single DAX column.
// Response rows contain one key "[value]" per row.
export function buildDistinctQuery(tableColumn: string): string {
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(${tableColumn}), NOT ISBLANK(${tableColumn})), "value", ${tableColumn})`
}

// Same as buildDistinctQuery but pre-filters the table so only values that
// exist under the currently active filters are returned — Power BI cross-filter behaviour.
export function buildDistinctWithFiltersQuery(tableColumn: string, conditions: string[]): string {
  const source = conditions.length > 0
    ? `FILTER(AppendFinal, ${conditions.join(' && ')})`
    : 'AppendFinal'
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(SELECTCOLUMNS(${source}, "value", ${tableColumn})), NOT ISBLANK([value])), "value", [value])`
}

// Active filter values passed from the UI.
export interface ActiveFilters {
  dateSeen?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  beaconId?: string
  assetType?: string
  vin?: string
  stockNumber?: string
}

// Maps each filter key to the DAX condition that applies it.
// excludeKey: the column whose own filter is intentionally omitted so its
// dropdown still shows all values compatible with the other selections.
export function buildCascadeConditions(filters: ActiveFilters, excludeKey?: keyof ActiveFilters): string[] {
  const conditions = [...BASE_CONDITIONS]
  const map: Record<keyof ActiveFilters, (v: string) => string> = {
    dateSeen:    (v) => `AppendFinal[LastSeenDateDefault] = "${sanitize(v)}"`,
    geofence:    (v) => `AppendFinal[Geofence] = "${sanitize(v)}"`,
    subGeoZone:  (v) => `AppendFinal[SubGeoZone] = "${sanitize(v)}"`,
    floorLevel:  (v) => `AppendFinal[Floor Level] = "${sanitize(v)}"`,
    beaconId:    (v) => `AppendFinal[BeaconId] = "${sanitize(v)}"`,
    assetType:   (v) => `AppendFinal[AssetType] = "${sanitize(v)}"`,
    vin:         (v) => `AppendFinal[VIN Updated] = "${sanitize(v)}"`,
    stockNumber: (v) => `AppendFinal[StockNumber] = "${sanitize(v)}"`,
  }
  for (const [key, val] of Object.entries(filters) as [keyof ActiveFilters, string][]) {
    if (key === excludeKey || !val || val === 'all') continue
    conditions.push(map[key](val))
  }
  return conditions
}

export interface TimeChunk {
  startFraction: number // fraction of a day: 0 = midnight, 0.25 = 6am, 0.5 = noon, 0.75 = 6pm
  endFraction: number   // exclusive upper bound (1 = next midnight)
}

// Four 6-hour windows that together cover a full day
export const DAY_TIME_CHUNKS: TimeChunk[] = [
  { startFraction: 0,    endFraction: 0.25 }, // 00:00 – 06:00
  { startFraction: 0.25, endFraction: 0.5  }, // 06:00 – 12:00
  { startFraction: 0.5,  endFraction: 0.75 }, // 12:00 – 18:00
  { startFraction: 0.75, endFraction: 1    }, // 18:00 – 24:00
]

interface LocationHistoryFilters {
  dateSeen?: string
  timeChunk?: TimeChunk
  beaconId?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  vin?: string
  stockNumber?: string
  assetType?: string
  minDurationMinutes?: number
}

function sanitize(val: string): string {
  return val.replace(/["\\]/g, '')
}

// Inline duration expression — MinuteDifference is a measure so it can't be used
// reliably in FILTER(); replicate the formula directly with column references.
const DURATION_DAX = `DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE)`

// These conditions are always applied — never show sold/archived assets,
// zero-duration pings, or manual-entry placeholder records.
const BASE_CONDITIONS = [
  'AppendFinal[AssetStatus] <> "Sold"',
  'AppendFinal[AssetStatus] <> "Archieved"',
  `${DURATION_DAX} > 0`,
  'AppendFinal[Make] <> "zz_manualentry"',
]

export function buildLocationHistoryQuery(filters: LocationHistoryFilters = {}): string {
  const minDur = filters.minDurationMinutes ?? 0
  const conditions: string[] = [...BASE_CONDITIONS]

  if (filters.dateSeen) {
    // Filter on the pre-computed date-label column — same field the Power BI report uses.
    // Values: "Today", "06/21/26", "06/20/26", etc.  No timezone ambiguity.
    conditions.push(`AppendFinal[LastSeenDateDefault] = "${sanitize(filters.dateSeen)}"`)

    if (filters.timeChunk) {
      // Split the day into 6-hour windows using the fractional time-of-day of the
      // arrival timestamp so each chunk stays under the 15 MB API response limit.
      conditions.push(`MOD(AppendFinal[Last Seen-Local], 1) >= ${filters.timeChunk.startFraction}`)
      conditions.push(`MOD(AppendFinal[Last Seen-Local], 1) < ${filters.timeChunk.endFraction}`)
    }
  }

  if (minDur > 0) {
    conditions.push(`${DURATION_DAX} >= ${minDur}`)
  }

  if (filters.beaconId)    conditions.push(`AppendFinal[BeaconId] = "${sanitize(filters.beaconId)}"`)
  if (filters.geofence)    conditions.push(`AppendFinal[Geofence] = "${sanitize(filters.geofence)}"`)
  if (filters.subGeoZone)  conditions.push(`AppendFinal[SubGeoZone] = "${sanitize(filters.subGeoZone)}"`)
  if (filters.floorLevel)  conditions.push(`AppendFinal[Floor Level] = "${sanitize(filters.floorLevel)}"`)
  if (filters.vin)         conditions.push(`AppendFinal[VIN Updated] = "${sanitize(filters.vin)}"`)
  if (filters.stockNumber) conditions.push(`AppendFinal[StockNumber] = "${sanitize(filters.stockNumber)}"`)
  if (filters.assetType)   conditions.push(`AppendFinal[AssetType] = "${sanitize(filters.assetType)}"`)

  const sourceTable =
    conditions.length > 0
      ? `FILTER(\n    AppendFinal,\n    ${conditions.join('\n    && ')}\n  )`
      : `AppendFinal`

  // No ORDER BY — sorting 49K rows per chunk server-side adds latency.
  // AG Grid handles client-side sorting via ColDef.sort.
  return `EVALUATE
SELECTCOLUMNS(
  ${sourceTable},
  "Geofence", AppendFinal[Geofence],
  "SubGeoZone", AppendFinal[SubGeoZone],
  "StartTime", AppendFinal[Last Seen-Local],
  "EndTime", AppendFinal[PreviousLastSeenNew_],
  "MinutesDiff", DATEDIFF(AppendFinal[Last Seen-Local], AppendFinal[PreviousLastSeenNew_], MINUTE),
  "BeaconId", AppendFinal[BeaconId],
  "VIN", AppendFinal[VIN Updated],
  "StockNumber", AppendFinal[StockNumber],
  "AssetType", AppendFinal[AssetType],
  "FloorLevel", AppendFinal[Floor Level],
  "BatteryLevel", AppendFinal[BatteryLevel],
  "Make", AppendFinal[Make],
  "Model", AppendFinal[Model],
  "Year", AppendFinal[Year]
)`
}
