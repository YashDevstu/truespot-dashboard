export function buildMeasureQuery(measure: string): string {
  return `EVALUATE ROW("Value", ${measure})`
}

// Returns all distinct non-blank values for a single DAX column.
// Response rows contain one key "[value]" per row.
export function buildDistinctQuery(tableColumn: string): string {
  return `EVALUATE SELECTCOLUMNS(FILTER(DISTINCT(${tableColumn}), NOT ISBLANK(${tableColumn})), "value", ${tableColumn})`
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
