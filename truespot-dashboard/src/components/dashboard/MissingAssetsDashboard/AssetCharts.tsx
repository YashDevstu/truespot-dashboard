'use client'

import { useCallback } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip as ChartJSTooltip,
  type ChartData,
  type ChartOptions,
  type Plugin,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import type { ChartDataPoint } from '@/hooks/useMissingAssetsData'

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartJSTooltip)

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_HEX         = '2563eb'
const BAR_MUTED_ALPHA = 0.20
const BAR_FULL_ALPHA  = 0.88

const TIME_SINCE_COLORS: Record<string, string> = {
  'Less than 2hr': '16a34a',
  '2hr-24hr':      '65a30d',
  '1d-7d':         'd97706',
  '7d-30d':        'ea580c',
  '30d+':          'dc2626',
}

function hexRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── Inline end-label plugin (no extra dependency) ─────────────────────────────

const endLabelsPlugin: Plugin<'bar'> = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di)
      meta.data.forEach((bar, i) => {
        const v = dataset.data[i]
        if (typeof v !== 'number') return
        ctx.save()
        ctx.font = '600 11px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.textAlign  = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(v.toLocaleString(), bar.x + 6, bar.y)
        ctx.restore()
      })
    })
  },
}

// ── Chart panel ────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  title: string
  data: ChartDataPoint[]
  loading: boolean
  barThickness?: number
  activeValue?: string
  onBarClick?: (value: string) => void
  onClear?: () => void
  colorMap?: Record<string, string>
}

function HorizontalBarChart({
  title,
  data,
  loading,
  barThickness = 20,
  activeValue,
  onBarClick,
  onClear,
  colorMap,
}: ChartPanelProps) {
  const selectedSet = activeValue
    ? new Set(activeValue.split(',').map((s) => s.trim()).filter(Boolean))
    : new Set<string>()
  const hasSelection  = selectedSet.size > 0
  const isClickable   = !!onBarClick
  const chartHeight   = Math.max(80, data.length * (barThickness + 16) + 24)
  // Cap visible height and let the panel scroll instead of hiding rows off the bottom
  // or hardcoding a max item count (a fixed slice(0, N) silently hid real data before).
  const MAX_VISIBLE_HEIGHT = 360
  const isScrollable = chartHeight > MAX_VISIBLE_HEIGHT

  const bgColors = data.map((d) => {
    const hex        = colorMap?.[d.label] ?? BAR_HEX
    const isSelected = selectedSet.has(d.label)
    return hexRgba(hex, hasSelection ? (isSelected ? 1 : BAR_MUTED_ALPHA) : BAR_FULL_ALPHA)
  })

  const chartData: ChartData<'bar'> = {
    labels: data.map((d) => d.label),
    datasets: [{
      data:            data.map((d) => d.count),
      backgroundColor: bgColors,
      borderRadius:    3,
      borderSkipped:   false,
      barThickness,
    }],
  }

  const handleClick = useCallback(
    (_evt: unknown, elements: { index: number }[]) => {
      if (!onBarClick || elements.length === 0) return
      onBarClick(data[elements[0].index].label)
    },
    [onBarClick, data],
  )

  const options: ChartOptions<'bar'> = {
    indexAxis:           'y',
    responsive:          true,
    maintainAspectRatio: false,
    animation:           false,
    layout:  { padding: { right: 52 } },
    plugins: {
      legend:  { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `  ${Number(ctx.parsed.x).toLocaleString()} assets`,
        },
        displayColors:  false,
        backgroundColor: '#ffffff',
        borderColor:     '#e2e8f0',
        borderWidth:     1,
        titleColor:      '#0f172a',
        bodyColor:       '#64748b',
        titleFont:       { weight: 'bold', size: 12 } as const,
        bodyFont:        { size: 11 },
        padding:         10,
        cornerRadius:    8,
      },
    },
    scales: {
      x: { display: false },
      y: {
        grid:   { display: false },
        border: { display: false },
        ticks:  {
          font:  { size: 11 },
          color: '#64748b',
          maxRotation: 0,
        },
      },
    },
    onClick: handleClick,
    onHover: (_evt, elements, chart) => {
      const canvas = chart.canvas
      canvas.style.cursor = elements.length > 0 && isClickable ? 'pointer' : 'default'
    },
  }

  return (
    <Paper
      elevation={0}
      sx={{
        flex:        '1 1 240px',
        minWidth:    220,
        borderRadius: 2,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: hasSelection ? '#2563eb' : 'divider',
        bgcolor:     'background.paper',
        p:           2.5,
        display:     'flex',
        flexDirection: 'column',
        gap:         1.5,
        transition:  'border-color 0.2s',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled', fontSize: '0.65rem' }}
        >
          {title}
        </Typography>

        {isClickable && !hasSelection && (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>
            click to filter
          </Typography>
        )}

        {hasSelection && (
          <Typography
            variant="caption"
            onClick={() => onClear ? onClear() : onBarClick!(activeValue!)}
            sx={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
          >
            ✕ Clear
          </Typography>
        )}
      </Box>

      {/* Body */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={barThickness} sx={{ borderRadius: 0.5, opacity: 1 - i * 0.15 }} />
          ))}
        </Box>
      ) : data.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <Typography variant="body2" color="text.disabled">No data</Typography>
        </Box>
      ) : (
        <Box
          sx={
            isScrollable
              ? {
                  maxHeight: MAX_VISIBLE_HEIGHT,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  pr: 0.5,
                }
              : undefined
          }
        >
          <Box sx={{ height: chartHeight }}>
            <Bar
              data={chartData}
              options={options}
              plugins={[endLabelsPlugin]}
            />
          </Box>
        </Box>
      )}
    </Paper>
  )
}

// ── AssetCharts ────────────────────────────────────────────────────────────────

interface AssetChartsProps {
  timeSinceData:    ChartDataPoint[]
  topLocationsData: ChartDataPoint[]
  assetCountData:   ChartDataPoint[]
  loading:          boolean
  activeHourGroup?: string
  activeGeofence?:  string
  activeAssetName?: string
  onTimeSinceClick?:  (value: string) => void
  onTimeSinceClear?:  () => void
  onLocationClick?:   (value: string) => void
  onLocationClear?:   () => void
  onAssetTypeClick?:  (value: string) => void
  onAssetTypeClear?:  () => void
}

export default function AssetCharts({
  timeSinceData,
  topLocationsData,
  assetCountData,
  loading,
  activeHourGroup,
  activeGeofence,
  activeAssetName,
  onTimeSinceClick,
  onTimeSinceClear,
  onLocationClick,
  onLocationClear,
  onAssetTypeClick,
  onAssetTypeClear,
}: AssetChartsProps) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <HorizontalBarChart
        title="Time Since Last Seen"
        data={timeSinceData}
        loading={loading}
        barThickness={22}
        activeValue={activeHourGroup}
        onBarClick={onTimeSinceClick}
        onClear={onTimeSinceClear}
        colorMap={TIME_SINCE_COLORS}
      />
      <HorizontalBarChart
        title="Top Locations"
        data={topLocationsData}
        loading={loading}
        barThickness={20}
        activeValue={activeGeofence}
        onBarClick={onLocationClick}
        onClear={onLocationClear}
      />
      <HorizontalBarChart
        title="Assets by Type"
        data={assetCountData}
        loading={loading}
        barThickness={20}
        activeValue={activeAssetName}
        onBarClick={onAssetTypeClick}
        onClear={onAssetTypeClear}
      />
    </Box>
  )
}
