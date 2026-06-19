export const CACHE_TTL_KPIS = parseInt(process.env.CACHE_TTL_KPIS ?? '300', 10)

export const CACHE_TTL_CHARTS = parseInt(process.env.CACHE_TTL_CHARTS ?? '600', 10)

export const CACHE_TTL_DATASETS = parseInt(process.env.CACHE_TTL_DATASETS ?? '3600', 10)

// Location history rows are expensive to fetch (Power BI API, 15 MB limit per chunk).
// TTL matches typical Fabric model refresh cadence. Stale-while-revalidate in cacheService
// ensures users always get instant responses; background refresh keeps data current.
export const CACHE_TTL_LOCATION_HISTORY = parseInt(process.env.CACHE_TTL_LOCATION_HISTORY ?? '7200', 10)
