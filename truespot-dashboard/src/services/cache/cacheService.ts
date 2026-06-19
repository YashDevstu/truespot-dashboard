import 'server-only'
import NodeCache from 'node-cache'

// ---------------------------------------------------------------------------
// Storage backends
// ---------------------------------------------------------------------------

const nodeCache = new NodeCache({ useClones: false })

// Upstash Redis: used in production when env vars are set.
// Survives Vercel serverless spin-downs; node-cache does NOT.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars.
let redis: import('@upstash/redis').Redis | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  import('@upstash/redis').then(({ Redis }) => {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  })
}

async function cacheRead<T>(key: string): Promise<T | null> {
  if (redis) {
    return redis.get<T>(key)
  }
  return nodeCache.get<T>(key) ?? null
}

async function cacheWrite<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (redis) {
    await redis.set(key, value, { ex: ttlSeconds })
  } else {
    nodeCache.set(key, value, ttlSeconds)
  }
}

function nodeCacheTtlMs(key: string): number {
  const ts = nodeCache.getTtl(key)
  return ts ? ts - Date.now() : Infinity
}

// ---------------------------------------------------------------------------
// In-flight deduplication
// Prevents N simultaneous requests for the same cold cache key from all
// hitting Power BI in parallel — the first one fetches, the rest wait.
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<unknown>>()

// ---------------------------------------------------------------------------
// Stale-while-revalidate threshold
// When < SWR_THRESHOLD_MS remains on the TTL, serve stale data and refresh
// in the background so the next request is also instant.
// ---------------------------------------------------------------------------

const SWR_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cacheRead<T>(key)

  if (cached !== null) {
    // Check whether we're inside the stale window and should background-refresh
    if (!redis) {
      const timeLeftMs = nodeCacheTtlMs(key)
      if (timeLeftMs < SWR_THRESHOLD_MS) {
        triggerBackgroundRefresh(key, ttlSeconds, fetcher)
      }
    }
    // For Redis we rely on the Vercel Cron warmup to refresh before expiry
    return cached
  }

  // Cache miss — deduplicate concurrent fetches for the same key
  if (inFlight.has(key)) {
    return inFlight.get(key) as Promise<T>
  }

  const promise = fetcher()
    .then(async (value) => {
      await cacheWrite(key, value, ttlSeconds)
      inFlight.delete(key)
      return value
    })
    .catch((err) => {
      inFlight.delete(key)
      throw err
    })

  inFlight.set(key, promise)
  return promise
}

function triggerBackgroundRefresh<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): void {
  fetcher()
    .then((fresh) => cacheWrite(key, fresh, ttlSeconds))
    .catch(() => {}) // silent — stale data continues serving
}

export function cacheDel(key: string): void {
  nodeCache.del(key)
  redis?.del(key)
}
