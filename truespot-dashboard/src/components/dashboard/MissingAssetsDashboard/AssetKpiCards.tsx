'use client'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import type { HealthKpiData } from '@/hooks/useMissingAssetsData'

// Color is applied to the number itself — only where it encodes status meaning.
// Total and Active use neutral (text.primary). Missing and Outside use status colors.
const KPI_CARDS = [
  {
    key: 'totalAssets' as keyof HealthKpiData,
    label: 'Total Assets',
    subtitle: 'assets selected',
    numberColor: 'text.primary',
  },
  {
    key: 'activeLt2hr' as keyof HealthKpiData,
    label: 'Active · < 2HR',
    subtitle: '% of selected',
    numberColor: '#15803d',
    isPercent: true,
  },
  {
    key: 'missing30d' as keyof HealthKpiData,
    label: 'Missing 30D+',
    subtitle: 'equipment off network',
    numberColor: '#dc2626',
  },
  {
    key: 'outsideHospital' as keyof HealthKpiData,
    label: 'Outside Hospital',
    subtitle: 'assets at exit locations',
    numberColor: '#ea580c',
  },
]

interface KpiCardProps {
  label: string
  value: number | null
  subtitle: string
  numberColor: string
  totalAssets?: number
  isPercent?: boolean
  loading: boolean
}

function KpiCard({
  label,
  value,
  subtitle,
  numberColor,
  totalAssets,
  isPercent,
  loading,
}: KpiCardProps) {
  const displaySubtitle =
    isPercent && value !== null && totalAssets
      ? `${Math.round((value / totalAssets) * 100)}% of selected`
      : subtitle

  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 180px',
        minWidth: 160,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 2.5,
        pt: 1.75,
        pb: 1.75,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'text.disabled',
          fontSize: '0.62rem',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>

      {loading ? (
        <Skeleton variant="text" width={80} height={52} />
      ) : (
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: '2rem', md: '2.375rem' },
            lineHeight: 1.1,
            color: numberColor,
            letterSpacing: '-0.02em',
            mb: 0.5,
          }}
        >
          {value !== null ? value.toLocaleString() : '—'}
        </Typography>
      )}

      <Typography
        variant="caption"
        sx={{ color: 'text.disabled', fontSize: '0.72rem', lineHeight: 1.3 }}
      >
        {displaySubtitle}
      </Typography>
    </Paper>
  )
}

interface AssetKpiCardsProps {
  kpis: HealthKpiData | null
  loading: boolean
}

export default function AssetKpiCards({ kpis, loading }: AssetKpiCardsProps) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      {KPI_CARDS.map((card) => (
        <KpiCard
          key={card.key}
          label={card.label}
          value={kpis?.[card.key] ?? null}
          subtitle={card.subtitle}
          numberColor={card.numberColor}
          totalAssets={kpis?.totalAssets}
          isPercent={card.isPercent}
          loading={loading}
        />
      ))}
    </Box>
  )
}
