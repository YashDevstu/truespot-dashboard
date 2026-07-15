'use client'

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { IHFloorStatusRow } from '@/hooks/useInsightHubData'

const TEAL = '#0d9488'

// ── Data derivation ──────────────────────────────────────────────────────────
// All three action items are derived purely from floorReadiness rows —
// no new API calls, no async operations.

interface ActionItem {
  timeframe:       'THIS WEEK' | 'THIS MONTH' | 'THIS QUARTER'
  headline:        string
  body:            string
  badge:           string
  primaryLabel:    string
  primaryFloor?:   string   // set → clicking navigates to floor drill-down
  hasTrueSpotLink: boolean
}

const TIMEFRAME_STYLE = {
  'THIS WEEK':    { bg: '#f0fdfb', text: TEAL,      border: '#99f6e4' },
  'THIS MONTH':   { bg: '#fffbeb', text: '#92400e',  border: '#fde68a' },
  'THIS QUARTER': { bg: '#eff6ff', text: '#1d4ed8',  border: '#bfdbfe' },
}

function deriveActions(
  rows:      IHFloorStatusRow[],
  assetType: string,
  unitValue: number,
): ActionItem[] {
  if (rows.length === 0) return []
  const items: ActionItem[] = []
  const label = assetType.toLowerCase()

  // ── Card 1: THIS WEEK — biggest single redistribution opportunity ─────────
  // Surplus floor: highest avgCount - par (most over-stocked)
  // Deficit floor: highest par - avgCount (most under-stocked)
  const withSurplus = rows
    .map((r) => ({ ...r, surplus: r.avgCount - r.par }))
    .filter((r) => r.surplus > 0.5)
    .sort((a, b) => b.surplus - a.surplus)

  const withDeficit = rows
    .map((r) => ({ ...r, gap: r.par - r.avgCount }))
    .filter((r) => r.gap > 0.5)
    .sort((a, b) => b.gap - a.gap)

  if (withSurplus.length > 0 && withDeficit.length > 0) {
    const donor   = withSurplus[0]
    const deficit = withDeficit[0]
    if (donor.floor !== deficit.floor) {
      const transfer   = Math.min(Math.round(donor.surplus), Math.round(deficit.gap))
      const closedFrac = Math.round(deficit.gap) > 0 ? transfer / Math.round(deficit.gap) : 0
      const closedDesc = closedFrac >= 0.5 ? 'more than half' : 'a significant portion of'
      items.push({
        timeframe:       'THIS WEEK',
        headline:        `Move ${transfer} ${label} from ${donor.floor} to ${deficit.floor}`,
        body:            `${donor.floor} is holding ${Math.round(donor.avgCount)} ${label} for a floor that needs ${donor.par} — while ${deficit.floor} needs ${deficit.par} and typically only has ${Math.round(deficit.avgCount)}. Moving the ${transfer} extra over closes ${closedDesc} that gap before tomorrow's 9 am rush.`,
        badge:           `Closes ${transfer} of a ${Math.round(deficit.gap)}-${label} gap`,
        primaryLabel:    `See the surplus on ${donor.floor} →`,
        primaryFloor:    donor.floor,
        hasTrueSpotLink: true,
      })
    }
  }

  // ── Card 2: THIS MONTH — floor that dips regularly ────────────────────────
  // Score = daysTight + (daysShort × 2): prioritises floors that go fully short
  const alertCandidates = rows
    .filter((r) => r.daysTight > 0 || r.daysShort > 0)
    .map((r) => ({ ...r, score: r.daysTight + r.daysShort * 2 }))
    .sort((a, b) => b.score - a.score)

  if (alertCandidates.length > 0) {
    const target    = alertCandidates[0]
    const frequency = target.daysShort >= 3 ? 'most' : target.daysShort >= 1 ? 'some' : 'many'
    items.push({
      timeframe:       'THIS MONTH',
      headline:        `Set a "getting tight" alert for ${target.floor}`,
      body:            `${target.floor} dips below par ${frequency} weekday mornings. An alert before 8 am gives the charge nurse time to borrow from a stocked floor, instead of finding out at the bedside.`,
      badge:           'Early warning, not a surprise',
      primaryLabel:    'Talk it through with TrueSpot',
      hasTrueSpotLink: false,
    })
  }

  // ── Card 3: THIS QUARTER — structural par rebalancing ────────────────────
  // Consistently over-stocked: daysEnough === totalDays AND avg > par × 1.25
  const overStocked  = rows
    .filter((r) => r.daysEnough === r.totalDays && r.avgCount > r.par * 1.25)
    .sort((a, b) => (b.avgCount - b.par) - (a.avgCount - a.par))

  const underStocked = rows
    .filter((r) => r.daysShort >= Math.max(1, Math.floor(r.totalDays * 0.4)))
    .sort((a, b) => b.daysShort - a.daysShort)

  if (overStocked.length > 0 || underStocked.length > 0) {
    const topOver  = overStocked[0]
    const topUnder = underStocked[0]
    const structuralSurplus = overStocked.reduce((sum, r) => sum + Math.max(0, r.avgCount - r.par), 0)
    const savedValue        = structuralSurplus > 0 && unitValue > 0
      ? Math.round(structuralSurplus * unitValue)
      : 0

    let bodyText = ''
    if (topOver && topUnder) {
      bodyText = `This isn't a one-time move — ${topOver.floor} is consistently over-stocked and ${topUnder.floor} is consistently short. Rebalancing the standing par numbers avoids buying more ${label} just to patch a distribution problem.`
    } else if (topOver) {
      bodyText = `${topOver.floor} is consistently carrying more ${label} than its par requires. Adjusting the standing par down there frees up budget without reducing readiness.`
    } else if (topUnder) {
      bodyText = `${topUnder.floor} runs short consistently — not just on bad days. Raising its par level (and sourcing from over-stocked floors) fixes the problem structurally.`
    }

    const badgeText = savedValue > 0
      ? `Frees ≈ $${savedValue.toLocaleString()} in avoided reorders`
      : `Imbalance across ${overStocked.length + underStocked.length} floor${overStocked.length + underStocked.length !== 1 ? 's' : ''}`

    items.push({
      timeframe:       'THIS QUARTER',
      headline:        'Fix the standing par plan',
      body:            bodyText,
      badge:           badgeText,
      primaryLabel:    'Talk it through with TrueSpot',
      hasTrueSpotLink: false,
    })
  }

  return items
}

// ── Sub-components ───────────────────────────────────────────────────────────

function GlossaryPanel({ assetType }: { assetType: string }) {
  const terms = [
    {
      term: '"Par level"',
      def:  `The amount of ${assetType.toLowerCase()} a floor should have on hand to get through a normal morning without anyone hunting for one.`,
    },
    {
      term: '"Stockout"',
      def:  'The moment a floor actually runs out — someone needs a device, checks the usual spot, and there isn\'t one.',
    },
    {
      term: '"Service level"',
      def:  'The fancy name for the big numbers on this page: the share of mornings a floor actually met its par level.',
    },
    {
      term: '"Right distribution"',
      def:  `Moving ${assetType.toLowerCase()} to match where it\'s actually needed, instead of leaving it wherever it happened to land last.`,
    },
  ]

  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {/* checkbox icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="#94a3b8" strokeWidth="1.4"/>
        </svg>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
          The grown-up words for what you just learned
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2, lineHeight: 1.5 }}>
        If someone from finance or a consultant uses these terms — you already understand them.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {terms.map(({ term, def }) => (
          <Box key={term}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: TEAL, mb: 0.4, lineHeight: 1.3 }}>
              {term}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}>
              {def}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function AboutPanel({
  rows,
  assetType,
  unitValue,
}: {
  rows:      IHFloorStatusRow[]
  assetType: string
  unitValue: number
}) {
  const totalVINs = rows[0]?.totalVINs ?? 0
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 3, p: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {/* info icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="#94a3b8" strokeWidth="1.4"/>
          <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="700" fill="#94a3b8" fontFamily="inherit">i</text>
        </svg>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
          About these numbers
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.75 }}>
        These figures are derived from{' '}
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {totalVINs > 0 ? totalVINs.toLocaleString() : 'your'}
        </Box>{' '}
        tagged {assetType.toLowerCase()} across{' '}
        <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>{rows.length} floor{rows.length !== 1 ? 's' : ''}</Box>,
        measured during the 8–10 am morning medication pass window over the last 7 days.
        Averages are based on actual equipment presence confirmed by RTLS signals — not scheduled locations.
        {unitValue > 0 && (
          <> Dollar figures use a replacement cost of{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              ${unitValue.toLocaleString()} per unit
            </Box>{' '}
            and are directional, not accounting.
          </>
        )}
        {' '}Your live report replaces every one of these with your own measured numbers, floor by floor.
      </Typography>
    </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface WhatYouCanDoAboutItProps {
  rows:          IHFloorStatusRow[]
  assetType:     string
  unitValue?:    number
  onSelectFloor: (floor: string) => void
}

export default function WhatYouCanDoAboutIt({
  rows,
  assetType,
  unitValue = 0,
  onSelectFloor,
}: WhatYouCanDoAboutItProps) {
  const actions = useMemo(
    () => deriveActions(rows, assetType, unitValue),
    [rows, assetType, unitValue],
  )

  if (actions.length === 0) return null

  const cols = actions.length === 3 ? '1fr 1fr 1fr' : actions.length === 2 ? '1fr 1fr' : '1fr'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>

      {/* ── Section header ───────────────────────────────────────────────────── */}
      <Box>
        <Typography
          sx={{
            fontSize:      { xs: 22, sm: 28 },
            fontWeight:    900,
            color:         'text.primary',
            lineHeight:    1.2,
            mb:            0.75,
            letterSpacing: '-0.01em',
          }}
        >
          What you can do about it.
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', lineHeight: 1.6, maxWidth: 560 }}>
          Three moves this data supports — the button is the next step, and TrueSpot can talk any of them through
        </Typography>
      </Box>

      {/* ── Action cards ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: cols, gap: 2, alignItems: 'stretch' }}>
        {actions.map((action) => {
          const tfStyle = TIMEFRAME_STYLE[action.timeframe]
          return (
            <Box
              key={action.timeframe}
              sx={{
                bgcolor:       '#fff',
                border:        '1px solid #e4eaf0',
                borderRadius:  3,
                p:             2.5,
                display:       'flex',
                flexDirection: 'column',
                gap:           1.5,
                boxShadow:     '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              {/* Timeframe badge */}
              <Box
                sx={{
                  display:      'inline-flex',
                  alignSelf:    'flex-start',
                  px:           1,
                  py:           0.35,
                  borderRadius: 1,
                  bgcolor:      tfStyle.bg,
                  border:       `1px solid ${tfStyle.border}`,
                }}
              >
                <Typography
                  sx={{
                    fontSize:      10,
                    fontWeight:    800,
                    letterSpacing: '0.1em',
                    color:         tfStyle.text,
                    textTransform: 'uppercase',
                    lineHeight:    1,
                  }}
                >
                  {action.timeframe}
                </Typography>
              </Box>

              {/* Headline */}
              <Typography
                sx={{
                  fontSize:   16,
                  fontWeight: 800,
                  color:      'text.primary',
                  lineHeight: 1.3,
                }}
              >
                {action.headline}
              </Typography>

              {/* Body */}
              <Typography
                sx={{
                  fontSize:   13,
                  color:      'text.secondary',
                  lineHeight: 1.7,
                  flex:       1,
                }}
              >
                {action.body}
              </Typography>

              {/* Impact badge */}
              <Box
                sx={{
                  display:      'inline-flex',
                  alignSelf:    'flex-start',
                  px:           1.25,
                  py:           0.5,
                  bgcolor:      '#f1f5f9',
                  borderRadius: 6,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                  {action.badge}
                </Typography>
              </Box>

              {/* Hairline divider */}
              <Box sx={{ height: '1px', bgcolor: '#f1f5f9', mx: -2.5 }} />

              {/* Primary CTA */}
              <Box
                onClick={() => action.primaryFloor ? onSelectFloor(action.primaryFloor) : undefined}
                sx={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            0.75,
                  py:             1.25,
                  borderRadius:   2,
                  bgcolor:        TEAL,
                  color:          '#fff',
                  cursor:         'pointer',
                  fontWeight:     700,
                  fontSize:       13.5,
                  letterSpacing:  '0.01em',
                  userSelect:     'none',
                  transition:     'opacity 0.15s',
                  '&:hover':      { opacity: 0.9 },
                }}
              >
                {/* chat bubble icon for TrueSpot CTAs */}
                {!action.primaryFloor && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 1h12v9H8l-3 3V10H1V1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  </svg>
                )}
                {action.primaryLabel}
              </Box>

              {/* Secondary link */}
              {action.hasTrueSpotLink && (
                <Typography
                  sx={{
                    fontSize:  12,
                    color:     'text.disabled',
                    textAlign: 'center',
                    cursor:    'default',
                    lineHeight: 1,
                  }}
                >
                  or talk it through with TrueSpot
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>

      {/* ── MedSpot360 integration banner ───────────────────────────────────── */}
      <Box
        sx={{
          bgcolor:      '#f0fdfb',
          border:       '1px solid #99f6e4',
          borderRadius: 3,
          p:            { xs: 2, sm: 2.5 },
          display:      'flex',
          alignItems:   'center',
          gap:          3,
          flexWrap:     'wrap',
        }}
      >
        {/* Logo */}
        <Box sx={{ flexShrink: 0 }}>
          <Typography
            sx={{
              fontSize:      17,
              fontWeight:    900,
              color:         '#0f766e',
              letterSpacing: '-0.01em',
              lineHeight:    1,
            }}
          >
            MEDSPOT
            <Box component="span" sx={{ color: TEAL }}>360</Box>
          </Typography>
        </Box>

        {/* Text */}
        <Typography sx={{ flex: 1, fontSize: 13, color: '#0f4f4a', lineHeight: 1.65, minWidth: 200 }}>
          Ready to move them? MedSpot 360 locates the surplus {assetType.toLowerCase()} on
          over-stocked floors right now — move them to a short floor in minutes, not shifts.
        </Typography>

        {/* CTA */}
        <Box
          sx={{
            flexShrink:   0,
            display:      'flex',
            alignItems:   'center',
            gap:          0.75,
            px:           2,
            py:           1.1,
            bgcolor:      TEAL,
            color:        '#fff',
            borderRadius: 2,
            cursor:       'pointer',
            fontWeight:   700,
            fontSize:     13.5,
            whiteSpace:   'nowrap',
            userSelect:   'none',
            transition:   'opacity 0.15s',
            '&:hover':    { opacity: 0.9 },
          }}
        >
          Find these in MedSpot 360
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: 4 }}>
            <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Box>
      </Box>

      {/* ── Footer panels: Glossary + About ─────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <GlossaryPanel assetType={assetType} />
        <AboutPanel rows={rows} assetType={assetType} unitValue={unitValue} />
      </Box>
    </Box>
  )
}
