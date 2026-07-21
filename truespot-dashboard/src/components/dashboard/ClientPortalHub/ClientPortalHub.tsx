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
import HistoryIcon from '@mui/icons-material/History'
import PinDropIcon from '@mui/icons-material/PinDrop'
import LogoutIcon from '@mui/icons-material/Logout'
import VisibilityIcon from '@mui/icons-material/Visibility'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import DashboardIcon from '@mui/icons-material/Dashboard'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import type { SvgIconComponent } from '@mui/icons-material'
import type { ClientConfig } from '@/types/dashboard'

const ICON_MAP: Record<string, SvgIconComponent> = {
  history:        HistoryIcon,
  pin_drop:       PinDropIcon,
  logout:         LogoutIcon,
  visibility:     VisibilityIcon,
  directions_car: DirectionsCarIcon,
}

const PRODUCT_LOGO: Record<string, { src: string; width: number; height: number }> = {
  health: { src: '/images/TruespotHealth.webp', width: 90, height: 50 },
}
const DEFAULT_LOGO = { src: '/images/logo.jpg', width: 130, height: 36 }

// Soft background + icon color per dashboard icon key
const ICON_PALETTE: Record<string, { bg: string; color: string }> = {
  history:        { bg: '#eff6ff', color: '#2563eb' },
  pin_drop:       { bg: '#f0fdf4', color: '#16a34a' },
  logout:         { bg: '#fff7ed', color: '#ea580c' },
  visibility:     { bg: '#fdf4ff', color: '#9333ea' },
  directions_car: { bg: '#f0f9ff', color: '#0284c7' },
}
const DEFAULT_PALETTE = { bg: '#f8fafc', color: '#475569' }

interface Props {
  product: string
  productLabel: string
  client: ClientConfig
}

export default function ClientPortalHub({ product, productLabel, client }: Props) {
  const logo = PRODUCT_LOGO[product] ?? DEFAULT_LOGO
  const dashboardEntries = Object.entries(client.dashboards)
  const hasCategories = dashboardEntries.some(([, d]) => d.category)

  const grouped: Record<string, Array<[string, ClientConfig['dashboards'][string]]>> = {}
  for (const [key, dashboard] of dashboardEntries) {
    const cat = dashboard.category ?? 'Reports'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push([key, dashboard])
  }

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
          {/* Breadcrumb */}
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
              {client.display_name}
            </Typography>
          </MuiBreadcrumbs>

          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.75, letterSpacing: -0.5 }}>
            {client.display_name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              Select a report to open.
            </Typography>
            <Chip
              label={`${dashboardEntries.length} report${dashboardEntries.length !== 1 ? 's' : ''}`}
              size="small"
              sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: '#f1f5f9', color: 'text.secondary' }}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Report grid ───────────────────────────────────────────────────── */}
      <Box sx={{ px: 3, py: 4, maxWidth: 1200, mx: 'auto', width: '100%' }}>
        {Object.entries(grouped).map(([category, entries]) => (
          <Box key={category} sx={{ mb: 4 }}>
            {hasCategories && (
              <Typography
                variant="overline"
                sx={{ mb: 2, display: 'block', color: 'text.disabled', letterSpacing: 1.2, fontSize: 11 }}
              >
                {category}
              </Typography>
            )}
            <Grid container spacing={2.5}>
              {entries.map(([dashboardKey, dashboard]) => {
                const IconComponent = (dashboard.icon && ICON_MAP[dashboard.icon]) || DashboardIcon
                const palette = (dashboard.icon && ICON_PALETTE[dashboard.icon]) || DEFAULT_PALETTE
                return (
                  <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={dashboardKey}>
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
                        href={`/dashboard/${product}/${client.client_id}/${dashboardKey}`}
                        sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5, height: '100%' }}
                      >
                        {/* Icon pill */}
                        <Box sx={{
                          width: 44, height: 44, borderRadius: 2,
                          bgcolor: palette.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <IconComponent sx={{ fontSize: 22, color: palette.color }} />
                        </Box>

                        {/* Label + description */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3, mb: 0.4 }}>
                            {dashboard.label}
                          </Typography>
                          {dashboard.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                              {dashboard.description}
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
          </Box>
        ))}
      </Box>
    </Box>
  )
}
