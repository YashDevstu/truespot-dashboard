// DAX query builders for TrueSpot Health — Exit Location Portal.
// Workspace: "Health - Exit Location Portal" | Dataset: "Halifax" (per client)
// Table: AppendFinal — same base table as Location History, plus two flags:
//   [IsExit]   — this specific row's session ended at (or currently sits in) an exit geofence
//   [MaxExit]  — this is the asset's MOST RECENT row (latest known position)
// An asset currently "at an exit" = IsExit = 1 AND MaxExit = 1 — verified against the
// client's live Power BI "Exit Portal" report (exact row-for-row match: same 7 assets,
// same 5 Geofence::SubGeoZone groups, same counts).
//
// [Last24] flags whether this row was first detected within the previous 24 hours —
// also verified: qualifying [AssetName] values already carry a literal "*" prefix
// baked in by the source data, so no client-side "new" logic is needed beyond display.
//
// [DepartmentName] — added to the semantic model after initial build. Verified
// against all 7 live exit-flagged assets: 6 of 7 have a real value (Biomed, ED,
// "7 France", Facilities), 2 are blank — good enough coverage to show as a column.

const T = 'AppendFinal'

function sanitize(val: string): string {
  return val.replace(/["\\]/g, '')
}

export interface ExitLocationFilters {
  assetType?: string  // comma-separated AssetType values
  geofence?:  string  // comma-separated Geofence values (from the Monitored Exits pills)
}

function buildConditions(filters: ExitLocationFilters): string[] {
  const conditions = [`${T}[IsExit] = 1`, `${T}[MaxExit] = 1`]

  if (filters.assetType) {
    const vals = filters.assetType.split(',').filter(Boolean)
    if (vals.length === 1) conditions.push(`${T}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conditions.push(`${T}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  if (filters.geofence) {
    const vals = filters.geofence.split(',').filter(Boolean)
    if (vals.length === 1) conditions.push(`${T}[Geofence] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conditions.push(`${T}[Geofence] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  return conditions
}

// ── Assets currently detected at an exit ────────────────────────────────────────
// One row per asset. dwell filters to just the "new" (Last24=1) or "longer than
// 24h" (Last24=0) bucket — omit to return everything currently at an exit.
export function buildExitAssetsQuery(
  filters: ExitLocationFilters,
  dwell?: 'new' | 'dwelling'
): string {
  const conditions = buildConditions(filters)
  if (dwell === 'new')      conditions.push(`${T}[Last24] = 1`)
  if (dwell === 'dwelling') conditions.push(`${T}[Last24] = 0`)

  return `EVALUATE
SELECTCOLUMNS(
  FILTER(${T}, ${conditions.join(' && ')}),
  "VIN",            ${T}[VIN],
  "AssetName",      ${T}[AssetName],
  "AssetType",      ${T}[AssetType],
  "Geofence",       ${T}[Geofence],
  "SubGeoZone",     ${T}[SubGeoZone],
  "DepartmentName", ${T}[DepartmentName],
  "FirstSeen",      ${T}[Last Seen-Local],
  "Last24",         ${T}[Last24]
)
ORDER BY [FirstSeen] DESC`
}

// ── Monitored exits — every Geofence::SubGeoZone combo ever flagged as an exit ──
// Historical (IsExit = 1, regardless of MaxExit) so exits with zero current
// detections still appear in the pill list, not just the currently-active ones.
export function buildMonitoredExitsQuery(): string {
  return `EVALUATE
DISTINCT(
  SELECTCOLUMNS(
    FILTER(${T}, ${T}[IsExit] = 1),
    "Geofence",   ${T}[Geofence],
    "SubGeoZone", ${T}[SubGeoZone]
  )
)
ORDER BY [Geofence] ASC, [SubGeoZone] ASC`
}

// ── Asset type options — for the filter dropdown, scoped to assets at exits ────
export function buildExitAssetTypeOptionsQuery(): string {
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    DISTINCT(SELECTCOLUMNS(FILTER(${T}, ${T}[IsExit] = 1 && ${T}[MaxExit] = 1), "value", ${T}[AssetType])),
    NOT ISBLANK([value]) && [value] <> ""
  ),
  "value", [value]
)
ORDER BY [value] ASC`
}

export function buildExitRefreshTimeQuery(): string {
  return `EVALUATE ROW("RefreshTime", [Last Refresh])`
}
