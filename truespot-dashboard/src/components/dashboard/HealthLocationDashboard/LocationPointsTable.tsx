'use client'

import { useMemo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import FirstPageIcon from '@mui/icons-material/FirstPage'
import LastPageIcon from '@mui/icons-material/LastPage'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams, RowClickedEvent } from 'ag-grid-community'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import type { HLLocationRow } from '@/hooks/useHealthLocationData'
import { formatDurationMins } from './HealthLocationKpiCards'

ModuleRegistry.registerModules([AllCommunityModule])

const UNKNOWN_GEOFENCE = 'Unknown Geofence'

// Unique key per location session — assetId + firstSeen timestamp
export function locationRowKey(row: HLLocationRow): string {
  return `${row.assetId}__${row.firstSeen}`
}

// ── Duration color ─────────────────────────────────────────────────────────────

function getDurationColor(mins: number): string {
  if (mins <   120) return '#16a34a'
  if (mins <  1440) return '#65a30d'
  if (mins < 10080) return '#d97706'
  if (mins < 43200) return '#ea580c'
  return '#dc2626'
}

// ── Cell renderers ─────────────────────────────────────────────────────────────

function DurationCell({ data }: ICellRendererParams<HLLocationRow>) {
  if (!data) return null
  const color = getDurationColor(data.durationMins)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1 }}>
        {formatDurationMins(data.durationMins)}
      </Typography>
    </Box>
  )
}

function GeofenceCell({ data }: ICellRendererParams<HLLocationRow>) {
  if (!data) return null
  const isUnknown = data.geofence === UNKNOWN_GEOFENCE
  return (
    <Typography
      variant="caption"
      sx={{ fontSize: 12, fontWeight: 700, color: isUnknown ? '#ea580c' : 'text.primary' }}
    >
      {data.geofence || '—'}
    </Typography>
  )
}

const UNKNOWN_SUB_GEO_ZONE = 'Unknown SubGeoZone'

function SubGeoZoneCell({ value }: { value: string }) {
  const isUnknown = value === UNKNOWN_SUB_GEO_ZONE || !value
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>
  return (
    <span style={{ fontSize: 12, color: isUnknown ? '#94a3b8' : 'inherit', fontStyle: isUnknown ? 'italic' : 'normal' }}>
      {value}
    </span>
  )
}

function MonoCell({ value }: { value: string }) {
  if (!value) return <span style={{ color: '#94a3b8' }}>—</span>
  return (
    <span style={{ fontFamily: '"Roboto Mono", monospace', fontSize: 11, color: '#475569', letterSpacing: '0.02em' }}>
      {value}
    </span>
  )
}

function formatDatetime(value: string): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Column definitions ─────────────────────────────────────────────────────────

function buildColumnDefs(): ColDef<HLLocationRow>[] {
  return [
    {
      field: 'firstSeen',
      headerName: 'First Seen',
      minWidth: 155, flex: 1.3,
      valueFormatter: (p) => formatDatetime(p.value as string),
      sortable: true, sort: 'asc',
      comparator: (a: string, b: string) => new Date(a || 0).getTime() - new Date(b || 0).getTime(),
      cellStyle: { fontSize: 12 },
    },
    {
      field: 'lastSeen',
      headerName: 'Last Seen',
      minWidth: 155, flex: 1.3,
      valueFormatter: (p) => formatDatetime(p.value as string),
      sortable: true,
      comparator: (a: string, b: string) => new Date(a || 0).getTime() - new Date(b || 0).getTime(),
      cellStyle: { fontSize: 12 },
    },
    {
      headerName: 'Duration',
      minWidth: 110, flex: 0.9,
      sortable: true,
      comparator: (_, __, nodeA, nodeB) => (nodeA.data?.durationMins ?? 0) - (nodeB.data?.durationMins ?? 0),
      cellRenderer: DurationCell,
    },
    {
      field: 'floor',
      headerName: 'Floor',
      minWidth: 90, flex: 0.7,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12 },
    },
    {
      headerName: 'Geofence',
      minWidth: 140, flex: 1.2,
      filter: true, sortable: true,
      valueGetter: (p) => p.data?.geofence ?? '',
      cellRenderer: GeofenceCell,
    },
    {
      field: 'subGeoZone',
      headerName: 'Sub Geo Zone',
      minWidth: 150, flex: 1.3,
      filter: true, sortable: true,
      cellRenderer: SubGeoZoneCell,
    },
    {
      field: 'assetId',
      headerName: 'Asset ID',
      minWidth: 130, flex: 0.9,
      filter: true, sortable: true,
      cellRenderer: (p: { value: string }) => <MonoCell value={p.value} />,
    },
    {
      field: 'assetName',
      headerName: 'Asset Name',
      minWidth: 150, flex: 1.4,
      filter: true, sortable: true,
      cellStyle: { fontSize: 12, fontWeight: 700 },
    },
    {
      field: 'tagId',
      headerName: 'Tag ID',
      minWidth: 140, flex: 0.9,
      filter: true, sortable: true,
      cellRenderer: (p: { value: string }) => <MonoCell value={p.value} />,
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

interface LocationPointsTableProps {
  rows:             HLLocationRow[]
  loading:          boolean
  selectedRowKeys:  Set<string>
  onRowClick:       (row: HLLocationRow) => void
  onClearSelection: () => void
  // Server-side pagination
  page:             number
  pageSize:         number
  totalRows:        number
  onPageChange:     (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const PAGE_SIZE_OPTIONS = [25, 50, 100]

export default function LocationPointsTable({
  rows, loading, selectedRowKeys,
  onRowClick, onClearSelection,
  page, pageSize, totalRows, onPageChange, onPageSizeChange,
}: LocationPointsTableProps) {
  const columnDefs    = useMemo(() => buildColumnDefs(), [])
  const defaultColDef = useMemo<ColDef>(
    () => ({ resizable: true, suppressMovable: false, cellStyle: { display: 'flex', alignItems: 'center' } }),
    []
  )

  const onRowClicked = useCallback((e: RowClickedEvent<HLLocationRow>) => {
    if (!e.data) return
    onRowClick(e.data)
  }, [onRowClick])

  const selectionCount = selectedRowKeys.size
  const totalPages     = Math.max(1, Math.ceil(totalRows / pageSize))
  const rangeStart     = totalRows === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd       = Math.min(page * pageSize, totalRows)

  return (
    <Paper
      elevation={0}
      sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* Header bar */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2.5, py: 1.25,
          borderBottom: '1px solid', borderBottomColor: 'divider',
          bgcolor: '#f8fafc',
          gap: 1.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.disabled', fontSize: '0.65rem' }}
        >
          Location Points
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
          {selectionCount > 0 && (
            <Chip
              label={`${selectionCount} row${selectionCount > 1 ? 's' : ''} selected — dashboard filtered`}
              size="small"
              onDelete={onClearSelection}
              sx={{
                height: 22, fontSize: '0.7rem', fontWeight: 700,
                bgcolor: '#eff6ff', color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                '& .MuiChip-deleteIcon': { color: '#1d4ed8', fontSize: 14 },
              }}
            />
          )}
          {loading && (
            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.72rem', fontWeight: 500, flexShrink: 0 }}>
              Loading…
            </Typography>
          )}
        </Box>
      </Box>

      {/* AG Grid — flex: 1 so it grows to fill the remaining panel height (panel is height:100% in the grid) */}
      <Box sx={{ flex: 1, minHeight: 380, width: '100%', overflow: 'hidden' }} className="ag-theme-alpine">
        <AgGridReact<HLLocationRow>
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          loading={loading}
          onRowClicked={onRowClicked}
          getRowStyle={(p) => {
            const selected = !!(p.data && selectedRowKeys.has(locationRowKey(p.data)))
            return {
              cursor:     'pointer',
              background: selected ? '#eff6ff' : '',
              borderLeft: selected ? '3px solid #2563eb' : '3px solid transparent',
              fontWeight: selected ? '600' : '',
            }
          }}
          rowHeight={40}
          headerHeight={38}
          suppressCellFocus
          animateRows={false}
          loadingOverlayComponent={() => (
            <Typography variant="body2" color="text.secondary">Loading location records…</Typography>
          )}
          noRowsOverlayComponent={() => (
            <Typography variant="body2" color="text.secondary">No records match the current filters.</Typography>
          )}
        />
      </Box>

      {/* Custom pagination footer */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          px: 2, py: 0.75,
          borderTop: '1px solid', borderColor: 'divider',
          bgcolor: '#f8fafc',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        {/* Rows per page */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
            Rows per page
          </Typography>
          <Select
            size="small"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
            sx={{
              fontSize: '0.75rem', height: 26,
              '& .MuiSelect-select': { py: 0.25, px: 1 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <MenuItem key={s} value={s} sx={{ fontSize: '0.8rem' }}>{s}</MenuItem>
            ))}
          </Select>
        </Box>

        {/* Range text */}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
          {totalRows === 0 ? '—' : `${rangeStart}–${rangeEnd} of ${totalRows.toLocaleString()}`}
        </Typography>

        {/* Navigation buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <IconButton
            size="small" onClick={() => onPageChange(1)}
            disabled={page === 1 || loading}
            sx={{ p: 0.5 }}
          >
            <FirstPageIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            size="small" onClick={() => onPageChange(page - 1)}
            disabled={page === 1 || loading}
            sx={{ p: 0.5 }}
          >
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography variant="caption" sx={{ px: 1, fontSize: '0.72rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
            Page {page} of {totalPages}
          </Typography>
          <IconButton
            size="small" onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || loading}
            sx={{ p: 0.5 }}
          >
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <IconButton
            size="small" onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages || loading}
            sx={{ p: 0.5 }}
          >
            <LastPageIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}
