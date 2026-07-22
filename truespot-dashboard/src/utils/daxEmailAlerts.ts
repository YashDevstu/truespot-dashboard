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
// folder-aware IsUndeliverable). St. Paul has this; Halifax/BSA don't yet, so this
// query falls back to their older schema rather than erroring on missing columns.
export function buildEmailAlertRowsQuery(
  tableName: string,
  noAssetsFlagColumn: string,
  hasCorrectedColumns = false
): string {
  const t = sanitizeTableName(tableName)
  const flagCol = noAssetsFlagColumn.replace(/[[\]]/g, '')

  if (hasCorrectedColumns) {
    return `EVALUATE
SELECTCOLUMNS(
  '${t}',
  "Subject",                  '${t}'[Subject],
  "DisplayTo",                 '${t}'[DisplayTo],
  "DateTimeReceived",          '${t}'[DateTimeReceivedUTC],
  "Recurrence",                '${t}'[Recurrence],
  "RecurrenceIntervalMinutes", '${t}'[RecurrenceIntervalMinutes],
  "IsUndeliverable",           '${t}'[IsUndeliverable],
  "NoAssetsFlag",              '${t}'[${flagCol}]
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
