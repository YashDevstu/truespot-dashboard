'use client'
import { useState, useEffect } from 'react'
import type { FilterOptions } from '@/components/dashboard/FilterSidebar/FilterSidebar'

const EMPTY: FilterOptions = {
  geofence: [],
  subGeoZone: [],
  floorLevel: [],
  beaconId: [],
  vin: [],
  stockNumber: [],
  assetType: [],
}

interface UseFilterOptionsParams {
  clientId: string
  dashboardKey: string
  panelId: string
}

// Fetches distinct column values from the server once on mount.
// Replaces client-side uniqueValues computation over 700K+ rows.
export function useFilterOptions({ clientId, dashboardKey, panelId }: UseFilterOptionsParams) {
  const [options, setOptions] = useState<FilterOptions>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ clientId, dashboardKey, panelId })
    let cancelled = false

    fetch(`/api/v1/filter-options?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Partial<FilterOptions>>
      })
      .then((data) => {
        if (!cancelled) setOptions({ ...EMPTY, ...data })
      })
      .catch(() => {
        // Keep empty options — filters still work as free-text inputs via freeSolo
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [clientId, dashboardKey, panelId])

  return { options, loading }
}
