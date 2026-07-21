'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { IHCleaningRow } from '@/hooks/useInsightHubData'
import { BUCKET_COLORS } from '../shared/PerTenIconGrid'

interface TheCleaningLoopProps {
  rows:      IHCleaningRow[]
  assetType: string | undefined
  loading:   boolean
}

// Colour gradient: short time = good (green→amber), long = concern (orange→red)
const HOUR_GRP_COLORS: Record<string, string> = {
  'Less than 2hr': '#22c55e',
  '2hr-24hr':      '#84cc16',
  '1d-7d':         '#f59e0b',
  '7d-30d':        '#f97316',
  '30d+':          BUCKET_COLORS.hardToFind,
}

function getColor(label: string): string {
  return HOUR_GRP_COLORS[label] ?? BUCKET_COLORS.cleaning
}

export default function TheCleaningLoop({ rows, assetType, loading }: TheCleaningLoopProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rectangular" height={28} width="50%" sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
      </Box>
    )
  }

  const total = rows.reduce((s, r) => s + r.count, 0)

  if (total === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
        No assets are currently in cleaning zones.
      </Typography>
    )
  }

  const assetLabel = assetType ?? 'equipment'
  const lt2hr = rows.find((r) => r.hourGrp === 'Less than 2hr')?.count ?? 0
  const concern = rows.filter((r) => r.hourGrpSort >= 3).reduce((s, r) => s + r.count, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 720 }}>

      {/* Headline */}
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {total.toLocaleString()} {assetLabel.toLowerCase()} are in cleaning zones right now
        </Typography>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.75 }}>
          {lt2hr > 0
            ? `${lt2hr.toLocaleString()} have been there under 2 hours — likely moving through the normal cleaning cycle.`
            : 'Check how long these assets have been waiting in soiled or utility rooms.'}
          {concern > 0 && ` ${concern.toLocaleString()} have been stuck for more than a day.`}
        </Typography>
      </Box>

      {/* Bar chart */}
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 2.5,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary', mb: 1.5, letterSpacing: '0.04em' }}>
          HOW LONG IN CLEANING ZONE
        </Typography>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={36}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="hourGrp" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(v: unknown) => [`${v} assets`, 'Count']}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={getColor(r.hourGrp)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {/* Stat pills */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {rows.map((r) => (
          <Box
            key={r.hourGrp}
            sx={{
              px: 2, py: 1.25,
              borderRadius: 2,
              bgcolor: 'background.paper',
              border: `2px solid ${getColor(r.hourGrp)}`,
              minWidth: 110,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: getColor(r.hourGrp) }}>
              {r.count.toLocaleString()}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{r.hourGrp}</Typography>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
        This shows how long assets currently in soiled utility or cleaning zones have been sitting there.
        Assets stuck for more than 1 day may need attention.
      </Typography>
    </Box>
  )
}
