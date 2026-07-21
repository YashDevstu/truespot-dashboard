'use client'
import Image from 'next/image'
import Link from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Typography from '@mui/material/Typography'
import MuiBreadcrumbs from '@mui/material/Breadcrumbs'
import Grid from '@mui/material/Grid'
import Chip from '@mui/material/Chip'
import BusinessIcon from '@mui/icons-material/Business'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import GroupsIcon from '@mui/icons-material/Groups'

const PRODUCT_LOGO: Record<string, { src: string; width: number; height: number }> = {
  health: { src: '/images/TruespotHealth.webp', width: 90, height: 50 },
}
const DEFAULT_LOGO = { src: '/images/logo.jpg', width: 130, height: 36 }

interface ClientEntry {
  clientId: string
  displayName: string
  dashboardLabel: string
  icon?: string
  description?: string
}

interface Props {
  product: string
  productLabel: string
  dashboardKey: string
  dashboardLabel: string
  clients: ClientEntry[]
}

export default function DashboardClientHub({
  product,
  productLabel,
  dashboardKey,
  dashboardLabel,
  clients,
}: Props) {
  const logo = PRODUCT_LOGO[product] ?? DEFAULT_LOGO

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
          {/* Breadcrumb: Product → Dashboard Type */}
          <MuiBreadcrumbs
            separator={<NavigateNextIcon sx={{ fontSize: 14 }} />}
            sx={{ mb: 1.5, fontSize: 13, color: 'text.secondary' }}
          >
            <Link
              href={`/dashboard/${product}`}
              style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#1976d2')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'inherit')}
            >
              {productLabel}
            </Link>
            <Typography sx={{ fontSize: 13, color: 'text.primary', fontWeight: 600 }}>
              {dashboardLabel}
            </Typography>
          </MuiBreadcrumbs>

          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.75, letterSpacing: -0.5 }}>
            {dashboardLabel}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Select a client to open the report.
            </Typography>
            <Chip
              label={`${clients.length} client${clients.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9', color: 'text.secondary' }}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Client grid ───────────────────────────────────────────────────── */}
      <Box sx={{ px: 3, py: 4, maxWidth: 1200, mx: 'auto', width: '100%' }}>
        {clients.length === 0 ? (
          <Box sx={{ py: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <GroupsIcon sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.4 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              No clients configured for this report
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            {clients.map((client) => {
              const initials = client.displayName
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={client.clientId}>
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
                      href={`/dashboard/${product}/${dashboardKey}/${client.clientId}`}
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

                      {/* Name */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, mb: 0.4 }}>
                          {client.displayName}
                        </Typography>
                        {client.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                            {client.description}
                          </Typography>
                        )}
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
