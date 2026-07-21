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

  if (process.env.NODE_ENV === 'production') notFound()

  let productConfig
  try {
    productConfig = getProductConfig(product)
  } catch {
    notFound()
  }

  // Aggregate unique dashboard types across all clients for this product.
  // Each unique dashboardKey becomes a tile on the product portal.
  const dashboardMap = new Map<string, { label: string; icon?: string; description?: string; clientCount: number }>()

  for (const clientId of productConfig.clients) {
    try {
      const clientConfig = getClientConfig(clientId)
      for (const [dashboardKey, dashboard] of Object.entries(clientConfig.dashboards)) {
        const existing = dashboardMap.get(dashboardKey)
        if (existing) {
          existing.clientCount += 1
        } else {
          dashboardMap.set(dashboardKey, {
            label: dashboard.label,
            icon: dashboard.icon,
            description: dashboard.description,
            clientCount: 1,
          })
        }
      }
    } catch { /* skip misconfigured clients */ }
  }

  const dashboardTypes = Array.from(dashboardMap.entries()).map(([key, value]) => ({
    dashboardKey: key,
    ...value,
  }))

  return (
    <ProductPortal
      product={product}
      productLabel={productConfig.label}
      dashboardTypes={dashboardTypes}
    />
  )
}
