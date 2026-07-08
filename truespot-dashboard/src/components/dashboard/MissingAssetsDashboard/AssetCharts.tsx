'use client'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import type { ChartDataPoint } from '@/hooks/useMissingAssetsData'

const BAR_COLOR         = '#2563eb'
const BAR_MUTED_OPACITY = 0.22        // non-selected bars when a selection exists

// Status colors for the Time Since Last Seen chart — matches LastSeenRangePills palette
const TIME_SINCE_COLORS: Record<string, string> = {
  'Less than 2hr': '#16a34a',
  '2hr-24hr':      '#65a30d',
  '1d-7d':         '#d97706',
  '7d-30d':        '#ea580c',
  '30d+':          '#dc2626',
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {payload[0].value.toLocaleString()} assets
      </Typography>
    </Box>
  )
}

// ── Chart panel ────────────────────────────────────────────────────────────────

interface ChartPanelProps {
  title: string
  data: ChartDataPoint[]
  loading: boolean
  barHeight?: number
  activeValue?: string
  onBarClick?: (value: string) => void
  onClear?: () => void
  colorMap?: Record<string, string>  // label → bar color; falls back to BAR_COLOR
}

function HorizontalBarChart({
  title,
  data,
  loading,
  barHeight = 22,
  activeValue,
  onBarClick,
  onClear,
  colorMap,
}: ChartPanelProps) {
  const chartHeight = Math.max(100, data.length * (barHeight + 14) + 32)
  // Parse multi-value comma-separated activeValue into a Set for membership checks
  const selectedSet = activeValue
    ? new Set(activeValue.split(',').map((s) => s.trim()).filter(Boolean))
    : new Set<string>()
  const hasSelection = selectedSet.size > 0
  const isClickable = !!onBarClick

  return (
    <Paper
      elevation={0}
      sx={{
        flex: '1 1 240px',
        minWidth: 220,
        borderRadius: 2,
        border: '1px solid',
        borderColor: hasSelection ? '#2563eb' : 'divider',
        bgcolor: 'background.paper',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'border-color 0.2s',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'text.disabled',
            fontSize: '0.65rem',
          }}
        >
          {title}
        </Typography>

        {/* "Click to filter" hint when no selection is active */}
        {isClickable && !hasSelection && (
          <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>
            click to filter
          </Typography>
        )}

        {/* Clear selection button — clears all selected values */}
        {hasSelection && (onBarClick || onClear) && (
          <Typography
            variant="caption"
            onClick={() => onClear ? onClear() : onBarClick!(activeValue!)}
            sx={{
              fontSize: '0.65rem',
              color: '#2563eb',
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            ✕ Clear
          </Typography>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              variant="rectangular"
              height={barHeight}
              sx={{ borderRadius: 0.5, opacity: 1 - i * 0.15 }}
            />
          ))}
        </Box>
      ) : data.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120 }}>
          <Typography variant="body2" color="text.disabled">No data</Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 0, right: 44, left: 0, bottom: 0 }}
            barSize={barHeight}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={110}
              tick={{ fontSize: 11, fill: 'currentColor' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  payload={payload as unknown as { value: number }[]}
                  label={label as string}
                />
              )}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar
              dataKey="count"
              radius={[0, 3, 3, 0]}
              onClick={
                onBarClick
                  ? (entry: unknown) => {
                      const e = entry as ChartDataPoint
                      onBarClick(e.label)
                    }
                  : undefined
              }
              style={isClickable ? { cursor: 'pointer' } : undefined}
            >
              {data.map((entry) => {
                const isSelected = selectedSet.has(entry.label)
                const baseColor = colorMap?.[entry.label] ?? BAR_COLOR
                return (
                  <Cell
                    key={entry.label}
                    fill={baseColor}
                    fillOpacity={
                      hasSelection
                        ? isSelected ? 1 : BAR_MUTED_OPACITY
                        : 0.85
                    }
                  />
                )
              })}
              <LabelList
                dataKey="count"
                position="right"
                style={{ fontSize: 11, fontWeight: 600, fill: 'currentColor' }}
                formatter={(v) =>
                  typeof v === 'number' ? v.toLocaleString() : String(v ?? '')
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Paper>
  )
}

// ── Exports ────────────────────────────────────────────────────────────────────

interface AssetChartsProps {
  timeSinceData: ChartDataPoint[]
  topLocationsData: ChartDataPoint[]
  assetCountData: ChartDataPoint[]
  loading: boolean
  activeHourGroup?: string
  activeGeofence?: string
  activeAssetName?: string
  onTimeSinceClick?: (value: string) => void
  onTimeSinceClear?: () => void
  onLocationClick?: (value: string) => void
  onLocationClear?: () => void
  onAssetTypeClick?: (value: string) => void
  onAssetTypeClear?: () => void
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
        barHeight={22}
        activeValue={activeHourGroup}
        onBarClick={onTimeSinceClick}
        onClear={onTimeSinceClear}
        colorMap={TIME_SINCE_COLORS}
      />
      {/* Chart shows only top 12 for readability; pills below use the full list */}
      <HorizontalBarChart
        title="Top Locations"
        data={topLocationsData.slice(0, 12)}
        loading={loading}
        barHeight={20}
        activeValue={activeGeofence}
        onBarClick={onLocationClick}
        onClear={onLocationClear}
      />
      <HorizontalBarChart
        title="Assets by Type"
        data={assetCountData}
        loading={loading}
        barHeight={20}
        activeValue={activeAssetName}
        onBarClick={onAssetTypeClick}
        onClear={onAssetTypeClear}
      />
    </Box>
  )
}
