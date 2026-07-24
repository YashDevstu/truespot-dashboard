'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

// One row = one sent email. "Undeliverable:" means this specific send bounced —
// confirmed via the underlying Power Query fix that folder path (\Inbox\ = bounce,
// \Sent Items\ = real send) is the authoritative signal, exposed as `undeliverable`
// below (falls back to the subject-prefix check for clients not yet migrated to
// the corrected query, where an explicit IsUndeliverable column doesn't exist yet).
export interface EmailAlertRow {
  subject:                    string
  cleanSubject:               string   // subject with the "Undeliverable:" prefix stripped, used to group
  recipients:                 string[] // DisplayTo split on ";" — confirmed delimiter from a live multi-recipient sample
  dateTimeReceived:           string
  recurrence:                 string
  recurrenceIntervalMinutes:  number | null
  undeliverable:              boolean
  noAssetsFlag:               boolean
  // Timestamp of the most recent send of ANY kind for this report type — including
  // "no result" sends that are otherwise excluded from display. Only present for
  // clients whose Mail table exposes it; null means fall back to dateTimeReceived
  // for overdue math (the only signal we have for that client).
  lastHeartbeat:              string | null
}

// One row per distinct alert type (grouped by cleanSubject).
export interface EmailAlertGroup {
  cleanSubject:               string
  recipients:                 string[]     // distinct recipients across the group
  recurrence:                 string       // recurrence of the group, or "Mixed" if inconsistent
  recurrenceIntervalMinutes:  number | null // null if inconsistent or not yet available for this client
  lastRun:                    string       // most recent GENUINE dateTimeReceived in the group — shown in the UI
  lastHeartbeat:              string       // most recent send of any kind — used for overdue/active math only
  isActive:                   boolean      // true if the MOST RECENT send in this group wasn't a bounce
  rows:                       EmailAlertRow[]
}

const UNDELIVERABLE_PREFIX = /^\s*undeliverable\s*:\s*/i

function parseRow(row: Record<string, unknown>): EmailAlertRow {
  const subject = String(row['[Subject]'] ?? '')
  const subjectSaysUndeliverable = UNDELIVERABLE_PREFIX.test(subject)
  // IsUndeliverable is only present for clients migrated to the corrected query —
  // when present, it's authoritative (folder-path-based, not just subject text).
  const hasIsUndeliverableColumn = row['[IsUndeliverable]'] !== undefined
  const undeliverable = hasIsUndeliverableColumn
    ? row['[IsUndeliverable]'] === true
    : subjectSaysUndeliverable

  const displayTo = String(row['[DisplayTo]'] ?? '')
  const recipients = displayTo.split(';').map((s) => s.trim()).filter(Boolean)

  const intervalRaw = row['[RecurrenceIntervalMinutes]']
  const recurrenceIntervalMinutes =
    intervalRaw !== undefined && intervalRaw !== null ? Number(intervalRaw) : null

  const heartbeatRaw = row['[LastHeartbeat]']
  const lastHeartbeat = heartbeatRaw !== undefined && heartbeatRaw !== null ? String(heartbeatRaw) : null

  return {
    subject,
    cleanSubject:     subject.replace(UNDELIVERABLE_PREFIX, '').trim(),
    recipients,
    dateTimeReceived: String(row['[DateTimeReceived]'] ?? ''),
    recurrence:       String(row['[Recurrence]'] ?? '').trim(),
    recurrenceIntervalMinutes,
    undeliverable,
    noAssetsFlag:     Number(row['[NoAssetsFlag]'] ?? 0) === 1,
    lastHeartbeat,
  }
}

function groupRows(rows: EmailAlertRow[]): EmailAlertGroup[] {
  const groups = new Map<string, EmailAlertRow[]>()
  for (const row of rows) {
    const key = row.cleanSubject || '(No subject)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  return [...groups.entries()]
    .map(([cleanSubject, groupRows]): EmailAlertGroup => {
      const sorted = [...groupRows].sort((a, b) => b.dateTimeReceived.localeCompare(a.dateTimeReceived))
      const latest = sorted[0]

      const recipients = [...new Set(groupRows.flatMap((r) => r.recipients))]
      const recurrences = new Set(groupRows.map((r) => r.recurrence).filter(Boolean))
      const recurrence = recurrences.size === 1 ? [...recurrences][0] : 'Mixed'
      const intervals = new Set(
        groupRows.map((r) => r.recurrenceIntervalMinutes).filter((v): v is number => v !== null)
      )
      const recurrenceIntervalMinutes = intervals.size === 1 ? [...intervals][0] : null

      // Heartbeat is the same value on every row within a report type (computed
      // group-wide upstream in the M query), so any row's value works — falls
      // back to the genuine lastRun for clients that don't expose it yet.
      const lastHeartbeat = latest?.lastHeartbeat ?? latest?.dateTimeReceived ?? ''

      return {
        cleanSubject,
        recipients,
        recurrence,
        recurrenceIntervalMinutes,
        lastRun: latest?.dateTimeReceived ?? '',
        lastHeartbeat,
        isActive: latest ? !latest.undeliverable : false,
        rows: groupRows,
      }
    })
    .sort((a, b) => b.lastRun.localeCompare(a.lastRun))
}

// ── Main hook ──────────────────────────────────────────────────────────────────

export function useEmailAlertsData(clientId: string, dashboardKey: string) {
  const [rows, setRows] = useState<EmailAlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/email-alerts/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, dashboardKey }),
      })
      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText)
        throw new Error(`Email alerts query failed: ${text}`)
      }
      const data = await response.json()
      const parsed = ((data.rows ?? []) as Record<string, unknown>[]).map(parseRow)
      setRows(parsed)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [clientId, dashboardKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const groups = groupRows(rows)

  return {
    rows,
    groups,
    loading,
    error,
    refresh: fetchData,
  }
}
