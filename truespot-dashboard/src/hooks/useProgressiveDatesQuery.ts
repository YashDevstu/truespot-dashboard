'use client'
import { useState, useEffect, useRef, useMemo } from 'react'

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
  dateLabels?: string[]  // override to fetch only specific dates; omit for all 8
  enabled?: boolean
}

export function buildAllDateLabels(): string[] {
  const labels: string[] = ['Today']
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    labels.push(`${mm}/${dd}/${yy}`)
  }
  return labels
}

export function useProgressiveDatesQuery({
  clientId,
  dashboardKey,
  panelId,
  baseFilters,
  dateLabels: dateLabelsOverride,
  enabled = true,
}: UseProgressiveDatesQueryParams) {
  // Store per-date row arrays in a ref to avoid the spread-accumulation pattern
  // that previously created increasingly large intermediate arrays on every date
  // response: [100K], [200K], [300K]... [700K] = 2.8M total object allocations.
  // With ref storage, each date gets its own fixed-size slice; the final flat()
  // runs once per date completion instead of re-allocating the whole dataset.
  const rowsByDateRef = useRef<Record<string, unknown>[][]>([])

  // Counter-only state: only re-renders when a date completes, not on row append.
  const [loadedDates, setLoadedDates] = useState(0)
  const [errors, setErrors] = useState(0)

  const filterKey = JSON.stringify(baseFilters ?? {})
  // Stable key so the effect re-fires when the selected date set changes
  const dateLabelsKey = JSON.stringify(dateLabelsOverride ?? null)
  const dateLabels = dateLabelsOverride ?? buildAllDateLabels()
  const totalDates = dateLabels.length

  useEffect(() => {
    if (!enabled) {
      rowsByDateRef.current = []
      setLoadedDates(0)
      setErrors(0)
      return
    }

    // Reset — clearing the ref is O(1) regardless of how many rows were stored
    rowsByDateRef.current = []
    setLoadedDates(0)
    setErrors(0)

    let cancelled = false
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
          if (cancelled) return
          if (json.rows && json.rows.length > 0) {
            // Push the per-date slice into the ref; no spreading of prior data
            rowsByDateRef.current.push(json.rows)
          }
          // Incrementing the counter is the only thing that triggers a re-render.
          // The memo below re-flattens at that point — one flat() instead of
          // N allocations of ever-growing arrays.
          setLoadedDates((prev) => prev + 1)
        })
        .catch((err: Error) => {
          if (!cancelled && err.name !== 'AbortError') {
            setErrors((prev) => prev + 1)
            setLoadedDates((prev) => prev + 1)
          }
        })
    })

    return () => {
      cancelled = true
      controllers.forEach((c) => c.abort())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, dateLabelsKey, enabled])

  // Recomputes only when loadedDates changes (a date completed).
  // flat() creates one combined array from the per-date slices stored in the ref.
  const rows = useMemo(
    () => rowsByDateRef.current.flat(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedDates]
  )

  return {
    rows,
    loading: loadedDates < totalDates,
    loadedDates,
    totalDates,
    errors,
  }
}
