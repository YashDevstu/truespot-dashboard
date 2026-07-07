import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { cookies } from 'next/headers'
import { getProductConfig } from '@/services/config/productConfigService'
import { getClientConfig } from '@/services/config/clientConfigService'
import ProductPortal from '@/components/dashboard/ProductPortal/ProductPortal'

interface PageProps {
  params: Promise<{ product: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { product } = await params
  try {
    const config = getProductConfig(product)
    return { title: config.label }
  } catch {
    return { title: 'TrueSpot Dashboard' }
  }
}

export default async function ProductPortalPage({ params }: PageProps) {
  const { product } = await params

  if (process.env.EMBED_TOKENS) {
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

  const clients = productConfig.clients.flatMap((clientId) => {
    try {
      return [getClientConfig(clientId)]
    } catch {
      return []
    }
  })

  return (
    <ProductPortal
      product={product}
      productLabel={productConfig.label}
      clients={clients}
    />
  )
}
