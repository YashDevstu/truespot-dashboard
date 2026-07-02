'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'

interface ExportButtonProps {
  onExportExcel: () => Promise<void>
  disabled?: boolean
}

export default function ExportButton({ onExportExcel, disabled }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading || disabled) return
    setLoading(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
    try {
      await onExportExcel()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tooltip title="Export data to Excel spreadsheet" placement="bottom">
      <span>
        <Button
          variant="outlined"
          size="small"
          onClick={handleClick}
          disabled={disabled || loading}
          startIcon={
            loading
              ? <CircularProgress size={13} color="inherit" />
              : <FileDownloadOutlinedIcon sx={{ fontSize: '16px !important' }} />
          }
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: 0.1,
            px: 1.75,
            py: 0.6,
            borderColor: '#d1d5db',
            color: 'text.secondary',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            bgcolor: 'background.paper',
            transition: 'all 0.15s',
            '&:hover': {
              borderColor: '#16a34a',
              color: '#16a34a',
              bgcolor: '#f0fdf4',
            },
            '&:active': {
              bgcolor: '#dcfce7',
            },
            '&.Mui-disabled': {
              opacity: 0.45,
            },
          }}
        >
          {loading ? 'Exporting…' : 'Export Excel'}
        </Button>
      </span>
    </Tooltip>
  )
}
