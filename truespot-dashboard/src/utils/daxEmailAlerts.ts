// DAX query builder for the Email Alert Portal (Health — "Health - Launch Portals" workspace).
// The mail-log table is one row per SENT EMAIL (one recipient each), not one row per
// "subscription" — grouping by cleaned subject + collecting distinct recipients happens
// client-side in useEmailAlertsData.ts. Table name and the "no assets" flag column name
// vary per client (e.g. "Halifax Mail"/"HasNoAssets" vs "BSA Mail"/"HasNoAssetsFlag"),
// so both are passed in from the client's config rather than hardcoded.

function sanitizeTableName(name: string): string {
  return name.replace(/'/g, '')
}

// Returns every mail-log row: Subject (raw, may carry an "Undeliverable:" prefix —
// left in place client-side, since the M-query-level IsUndeliverable/folder-path fix
// is now the authoritative signal; see useEmailAlertsData.ts), DisplayTo (semicolon-
// separated recipient list, confirmed via live sample), a timestamp, Recurrence, and
// the client-specific "no assets found" flag column (aliased to "NoAssetsFlag").
//
// `hasCorrectedColumns` — true once a client's Mail table has been migrated to the
// fixed Power Query (adds DateTimeReceivedUTC + RecurrenceIntervalMinutes + a
// folder-aware IsUndeliverable). St. Paul and Halifax both have this now; BSA
// doesn't yet, so this query falls back to the older schema for BSA rather than
// erroring on missing columns.
//
// `+ TIME(h,m,0)`: our app's own Execute Queries calls (service-principal auth)
// read every "Date"-typed column earlier than what Fabric's own native query
// view shows for the identical column — confirmed reproducible via a direct
// side-by-side comparison for Halifax. DateTimeReceivedUTC is correct as stored
// (verified against Fabric's native view), so this addition compensates for our
// own read-path artifact, not the data — do not "fix" this by touching the
// semantic model again, and do not remove it without re-verifying the read-quirk
// is gone (e.g. after any auth/tenant/environment change).
//
// The compensation magnitude must match each client's own M-query correction —
// Halifax's M query subtracts 5:30, St. Paul's subtracts 5:00 — so it's passed
// in as `utcCorrectionMinutes` (from the client's `mail_utc_correction_minutes`
// config) rather than hardcoded, to avoid over/under-correcting per client.
//
// `hasHeartbeatColumn` — true once a client's Mail table computes LastHeartbeat
// (max EffectiveDate across ALL sends of a report type, including excluded
// "no result" ones) — lets status logic distinguish "automation stopped" from
// "automation is fine, just found nothing to report." Not all migrated clients
// have this column yet, so it's a separate flag from hasCorrectedColumns.
export function buildEmailAlertRowsQuery(
  tableName: string,
  noAssetsFlagColumn: string,
  hasCorrectedColumns = false,
  utcCorrectionMinutes = 330,
  hasHeartbeatColumn = false
): string {
  const t = sanitizeTableName(tableName)
  const flagCol = noAssetsFlagColumn.replace(/[[\]]/g, '')

  if (hasCorrectedColumns) {
    const hours = Math.floor(utcCorrectionMinutes / 60)
    const minutes = utcCorrectionMinutes % 60
    const heartbeatColumn = hasHeartbeatColumn
      ? `,\n  "LastHeartbeat",             '${t}'[LastHeartbeat] + TIME(${hours},${minutes},0)`
      : ''
    return `EVALUATE
SELECTCOLUMNS(
  '${t}',
  "Subject",                  '${t}'[Subject],
  "DisplayTo",                 '${t}'[DisplayTo],
  "DateTimeReceived",          '${t}'[DateTimeReceivedUTC] + TIME(${hours},${minutes},0),
  "Recurrence",                '${t}'[Recurrence],
  "RecurrenceIntervalMinutes", '${t}'[RecurrenceIntervalMinutes],
  "IsUndeliverable",           '${t}'[IsUndeliverable],
  "NoAssetsFlag",              '${t}'[${flagCol}]${heartbeatColumn}
)
ORDER BY [DateTimeReceived] DESC`
  }

  return `EVALUATE
SELECTCOLUMNS(
  '${t}',
  "Subject",          '${t}'[Subject],
  "DisplayTo",         '${t}'[DisplayTo],
  "DateTimeReceived",  '${t}'[DateTimeReceived],
  "Recurrence",        '${t}'[Recurrence],
  "NoAssetsFlag",      '${t}'[${flagCol}]
)
ORDER BY [DateTimeReceived] DESC`
}
