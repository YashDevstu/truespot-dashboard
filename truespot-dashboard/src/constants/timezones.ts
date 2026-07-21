// IANA timezone for each Health client's facility — used to compute the correct,
// DST-aware UTC offset for RefreshTimeLocal's naive (no-timezone) local timestamp.
export const CLIENT_FACILITY_TIME_ZONE: Record<string, string> = {
  bsa:     'America/Chicago',   // Amarillo, TX — Central Time
  halifax: 'America/New_York',  // Daytona Beach, FL — Eastern Time
}

export const DEFAULT_FACILITY_TIME_ZONE = 'America/Chicago'
