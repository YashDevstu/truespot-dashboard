'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Divider from '@mui/material/Divider'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DirectionsCarOutlinedIcon from '@mui/icons-material/DirectionsCarOutlined'
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined'

interface SelectedAssetCardProps {
  rows: Record<string, unknown>[]
}

export default function SelectedAssetCard({ rows }: SelectedAssetCardProps) {
  const [expanded, setExpanded] = useState(true)

  const info = useMemo(() => {
    const r = rows[0]
    if (!r) return null
    // Collect all unique asset types present in the loaded rows
    const types = [...new Set(
      rows.map((row) => String(row['[AssetType]'] ?? '').trim()).filter(Boolean)
    )]
    return {
      make:        String(r['[Make]']        ?? ''),
      model:       String(r['[Model]']       ?? ''),
      year:        String(r['[Year]']        ?? ''),
      vin:         String(r['[VIN]']         ?? ''),
      stockNumber: String(r['[StockNumber]'] ?? ''),
      assetTypes:  types,
    }
  }, [rows])

  if (!info) return null

  const title = [info.year, info.make, info.model].filter(Boolean).join(' ') || '—'

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Collapsible header */}
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{
          px: 2.5,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          '&:hover': { bgcolor: 'grey.50' },
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <IconButton size="small" tabIndex={-1}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Divider />
        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: icon + name + one chip per asset type present in the data */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <DirectionsCarOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            {info.assetTypes.map((type) => (
              <Chip
                key={type}
                label={type}
                size="small"
                variant="outlined"
                icon={
                  type.toLowerCase() === 'key'
                    ? <VpnKeyOutlinedIcon sx={{ fontSize: '14px !important' }} />
                    : <DirectionsCarOutlinedIcon sx={{ fontSize: '14px !important' }} />
                }
                sx={{
                  borderColor: 'primary.main',
                  color: 'primary.main',
                  fontWeight: 600,
                  fontSize: 11,
                  height: 22,
                  '& .MuiChip-label': { px: 0.75 },
                  '& .MuiChip-icon': { color: 'primary.main', ml: 0.5 },
                }}
              />
            ))}
          </Box>

          {/* Right: VIN + Stock # */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {info.vin && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: 'text.disabled', letterSpacing: 1, fontWeight: 600, fontSize: 10 }}
                >
                  VIN
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', letterSpacing: 0.5 }}>
                  {info.vin}
                </Typography>
              </Box>
            )}
            {info.stockNumber && (
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="caption"
                  sx={{ display: 'block', color: 'text.disabled', letterSpacing: 1, fontWeight: 600, fontSize: 10 }}
                >
                  STOCK #
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2 }}>
                  {info.stockNumber}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  )
}
