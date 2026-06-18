export function buildMeasureQuery(measure: string): string {
  return `EVALUATE ROW("Value", ${measure})`
}

interface LocationHistoryFilters {
  dateSeen?: string
  beaconId?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  vin?: string
  stockNumber?: string
  assetType?: string
}

function sanitize(val: string): string {
  return val.replace(/["\\]/g, '')
}

export function buildLocationHistoryQuery(filters: LocationHistoryFilters = {}): string {
  // Filter conditions applied to the raw table before SELECTCOLUMNS renames columns
  const conditions: string[] = [
    `NOT ISBLANK(AppendFinal[SubGeoZone])`,
    `AppendFinal[LastSeenDateDefault] = "${sanitize(filters.dateSeen ?? 'Today')}"`,
  ]

  if (filters.beaconId) conditions.push(`AppendFinal[BeaconId] = "${sanitize(filters.beaconId)}"`)
  if (filters.geofence) conditions.push(`AppendFinal[Geofence] = "${sanitize(filters.geofence)}"`)
  if (filters.subGeoZone) conditions.push(`AppendFinal[SubGeoZone] = "${sanitize(filters.subGeoZone)}"`)
  if (filters.floorLevel) conditions.push(`AppendFinal[Floor Level] = "${sanitize(filters.floorLevel)}"`)
  if (filters.vin) conditions.push(`AppendFinal[VIN Updated] = "${sanitize(filters.vin)}"`)
  if (filters.stockNumber) conditions.push(`AppendFinal[StockNumber] = "${sanitize(filters.stockNumber)}"`)
  if (filters.assetType) conditions.push(`AppendFinal[AssetType] = "${sanitize(filters.assetType)}"`)

  const filterClause = conditions.join('\n    && ')

  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    AppendFinal,
    ${filterClause}
  ),
  "Rank", AppendFinal[Rank],
  "Geofence", AppendFinal[Geofence],
  "SubGeoZone", AppendFinal[SubGeoZone],
  "StartTime", AppendFinal[Last Seen-Local],
  "EndTime", AppendFinal[PreviousLastSeenNew_],
  "MinDiff", AppendFinal[MinDiff],
  "MinutesDiff", AppendFinal[MinuteDifference],
  "BeaconId", AppendFinal[BeaconId],
  "VIN", AppendFinal[VIN Updated],
  "StockNumber", AppendFinal[StockNumber],
  "AssetType", AppendFinal[AssetType],
  "FloorLevel", AppendFinal[Floor Level],
  "BatteryLevel", AppendFinal[BatteryLevel]
)
ORDER BY [StartTime] ASC`
}
