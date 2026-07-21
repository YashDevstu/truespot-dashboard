'use client'

import { useCallback, useEffect, useState } from 'react'

// Tracks manual staff review decisions for assets dwelling >24h at an exit —
// "Expected" (confirmed normal) vs "Flagged" (needs follow-up). Fabric has no
// such field, and this project has no backend database, so decisions live in
// the browser's localStorage — same pattern already used for "My Department"
// elsewhere in this app. Per-browser, not shared across staff/devices; that's
// a known v1 limitation, not an oversight.

export type ReviewStatus = 'expected' | 'flagged'

interface ReviewRecord {
  status:    ReviewStatus
  firstSeen: string  // the asset's firstSeen at the time of the decision — if the
                      // asset leaves and returns later (new firstSeen), the old
                      // decision no longer applies and review is needed again.
  decidedAt: string  // ISO timestamp, for a "reviewed X ago" display
}

type ReviewMap = Record<string, ReviewRecord>  // keyed by VIN

function storageKey(clientId: string): string {
  return `truespot_exit_review_${clientId}`
}

function loadMap(clientId: string): ReviewMap {
  try {
    const raw = localStorage.getItem(storageKey(clientId))
    return raw ? (JSON.parse(raw) as ReviewMap) : {}
  } catch {
    return {}
  }
}

function saveMap(clientId: string, map: ReviewMap) {
  try {
    localStorage.setItem(storageKey(clientId), JSON.stringify(map))
  } catch {
    // localStorage unavailable (private mode, quota) — decisions just won't persist
  }
}

export function useExitReviewStatus(clientId: string) {
  const [map, setMap] = useState<ReviewMap>({})

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(loadMap(clientId))
  }, [clientId])

  const getStatus = useCallback(
    (vin: string, firstSeen: string): ReviewRecord | null => {
      const rec = map[vin]
      if (!rec || rec.firstSeen !== firstSeen) return null
      return rec
    },
    [map]
  )

  const setStatus = useCallback(
    (vin: string, firstSeen: string, status: ReviewStatus) => {
      setMap((prev) => {
        const next = { ...prev, [vin]: { status, firstSeen, decidedAt: new Date().toISOString() } }
        saveMap(clientId, next)
        return next
      })
    },
    [clientId]
  )

  const clearStatus = useCallback(
    (vin: string) => {
      setMap((prev) => {
        const next = { ...prev }
        delete next[vin]
        saveMap(clientId, next)
        return next
      })
    },
    [clientId]
  )

  return { getStatus, setStatus, clearStatus }
}
