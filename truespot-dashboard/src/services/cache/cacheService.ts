import 'server-only'
import NodeCache from 'node-cache'

const cache = new NodeCache({ useClones: false })

// Refresh in background when less than this much TTL remains (10 minutes)
const SWR_THRESHOLD_MS = 10 * 60 * 1000

export function cacheGet<T>(key: string): T | undefined {
  return cache.get<T>(key)
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  cache.set(key, value, ttlSeconds)
}

export function cacheDel(key: string): void {
  cache.del(key)
}

// Stale-while-revalidate: serve cached data instantly even when near expiry,
// and trigger a background refresh so the next request is also instant.
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key)

  if (cached !== undefined) {
    const expiresAt = cache.getTtl(key) // ms timestamp, or 0 if no TTL
    const timeLeftMs = expiresAt ? expiresAt - Date.now() : Infinity

    if (timeLeftMs < SWR_THRESHOLD_MS) {
      // Serve stale immediately; refresh in background so next request is still fast
      fetcher()
        .then((fresh) => cache.set(key, fresh, ttlSeconds))
        .catch(() => {}) // background failures are silent — stale data continues serving
    }

    return cached
  }

  // Cold miss: must wait for the fetcher
  const value = await fetcher()
  cache.set(key, value, ttlSeconds)
  return value
}
