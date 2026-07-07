import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
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
