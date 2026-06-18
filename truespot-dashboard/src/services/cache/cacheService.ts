import 'server-only'
import NodeCache from 'node-cache'

const cache = new NodeCache({ useClones: false })

export function cacheGet<T>(key: string): T | undefined {
  return cache.get<T>(key)
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  cache.set(key, value, ttlSeconds)
}

export function cacheDel(key: string): void {
  cache.del(key)
}

export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key)
  if (cached !== undefined) return cached

  const value = await fetcher()
  cache.set(key, value, ttlSeconds)
  return value
}
