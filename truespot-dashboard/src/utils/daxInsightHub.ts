// DAX query builders for TrueSpot Health — Insight Hub product.
// Workspace: "Health - Missing Assets Portal" | Dataset: "BSA"
// Table: 'Post-Aggregate' (current-state, 1 row per asset)
//
// Bucket classification — priority order (highest wins):
//   1. Hard to Find  : not seen 30+ days OR outside hospital
//   2. Cleaning      : SubGeo contains soiled/dirty/clean-room keywords
//   3. With Patient  : SubGeo starts with room number or ICU/pod patterns
//   4. Sitting Unused: everything else

const T = "'Post-Aggregate'"
const SUB = `${T}[SubGeo]`

// ── Bucket condition fragments ────────────────────────────────────────────────

function hardToFindCond(): string {
  return `(${T}[Not seen since] >= 720 || ${T}[Outside/Inside] = "Yes")`
}

function cleaningCond(): string {
  return `(` +
    `CONTAINSSTRING(${SUB}, "Soiled") || ` +
    `CONTAINSSTRING(${SUB}, "Dirty") || ` +
    `CONTAINSSTRING(${SUB}, "Main Clean") || ` +
    `CONTAINSSTRING(${SUB}, "Clean Room") || ` +
    `CONTAINSSTRING(${SUB}, "Decon") || ` +
    `CONTAINSSTRING(${SUB}, "SPD")` +
  `)`
}

function patientCond(): string {
  return `(` +
    `LEFT(${SUB}, 5) = "Rooms" || ` +
    `LEFT(${SUB}, 4) = "Room" || ` +
    `LEFT(${SUB}, 3) = "OR " || ` +
    `CONTAINSSTRING(${SUB}, "MICU") || ` +
    `CONTAINSSTRING(${SUB}, "NICU") || ` +
    `CONTAINSSTRING(${SUB}, "PICU") || ` +
    `CONTAINSSTRING(${SUB}, "PACU") || ` +
    `CONTAINSSTRING(${SUB}, " ICU") || ` +
    `CONTAINSSTRING(${SUB}, "Pod ") || ` +
    `CONTAINSSTRING(${SUB}, "Gold Pod") || ` +
    `CONTAINSSTRING(${SUB}, "Labor & Delivery")` +
  `)`
}

// ── Filter types ───────────────────────────────────────────────────────────────

export interface InsightHubFilters {
  assetType?:  string  // comma-separated 'Post-Aggregate'[AssetType] values
  floor?:      string  // comma-separated 'Post-Aggregate'[Floor] / AppendFinal[Floor Level] values
  department?: string  // comma-separated 'Post-Aggregate'[My Department] values
  building?:   string  // comma-separated 'Post-Aggregate'[Building] / AppendFinal[Building] values
  days?:       number  // lookback window in days (default 7)
  category?:   string  // 'patient' | 'cleaning' | 'unknown' | 'other' — for location drill-down
  vin?:        string  // single VIN for asset trail drill-down
  dateKey?:    number  // exact day filter: YEAR×10000 + MONTH×100 + DAY — overrides the days window
}

function sanitize(v: string): string {
  return v.replace(/["\\]/g, '')
}

function buildIHFilterConditions(filters: InsightHubFilters): string[] {
  const conds: string[] = []

  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1) {
      conds.push(`${T}[AssetType] = "${sanitize(vals[0])}"`)
    } else if (vals.length > 1) {
      conds.push(`${T}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
    }
  }

  if (filters.floor) {
    const vals = filters.floor.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Floor] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Floor] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  if (filters.department) {
    const vals = filters.department.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[My Department] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[My Department] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  if (filters.building) {
    const vals = filters.building.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Building] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Building] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  return conds
}

function buildSource(filters: InsightHubFilters): string {
  const conds = buildIHFilterConditions(filters)
  return conds.length > 0 ? `FILTER(${T}, ${conds.join(' && ')})` : T
}

// ── Report 1 — Utilisation bucketed counts ────────────────────────────────────
// Returns ONE row: Total, WithPatient, Cleaning, HardToFind.
// SittingUnused = Total - WithPatient - Cleaning - HardToFind (computed client-side).

export function buildIHUtilisationQuery(filters: InsightHubFilters): string {
  const src = buildSource(filters)
  const h = hardToFindCond()
  const c = cleaningCond()
  const p = patientCond()

  const countWhere = (cond: string) =>
    `COUNTROWS(FILTER(${src}, ${cond}))`

  return `EVALUATE
ROW(
  "Total",       COUNTROWS(${src}),
  "WithPatient", ${countWhere(`NOT ${h} && NOT ${c} && ${p}`)},
  "Cleaning",    ${countWhere(`NOT ${h} && ${c}`)},
  "HardToFind",  ${countWhere(h)}
)`
}

// ── Report 2 — Floor distribution ─────────────────────────────────────────────
// Returns one row per floor with bucket counts.
// Client maps to: floor, total, withPatient, cleaning, hardToFind, sittingUnused.

export function buildIHFloorDistributionQuery(filters: InsightHubFilters): string {
  const filterConds = buildIHFilterConditions(filters)
  const filterArg = filterConds.length > 0
    ? `\n    FILTER(${T}, ${filterConds.join(' && ')}),`
    : ''

  const h = hardToFindCond()
  const c = cleaningCond()
  const p = patientCond()

  return `EVALUATE
SELECTCOLUMNS(
  SUMMARIZECOLUMNS(
    ${T}[Floor],${filterArg}
    "Total",       CALCULATE(COUNTROWS(${T})),
    "HardToFind",  CALCULATE(COUNTROWS(${T}), FILTER(${T}, ${h})),
    "Cleaning",    CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && ${c})),
    "WithPatient", CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && NOT ${c} && ${p}))
  ),
  "Floor",       ${T}[Floor],
  "Total",       [Total],
  "HardToFind",  [HardToFind],
  "Cleaning",    [Cleaning],
  "WithPatient", [WithPatient]
)
ORDER BY [Total] DESC`
}

// ── Report 3 — Cleaning loop dwell times ─────────────────────────────────────
// Returns distribution of HourGrp for assets currently in cleaning zones.
// Interpretation: how long are assets sitting in soiled/clean rooms right now?

export function buildIHCleaningLoopQuery(filters: InsightHubFilters): string {
  const filterConds = buildIHFilterConditions(filters)
  const h = hardToFindCond()
  const c = cleaningCond()

  // Extra condition: must be in a cleaning zone (and not hard-to-find)
  const allConds = [...filterConds, `NOT ${h}`, c]

  return `EVALUATE
SELECTCOLUMNS(
  SUMMARIZECOLUMNS(
    ${T}[HourGrp],
    ${T}[HourGrpSort],
    FILTER(${T}, ${allConds.join(' && ')}),
    "Count", CALCULATE(COUNTROWS(${T}))
  ),
  "HourGrp",     ${T}[HourGrp],
  "HourGrpSort", ${T}[HourGrpSort],
  "Count",       [Count]
)
ORDER BY ${T}[HourGrpSort] ASC`
}

// ── Report 4 — Hiding spots ───────────────────────────────────────────────────
// Top idle locations: "Sitting Unused" zones ranked by asset count.
// Returns top 25 SubGeo zones + floor + count.

export function buildIHHidingSpotsQuery(filters: InsightHubFilters): string {
  const filterConds = buildIHFilterConditions(filters)
  const h = hardToFindCond()
  const c = cleaningCond()
  const p = patientCond()

  // Sitting Unused = NOT hard-to-find AND NOT cleaning AND NOT patient
  const unusedConds = [...filterConds, `NOT ${h}`, `NOT ${c}`, `NOT ${p}`]

  return `EVALUATE
TOPN(
  25,
  SELECTCOLUMNS(
    SUMMARIZECOLUMNS(
      ${T}[SubGeo],
      ${T}[Floor],
      FILTER(${T}, ${unusedConds.join(' && ')}),
      "Count", CALCULATE(COUNTROWS(${T}))
    ),
    "SubGeo", ${T}[SubGeo],
    "Floor",  ${T}[Floor],
    "Count",  [Count]
  ),
  [Count], 0
)
ORDER BY [Count] DESC`
}

// ── Asset type utilisation breakdown ──────────────────────────────────────────
// One row per AssetType with bucket counts. Intentionally IGNORES the assetType
// filter so the chart always shows all types side-by-side (floor filter is kept).

export function buildIHAssetTypeUtilisationQuery(filters: InsightHubFilters): string {
  // Intentionally ignores assetType so every type appears side-by-side.
  // Respects floor, department, and building so the breakdown reflects active scope.
  const conds: string[] = []
  if (filters.floor) {
    const vals = filters.floor.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Floor] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Floor] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.department) {
    const vals = filters.department.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[My Department] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[My Department] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.building) {
    const vals = filters.building.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Building] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Building] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }

  const filterArg = conds.length > 0 ? `\n    FILTER(${T}, ${conds.join(' && ')}),` : ''
  const h = hardToFindCond()
  const c = cleaningCond()
  const p = patientCond()

  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    SUMMARIZECOLUMNS(
      ${T}[AssetType],${filterArg}
      "Total",       CALCULATE(COUNTROWS(${T})),
      "HardToFind",  CALCULATE(COUNTROWS(${T}), FILTER(${T}, ${h})),
      "Cleaning",    CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && ${c})),
      "WithPatient", CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && NOT ${c} && ${p}))
    ),
    [Total] > 0 && NOT ISBLANK(${T}[AssetType])
  ),
  "AssetType",   ${T}[AssetType],
  "Total",       [Total],
  "WithPatient", [WithPatient],
  "Cleaning",    [Cleaning],
  "HardToFind",  [HardToFind]
)
ORDER BY [Total] DESC`
}

// ── Hourly activity distribution ──────────────────────────────────────────────
// For each hour 0-23, count assets whose LastSeenDateDefault falls in that hour
// and are in the "With Patient" bucket.  VAR captures the row value from
// GENERATESERIES so CALCULATE can use it as a scalar inside FILTER.

export function buildIHHourlyQuery(filters: InsightHubFilters): string {
  const conds = buildIHFilterConditions(filters)
  // Base condition string for pre-filtering (no assetType override here)
  const baseCond = conds.length > 0 ? conds.join(' && ') : 'TRUE()'
  const p = patientCond()
  const h = hardToFindCond()
  const c = cleaningCond()

  // Use VAR to materialise filtered tables — avoids CALCULATE context issues
  // when iterating with ADDCOLUMNS over GENERATESERIES.
  return `EVALUATE
SELECTCOLUMNS(
  ADDCOLUMNS(
    GENERATESERIES(0, 23),
    "WithPatient",
      VAR hr = [Value]
      VAR subset = FILTER(
        ${T},
        ${baseCond} &&
        HOUR(${T}[Last Seen]) = hr &&
        NOT ${h} && NOT ${c} && ${p}
      )
      RETURN COUNTROWS(subset),
    "Total",
      VAR hr = [Value]
      VAR totalSubset = FILTER(
        ${T},
        ${baseCond} && HOUR(${T}[Last Seen]) = hr
      )
      RETURN COUNTROWS(totalSubset)
  ),
  "Hour",        [Value],
  "WithPatient", [WithPatient],
  "Total",       [Total]
)`
}

// ── Weekly trend (queries AppendFinal in Location History workspace) ──────────
// Groups the last 8 weeks of session data by ISO week number.
// Uses SubGeoZone (same naming patterns as Post-Aggregate[SubGeo]) to classify
// sessions as "With Patient". Returns row count ratio as a trend proxy —
// distinct-count inside GROUPBY/CURRENTGROUP is not natively supported in DAX.

const TL  = 'AppendFinal'

// ── GEOFENCE CATEGORY CLASSIFICATION ─────────────────────────────────────────
// Classification is driven by AppendFinal[Geofence] (floor/zone level), NOT SubGeoZone
// keyword patterns. Geofence names are facility-specific — "ISC Cleanroom" on 3rd Floor
// is a patient area, not a cleaning zone; "SPD 2" is the only real cleaning zone.
//
// FUTURE MIGRATION → Semantic Model table
// When the data team adds a "GeofenceCategories" table to the Fabric model (uploaded
// from Excel with columns: Geofence | Category), replace these hardcoded IN {} lists
// with a single LOOKUPVALUE call in categoryExprLH():
//
//   SWITCH(TRUE(),
//     AppendFinal[Geofence] = "Unknown Geofence", "unknown",
//     NOT ISBLANK(LOOKUPVALUE(GeofenceCategories[Category],
//                             GeofenceCategories[Geofence], AppendFinal[Geofence])),
//       LOOKUPVALUE(GeofenceCategories[Category],
//                   GeofenceCategories[Geofence], AppendFinal[Geofence]),
//     "other"
//   )
//
// Excel file rows needed (Geofence | Category):
//   1st Floor              | patient        Fountain - 4th Floor  | patient
//   2nd Floor              | patient        Fountain - 5th Floor  | patient
//   3rd Floor              | patient        Fountain - 6th Floor  | patient
//   ED                     | patient        Fountain - 7th Floor  | patient
//   Radiology              | patient        Fountain - 8th Floor  | patient
//   France - 4th Floor     | patient        Lohman Building IR    | patient
//   France - 5th Floor     | patient        ROC-ONC - 2nd Floor   | patient
//   France - 6th Floor     | patient        SPD 2                 | soiled
//   France - 7th Floor     | patient        Ground Floor General  | clean_storage
//   France - 8th Floor     | patient        Trauma Exit           | exit
//   France Tower - 9th Floor | patient      CDU Exit              | exit
//   Unknown Geofence       | unknown
//
function patientCondLH(): string {
  return (
    `${TL}[Geofence] IN {` +
    `"1st Floor", "2nd Floor", "3rd Floor", "ED", "Radiology", ` +
    `"Fountain - 4th Floor", "Fountain - 5th Floor", "Fountain - 6th Floor", ` +
    `"Fountain - 7th Floor", "Fountain - 8th Floor", ` +
    `"France - 4th Floor", "France - 5th Floor", "France - 6th Floor", ` +
    `"France - 7th Floor", "France - 8th Floor", "France Tower - 9th Floor", ` +
    `"Lohman Building IR", "ROC-ONC - 2nd Floor"` +
    `}`
  )
}

export function buildIHWeeklyTrendQuery(filters: InsightHubFilters): string {
  // Fabric global filter is "MinDiff is not 0" — MinDiff = DATEDIFF(Last Seen-Local, PreviousLastSeenNew_, MINUTE).
  // We compute it inline since MinDiff is a measure (not a column) and can't be used in FILTER().
  const durationOk  = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`
  const recentCond  = `${TL}[Last Seen-Local] >= TODAY() - 56`
  const baseConds: string[] = [durationOk, recentCond]

  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1) {
      baseConds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    } else if (vals.length > 1) {
      baseConds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
    }
  }
  addLHFloorBuildingConds(baseConds, filters)

  const baseFilter = baseConds.join(' && ')
  const p          = patientCondLH()

  // GROUPBY + CURRENTGROUP() lets us aggregate over derived columns (WeekNum, YearNum)
  // that don't exist as physical columns. SUMX([IsPatient]) counts patient sessions.
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    GROUPBY(
      ADDCOLUMNS(
        FILTER(${TL}, ${baseFilter}),
        "WeekNum",   WEEKNUM(${TL}[Last Seen-Local], 2),
        "YearNum",   YEAR(${TL}[Last Seen-Local]),
        "IsPatient", IF(${p}, 1, 0)
      ),
      [WeekNum],
      [YearNum],
      "Total",       COUNTX(CURRENTGROUP(), ${TL}[VIN]),
      "WithPatient", SUMX(CURRENTGROUP(), [IsPatient])
    ),
    [Total] > 0
  ),
  "WeekNum",     [WeekNum],
  "Year",        [YearNum],
  "Total",       [Total],
  "WithPatient", [WithPatient]
)
ORDER BY [Year] ASC, [WeekNum] ASC`
}

export function buildIHWeeklyTrendGFQuery(filters: InsightHubFilters): string {
  const durationOk  = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`
  const recentCond  = `${TL}[Last Seen-Local] >= TODAY() - 84`  // 12 weeks
  const baseConds: string[] = [durationOk, recentCond]

  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1) {
      baseConds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    } else if (vals.length > 1) {
      baseConds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
    }
  }
  addLHFloorBuildingConds(baseConds, filters)

  const baseFilter = baseConds.join(' && ')
  const p          = patientCondGFLH()

  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    GROUPBY(
      ADDCOLUMNS(
        FILTER(${TL}, ${baseFilter}),
        "WeekNum",   WEEKNUM(${TL}[Last Seen-Local], 2),
        "YearNum",   YEAR(${TL}[Last Seen-Local]),
        "IsPatient", IF(${p}, 1, 0)
      ),
      [WeekNum],
      [YearNum],
      "Total",       COUNTX(CURRENTGROUP(), ${TL}[VIN]),
      "WithPatient", SUMX(CURRENTGROUP(), [IsPatient])
    ),
    [Total] > 0
  ),
  "WeekNum",     [WeekNum],
  "Year",        [YearNum],
  "Total",       [Total],
  "WithPatient", [WithPatient]
)
ORDER BY [Year] ASC, [WeekNum] ASC`
}

// ── Location category helpers (AppendFinal) ───────────────────────────────────

// SPD 2 = the only decontamination zone in this facility.
// Used both as the "soiled" location category and the "cleaning" utilisation bucket.
function soiledCondLH(): string {
  return `${TL}[Geofence] = "SPD 2"`
}

// Alias kept so utilisation/asset-type queries read naturally
const cleaningCondLH = soiledCondLH

// Clean storage = Ground Floor General (Bed Storage, Infusion Therapy, Service Desk)
function cleanStorageCondLH(): string {
  return `${TL}[Geofence] = "Ground Floor General"`
}

// Exit geofences: Trauma Exit and CDU Exit
function exitCondLH(): string {
  return `${TL}[Geofence] IN {"Trauma Exit", "CDU Exit"}`
}

// categoryExprLH: 6-category classification driven by Geofence name.
// Priority: unknown → exit → soiled → clean_storage → patient → other
// Hallway and staff are not distinct geofences in this facility — they fall into other.
function categoryExprLH(): string {
  const unk = `${TL}[Geofence] = "Unknown Geofence"`
  const e   = exitCondLH()
  const s   = soiledCondLH()
  const cs  = cleanStorageCondLH()
  const p   = patientCondLH()
  return (
    `SWITCH(TRUE(), ` +
    `${unk}, "unknown", ` +
    `${e},   "exit", ` +
    `${s},   "soiled", ` +
    `${cs},  "clean_storage", ` +
    `${p},   "patient", ` +
    `"other")`
  )
}

// Appends floor + building conditions to an AppendFinal conds array.
// Shared by query builders that construct their own baseConds without going through lhBaseConds().
function addLHFloorBuildingConds(conds: string[], filters: InsightHubFilters): void {
  if (filters.floor) {
    const vals = filters.floor.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[Floor Level] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[Floor Level] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.building) {
    const vals = filters.building.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[Building] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[Building] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
}

function lhBaseConds(filters: InsightHubFilters, days?: number): string[] {
  const d   = days ?? filters.days ?? 7
  const dur = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  // When a specific day is selected, pin to that exact DateKey (computed inline — not a real column)
  const dateCond = filters.dateKey
    ? `DAY(${TL}[Last Seen-Local]) + MONTH(${TL}[Last Seen-Local]) * 100 + YEAR(${TL}[Last Seen-Local]) * 10000 = ${filters.dateKey}`
    : `${TL}[Last Seen-Local] >= TODAY() - ${d}`
  const conds: string[] = [`${dur} > 0`, dateCond]
  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.floor) {
    const vals = filters.floor.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[Floor Level] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[Floor Level] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.building) {
    const vals = filters.building.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[Building] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[Building] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  return conds
}

// ── GF-specific building groupings (Halifax campus) ──────────────────────────
// Halifax Health is a multi-building campus. These conditions group the
// Fountain and France Tower sister-building floors into separate categories
// so they don't collapse into the generic "patient" bucket.

function franceTowerCondLH(): string {
  return (
    `${TL}[Geofence] IN {` +
    `"France - 4th Floor", "France - 5th Floor", "France - 6th Floor", ` +
    `"France - 7th Floor", "France - 8th Floor", "France Tower - 9th Floor"}`
  )
}

function fountainCondLH(): string {
  return (
    `${TL}[Geofence] IN {` +
    `"Fountain - 4th Floor", "Fountain - 5th Floor", "Fountain - 6th Floor", ` +
    `"Fountain - 7th Floor", "Fountain - 8th Floor"}`
  )
}

function satelliteCondLH(): string {
  return `${TL}[Geofence] IN {"Lohman Building IR", "ROC-ONC - 2nd Floor"}`
}

// categoryExprGFLH: 9-category classification for GF clients (Halifax).
// Separates France Tower, Fountain, and Satellite clinics from patient floors.
// Priority: unknown → exit → soiled → clean_storage → patient (5 zones) →
//           france_tower → fountain → satellite → other
function categoryExprGFLH(): string {
  const unk = `${TL}[Geofence] = "Unknown Geofence"`
  const e   = exitCondLH()
  const s   = soiledCondLH()
  const cs  = cleanStorageCondLH()
  const p   = patientCondGFLH()
  const ft  = franceTowerCondLH()
  const fo  = fountainCondLH()
  const sat = satelliteCondLH()
  return (
    `SWITCH(TRUE(), ` +
    `${unk}, "unknown", ` +
    `${e},   "exit", ` +
    `${s},   "soiled", ` +
    `${cs},  "clean_storage", ` +
    `${p},   "patient", ` +
    `${ft},  "france_tower", ` +
    `${fo},  "fountain", ` +
    `${sat}, "satellite", ` +
    `"other")`
  )
}

// ── Location category summary ─────────────────────────────────────────────────
// Groups last 7 days of AppendFinal sessions into 4 derived categories.
// Returns session-minute totals + asset row counts (not distinct) per category.

export function buildIHLocationCategoryQuery(filters: InsightHubFilters): string {
  const dur        = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const baseFilter = lhBaseConds(filters).join(' && ')
  const catExpr    = categoryExprLH()

  // Two-step GROUPBY to get distinct device count per category:
  // Step 1 — collapse to one row per (Category, VIN), summing session minutes
  // Step 2 — collapse to one row per Category; COUNTX in step 2 counts unique VINs
  return `EVALUATE
VAR _annotated = ADDCOLUMNS(
  FILTER(${TL}, ${baseFilter}),
  "Category", ${catExpr},
  "DurMins",  ${dur}
)
VAR _vinCat = GROUPBY(
  _annotated,
  [Category],
  ${TL}[VIN],
  "VINMins", SUMX(CURRENTGROUP(), [DurMins])
)
RETURN
SELECTCOLUMNS(
  FILTER(
    GROUPBY(
      _vinCat,
      [Category],
      "TotalMins",  SUMX(CURRENTGROUP(), [VINMins]),
      "AssetCount", COUNTX(CURRENTGROUP(), ${TL}[VIN])
    ),
    [TotalMins] > 0
  ),
  "Category",   [Category],
  "TotalMins",  [TotalMins],
  "AssetCount", [AssetCount]
)
ORDER BY [TotalMins] DESC`
}

// GF variant: uses 9-category expression (patient = 5 zones only, plus building splits)
export function buildIHLocationCategoryGFQuery(filters: InsightHubFilters): string {
  const dur        = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const baseFilter = lhBaseConds(filters).join(' && ')
  const catExpr    = categoryExprGFLH()

  return `EVALUATE
VAR _annotated = ADDCOLUMNS(
  FILTER(${TL}, ${baseFilter}),
  "Category", ${catExpr},
  "DurMins",  ${dur}
)
VAR _vinCat = GROUPBY(
  _annotated,
  [Category],
  ${TL}[VIN],
  "VINMins", SUMX(CURRENTGROUP(), [DurMins])
)
RETURN
SELECTCOLUMNS(
  FILTER(
    GROUPBY(
      _vinCat,
      [Category],
      "TotalMins",  SUMX(CURRENTGROUP(), [VINMins]),
      "AssetCount", COUNTX(CURRENTGROUP(), ${TL}[VIN])
    ),
    [TotalMins] > 0
  ),
  "Category",   [Category],
  "TotalMins",  [TotalMins],
  "AssetCount", [AssetCount]
)
ORDER BY [TotalMins] DESC`
}

// ── Location category asset list (drill-down) ─────────────────────────────────
// For a selected category key (filters.category), returns top 50 assets ranked
// by session time in that category over the last 7 days.

export function buildIHCategoryAssetsQuery(filters: InsightHubFilters): string {
  const dur  = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const base = lhBaseConds(filters)

  const p   = patientCondLH()
  const cs  = cleanStorageCondLH()
  const s   = soiledCondLH()
  const e   = exitCondLH()
  const unk = `${TL}[Geofence] = "Unknown Geofence"`
  let catCond: string
  switch (filters.category) {
    case 'patient':       catCond = p; break
    case 'hallway':       catCond = `NOT ${p} && NOT ${s} && NOT ${cs} && NOT ${e} && NOT ${unk}`; break
    case 'clean_storage': catCond = cs; break
    case 'soiled':        catCond = s; break
    case 'staff':         catCond = `NOT ${p} && NOT ${s} && NOT ${cs} && NOT ${e} && NOT ${unk}`; break
    case 'exit':          catCond = e; break
    case 'unknown':       catCond = unk; break
    case 'cleaning':      catCond = s; break  // legacy — maps to soiled (SPD 2)
    default:              catCond = `NOT ${p} && NOT ${cs} && NOT ${s} && NOT ${e} && NOT ${unk}`
  }

  const allConds = [...base, catCond].join(' && ')

  return `EVALUATE
SELECTCOLUMNS(
  TOPN(
    50,
    FILTER(
      GROUPBY(
        FILTER(${TL}, ${allConds}),
        ${TL}[VIN],
        ${TL}[Name],
        ${TL}[AssetType],
        "TotalMins", SUMX(CURRENTGROUP(), ${dur}),
        "LastSeen",  MAXX(CURRENTGROUP(), ${TL}[PreviousLastSeenNew_]),
        "HomeFloor", MAXX(CURRENTGROUP(), ${TL}[Floor Level])
      ),
      [TotalMins] > 0
    ),
    [TotalMins], 0
  ),
  "AssetId",   ${TL}[VIN],
  "AssetName", ${TL}[Name],
  "AssetType", ${TL}[AssetType],
  "TotalMins", [TotalMins],
  "LastSeen",  [LastSeen],
  "HomeFloor", [HomeFloor]
)
ORDER BY [TotalMins] DESC`
}

// GF variant: supports 9 categories including france_tower, fountain, satellite
export function buildIHCategoryAssetsGFQuery(filters: InsightHubFilters): string {
  const dur  = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const base = lhBaseConds(filters)

  const p   = patientCondGFLH()
  const cs  = cleanStorageCondLH()
  const s   = soiledCondLH()
  const e   = exitCondLH()
  const ft  = franceTowerCondLH()
  const fo  = fountainCondLH()
  const sat = satelliteCondLH()
  const unk = `${TL}[Geofence] = "Unknown Geofence"`
  let catCond: string
  switch (filters.category) {
    case 'patient':       catCond = p;   break
    case 'clean_storage': catCond = cs;  break
    case 'soiled':        catCond = s;   break
    case 'exit':          catCond = e;   break
    case 'france_tower':  catCond = ft;  break
    case 'fountain':      catCond = fo;  break
    case 'satellite':     catCond = sat; break
    case 'unknown':       catCond = unk; break
    default:              catCond = `NOT ${p} && NOT ${cs} && NOT ${s} && NOT ${e} && NOT ${ft} && NOT ${fo} && NOT ${sat} && NOT ${unk}`
  }

  const allConds = [...base, catCond].join(' && ')

  return `EVALUATE
SELECTCOLUMNS(
  TOPN(
    50,
    FILTER(
      GROUPBY(
        FILTER(${TL}, ${allConds}),
        ${TL}[VIN],
        ${TL}[Name],
        ${TL}[AssetType],
        "TotalMins", SUMX(CURRENTGROUP(), ${dur}),
        "LastSeen",  MAXX(CURRENTGROUP(), ${TL}[PreviousLastSeenNew_]),
        "HomeFloor", MAXX(CURRENTGROUP(), ${TL}[Floor Level])
      ),
      [TotalMins] > 0
    ),
    [TotalMins], 0
  ),
  "AssetId",   ${TL}[VIN],
  "AssetName", ${TL}[Name],
  "AssetType", ${TL}[AssetType],
  "TotalMins", [TotalMins],
  "LastSeen",  [LastSeen],
  "HomeFloor", [HomeFloor]
)
ORDER BY [TotalMins] DESC`
}

// ── Floor readiness (AppendFinal — distinct assets per floor per day) ─────────
// Returns one row per unique (Floor Level, Date, VIN) combination over last 7 days.
// SUMMARIZE deduplicates so each asset counts once per floor per day regardless
// of how many sessions it had. The API route groups by (floor, date) and counts
// rows to get distinct-asset counts, then applies par thresholds from config.

const FLOOR_COL = `${TL}[Floor Level]`

export function buildIHFloorReadinessQuery(filters: InsightHubFilters): string {
  // Matches Fabric's global "MinDiff is not 0" filter — excludes ghost single-ping sessions.
  // MinDiff is a measure so we compute inline: DATEDIFF(Last Seen-Local, PreviousLastSeenNew_, MINUTE) > 0
  const durationOk  = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`
  const recentCond  = `${TL}[Last Seen-Local] >= TODAY() - 6`
  const floorValid  = `NOT ISBLANK(${FLOOR_COL}) && ${FLOOR_COL} <> "" && ${FLOOR_COL} <> "Unknown"`
  // Rush hour: only count assets present on the floor during 8am–10am morning medication pass.
  // A session overlaps 8–10am if it started before 10am AND ended at or after 8am.
  const rushHour    = `HOUR(${TL}[PreviousLastSeenNew_]) < 10 && HOUR(${TL}[Last Seen-Local]) >= 8`
  const baseConds   = [durationOk, recentCond, floorValid, rushHour]

  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1) {
      baseConds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    } else if (vals.length > 1) {
      baseConds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
    }
  }
  addLHFloorBuildingConds(baseConds, filters)

  return `EVALUATE
SELECTCOLUMNS(
  SUMMARIZE(
    ADDCOLUMNS(
      FILTER(${TL}, ${baseConds.join(' && ')}),
      "__Floor",   ${FLOOR_COL},
      "__VIN",     ${TL}[VIN],
      "__DateKey", DATE(YEAR(${TL}[Last Seen-Local]), MONTH(${TL}[Last Seen-Local]), DAY(${TL}[Last Seen-Local]))
    ),
    [__Floor], [__DateKey], [__VIN]
  ),
  "Floor", [__Floor],
  "Date",  [__DateKey],
  "VIN",   [__VIN]
)`
}

// ── Floor readiness by asset type (all types, no assetType filter) ──────────
// Returns (AssetType, Floor, Date, VIN) so the server can compute per-type
// floor readiness stats (enoughFloors / tightFloors / shortFloors / pctMet).

export function buildIHFloorReadinessByTypeQuery(): string {
  const durationOk = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`
  const recentCond = `${TL}[Last Seen-Local] >= TODAY() - 6`
  const floorValid = `NOT ISBLANK(${FLOOR_COL}) && ${FLOOR_COL} <> "" && ${FLOOR_COL} <> "Unknown"`
  const typeValid  = `NOT ISBLANK(${TL}[AssetType]) && ${TL}[AssetType] <> ""`
  // Rush hour: only count assets present during 8am–10am morning medication pass.
  const rushHour   = `HOUR(${TL}[PreviousLastSeenNew_]) < 10 && HOUR(${TL}[Last Seen-Local]) >= 8`

  return `EVALUATE
SELECTCOLUMNS(
  SUMMARIZE(
    ADDCOLUMNS(
      FILTER(${TL}, ${durationOk} && ${recentCond} && ${floorValid} && ${typeValid} && ${rushHour}),
      "__AT",      ${TL}[AssetType],
      "__Floor",   ${FLOOR_COL},
      "__VIN",     ${TL}[VIN],
      "__DateKey", DATE(YEAR(${TL}[Last Seen-Local]), MONTH(${TL}[Last Seen-Local]), DAY(${TL}[Last Seen-Local]))
    ),
    [__AT], [__Floor], [__DateKey], [__VIN]
  ),
  "AssetType", [__AT],
  "Floor",     [__Floor],
  "Date",      [__DateKey],
  "VIN",       [__VIN]
)`
}

// ── Building options (Post-Aggregate — for GF clients like Halifax) ───────────

export function buildIHBuildingOptionsQuery(): string {
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    DISTINCT(SELECTCOLUMNS(${T}, "value", ${T}[Building])),
    NOT ISBLANK([value]) && [value] <> ""
  ),
  "value", [value]
)
ORDER BY [value] ASC`
}

// ── Building options (AppendFinal — for LH-based clients) ─────────────────────

export function buildIHBuildingOptionsLHQuery(): string {
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    DISTINCT(SELECTCOLUMNS(${TL}, "value", ${TL}[Building])),
    NOT ISBLANK([value]) && [value] <> ""
  ),
  "value", [value]
)
ORDER BY [value] ASC`
}

// ── Asset type options (Post-Aggregate — for clients with Missing Assets Portal) ──

export function buildIHAssetTypeOptionsQuery(): string {
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    DISTINCT(SELECTCOLUMNS(${T}, "value", ${T}[AssetType])),
    NOT ISBLANK([value]) && [value] <> "None"
  ),
  "value", [value]
)
ORDER BY [value] ASC`
}

// ── Asset type options (AppendFinal — for Location History Portal clients) ─────
// Used when the Insight Hub dataset lives in the LH workspace (e.g. Halifax).

export function buildIHAssetTypeOptionsLHQuery(): string {
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    DISTINCT(SELECTCOLUMNS(${TL}, "value", ${TL}[AssetType])),
    NOT ISBLANK([value]) && [value] <> "None"
  ),
  "value", [value]
)
ORDER BY [value] ASC`
}

// ── Floor assets — current / recent assets on a specific floor ────────────────
// Returns up to 500 rows ordered by LastSeen DESC so the server can deduplicate
// to the most recent session per VIN. filters.floor must be set to the exact floor name.

export function buildIHFloorAssetsQuery(floor: string, assetType?: string): string {
  const floorSafe = sanitize(floor)
  const dur       = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const conds     = [
    `${TL}[Floor Level] = "${floorSafe}"`,
    `${TL}[Last Seen-Local] >= TODAY() - 7`,
    `${dur} > 0`,
  ]
  if (assetType) {
    const vals = assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  // LastSeen  = PreviousLastSeenNew_ — session END (most recent confirmation)
  // PrevSeen  = Last Seen-Local      — session START
  // TOPN sorts DESC so the client-side deduplication (first row per VIN) keeps the most recent session.
  // 5000 rows handles ~100 devices × ~7 days × ~7 sessions/day safely within the 100K Execute Queries limit.
  return `EVALUATE
TOPN(
  5000,
  SELECTCOLUMNS(
    FILTER(
      ${TL},
      ${conds.join(' && ')}
    ),
    "VIN",       ${TL}[VIN],
    "AssetName", ${TL}[Name],
    "AssetType", ${TL}[AssetType],
    "SubGeo",    ${TL}[SubGeoZone],
    "LastSeen",  ${TL}[PreviousLastSeenNew_],
    "PrevSeen",  ${TL}[Last Seen-Local]
  ),
  [LastSeen], DESC
)`
}

// ── Location category daily breakdown ─────────────────────────────────────────
// For a selected category, returns one row per calendar day over the look-back
// window: total fleet minutes that day (TotalMins), minutes in the category
// (CatMins), and distinct asset count in that category (AssetCount).
// Client computes pct = CatMins / TotalMins * 100.

export function buildIHCategoryDailyQuery(filters: InsightHubFilters): string {
  if (!filters.category) return `EVALUATE ROW("Error", "No category provided")`
  const dur        = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const baseFilter = lhBaseConds(filters).join(' && ')
  const catExpr    = categoryExprLH()
  const cat        = sanitize(filters.category)

  return `EVALUATE
VAR _base = FILTER(${TL}, ${baseFilter})
VAR _annotated = ADDCOLUMNS(
  _base,
  "Category", ${catExpr},
  "DurMins",  ${dur},
  "DateKey",
    DAY(${TL}[Last Seen-Local]) +
    MONTH(${TL}[Last Seen-Local]) * 100 +
    YEAR(${TL}[Last Seen-Local])  * 10000
)
VAR _grouped = GROUPBY(
  _annotated,
  [DateKey],
  "TotalMins",  SUMX(CURRENTGROUP(), [DurMins]),
  "CatMins",    SUMX(CURRENTGROUP(), IF([Category] = "${cat}", [DurMins], 0)),
  "AssetCount", SUMX(CURRENTGROUP(), IF([Category] = "${cat}", 1, 0))
)
RETURN
SELECTCOLUMNS(
  FILTER(_grouped, [TotalMins] > 0),
  "DateKey",    [DateKey],
  "TotalMins",  [TotalMins],
  "CatMins",    [CatMins],
  "AssetCount", [AssetCount]
)
ORDER BY [DateKey] ASC`
}

export function buildIHCategoryDailyGFQuery(filters: InsightHubFilters): string {
  if (!filters.category) return `EVALUATE ROW("Error", "No category provided")`
  const dur        = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const baseFilter = lhBaseConds(filters).join(' && ')
  const catExpr    = categoryExprGFLH()
  const cat        = sanitize(filters.category)

  return `EVALUATE
VAR _base = FILTER(${TL}, ${baseFilter})
VAR _annotated = ADDCOLUMNS(
  _base,
  "Category", ${catExpr},
  "DurMins",  ${dur},
  "DateKey",
    DAY(${TL}[Last Seen-Local]) +
    MONTH(${TL}[Last Seen-Local]) * 100 +
    YEAR(${TL}[Last Seen-Local])  * 10000
)
VAR _grouped = GROUPBY(
  _annotated,
  [DateKey],
  "TotalMins",  SUMX(CURRENTGROUP(), [DurMins]),
  "CatMins",    SUMX(CURRENTGROUP(), IF([Category] = "${cat}", [DurMins], 0)),
  "AssetCount", SUMX(CURRENTGROUP(), IF([Category] = "${cat}", 1, 0))
)
RETURN
SELECTCOLUMNS(
  FILTER(_grouped, [TotalMins] > 0),
  "DateKey",    [DateKey],
  "TotalMins",  [TotalMins],
  "CatMins",    [CatMins],
  "AssetCount", [AssetCount]
)
ORDER BY [DateKey] ASC`
}

// buildIHAssetTrailQuery is defined below (after the LH helpers it depends on)

// ── Floor hourly — raw sessions for one floor over last 7 days ────────────────
// Returns VIN + SessionStart + SessionEnd per session row.
// Client-side hour-bins these into "avg distinct assets at each hour of day".

export function buildIHFloorHourlyQuery(floor: string, assetType?: string): string {
  const floorSafe = sanitize(floor)
  const dur       = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const conds     = [
    `${TL}[Floor Level] = "${floorSafe}"`,
    `${TL}[Last Seen-Local] >= TODAY() - 7`,
    `${dur} > 0`,
  ]
  if (assetType) {
    const vals = assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    ${TL},
    ${conds.join(' && ')}
  ),
  "VIN",          ${TL}[VIN],
  "SessionStart", ${TL}[Last Seen-Local],
  "SessionEnd",   ${TL}[PreviousLastSeenNew_]
)`
}

// ── Refresh time ───────────────────────────────────────────────────────────────

export function buildIHRefreshTimeQuery(): string {
  return `EVALUATE ROW("RefreshTime", MAX(${T}[Last Refresh]))`
}

// ── LH-based utilisation (for clients without Post-Aggregate table) ───────────
// Counts DISTINCT VINs per category from AppendFinal session data (last 7 days).
// Priority: HardToFind > Cleaning > WithPatient > SittingUnused.
// A VIN can appear in multiple sessions across categories; we count it in all
// matching ones — sittingUnused is derived client-side as total - others.

// Exclusive-bucket LH utilisation: assigns each VIN to the category where it spent
// the most minutes over the last 7 days (priority: HardToFind > Cleaning > WithPatient > SittingUnused).
// Uses GROUPBY + SUMX(CURRENTGROUP()) to compute per-VIN minutes per category, then
// COUNTROWS(FILTER()) to tally exclusive buckets. SittingUnused derived client-side.
export function buildIHUtilisationLHQuery(filters: InsightHubFilters): string {
  const baseConds  = lhBaseConds(filters)
  const baseFilter = baseConds.join(' && ')
  const dur        = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const p          = patientCondLH()
  const c          = cleaningCondLH()
  const unknown    = `${TL}[Geofence] = "Unknown Geofence"`

  return `EVALUATE
VAR _flags = ADDCOLUMNS(
  FILTER(${TL}, ${baseFilter}),
  "__DurMins",    ${dur},
  "__FlagUnk",    IF(${unknown}, 1, 0),
  "__FlagClean",  IF(NOT (${unknown}) && (${c}), 1, 0),
  "__FlagPat",    IF(NOT (${unknown}) && NOT (${c}) && (${p}), 1, 0)
)
VAR _byVIN = GROUPBY(
  _flags,
  ${TL}[VIN],
  "__Total",   SUMX(CURRENTGROUP(), [__DurMins]),
  "__Unk",     SUMX(CURRENTGROUP(), [__DurMins] * [__FlagUnk]),
  "__Clean",   SUMX(CURRENTGROUP(), [__DurMins] * [__FlagClean]),
  "__Pat",     SUMX(CURRENTGROUP(), [__DurMins] * [__FlagPat])
)
VAR _total   = COUNTROWS(_byVIN)
VAR _hard    = COUNTROWS(FILTER(_byVIN, [__Total] > 0 && DIVIDE([__Unk],   [__Total]) > 0.5))
VAR _clean   = COUNTROWS(FILTER(_byVIN, [__Total] > 0 && DIVIDE([__Unk],   [__Total]) <= 0.5 && DIVIDE([__Clean], [__Total]) >= 0.25))
VAR _patient = COUNTROWS(FILTER(_byVIN, [__Total] > 0 && DIVIDE([__Unk],   [__Total]) <= 0.5 && DIVIDE([__Clean], [__Total]) < 0.25 && DIVIDE([__Pat], [__Total]) >= 0.25))
RETURN ROW(
  "Total",       _total,
  "WithPatient", _patient,
  "Cleaning",    _clean,
  "HardToFind",  _hard
)`
}

// ── LH-based asset-type utilisation breakdown ─────────────────────────────────
// One row per AssetType with distinct-VIN counts per category.

export function buildIHAssetTypeUtilisationLHQuery(filters: InsightHubFilters = {}): string {
  // Intentionally ignores assetType filter — all asset types must appear side by side.
  // Respects floor and building so the breakdown reflects the active scope.
  const d = filters.days ?? 7
  const baseConds: string[] = [
    `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`,
    `${TL}[Last Seen-Local] >= TODAY() - ${d}`,
  ]
  addLHFloorBuildingConds(baseConds, filters)
  const baseFilter = baseConds.join(' && ')
  const p          = patientCondLH()
  const c          = cleaningCondLH()
  const unknown    = `${TL}[Geofence] = "Unknown Geofence"`

  return `EVALUATE
FILTER(
  SELECTCOLUMNS(
    SUMMARIZECOLUMNS(
      ${TL}[AssetType],
      FILTER(${TL}, ${baseFilter} && NOT ISBLANK(${TL}[AssetType]) && ${TL}[AssetType] <> ""),
      "Total",       CALCULATE(DISTINCTCOUNT(${TL}[VIN])),
      "WithPatient", CALCULATE(DISTINCTCOUNT(${TL}[VIN]), FILTER(${TL}, ${baseFilter} && NOT (${unknown}) && NOT (${c}) && (${p}))),
      "Cleaning",    CALCULATE(DISTINCTCOUNT(${TL}[VIN]), FILTER(${TL}, ${baseFilter} && NOT (${unknown}) && (${c}))),
      "HardToFind",  CALCULATE(DISTINCTCOUNT(${TL}[VIN]), FILTER(${TL}, ${baseFilter} && (${unknown})))
    ),
    "AssetType",   ${TL}[AssetType],
    "Total",       [Total],
    "WithPatient", [WithPatient],
    "Cleaning",    [Cleaning],
    "HardToFind",  [HardToFind]
  ),
  [Total] > 0
)
ORDER BY [Total] DESC`
}

// ── LH-based hourly utilisation ───────────────────────────────────────────────
// For each hour 0-23, count distinct VINs whose sessions (last 7 days) included
// that hour AND whose SubGeoZone classifies as "With Patient".

export function buildIHHourlyLHQuery(filters: InsightHubFilters): string {
  const baseConds  = lhBaseConds(filters)
  const baseFilter = baseConds.join(' && ')
  const p          = patientCondLH()

  return `EVALUATE
SELECTCOLUMNS(
  ADDCOLUMNS(
    GENERATESERIES(0, 23),
    "WithPatient",
      VAR hr = [Value]
      RETURN CALCULATE(
        DISTINCTCOUNT(${TL}[VIN]),
        FILTER(${TL}, ${baseFilter} && (${p}) &&
          HOUR(${TL}[Last Seen-Local]) = hr)
      ),
    "Total",
      VAR hr = [Value]
      RETURN CALCULATE(
        DISTINCTCOUNT(${TL}[VIN]),
        FILTER(${TL}, ${baseFilter} && HOUR(${TL}[Last Seen-Local]) = hr)
      )
  ),
  "Hour",        [Value],
  "WithPatient", [WithPatient],
  "Total",       [Total]
)`
}

// ── LH-based refresh time ─────────────────────────────────────────────────────

export function buildIHRefreshTimeLHQuery(): string {
  return `EVALUATE ROW("RefreshTime", MAX(${TL}[PreviousLastSeenNew_]))`
}

// ── LH-based peak utilisation ─────────────────────────────────────────────────
// Finds the maximum number of distinct VINs simultaneously in patient-area
// sessions within any single (date, hour) bucket over the last 7 days.
// Strategy:
//   1. Filter to patient sessions → assign each row a DateHour integer key
//   2. SUMMARIZE deduplicates to one row per (VIN, DateHour)
//   3. GROUPBY counts unique VINs per DateHour
//   4. MAXX picks the peak bucket
// Not available for Post-Aggregate clients — they have no session history.

export function buildIHPeakUtilisationLHQuery(filters: InsightHubFilters): string {
  const baseConds  = lhBaseConds(filters)
  const baseFilter = baseConds.join(' && ')
  const p          = patientCondLH()
  const unknown    = `${TL}[Geofence] = "Unknown Geofence"`

  return `EVALUATE
VAR _patSessions = ADDCOLUMNS(
  FILTER(${TL}, ${baseFilter} && NOT (${unknown}) && (${p})),
  "__DH",
    HOUR(${TL}[Last Seen-Local]) +
    DAY(${TL}[Last Seen-Local])   * 100 +
    MONTH(${TL}[Last Seen-Local]) * 10000 +
    YEAR(${TL}[Last Seen-Local])  * 1000000
)
VAR _deduped  = SUMMARIZE(_patSessions, ${TL}[VIN], [__DH])
VAR _byDH     = GROUPBY(_deduped, [__DH], "__Count", COUNTX(CURRENTGROUP(), ${TL}[VIN]))
VAR _peak     = IF(COUNTROWS(_byDH) > 0, MAXX(_byDH, [__Count]), 0)
VAR _peakDH   = MAXX(FILTER(_byDH, [__Count] = _peak), [__DH])
VAR _peakHour = MOD(_peakDH, 100)
VAR _peakDay  = MOD(INT(DIVIDE(_peakDH, 100)), 100)
VAR _peakMon  = MOD(INT(DIVIDE(_peakDH, 10000)), 100)
VAR _peakYear = INT(DIVIDE(_peakDH, 1000000))
RETURN
ROW(
  "PeakCount", _peak,
  "PeakHour",  _peakHour,
  "PeakDay",   _peakDay,
  "PeakMonth", _peakMon,
  "PeakYear",  _peakYear
)`
}

// ── Asset trail (yesterday's sessions for a single VIN) ───────────────────────
// Returns every session from yesterday for the given VIN, ordered chronologically.
// Used by the 3rd-level "trail" drill-down in WhereDoTheySpend.

export function buildIHAssetTrailQuery(filters: InsightHubFilters): string {
  if (!filters.vin) return `EVALUATE ROW("Error", "No VIN provided")`
  const vin     = sanitize(filters.vin)
  const dur     = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`
  const catExpr = categoryExprLH()
  // When a specific day was selected in the bar chart, pin the trail to that day only
  const dateCond = filters.dateKey
    ? `DAY(${TL}[Last Seen-Local]) + MONTH(${TL}[Last Seen-Local]) * 100 + YEAR(${TL}[Last Seen-Local]) * 10000 = ${filters.dateKey}`
    : `${TL}[Last Seen-Local] >= TODAY() - 7`

  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    ADDCOLUMNS(
      FILTER(
        ${TL},
        ${TL}[VIN] = "${vin}" &&
        ${dateCond} &&
        ${dur} > 0
      ),
      "DurMins",  ${dur},
      "Category", ${catExpr}
    ),
    [DurMins] > 0
  ),
  "StartTime",  ${TL}[Last Seen-Local],
  "DurMins",    [DurMins],
  "SubGeoZone", ${TL}[SubGeoZone],
  "Geofence",   ${TL}[Geofence],
  "FloorLevel", ${TL}[Floor Level],
  "Category",   [Category],
  "AssetName",  ${TL}[Name],
  "AssetType",  ${TL}[AssetType]
)
ORDER BY [StartTime] ASC`
}

// ── Geofence-based Post-Aggregate helpers (Halifax) ───────────────────────────
// Halifax's Post-Aggregate table has different column names than BSA's:
//   [LastSeen]            instead of [Last Seen]
//   [RefreshDate]         instead of [Last Refresh]
//   [Exits and Non Exits] instead of [Outside/Inside]
// Classification uses the Geofence column (same values as AppendFinal) not SubGeo keywords.
//
// Client-confirmed classification (can become config when Excel mapping is available):
//   With patient    → 5 clinical zones only (3 floors + ED + Radiology)
//   Cleaning/moving → any geofence starting with "Ground Floor"
//   Hard to find    → not seen in the last 24 hours ([Not seen since] >= 24)
//   Sitting unused  → everything else

function patientCondGF(): string {
  // Client spec: 3rd floor, 2nd floor, 1st floor, ED, Radiology only
  return `${T}[Geofence] IN {"1st Floor", "2nd Floor", "3rd Floor", "ED", "Radiology"}`
}

function cleaningCondGF(): string {
  // "Ground Floor" = cleaning/moving area per client spec (prefix match, 12 chars)
  return `LEFT(${T}[Geofence], 12) = "Ground Floor"`
}

function hardToFindCondGF(): string {
  // "Not seen over 1 day" per client spec = 24 hours
  return `${T}[Not seen since] >= 24`
}

export function buildIHUtilisationGFQuery(filters: InsightHubFilters): string {
  const src = buildSource(filters)
  const h   = hardToFindCondGF()
  const c   = cleaningCondGF()
  const p   = patientCondGF()
  const countWhere = (cond: string) => `COUNTROWS(FILTER(${src}, ${cond}))`
  return `EVALUATE
ROW(
  "Total",       COUNTROWS(${src}),
  "WithPatient", ${countWhere(`NOT ${h} && NOT ${c} && ${p}`)},
  "Cleaning",    ${countWhere(`NOT ${h} && ${c}`)},
  "HardToFind",  ${countWhere(h)}
)`
}

export function buildIHHourlyGFQuery(filters: InsightHubFilters): string {
  const conds    = buildIHFilterConditions(filters)
  const baseCond = conds.length > 0 ? conds.join(' && ') : 'TRUE()'
  const h = hardToFindCondGF()
  const c = cleaningCondGF()
  const p = patientCondGF()
  return `EVALUATE
SELECTCOLUMNS(
  ADDCOLUMNS(
    GENERATESERIES(0, 23),
    "WithPatient",
      VAR hr = [Value]
      VAR s = FILTER(${T}, ${baseCond} && HOUR(${T}[LastSeen]) = hr && NOT ${h} && NOT ${c} && ${p})
      RETURN COUNTROWS(s),
    "Total",
      VAR hr = [Value]
      VAR s = FILTER(${T}, ${baseCond} && HOUR(${T}[LastSeen]) = hr)
      RETURN COUNTROWS(s)
  ),
  "Hour",        [Value],
  "WithPatient", [WithPatient],
  "Total",       [Total]
)`
}

export function buildIHAssetTypeUtilisationGFQuery(filters: InsightHubFilters = {}): string {
  // Intentionally ignores assetType so every type appears side-by-side.
  // Respects floor and building so the breakdown reflects the active scope.
  const conds: string[] = []
  if (filters.floor) {
    const vals = filters.floor.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Floor] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Floor] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  if (filters.building) {
    const vals = filters.building.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${T}[Building] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${T}[Building] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  const filterArg = conds.length > 0 ? `\n      FILTER(${T}, ${conds.join(' && ')}),` : ''
  const h = hardToFindCondGF()
  const c = cleaningCondGF()
  const p = patientCondGF()
  return `EVALUATE
SELECTCOLUMNS(
  FILTER(
    SUMMARIZECOLUMNS(
      ${T}[AssetType],${filterArg}
      "Total",       CALCULATE(COUNTROWS(${T})),
      "HardToFind",  CALCULATE(COUNTROWS(${T}), FILTER(${T}, ${h})),
      "Cleaning",    CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && ${c})),
      "WithPatient", CALCULATE(COUNTROWS(${T}), FILTER(${T}, NOT ${h} && NOT ${c} && ${p}))
    ),
    [Total] > 0 && NOT ISBLANK(${T}[AssetType])
  ),
  "AssetType",   ${T}[AssetType],
  "Total",       [Total],
  "WithPatient", [WithPatient],
  "Cleaning",    [Cleaning],
  "HardToFind",  [HardToFind]
)
ORDER BY [Total] DESC`
}

export function buildIHHidingSpotsGFQuery(filters: InsightHubFilters): string {
  const filterConds = buildIHFilterConditions(filters)
  const h   = hardToFindCondGF()
  const p   = patientCondGF()
  const c   = cleaningCondGF()
  const unk = `${T}[Geofence] = "Unknown Geofence"`
  // exits (Trauma Exit, CDU Exit, Laundry, Psych, etc.) are classified as sitting unused
  // so they intentionally surface here as hiding spots
  const unusedConds = [...filterConds, `NOT ${h}`, `NOT ${p}`, `NOT ${c}`, `NOT ${unk}`]
  return `EVALUATE
TOPN(
  25,
  SELECTCOLUMNS(
    SUMMARIZECOLUMNS(
      ${T}[SubGeo],
      ${T}[Floor],
      FILTER(${T}, ${unusedConds.join(' && ')}),
      "Count", CALCULATE(COUNTROWS(${T}))
    ),
    "SubGeo", ${T}[SubGeo],
    "Floor",  ${T}[Floor],
    "Count",  [Count]
  ),
  [Count], 0
)
ORDER BY [Count] DESC`
}

// ── GF Hours-based utilisation (AppendFinal) ─────────────────────────────────
// Uses session history instead of the Post-Aggregate snapshot to compute the
// % of time equipment spends in patient zones on an average day:
//   PatientMins / (totalVINs × days × 24 × 60) × 100
// Returned as [HoursBasedPct] and merged into the utilisation response by route.ts.

export function buildIHUtilisationHoursGFQuery(filters: InsightHubFilters): string {
  const conds: string[] = [
    `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`,
    `${TL}[Last Seen-Local] >= TODAY() - 7`,
  ]

  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1) {
      conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    } else if (vals.length > 1) {
      conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
    }
  }
  addLHFloorBuildingConds(conds, filters)

  const baseFilter = conds.join(' && ')
  // Same 5-zone patient definition as patientCondGF() — consistent across both sources
  const patient = `${TL}[Geofence] IN {"1st Floor", "2nd Floor", "3rd Floor", "ED", "Radiology"}`
  const durExpr = `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE)`

  return `EVALUATE
VAR _days    = 7
VAR _base    = FILTER(${TL}, ${baseFilter})
VAR _vins    = CALCULATE(DISTINCTCOUNT(${TL}[VIN]), _base)
VAR _capMins = _vins * _days * 24 * 60
VAR _patMins = SUMX(FILTER(_base, ${patient}), ${durExpr})
RETURN
ROW("HoursBasedPct", IF(_capMins > 0, DIVIDE(_patMins, _capMins) * 100, BLANK()))`
}

export function buildIHRefreshTimeGFQuery(): string {
  return `EVALUATE ROW("RefreshTime", MAX(${T}[RefreshDate]))`
}

// ── GF patient condition for AppendFinal ──────────────────────────────────────
// Same 5-zone definition as patientCondGF() but targets AppendFinal[Geofence].
// Used by per-day hourly and daily-peak queries which run against the LH dataset.
function patientCondGFLH(): string {
  return `${TL}[Geofence] IN {"1st Floor", "2nd Floor", "3rd Floor", "ED", "Radiology"}`
}

// ── GF hourly utilisation for a specific day (AppendFinal) ───────────────────
// Returns 24 rows (one per hour) with distinct VINs in patient zones for the
// selected calendar day (TODAY() - dayOffset). dayOffset=1 = yesterday (full day).
export function buildIHHourlyByDayGFQuery(filters: InsightHubFilters, dayOffset: number): string {
  const conds: string[] = [
    `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`,
    `DATE(YEAR(${TL}[Last Seen-Local]), MONTH(${TL}[Last Seen-Local]), DAY(${TL}[Last Seen-Local])) = TODAY() - ${Math.max(0, Math.round(dayOffset))}`,
  ]
  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  addLHFloorBuildingConds(conds, filters)
  const baseFilter = conds.join(' && ')
  const p = patientCondGFLH()

  return `EVALUATE
SELECTCOLUMNS(
  ADDCOLUMNS(
    GENERATESERIES(0, 23),
    "WithPatient",
      VAR hr = [Value]
      RETURN CALCULATE(
        DISTINCTCOUNT(${TL}[VIN]),
        FILTER(${TL}, ${baseFilter} && (${p}) && HOUR(${TL}[Last Seen-Local]) = hr)
      )
  ),
  "Hour",        [Value],
  "WithPatient", [WithPatient]
)`
}

// ── GF daily peak — max concurrent VINs per day over last 7 days (AppendFinal) ─
// Returns up to 7 rows. Each row: DateKey = DAY + MONTH×100 + YEAR×10000, PeakCount.
// Client decodes: day=MOD(DateKey,100), month=MOD(INT(DateKey/100),100), year=INT(DateKey/10000).
// ── GF peak utilisation — max concurrent VINs in patient zones (last 7 days) ─────
// Same logic as buildIHPeakUtilisationLHQuery but uses the 5-zone GF patient
// definition instead of the 18-zone BSA definition.
export function buildIHPeakUtilisationGFQuery(filters: InsightHubFilters): string {
  const conds: string[] = [
    `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`,
    `${TL}[Last Seen-Local] >= TODAY() - 7`,
  ]
  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  addLHFloorBuildingConds(conds, filters)
  const baseFilter = conds.join(' && ')
  const p = patientCondGFLH()

  return `EVALUATE
VAR _patSessions = ADDCOLUMNS(
  FILTER(${TL}, ${baseFilter} && (${p})),
  "__DH",
    HOUR(${TL}[Last Seen-Local]) +
    DAY(${TL}[Last Seen-Local])   * 100 +
    MONTH(${TL}[Last Seen-Local]) * 10000 +
    YEAR(${TL}[Last Seen-Local])  * 1000000
)
VAR _deduped  = SUMMARIZE(_patSessions, ${TL}[VIN], [__DH])
VAR _byDH     = GROUPBY(_deduped, [__DH], "__Count", COUNTX(CURRENTGROUP(), ${TL}[VIN]))
VAR _peak     = IF(COUNTROWS(_byDH) > 0, MAXX(_byDH, [__Count]), 0)
VAR _peakDH   = MAXX(FILTER(_byDH, [__Count] = _peak), [__DH])
VAR _peakHour = MOD(_peakDH, 100)
VAR _peakDay  = MOD(INT(DIVIDE(_peakDH, 100)), 100)
VAR _peakMon  = MOD(INT(DIVIDE(_peakDH, 10000)), 100)
VAR _peakYear = INT(DIVIDE(_peakDH, 1000000))
RETURN
ROW(
  "PeakCount", _peak,
  "PeakHour",  _peakHour,
  "PeakDay",   _peakDay,
  "PeakMonth", _peakMon,
  "PeakYear",  _peakYear
)`
}

export function buildIHDailyPeakGFQuery(filters: InsightHubFilters): string {
  const conds: string[] = [
    `DATEDIFF(${TL}[Last Seen-Local], ${TL}[PreviousLastSeenNew_], MINUTE) > 0`,
    `${TL}[Last Seen-Local] >= TODAY() - 7`,
  ]
  if (filters.assetType) {
    const vals = filters.assetType.split(',').map((s) => s.trim()).filter(Boolean)
    if (vals.length === 1)    conds.push(`${TL}[AssetType] = "${sanitize(vals[0])}"`)
    else if (vals.length > 1) conds.push(`${TL}[AssetType] IN {${vals.map((v) => `"${sanitize(v)}"`).join(', ')}}`)
  }
  addLHFloorBuildingConds(conds, filters)
  const baseFilter = conds.join(' && ')
  const p = patientCondGFLH()

  return `EVALUATE
VAR _pat = FILTER(${TL}, ${baseFilter} && (${p}))
VAR _withDH = ADDCOLUMNS(
  _pat,
  "__DH",
    HOUR(${TL}[Last Seen-Local]) +
    DAY(${TL}[Last Seen-Local])   * 100 +
    MONTH(${TL}[Last Seen-Local]) * 10000 +
    YEAR(${TL}[Last Seen-Local])  * 1000000
)
VAR _deduped     = SUMMARIZE(_withDH, ${TL}[VIN], [__DH])
VAR _byDH        = GROUPBY(_deduped, [__DH], "__Count", COUNTX(CURRENTGROUP(), ${TL}[VIN]))
VAR _withDateKey = ADDCOLUMNS(_byDH, "__DateKey", INT(DIVIDE([__DH], 100)))
VAR _byDay       = GROUPBY(_withDateKey, [__DateKey], "PeakCount", MAXX(CURRENTGROUP(), [__Count]))
RETURN
SELECTCOLUMNS(
  _byDay,
  "DateKey",   [__DateKey],
  "PeakCount", [PeakCount]
)
ORDER BY [DateKey] ASC`
}
