import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { cookies } from 'next/headers'
import { getClientConfig } from '@/services/config/clientConfigService'
import { getProductConfig } from '@/services/config/productConfigService'
import ClientPortalHub from '@/components/dashboard/ClientPortalHub/ClientPortalHub'

interface PageProps {
  params: Promise<{ product: string; clientId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { clientId } = await params
  try {
    const config = getClientConfig(clientId)
    return { title: `${config.display_name} Portal` }
  } catch {
    return { title: 'TrueSpot Dashboard' }
  }
}

export default async function ClientHubPage({ params }: PageProps) {
  const { product, clientId } = await params

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
    if (sessionClientId !== clientId) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Forbidden</Typography>
          <Typography color="text.secondary">You do not have access to this client&apos;s portal.</Typography>
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

  let productLabel = product
  try {
    productLabel = getProductConfig(product).label
  } catch { /* fall back to raw product string */ }

  return <ClientPortalHub product={product} productLabel={productLabel} client={config} />
}
