import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
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
