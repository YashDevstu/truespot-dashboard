export function buildMeasureQuery(measure: string): string {
  return `EVALUATE ROW("Value", ${measure})`
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

// "MM/DD/YY" → "DATE(YYYY, M, D)";  "Today" → "TODAY()"
function dateSeenToDax(dateSeen: string): string {
  if (dateSeen === 'Today') return 'TODAY()'
  const parts = dateSeen.split('/')
  if (parts.length !== 3) return ''
  const month = parseInt(parts[0], 10)
  const day = parseInt(parts[1], 10)
  const year = 2000 + parseInt(parts[2], 10)
  if (isNaN(month) || isNaN(day) || isNaN(year)) return ''
  return `DATE(${year}, ${month}, ${day})`
}

export function buildLocationHistoryQuery(filters: LocationHistoryFilters = {}): string {
  const minDur = filters.minDurationMinutes ?? 0
  const conditions: string[] = []

  if (filters.dateSeen) {
    const dateDax = dateSeenToDax(filters.dateSeen)
    if (dateDax) {
      if (filters.timeChunk) {
        // Narrow to a 6-hour window to stay under the 15 MB API response limit
        conditions.push(`AppendFinal[Last Seen-Local] >= ${dateDax} + ${filters.timeChunk.startFraction}`)
        conditions.push(`AppendFinal[Last Seen-Local] < ${dateDax} + ${filters.timeChunk.endFraction}`)
      } else {
        // Full-day filter — only safe when row count × column size < 15 MB
        conditions.push(`INT(AppendFinal[Last Seen-Local]) = ${dateDax}`)
      }
    }
  }

  if (minDur > 0) {
    conditions.push(`AppendFinal[MinuteDifference] >= ${minDur}`)
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
  "MinutesDiff", AppendFinal[MinuteDifference],
  "BeaconId", AppendFinal[BeaconId],
  "VIN", AppendFinal[VIN Updated],
  "StockNumber", AppendFinal[StockNumber],
  "AssetType", AppendFinal[AssetType],
  "FloorLevel", AppendFinal[Floor Level],
  "BatteryLevel", AppendFinal[BatteryLevel]
)`
}
