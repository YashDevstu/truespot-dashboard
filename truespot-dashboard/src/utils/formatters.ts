// Convert an ALL CAPS or mixed-case string to Title Case.
// Used to normalize vehicle make/model values that come from the API in ALL CAPS.
export function toTitleCase(s: string): string {
  if (!s) return s
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// Fabric session timestamps (e.g. AppendFinal's "Last Seen-Local") are stored
// in UTC but returned as naive strings with no timezone marker (e.g.
// "2026-07-10T23:59:00"). A bare `new Date(iso)` makes JS assume the VIEWER's
// local timezone instead of UTC, silently shifting every "time ago" / duration
// calculation by that offset depending on where the browser or server happens
// to run. Always use this instead of `new Date(iso)` when parsing a raw
// Fabric timestamp string.
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
