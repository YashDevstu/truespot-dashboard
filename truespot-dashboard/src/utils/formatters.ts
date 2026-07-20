// Convert an ALL CAPS or mixed-case string to Title Case.
// Used to normalize vehicle make/model values that come from the API in ALL CAPS.
export function toTitleCase(s: string): string {
  if (!s) return s
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// Some Fabric session timestamps are stored in UTC but returned as naive
// strings with no timezone marker (e.g. "2026-07-10T23:59:00"). A bare
// `new Date(iso)` makes JS assume the VIEWER's local timezone instead of UTC,
// silently shifting every "time ago" / duration calculation by that offset
// depending on where the browser or server happens to run. Use this instead
// of `new Date(iso)` for timestamp columns confirmed to be true UTC.
//
// NOT applicable to Halifax's AppendFinal "Last Seen-Local" / "PreviousLastSeenNew_" —
// those are genuinely already facility-local wall-clock time (confirmed by
// cross-checking against the Location History dashboard's raw, unconverted
// display, which lines up with true local midnight-to-midnight days). Running
// those through parseUtcTimestamp + getFacilityParts double-shifts them by the
// facility's UTC offset — this was the cause of Insight Hub's trail views
// appearing to start around 8pm instead of midnight. Use
// parseFacilityLocalParts / facilityLocalToUtcInstant for those instead.
export function parseUtcTimestamp(iso: string): Date {
  if (!iso) return new Date(NaN)
  return new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
}

// Halifax Health Medical Center — Daytona Beach, FL — Eastern Time.
// (Not to be confused with Halifax, Nova Scotia; this is the Florida facility.)
const FACILITY_TIME_ZONE = 'America/New_York'

// Wall-clock parts as they'd read on a clock at the facility, DST-aware
// (EDT in summer, EST in winter — never a fixed offset). Use this instead of
// Date.prototype.getHours()/getDate()/etc, which read in the VIEWER's own
// browser timezone, not the facility's — two different, and often wrong,
// answers to "what time was it there?"
export interface FacilityDateParts {
  year: number; month: number; day: number
  hour: number; minute: number
  weekday: number  // 0=Sun .. 6=Sat
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export function getFacilityParts(d: Date): FacilityDateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone:  FACILITY_TIME_ZONE,
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    hour:      '2-digit',
    minute:    '2-digit',
    hourCycle: 'h23',
    weekday:   'short',
  })
  const parts = fmt.formatToParts(d)
  const get   = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  return {
    year:    Number(get('year')),
    month:   Number(get('month')),
    day:     Number(get('day')),
    hour:    Number(get('hour')),
    minute:  Number(get('minute')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  }
}

// Reads the y/m/d/h/mi components literally off a facility-local naive string
// (Halifax's AppendFinal "Last Seen-Local" / "PreviousLastSeenNew_") — no Date
// object, no timezone conversion, since the string is already the correct
// facility wall-clock reading. Weekday is derived from the calendar date alone
// (timezone-independent).
export function parseFacilityLocalParts(iso: string): FacilityDateParts {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return { year: 0, month: 0, day: 0, hour: 0, minute: 0, weekday: 0 }
  const [, y, mo, d, h, mi] = m
  const weekday = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()
  return { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi), weekday }
}

// Converts an already-facility-local wall-clock string into the true UTC
// instant it represents (DST-aware) — needed only when diffing against
// Date.now() for "time ago" style displays. Not needed for plain display of
// the date/time itself — use parseFacilityLocalParts for that.
const FACILITY_OFFSET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone:  FACILITY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export function facilityLocalToUtcInstant(iso: string): Date {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/)
  if (!m) return new Date(NaN)
  const [, y, mo, d, h, mi, s] = m
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), s ? Number(s) : 0)
  // Find the facility's UTC offset at this instant (DST-aware) by reading its
  // wall-clock components via Intl — NOT `new Date(localeString)`, which parses
  // in the RUNTIME's own local timezone and silently corrupts the result on
  // any machine/browser not itself set to UTC.
  const parts = FACILITY_OFFSET_FMT.formatToParts(new Date(guess))
  const get   = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asFacilityUTCMillis = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offset = guess - asFacilityUTCMillis
  return new Date(guess + offset)
}
