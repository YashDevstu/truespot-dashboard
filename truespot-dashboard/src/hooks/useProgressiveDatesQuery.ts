'use client'
import { useState, useEffect } from 'react'

interface BaseFilters {
  beaconId?: string
  geofence?: string
  subGeoZone?: string
  floorLevel?: string
  vin?: string
  stockNumber?: string
  assetType?: string
  minDurationMinutes?: number
}

interface UseProgressiveDatesQueryParams {
  clientId: string
  dashboardKey: string
  panelId: string
  baseFilters?: BaseFilters
  enabled?: boolean
}

// Generates the 7 rolling date labels the server expects: "Today" + last 6 days as "MM/DD/YY"
function buildDateLabels(): string[] {
  const labels: string[] = ['Today']
  for (let i = 1; i <= 6; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    labels.push(`${mm}/${dd}/${yy}`)
  }
  return labels
}

// Fires one request per date in parallel and accumulates rows as each response arrives.
// Users see data building up progressively rather than waiting for all 7 dates at once.
export function useProgressiveDatesQuery({
  clientId,
  dashboardKey,
  panelId,
  baseFilters,
  enabled = true,
}: UseProgressiveDatesQueryParams) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loadedDates, setLoadedDates] = useState(0)
  const [errors, setErrors] = useState(0)

  const filterKey = JSON.stringify(baseFilters ?? {})
  const dateLabels = buildDateLabels()
  const totalDates = dateLabels.length

  useEffect(() => {
    if (!enabled) {
      setRows([])
      setLoadedDates(0)
      setErrors(0)
      return
    }

    setRows([])
    setLoadedDates(0)
    setErrors(0)

    const controllers = dateLabels.map(() => new AbortController())

    dateLabels.forEach((dateSeen, i) => {
      fetch('/api/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          dashboardKey,
          panelId,
          filters: { ...baseFilters, dateSeen },
        }),
        signal: controllers[i].signal,
      })
        .then((r) => r.json())
        .then((json: { rows?: Record<string, unknown>[]; error?: string }) => {
          if (json.rows && json.rows.length > 0) {
            setRows((prev) => [...prev, ...json.rows!])
          }
          setLoadedDates((prev) => prev + 1)
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') {
            setErrors((prev) => prev + 1)
            setLoadedDates((prev) => prev + 1)
          }
        })
    })

    return () => controllers.forEach((c) => c.abort())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, enabled])

  return {
    rows,
    loading: loadedDates < totalDates,
    loadedDates,
    totalDates,
    errors,
  }
}
