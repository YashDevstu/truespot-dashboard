import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { cookies } from 'next/headers'
import { getClientConfig } from '@/services/config/clientConfigService'
import LocationHistoryDashboard from '@/components/dashboard/LocationHistoryDashboard'
import MissingAssetsDashboard from '@/components/dashboard/MissingAssetsDashboard/MissingAssetsDashboard'
import HealthLocationDashboard from '@/components/dashboard/HealthLocationDashboard/HealthLocationDashboard'
import InsightHubDashboard from '@/components/dashboard/InsightHubDashboard/InsightHubDashboard'
import ExitLocationDashboard from '@/components/dashboard/ExitLocationDashboard/ExitLocationDashboard'

interface PageProps {
  params: Promise<{ product: string; dashboardKey: string; clientId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { clientId, dashboardKey } = await params
  try {
    const config = getClientConfig(clientId)
    const dashboard = config.dashboards[dashboardKey]
    return { title: dashboard ? `${config.display_name} — ${dashboard.label}` : `${config.display_name} Dashboard` }
  } catch {
    return { title: 'TrueSpot Dashboard' }
  }
}

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { product, dashboardKey, clientId } = await params
  const sp = await searchParams

  // If a token is in the URL, exchange it for a session cookie via the auth route
  const token = typeof sp.token === 'string' ? sp.token : undefined
  if (token) {
    const cleanPath = `/dashboard/${product}/${dashboardKey}/${clientId}`
    redirect(
      `/api/auth/verify?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(cleanPath)}`
    )
  }

  // Auth gate: only enforced when EMBED_TOKENS is configured (production)
  if (process.env.EMBED_TOKENS && process.env.NODE_ENV === 'production') {
    const cookieStore = await cookies()
    const sessionClientId = cookieStore.get('_dash_session')?.value

    if (!sessionClientId) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Unauthorized</Typography>
          <Typography color="text.secondary">
            Please access this dashboard through your TrueSpot account.
          </Typography>
        </Box>
      )
    }

    if (sessionClientId !== clientId) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Forbidden</Typography>
          <Typography color="text.secondary">
            You do not have access to this client&apos;s dashboard.
          </Typography>
        </Box>
      )
    }
  }

  let config
  try {
    config = getClientConfig(clientId)
  } catch {
    notFound()
  }

  const dashboard = config.dashboards[dashboardKey]
  if (!dashboard) notFound()

  const sharedProps = {
    clientId,
    dashboardKey,
    product,
    displayName: config.display_name,
    dashboardLabel: dashboard.label,
  }

  const fallback = (
    <Box sx={{ p: 3 }}>
      <Skeleton height={60} sx={{ mb: 2 }} />
      <Skeleton height={400} />
    </Box>
  )

  if (dashboard.dashboard_type === 'missing_assets') {
    return (
      <Suspense fallback={fallback}>
        <MissingAssetsDashboard {...sharedProps} />
      </Suspense>
    )
  }

  if (dashboard.dashboard_type === 'health_location_history') {
    return (
      <Suspense fallback={fallback}>
        <HealthLocationDashboard {...sharedProps} />
      </Suspense>
    )
  }

  if (dashboard.dashboard_type === 'health_insight_hub') {
    // Collect all asset types that have par configured across any floor
    const configuredTypes = dashboard.floor_par?.floors
      ? [...new Set(
          Object.values(dashboard.floor_par.floors)
            .flatMap((f) => Object.keys(f.by_type ?? {}))
        )]
      : undefined

    return (
      <Suspense fallback={fallback}>
        <InsightHubDashboard
          {...sharedProps}
          classification={dashboard.classification}
          spareBuffer={dashboard.spare_buffer}
          unitValue={dashboard.unit_value}
          configuredTypes={configuredTypes}
        />
      </Suspense>
    )
  }

  if (dashboard.dashboard_type === 'health_exit_location') {
    return (
      <Suspense fallback={fallback}>
        <ExitLocationDashboard {...sharedProps} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={fallback}>
      <LocationHistoryDashboard
        {...sharedProps}
        azureMapsKey={process.env.MAPBOX_TOKEN}
      />
    </Suspense>
  )
}
