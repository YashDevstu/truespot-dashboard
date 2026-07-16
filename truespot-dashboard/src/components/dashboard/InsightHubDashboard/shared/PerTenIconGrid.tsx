'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// Brand teal for "With Patient" — matches the Insight Hub design system
const TEAL   = '#0d9488'
const SLATE  = '#64748b'
const AMBER  = '#d97706'
const ORANGE = '#f97316'
const RED    = '#ef4444'

export const BUCKET_COLORS = {
  withPatient:   TEAL,
  sittingUnused: SLATE,
  cleaning:      AMBER,
  exit:          ORANGE,
  hardToFind:    RED,
}

export const BUCKET_BG = {
  withPatient:   '#d1faf5',
  sittingUnused: '#f1f5f9',
  cleaning:      '#fef3c7',
  exit:          '#ffedd5',
  hardToFind:    '#fee2e2',
}

export const BUCKET_LABELS = {
  withPatient:   'With Patient',
  sittingUnused: 'Sitting Unused',
  cleaning:      'Cleaning / Moving',
  exit:          'Exit',
  hardToFind:    'Hard to Find',
}

export function PinIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.35)} viewBox="0 0 12 16" fill="none">
      <path
        d="M6 0.5C3.52 0.5 1.5 2.52 1.5 5C1.5 8.5 6 15.5 6 15.5C6 15.5 10.5 8.5 10.5 5C10.5 2.52 8.48 0.5 6 0.5Z"
        fill={color}
      />
      <circle cx="6" cy="5" r="1.8" fill="white" opacity="0.85" />
    </svg>
  )
}

// Largest-remainder rounding — scales raw counts to exactly 10 icons.
// When values overlap (sum > total), normalises against the actual sum first
// so the result always sums to 10.
export function scaleTo10(values: number[], total: number): number[] {
  if (total === 0) return values.map(() => 0)
  const sum      = values.reduce((a, b) => a + b, 0)
  const divisor  = sum > total ? sum : total   // handle overlapping buckets
  const raw      = values.map((v) => (v / divisor) * 10)
  const floors   = raw.map(Math.floor)
  const floorsSum = floors.reduce((a, b) => a + b, 0)
  const rem      = 10 - floorsSum
  if (rem <= 0) return floors
  const order    = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < rem; k++) floors[order[k].i]++
  return floors
}

const PIN_SIZE = 28

interface BucketRowProps {
  n:         number
  label:     string
  iconColor: string
  chipBg:    string
}

function BucketRow({ n, label, iconColor, chipBg }: BucketRowProps) {
  const active = n > 0

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.5 }}>
      {/* Category label */}
      <Typography
        sx={{
          fontSize:   13,
          fontWeight: 500,
          color:      active ? 'text.secondary' : 'text.disabled',
          lineHeight: 1.35,
          minWidth:   130,
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>

      {/* Colored chip — full pins when n > 0; empty track otherwise */}
      {n > 0 ? (
        <Box
          sx={{
            flexShrink:   0,
            bgcolor:      chipBg,
            borderRadius: 2.5,
            px:           1.5,
            py:           0.75,
            display:      'flex',
            gap:          '5px',
            alignItems:   'center',
            minHeight:    46,
          }}
        >
          {Array(n).fill(null).map((_, i) => (
            <PinIcon key={i} color={iconColor} size={PIN_SIZE} />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            flexShrink:   0,
            minHeight:    46,
            display:      'flex',
            alignItems:   'center',
            px:           1,
          }}
        >
          <Box sx={{ width: 20, height: 2, bgcolor: '#e2e8f0', borderRadius: 1 }} />
        </Box>
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Count — same size/weight whether it's a pin count or a plain 0,
          so every row's number reads consistently at a glance */}
      <Typography
        sx={{
          fontSize:      24,
          fontWeight:    800,
          color:         n > 0 ? iconColor : '#cbd5e1',
          letterSpacing: '-0.02em',
          lineHeight:    1,
          minWidth:      32,
          textAlign:     'right',
        }}
      >
        {n}
      </Typography>
    </Box>
  )
}

interface PerTenIconGridProps {
  total:         number
  withPatient:   number
  cleaning:      number
  sittingUnused: number
  hardToFind:    number
  exit?:         number  // GF clients only — omit to keep the 4-bucket layout
}

export default function PerTenIconGrid({
  total,
  withPatient,
  cleaning,
  sittingUnused,
  hardToFind,
  exit,
}: PerTenIconGridProps) {
  const hasExit = exit !== undefined
  const [nPatient, nCleaning, nExit, nUnused, nHard] = scaleTo10(
    [withPatient, cleaning, exit ?? 0, sittingUnused, hardToFind],
    total,
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <BucketRow n={nPatient}  label="With a patient"    iconColor={TEAL}   chipBg={BUCKET_BG.withPatient}   />
      <BucketRow n={nCleaning} label="Cleaning / moving" iconColor={AMBER}  chipBg={BUCKET_BG.cleaning}      />
      {hasExit && (
        <BucketRow n={nExit}   label="Exit"              iconColor={ORANGE} chipBg={BUCKET_BG.exit}          />
      )}
      <BucketRow n={nUnused}   label="Sitting unused"    iconColor={SLATE}  chipBg={BUCKET_BG.sittingUnused} />
      <BucketRow n={nHard}     label="Hard to find"      iconColor={RED}    chipBg={BUCKET_BG.hardToFind}    />
    </Box>
  )
}
