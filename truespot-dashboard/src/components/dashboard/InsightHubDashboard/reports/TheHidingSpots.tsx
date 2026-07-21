'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import type { IHHidingSpotRow } from '@/hooks/useInsightHubData'
import { BUCKET_COLORS } from '../shared/PerTenIconGrid'

interface TheHidingSpotsProps {
  rows:      IHHidingSpotRow[]
  assetType: string | undefined
  loading:   boolean
}

// Strip the trailing beacon ID code from zone names e.g. "(P02a0)"
function cleanZoneName(name: string): string {
  return name.replace(/\s*\([A-Za-z0-9]{4,6}\)\s*$/, '').trim()
}

export default function TheHidingSpots({ rows, assetType, loading }: TheHidingSpotsProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rectangular" height={28} width="52%" sx={{ borderRadius: 1 }} />
        {[0,1,2,3,4].map((i) => (
          <Skeleton key={i} variant="rectangular" height={52} sx={{ borderRadius: 1.5 }} />
        ))}
      </Box>
    )
  }

  if (rows.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
        No idle locations found for the current filter.
      </Typography>
    )
  }

  const total = rows.reduce((s, r) => s + r.count, 0)
  const assetLabel = assetType ?? 'equipment'
  const top = rows[0]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>

      {/* Headline */}
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {total.toLocaleString()} {assetLabel.toLowerCase()} are sitting idle across {rows.length} locations
        </Typography>
        {top && (
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.75 }}>
            The biggest hiding spot is{' '}
            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {cleanZoneName(top.subGeo)}
            </Box>
            {top.floor ? ` (${top.floor})` : ''} — {top.count} assets are parked there right now.
          </Typography>
        )}
      </Box>

      {/* Location list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map((row, i) => {
          const barPct = rows[0].count > 0 ? (row.count / rows[0].count) * 100 : 0
          return (
            <Box
              key={i}
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                px: 2,
                py: 1.25,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Background bar fill */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0, left: 0, bottom: 0,
                  width: `${barPct}%`,
                  bgcolor: BUCKET_COLORS.sittingUnused,
                  opacity: 0.12,
                  borderRadius: '6px 0 0 6px',
                  pointerEvents: 'none',
                }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
                {/* Rank */}
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'text.disabled',
                    width: 20,
                    flexShrink: 0,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </Typography>

                {/* Zone name + floor */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'text.primary',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cleanZoneName(row.subGeo)}
                  </Typography>
                  {row.floor && (
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                      {row.floor}
                    </Typography>
                  )}
                </Box>

                {/* Count badge */}
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.4,
                    borderRadius: 1,
                    bgcolor: BUCKET_COLORS.sittingUnused + '22',
                    border: `1px solid ${BUCKET_COLORS.sittingUnused}55`,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#475569',
                    }}
                  >
                    {row.count}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )
        })}
      </Box>

      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
        Showing top {rows.length} idle locations. These zones have assets that are not in patient care areas,
        cleaning rooms, or classified as hard to find.
      </Typography>
    </Box>
  )
}
