'use client'
import Image from 'next/image'
import Link from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import BusinessIcon from '@mui/icons-material/Business'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import GroupsIcon from '@mui/icons-material/Groups'
import type { ClientConfig } from '@/types/dashboard'

const PRODUCT_LOGO: Record<string, { src: string; width: number; height: number }> = {
  health: { src: '/images/TruespotHealth.webp', width: 90, height: 50 },
}
const DEFAULT_LOGO = { src: '/images/logo.jpg', width: 130, height: 36 }

interface Props {
  product: string
  productLabel: string
  clients: ClientConfig[]
}

export default function ProductPortal({ product, productLabel, clients }: Props) {
  const logo = PRODUCT_LOGO[product] ?? DEFAULT_LOGO
  const totalReports = clients.reduce((sum, c) => sum + Object.keys(c.dashboards).length, 0)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#f8fafc' }}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'sticky', top: 0, zIndex: 20,
          height: 60, flexShrink: 0,
          bgcolor: 'background.paper',
          borderBottom: '1px solid', borderColor: 'divider',
          px: 3, display: 'flex', alignItems: 'center',
        }}
      >
        <Image
          src={logo.src}
          alt="TrueSpot"
          width={logo.width}
          height={logo.height}
          style={{ objectFit: 'contain', objectPosition: 'left center' }}
          priority
        />
      </Box>

      {/* ── Hero band ─────────────────────────────────────────────────────── */}
      <Box sx={{ bgcolor: '#f8fafc', borderBottom: '1px solid', borderColor: 'divider', px: 3, py: 4 }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.75, letterSpacing: -0.5 }}>
            {productLabel}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              Select a client portal to get started.
            </Typography>
            <Chip
              label={`${clients.length} client${clients.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9', color: 'text.secondary' }}
            />
            <Chip
              label={`${totalReports} report${totalReports !== 1 ? 's' : ''}`}
              size="small"
              sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9', color: 'text.secondary' }}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Client grid ───────────────────────────────────────────────────── */}
      <Box sx={{ px: 3, py: 4, maxWidth: 1200, mx: 'auto', width: '100%' }}>
        {clients.length === 0 ? (
          <Box sx={{ py: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, color: 'text.disabled' }}>
            <GroupsIcon sx={{ fontSize: 48, opacity: 0.4 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary' }}>No clients configured yet</Typography>
            <Typography variant="body2" color="text.disabled">Client portals will appear here once they are added.</Typography>
          </Box>
        ) : (
        <Grid container spacing={2.5}>
          {clients.map((client) => {
            const reportCount = Object.keys(client.dashboards).length
            const initials = client.display_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={client.client_id}>
                <Card
                  variant="outlined"
                  sx={{
                    borderRadius: 2.5,
                    height: '100%',
                    transition: 'box-shadow 0.18s, border-color 0.18s, transform 0.18s',
                    '&:hover': {
                      boxShadow: '0 4px 20px rgba(0,0,0,0.09)',
                      borderColor: 'primary.main',
                      transform: 'translateY(-2px)',
                    },
                  }}
                >
                  <CardActionArea
                    component={Link}
                    href={`/dashboard/${product}/${client.client_id}`}
                    sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5, height: '100%' }}
                  >
                    {/* Avatar */}
                    <Box sx={{
                      width: 44, height: 44, borderRadius: 2,
                      bgcolor: 'primary.main', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 15, letterSpacing: 0.5,
                      flexShrink: 0,
                    }}>
                      {initials || <BusinessIcon sx={{ fontSize: 20 }} />}
                    </Box>

                    {/* Name + count */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, mb: 0.4 }}>
                        {client.display_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {reportCount} report{reportCount !== 1 ? 's' : ''} available
                      </Typography>
                    </Box>

                    {/* Arrow */}
                    <Box sx={{ alignSelf: 'flex-end' }}>
                      <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                    </Box>
                  </CardActionArea>
                </Card>
              </Grid>
            )
          })}
        </Grid>
        )}
      </Box>
    </Box>
  )
}
