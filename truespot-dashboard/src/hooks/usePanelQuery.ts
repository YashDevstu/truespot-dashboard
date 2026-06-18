'use client'
import { useState, useEffect } from 'react'
import type { QueryResponse } from '@/types/api'

interface UsePanelQueryParams {
  clientId: string
  dashboardKey: string
  panelId: string
  filters?: Record<string, string | number | undefined>
  enabled?: boolean
}

export function usePanelQuery({
  clientId,
  dashboardKey,
  panelId,
  filters,
  enabled = true,
}: UsePanelQueryParams) {
  const [data, setData] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable key so the effect only re-runs when filter content actually changes
  const filterKey = JSON.stringify(filters ?? {})

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 130_000)
    setLoading(true)
    setError(null)

    fetch('/api/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, dashboardKey, panelId, filters }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json: QueryResponse & { error?: string }) => {
        if (json.error) throw new Error(json.error)
        setData(json)
      })
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setError(err.message)
      })
      .finally(() => setLoading(false))

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboardKey, panelId, filterKey, enabled])

  return { data, loading, error }
}
