import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { cookies } from 'next/headers'
import { getProductConfig } from '@/services/config/productConfigService'
import { getClientConfig } from '@/services/config/clientConfigService'
import DashboardClientHub from '@/components/dashboard/DashboardClientHub/DashboardClientHub'

interface PageProps {
  params: Promise<{ product: string; dashboardKey: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { product, dashboardKey } = await params
  try {
    const productConfig = getProductConfig(product)
    // Find the dashboard label from the first client that has this dashboardKey
    for (const clientId of productConfig.clients) {
      try {
        const clientConfig = getClientConfig(clientId)
        const dashboard = clientConfig.dashboards[dashboardKey]
        if (dashboard) return { title: `${dashboard.label} — ${productConfig.label}` }
      } catch { /* skip */ }
    }
    return { title: productConfig.label }
  } catch {
    return { title: 'TrueSpot Dashboard' }
  }
}

export default async function DashboardTypeHubPage({ params }: PageProps) {
  const { product, dashboardKey } = await params

  if (process.env.EMBED_TOKENS && process.env.NODE_ENV === 'production') {
    const cookieStore = await cookies()
    const sessionClientId = cookieStore.get('_dash_session')?.value
    if (!sessionClientId) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Unauthorized</Typography>
          <Typography color="text.secondary">Please access this dashboard through your TrueSpot account.</Typography>
        </Box>
      )
    }
  }

  let productConfig
  try {
    productConfig = getProductConfig(product)
  } catch {
    notFound()
  }

  // Collect clients that have this dashboardKey and resolve their dashboard config
  const clientEntries: { clientId: string; displayName: string; dashboardLabel: string; icon?: string; description?: string }[] = []

  for (const clientId of productConfig.clients) {
    try {
      const clientConfig = getClientConfig(clientId)
      const dashboard = clientConfig.dashboards[dashboardKey]
      if (dashboard) {
        clientEntries.push({
          clientId,
          displayName: clientConfig.display_name,
          dashboardLabel: dashboard.label,
          icon: dashboard.icon,
          description: dashboard.description,
        })
      }
    } catch { /* skip misconfigured clients */ }
  }

  if (clientEntries.length === 0) notFound()

  // Use the label from the first matching client's dashboard config
  const dashboardLabel = clientEntries[0].dashboardLabel

  return (
    <DashboardClientHub
      product={product}
      productLabel={productConfig.label}
      dashboardKey={dashboardKey}
      dashboardLabel={dashboardLabel}
      clients={clientEntries}
    />
  )
}
