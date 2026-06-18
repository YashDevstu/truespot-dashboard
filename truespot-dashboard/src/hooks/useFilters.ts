'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export interface LocationHistoryFilters {
  beaconId: string
  dateSeen: string
  geofence: string
  subGeoZone: string
  floorLevel: string
  minDurationMinutes: string
  vin: string
  stockNumber: string
  assetType: string
}

const DEFAULTS: LocationHistoryFilters = {
  beaconId: '',
  dateSeen: 'Today',
  geofence: '',
  subGeoZone: '',
  floorLevel: '',
  minDurationMinutes: '1',
  vin: '',
  stockNumber: '',
  assetType: '',
}

export function useFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters: LocationHistoryFilters = {
    beaconId: searchParams.get('beaconId') ?? DEFAULTS.beaconId,
    dateSeen: searchParams.get('dateSeen') ?? DEFAULTS.dateSeen,
    geofence: searchParams.get('geofence') ?? DEFAULTS.geofence,
    subGeoZone: searchParams.get('subGeoZone') ?? DEFAULTS.subGeoZone,
    floorLevel: searchParams.get('floorLevel') ?? DEFAULTS.floorLevel,
    minDurationMinutes: searchParams.get('minDurationMinutes') ?? DEFAULTS.minDurationMinutes,
    vin: searchParams.get('vin') ?? DEFAULTS.vin,
    stockNumber: searchParams.get('stockNumber') ?? DEFAULTS.stockNumber,
    assetType: searchParams.get('assetType') ?? DEFAULTS.assetType,
  }

  const setFilter = useCallback(
    (key: keyof LocationHistoryFilters, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== DEFAULTS[key]) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router]
  )

  const resetFilters = useCallback(() => {
    router.push('?', { scroll: false })
  }, [router])

  return { filters, setFilter, resetFilters }
}
