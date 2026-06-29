'use client'
import { useReducer, useEffect, useRef, useCallback } from 'react'

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

interface Params {
  clientId: string
  dashboardKey: string
  panelId: string
  baseFilters?: BaseFilters
  dateSeen?: string
  pageSize?: number
  enabled?: boolean
}

// ── state ─────────────────────────────────────────────────────────────────────

interface State {
  rows: Record<string, unknown>[]
  cursor: number | undefined  // [StartTime] serial of the last loaded row
  loading: boolean
  hasMore: boolean
}

type Action =
  | { type: 'fetch_start' }
  | { type: 'fetch_success'; newRows: Record<string, unknown>[]; hasMore: boolean; cursor: number | undefined }
  | { type: 'fetch_error' }
  | { type: 'reset' }

const INITIAL: State = { rows: [], cursor: undefined, loading: false, hasMore: false }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':       return { ...INITIAL }
    case 'fetch_start': return { ...state, loading: true }
    case 'fetch_error': return { ...state, loading: false }
    case 'fetch_success':
      return {
        rows:    state.rows.concat(action.newRows),
        cursor:  action.cursor,
        loading: false,
        hasMore: action.hasMore,
      }
  }
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function usePaginatedQuery({
  clientId,
  dashboardKey,
  panelId,
  baseFilters,
  dateSeen,
  pageSize = 100,
  enabled = true,
}: Params) {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  // Serialise dependencies so effect only re-runs when values actually change
  const filterKey  = JSON.stringify(baseFilters ?? {})
  const dateSeenKey = dateSeen ?? ''

  // Abort controller ref so loadMore can cancel the in-flight request
  const controllerRef = useRef<AbortController | null>(null)

  // ── initial / filter-change fetch ──────────────────────────────────────────
  useEffect(() => {
    dispatch({ type: 'reset' })
    if (!enabled) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    dispatch({ type: 'fetch_start' })

    fetch('/api/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, dashboardKey, panelId,
        filters: { ...JSON.parse(filterKey), dateSeen: dateSeen || undefined, limit: pageSize + 1 },
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json: { rows?: Record<string, unknown>[]; error?: string }) => {
        if (json.error) throw new Error(json.error)
        const raw     = json.rows ?? []
        const hasMore = raw.length > pageSize
        const page    = hasMore ? raw.slice(0, pageSize) : raw
        const lastRow = page[page.length - 1]
        const cursor  = lastRow ? Number(lastRow['[StartTime]'] ?? 0) || undefined : undefined
        dispatch({ type: 'fetch_success', newRows: page, hasMore, cursor })
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') dispatch({ type: 'fetch_error' })
      })

    return () => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, dateSeenKey, pageSize, enabled])

  // ── load more ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (state.loading || !state.hasMore) return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    dispatch({ type: 'fetch_start' })

    fetch('/api/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, dashboardKey, panelId,
        filters: {
          ...JSON.parse(filterKey),
          dateSeen: dateSeen || undefined,
          limit: pageSize + 1,
          cursor: state.cursor,
        },
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json: { rows?: Record<string, unknown>[]; error?: string }) => {
        if (json.error) throw new Error(json.error)
        const raw     = json.rows ?? []
        const hasMore = raw.length > pageSize
        const page    = hasMore ? raw.slice(0, pageSize) : raw
        const lastRow = page[page.length - 1]
        const cursor  = lastRow ? Number(lastRow['[StartTime]'] ?? 0) || undefined : undefined
        dispatch({ type: 'fetch_success', newRows: page, hasMore, cursor })
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') dispatch({ type: 'fetch_error' })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, dateSeenKey, pageSize, state.loading, state.hasMore, state.cursor])

  return {
    rows:    state.rows,
    loading: state.loading,
    hasMore: state.hasMore,
    loadMore,
  }
}
