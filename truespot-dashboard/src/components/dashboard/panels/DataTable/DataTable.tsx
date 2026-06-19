'use client'
import { useEffect, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, type ColDef } from 'ag-grid-community'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Skeleton from '@mui/material/Skeleton'

ModuleRegistry.registerModules([AllCommunityModule])

function formatDuration(minutes: unknown): string {
  if (minutes === null || minutes === undefined) return '—'
  const m = Number(minutes)
  if (isNaN(m)) return String(minutes)
  if (m < 60) return `${Math.round(m)}m`
  const h = Math.floor(m / 60)
  const rem = Math.round(m % 60)
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

function formatTime(val: unknown): string {
  if (!val) return '—'
  const str = String(val)
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
  }
  return str
}

interface DataTableProps {
  rows: Record<string, unknown>[]
  loading?: boolean
  error?: string | null
}

// Power BI Execute Queries API wraps all column names in square brackets in the response
const COL_DEFS: ColDef[] = [
  { field: '[Geofence]', headerName: 'Geofence', flex: 1, minWidth: 130 },
  { field: '[SubGeoZone]', headerName: 'Sub Zone', flex: 1, minWidth: 130 },
  {
    field: '[StartTime]',
    headerName: 'Start Time',
    flex: 1,
    minWidth: 160,
    valueFormatter: (p) => formatTime(p.value),
  },
  {
    field: '[EndTime]',
    headerName: 'End Time',
    flex: 1,
    minWidth: 160,
    valueFormatter: (p) => formatTime(p.value),
  },
  {
    field: '[MinutesDiff]',
    headerName: 'Duration',
    width: 110,
    valueFormatter: (p) => formatDuration(p.value),
    sort: 'desc',
  },
  { field: '[BeaconId]', headerName: 'Beacon', width: 150 },
  { field: '[VIN]', headerName: 'VIN', width: 170 },
  { field: '[StockNumber]', headerName: 'Stock #', width: 110 },
  { field: '[AssetType]', headerName: 'Asset Type', width: 120 },
  { field: '[FloorLevel]', headerName: 'Floor', width: 90 },
  {
    field: '[BatteryLevel]',
    headerName: 'Battery',
    width: 90,
    valueFormatter: (p) =>
      p.value !== null && p.value !== undefined ? `${Number(p.value).toFixed(0)}%` : '—',
  },
]

export default function DataTable({ rows, loading, error }: DataTableProps) {
  const gridRef = useRef<AgGridReact>(null)

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.sizeColumnsToFit()
    }
  }, [rows])

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} height={36} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    )
  }

  return (
    <Box
      className="ag-theme-quartz"
      sx={{
        height: '100%',
        width: '100%',
        '--ag-font-size': '13px',
        '--ag-row-height': '38px',
        '--ag-header-height': '40px',
        '--ag-border-color': '#E2E8F0',
        '--ag-header-background-color': '#F8FAFC',
        '--ag-odd-row-background-color': '#FAFBFC',
        '--ag-row-hover-color': '#EFF6FF',
        '--ag-selected-row-background-color': '#DBEAFE',
        '--ag-font-family': '"Inter", "Roboto", sans-serif',
      }}
    >
      <AgGridReact
        ref={gridRef}
        rowData={rows}
        columnDefs={COL_DEFS}
        defaultColDef={{ resizable: true, sortable: true, filter: true }}
        pagination
        paginationPageSize={100}
        paginationPageSizeSelector={[50, 100, 250, 500]}
        suppressMovableColumns={false}
        domLayout="autoHeight"
      />
    </Box>
  )
}
