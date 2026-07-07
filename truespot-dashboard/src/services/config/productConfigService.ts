import 'server-only'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProductConfigSchema, type ProductConfig } from '@/types/dashboard'

const configCache = new Map<string, ProductConfig>()

export function getProductConfig(product: string): ProductConfig {
  if (configCache.has(product)) return configCache.get(product)!

  const filePath = join(process.cwd(), 'src', 'config', 'products', `${product}.json`)

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    throw new Error(
      `Product config not found for "${product}". Expected file at src/config/products/${product}.json`
    )
  }

  const result = ProductConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Invalid config for product "${product}": ${result.error.message}`
    )
  }

  configCache.set(product, result.data)
  return result.data
}
