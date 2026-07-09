'use client'

import { useMemo } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, RowClickedEvent, ICellRendererParams } from 'ag-grid-community'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import type { MissingAssetRow } from '@/hooks/useMissingAssetsData'

ModuleRegistry.registerModules([AllCommunityModule])

// ── Duration formatting ────────────────────────────────────────────────────────

function formatDuration(hours: number): string {
  if (hours === null || hours === undefined) return '—'
  // 'Not seen since' column is in hours, not days
  const totalMinutes = Math.round(hours * 60)
  const d = Math.floor(totalMinutes / (24 * 60))
  const h = Math.floor((totalMinutes % (24 * 60)) / 60)
  const m = totalMinutes % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Cell renderers ─────────────────────────────────────────────────────────────

const HOUR_GROUP_COLOR: Record<string, string> = {
  'Less than 2hr': '#16a34a',
  '2hr-24hr':      '#65a30d',
  '1d-7d':         '#d97706',
  '7d-30d':        '#ea580c',
  '30d+':          '#dc2626',
}

function DurationCell({ data }: ICellRendererParams<MissingAssetRow>) {
  if (!data) return null
  const color = HOUR_GROUP_COLOR[data.hourGroup ?? ''] ?? '#94a3b8'
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12, fontWeight: 600, color, lineHeight: 1 }}>
        {formatDuration(data.hoursMissing)}
      </Typography>
    </Box>
  )
}

function GeofenceCell({ data }: ICellRendererParams<MissingAssetRow>) {
  if (!data) return null
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 0.25 }}>
      <Typography variant="caption" sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>
        {data.geofence || '—'}
      </Typography>
      {data.subLocation && (
        <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.disabled', lineHeight: 1.2 }}>
          {data.subLocation}
        </Typography>
      )}
    </Box>
  )
}

function OutsideFacilityCell({ value }: { value: string }) {
  if (value === 'Yes') {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', px: 1.5, py: 0.3, borderRadius: 999, minWidth: 42, justifyContent: 'center', bgcolor: '#fff7ed', border: '1px solid #fed7aa' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#c2410c', fontSize: 11 }}>Yes</Typography>
      </Box>
    )
  }
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', px: 1.5, py: 0.3, borderRadius: 999, minWidth: 42, justifyContent: 'center', bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: '#94a3b8', fontSize: 11 }}>No</Typography>
    </Box>
  )
}

function IdCell({ value }: { value: string }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>
  return (
    <span style={{ fontFamily: '"Roboto Mono", monospace', fontSize: 11, color: '#475569', letterSpacing: '0.02em' }}>
      {value}
    </span>
  )
}

function formatLastSeen(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Column definitions ─────────────────────────────────────────────────────────

function buildColumnDefs(): ColDef<MissingAssetRow>[] {
  return [
    {
      field: 'department',
      headerName: 'Department',
      minWidth: 130, flex: 1.2,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12 },
      tooltipField: 'department',
    },
    {
      field: 'assetName',
      headerName: 'Asset Name',
      minWidth: 140, flex: 1.4,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12, fontWeight: 700 },
    },
    {
      field: 'assetId',
      headerName: 'Asset ID',
      minWidth: 100, flex: 0.9,
      filter: true, sortable: true,
      cellRenderer: (params: { value: string }) => <IdCell value={params.value} />,
    },
    {
      field: 'tagId',
      headerName: 'Tag ID',
      minWidth: 110, flex: 0.9,
      cellRenderer: (params: { value: string }) => <IdCell value={params.value} />,
      filter: true, sortable: true,
    },
    {
      field: 'lastSeen',
      headerName: 'Last Seen',
      minWidth: 155, flex: 1.4,
      valueFormatter: (params) => formatLastSeen(params.value as string),
      sortable: true, sort: 'desc',
      comparator: (a: string, b: string) => new Date(a || 0).getTime() - new Date(b || 0).getTime(),
      cellStyle: { fontSize: 12 },
    },
    {
      headerName: 'Duration',
      minWidth: 120, flex: 0.9,
      sortable: true,
      comparator: (_, __, nodeA, nodeB) => (nodeA.data?.hoursMissing ?? 0) - (nodeB.data?.hoursMissing ?? 0),
      cellRenderer: DurationCell,
    },
    {
      field: 'floor',
      headerName: 'Floor',
      minWidth: 80, flex: 0.65,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12 },
    },
    {
      headerName: 'Last Geofence',
      minWidth: 160, flex: 1.3,
      filter: true, sortable: true,
      valueGetter: (params) => params.data?.geofence ?? '',
      cellRenderer: GeofenceCell,
    },
    {
      field: 'outsideHospital',
      headerName: 'Outside Facility',
      minWidth: 120, flex: 0.85,
      cellRenderer: (params: { value: string }) => <OutsideFacilityCell value={params.value} />,
      sortable: true,
    },
    {
      field: 'assetType',
      headerName: 'Asset Type',
      minWidth: 120, flex: 1,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12 },
    },
  ]
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AssetsTableProps {
  rows: MissingAssetRow[]
  loading: boolean
  selectedAssetId: string | undefined  // comma-separated asset IDs
  onRowClick: (row: MissingAssetRow) => void
  onClearSelection: () => void
}

export default function AssetsTable({
  rows,
  loading,
  selectedAssetId,
  onRowClick,
  onClearSelection,
}: AssetsTableProps) {
  const columnDefs = useMemo(() => buildColumnDefs(), [])

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      suppressMovable: false,
      cellStyle: { display: 'flex', alignItems: 'center' },
    }),
    []
  )

  // Parse comma-separated selected IDs into a Set for O(1) lookup
  const selectedSet = useMemo(
    () => new Set(selectedAssetId ? selectedAssetId.split(',').map((s) => s.trim()).filter(Boolean) : []),
    [selectedAssetId]
  )
  const selectionCount = selectedSet.size

  function handleRowClicked(event: RowClickedEvent<MissingAssetRow>) {
    if (!event.data) return
    onRowClick(event.data)  // parent handles toggle logic
  }

  // Highlight all selected rows
  function getRowStyle(params: { data?: MissingAssetRow }) {
    const isSelected = !!params.data?.assetId && selectedSet.has(params.data.assetId)
    return {
      cursor: 'pointer',
      background: isSelected ? '#eff6ff' : '',
      borderLeft: isSelected ? '3px solid #2563eb' : '',
    }
  }

  const chipLabel =
    selectionCount === 1
      ? '1 asset selected — click to deselect'
      : `${selectionCount} assets selected — click to deselect`

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: selectionCount > 0 ? '#2563eb' : 'divider',
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Table header bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.25,
          borderBottom: '1px solid',
          borderBottomColor: 'divider',
          bgcolor: selectionCount > 0 ? '#eff6ff' : '#f8fafc',
          transition: 'background-color 0.2s',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
            Filtered Assets
          </Typography>
          {selectionCount > 0 && (
            <Chip
              label={chipLabel}
              size="small"
              onDelete={onClearSelection}
              deleteIcon={
                <Tooltip title="Clear selection">
                  <FilterAltOffIcon sx={{ fontSize: 14 }} />
                </Tooltip>
              }
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 600,
                bgcolor: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                '& .MuiChip-deleteIcon': { color: '#1d4ed8' },
              }}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', fontSize: '0.72rem', fontWeight: 500 }}
        >
          {loading ? 'Loading…' : `${rows.length.toLocaleString()} assets`}
        </Typography>
      </Box>

      {/* AG Grid */}
      <Box sx={{ height: 520, width: '100%' }} className="ag-theme-alpine">
        <AgGridReact<MissingAssetRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          loading={loading}
          pagination
          paginationPageSize={25}
          paginationPageSizeSelector={[25, 50, 100]}
          rowHeight={40}
          headerHeight={38}
          getRowStyle={getRowStyle}
          onRowClicked={handleRowClicked}
          loadingOverlayComponent={() => (
            <Typography variant="body2" color="text.secondary">Loading assets…</Typography>
          )}
          noRowsOverlayComponent={() => (
            <Typography variant="body2" color="text.secondary">No assets match the current filters.</Typography>
          )}
          suppressCellFocus
          animateRows={false}
        />
      </Box>
    </Paper>
  )
}
