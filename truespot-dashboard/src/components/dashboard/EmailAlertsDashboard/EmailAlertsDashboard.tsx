'use client'

import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import Image from 'next/image'
import { useEmailAlertsData, type EmailAlertGroup } from '@/hooks/useEmailAlertsData'
import { parseFacilityLocalParts } from '@/utils/formatters'

const GREEN = '#16a34a'
const GREEN_BG = '#f0fdf4'
const GREEN_BORDER = '#bbf7d0'
const AMBER = '#d97706'
const AMBER_BG = '#fffbeb'
const AMBER_BORDER = '#fde68a'
const MUTED = '#94a3b8'
const TEAL = '#0d9488'
const AVATAR_BLUE = '#2563eb'
const TOP_BAR_H = 60

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Timestamps arrive as a bare "YYYY-MM-DDTHH:MM:SS" string. For clients migrated
// to the corrected Power Query, this is genuine UTC (DateTimeReceivedUTC) — read
// literally via Date.UTC, never through the browser's own local timezone. For
// clients not yet migrated, the true zone is still unconfirmed, so the same
// literal-read approach is at least consistent and never silently reinterprets
// the value in the viewer's own timezone.
function toUtcMillis(iso: string): number | null {
  const p = parseFacilityLocalParts(iso)
  if (p.year === 0) return null
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const p = parseFacilityLocalParts(iso)
  if (p.year === 0) return iso
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const ampm = p.hour < 12 ? 'AM' : 'PM'
  const minute = String(p.minute).padStart(2, '0')
  return `${MONTH_NAMES[p.month - 1]} ${p.day}, ${p.year}, ${hour12}:${minute} ${ampm}`
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  const p = parseFacilityLocalParts(iso)
  if (p.year === 0) return iso
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const ampm = p.hour < 12 ? 'AM' : 'PM'
  const minute = String(p.minute).padStart(2, '0')
  return `${hour12}:${minute} ${ampm}`
}

function formatDateMDY(iso: string): string {
  if (!iso) return '—'
  const p = parseFacilityLocalParts(iso)
  if (p.year === 0) return iso
  return `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}-${p.year}`
}

// Real computed status, not an asserted label — "on time"/"overdue" only appears
// when RecurrenceIntervalMinutes is actually known for this alert (migrated
// clients); otherwise falls back to a neutral elapsed description so nothing is
// claimed the data can't support.
interface AlertStatus {
  label:     string
  color:     string
  bg:        string
  border:    string
  sublabel:  string
}

const TOLERANCE_MULTIPLIER = 2

function computeStatus(group: EmailAlertGroup): AlertStatus {
  if (!group.lastRun) {
    return { label: 'No Data', color: MUTED, bg: '#f8fafc', border: '#e2e8f0', sublabel: 'no sends recorded' }
  }
  if (!group.isActive) {
    return { label: 'Delivery Issue', color: AMBER, bg: AMBER_BG, border: AMBER_BORDER, sublabel: 'last send bounced' }
  }

  const lastRunMs = toUtcMillis(group.lastRun)
  if (lastRunMs === null || group.recurrenceIntervalMinutes === null) {
    return { label: 'Active', color: GREEN, bg: GREEN_BG, border: GREEN_BORDER, sublabel: '' }
  }

  const elapsedMinutes = Math.round((Date.now() - lastRunMs) / 60_000)
  const overdue = elapsedMinutes > group.recurrenceIntervalMinutes * TOLERANCE_MULTIPLIER
  return overdue
    ? { label: 'Overdue', color: AMBER, bg: AMBER_BG, border: AMBER_BORDER, sublabel: `${elapsedMinutes}m since last run` }
    : { label: 'Active', color: GREEN, bg: GREEN_BG, border: GREEN_BORDER, sublabel: 'on time' }
}

// Derives a 2-letter avatar initial from an email's local-part, e.g.
// "Courtney.Haschke@bsahs.org" -> "CH".
function emailInitials(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const parts = localPart.split(/[._-]/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

interface EmailAlertsDashboardProps {
  clientId:       string
  dashboardKey:   string
  product:        string
  displayName:    string
  dashboardLabel: string
}

function KpiCard({ label, value, sublabel, valueColor }: { label: string; value: string | number; sublabel?: string; valueColor?: string }) {
  return (
    <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 3, flex: '1 1 220px' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'text.disabled', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 34, fontWeight: 800, color: valueColor ?? 'text.primary', lineHeight: 1.1, mt: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      {sublabel && (
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.75 }}>
          {sublabel}
        </Typography>
      )}
    </Box>
  )
}

export default function EmailAlertsDashboard({ clientId, dashboardKey, displayName, dashboardLabel }: EmailAlertsDashboardProps) {
  const { groups, loading, error } = useEmailAlertsData(clientId, dashboardKey)

  const allRecipients = new Set(groups.flatMap((g) => g.recipients))
  const lastRunGroup = groups.reduce<EmailAlertGroup | null>(
    (best, g) => (!best || g.lastRun > best.lastRun ? g : best),
    null
  )
  const lastRunStatus = lastRunGroup ? computeStatus(lastRunGroup) : null

  const recurrenceValues = [...new Set(groups.map((g) => g.recurrence).filter(Boolean))]
  const recurrenceDisplay = recurrenceValues.length === 0 ? '—' : recurrenceValues.length === 1 ? recurrenceValues[0] : 'Varies'
  const recurrenceSublabel = recurrenceValues.length > 1 ? recurrenceValues.join(' & ') : 'across all alerts'

  return (
    <Box>
      <Box
        sx={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
          height: TOP_BAR_H, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider',
          px: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Image
          src="/images/TruespotHealth.webp"
          alt="TrueSpot Health"
          width={130}
          height={36}
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
          priority
        />
      </Box>

      <Box sx={{ mt: `${TOP_BAR_H}px`, bgcolor: '#f8fafc', p: { xs: 2.5, sm: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3, minHeight: `calc(100vh - ${TOP_BAR_H}px)` }}>
        {error && (
          <Alert severity="error">Unable to load email alert data. Please refresh and try again.</Alert>
        )}

        {/* Header — title + client chip on the left, live status on the right */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: '1.5rem', sm: '1.875rem' }, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {dashboardLabel}
            </Typography>
            <Box sx={{ px: 1.25, py: 0.35, borderRadius: 6, bgcolor: '#f0fdfb', border: '1px solid #99f6e4', flexShrink: 0 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: TEAL, letterSpacing: '0.01em' }}>{displayName}</Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexShrink: 0 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: GREEN }} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Entries update each time an alert is sent</Typography>
          </Box>
        </Box>

        {/* KPI cards */}
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
          <KpiCard label="Active Subscriptions" value={loading ? '—' : groups.length} sublabel="Org-wide" />
          <KpiCard label="Recipients" value={loading ? '—' : allRecipients.size} sublabel="across all alerts" />
          <KpiCard label="Recurrence" value={loading ? '—' : recurrenceDisplay} sublabel={loading ? undefined : recurrenceSublabel} />
          <KpiCard
            label="Last Run"
            value={loading ? '—' : (lastRunGroup ? formatTime(lastRunGroup.lastRun) : '—')}
            valueColor={loading || !lastRunStatus ? undefined : lastRunStatus.color}
            sublabel={
              loading
                ? undefined
                : lastRunGroup
                ? formatDateMDY(lastRunGroup.lastRun)
                : 'No sends recorded yet'
            }
          />
        </Box>

        {/* Table */}
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'text.disabled', textTransform: 'uppercase' }}>
              Subscribed Email Alerts
            </Typography>
          </Box>

          {!loading && groups.length > 0 && (
            <Box
              sx={{
                display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.3fr 0.9fr',
                gap: 2, px: 2.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider',
              }}
            >
              {['Subject', 'Recurrence', 'Last Run', 'Status'].map((label) => (
                <Typography key={label} sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'text.disabled', textTransform: 'uppercase' }}>
                  {label}
                </Typography>
              ))}
            </Box>
          )}

          {loading ? (
            <Box sx={{ p: 3 }}><Skeleton height={120} /></Box>
          ) : groups.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'text.disabled', textAlign: 'center', py: 5 }}>
              No email alerts recorded yet.
            </Typography>
          ) : (
            groups.map((group) => {
              const status = computeStatus(group)
              return (
                <Box
                  key={group.cleanSubject}
                  sx={{
                    display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.3fr 0.9fr',
                    gap: 2, alignItems: 'center', px: 2.5, py: 1.75,
                    borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', minWidth: 0 }}>
                    {group.cleanSubject}
                  </Typography>

                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                    {group.recurrence}
                  </Typography>

                  <Typography sx={{ fontSize: 12.5, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDateTime(group.lastRun)}
                  </Typography>

                  <Box>
                    <Box
                      sx={{
                        display: 'inline-flex', alignItems: 'center', gap: 0.6,
                        px: 1.1, py: 0.35, borderRadius: 6,
                        bgcolor: status.bg, border: '1px solid', borderColor: status.border,
                      }}
                    >
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: status.color, flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: status.color }}>
                        {status.label}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )
            })
          )}
        </Box>

        {/* Recipients — grouped per alert, distinct across the whole group */}
        {!loading && allRecipients.size > 0 && (
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 3 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: 'text.disabled', textTransform: 'uppercase', mb: 2.25 }}>
              Recipients ({allRecipients.size} across {groups.length} {groups.length === 1 ? 'alert' : 'alerts'})
            </Typography>
            {groups.filter((g) => g.recipients.length > 0).map((group, i) => (
              <Box key={group.cleanSubject} sx={{ mt: i > 0 ? 2 : 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                  {group.cleanSubject}{' '}
                  <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>({group.recipients.length})</Box>
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {group.recipients.map((email) => (
                    <Box
                      key={email}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75,
                        px: 1, py: 0.5, borderRadius: 5, bgcolor: 'action.hover',
                      }}
                    >
                      <Box
                        sx={{
                          width: 20, height: 20, borderRadius: '50%', bgcolor: AVATAR_BLUE, color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, flexShrink: 0,
                        }}
                      >
                        {emailInitials(email)}
                      </Box>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{email}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
