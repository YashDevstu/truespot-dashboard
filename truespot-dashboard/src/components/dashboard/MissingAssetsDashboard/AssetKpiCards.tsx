'use client'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { HealthKpiData } from '@/hooks/useMissingAssetsData'

interface KpiCardConfig {
  key: keyof HealthKpiData
  label: string
  subtitle: string
  numberColor: string
  activeColor: string   // border + bg tint when active
  activeBg: string
  isPercent?: boolean
  onClick?: () => void
  isActive?: boolean
}

const KPI_CARDS: Omit<KpiCardConfig, 'onClick' | 'isActive'>[] = [
  {
    key: 'totalAssets',
    label: 'Total Assets',
    subtitle: 'assets selected',
    numberColor: 'text.primary',
    activeColor: '#2563eb',
    activeBg: '#eff6ff',
  },
  {
    key: 'activeLt2hr',
    label: 'Active · < 2HR',
    subtitle: '% of selected',
    numberColor: '#15803d',
    activeColor: '#15803d',
    activeBg: '#f0fdf4',
    isPercent: true,
  },
  {
    key: 'missing30d',
    label: 'Missing 30D+',
    subtitle: 'equipment off network',
    numberColor: '#dc2626',
    activeColor: '#dc2626',
    activeBg: '#fef2f2',
  },
  {
    key: 'outsideHospital',
    label: 'Outside Hospital',
    subtitle: 'assets at exit locations',
    numberColor: '#ea580c',
    activeColor: '#ea580c',
    activeBg: '#fff7ed',
  },
]

interface KpiCardProps extends KpiCardConfig {
  value: number | null
  totalAssets?: number
  loading: boolean
}

function KpiCard({
  label,
  value,
  subtitle,
  numberColor,
  activeColor,
  activeBg,
  totalAssets,
  isPercent,
  loading,
  onClick,
  isActive,
}: KpiCardProps) {
  const displaySubtitle =
    isPercent && value !== null && totalAssets
      ? `${Math.round((value / totalAssets) * 100)}% of selected`
      : subtitle

  const clickable = !!onClick

  return (
    <Tooltip title={clickable ? (isActive ? 'Click to clear filter' : 'Click to filter') : ''} placement="top" disableHoverListener={!clickable}>
      <Paper
        elevation={0}
        onClick={onClick}
        sx={{
          flex: '1 1 180px',
          minWidth: 160,
          borderRadius: 2,
          border: '1px solid',
          borderColor: isActive ? activeColor : 'divider',
          bgcolor: isActive ? activeBg : 'background.paper',
          px: 2.5,
          pt: 1.75,
          pb: 1.75,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'border-color 0.15s, background-color 0.15s, box-shadow 0.15s',
          '&:hover': clickable ? {
            borderColor: activeColor,
            boxShadow: `0 0 0 1px ${activeColor}22`,
          } : {},
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
    </Tooltip>
  )
}

interface AssetKpiCardsProps {
  kpis: HealthKpiData | null
  loading: boolean
  activeHourGroup?: string
  activeOutsideHospital?: string
  onActiveLt2hrClick: () => void
  onMissing30dClick: () => void
  onOutsideHospitalClick: () => void
}

export default function AssetKpiCards({
  kpis,
  loading,
  activeHourGroup,
  activeOutsideHospital,
  onActiveLt2hrClick,
  onMissing30dClick,
  onOutsideHospitalClick,
}: AssetKpiCardsProps) {
  const handlers: Partial<Record<keyof HealthKpiData, () => void>> = {
    activeLt2hr:     onActiveLt2hrClick,
    missing30d:      onMissing30dClick,
    outsideHospital: onOutsideHospitalClick,
  }

  const isActive = (key: keyof HealthKpiData): boolean => {
    if (key === 'activeLt2hr')     return activeHourGroup === 'Less than 2hr'
    if (key === 'missing30d')      return activeHourGroup === '30d+'
    if (key === 'outsideHospital') return activeOutsideHospital === 'Yes'
    return false
  }

  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      {KPI_CARDS.map(({ key, ...cardProps }) => (
        <KpiCard
          key={key}
          {...cardProps}
          value={kpis?.[key] ?? null}
          totalAssets={kpis?.totalAssets}
          loading={loading}
          onClick={handlers[key]}
          isActive={isActive(key)}
        />
      ))}
    </Box>
  )
}
