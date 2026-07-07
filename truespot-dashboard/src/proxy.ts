import { NextRequest, NextResponse } from 'next/server'

// EMBED_TOKENS env var: JSON map of clientId → secret token
// e.g. '{"carvision":"abc123","servco":"xyz789"}'
// TrueSpot's website appends ?token=<the client's token> when linking to the dashboard.
function buildTokenMap(): Record<string, string> {
  const raw = process.env.EMBED_TOKENS
  if (!raw) return {}
  try {
    const clientTokens: Record<string, string> = JSON.parse(raw)
    // Invert to token → clientId for fast lookup
    return Object.fromEntries(Object.entries(clientTokens).map(([k, v]) => [v, k]))
  } catch {
    return {}
  }
}

export function proxy(request: NextRequest) {
  const tokenMap = buildTokenMap()

  // No tokens configured (local dev) — pass through
  if (Object.keys(tokenMap).length === 0) return NextResponse.next()

  const tokenInUrl = request.nextUrl.searchParams.get('token')

  if (tokenInUrl) {
    const clientId = tokenMap[tokenInUrl]
    if (!clientId) {
      return new NextResponse('Unauthorized', { status: 403 })
    }
    // Valid token: strip from URL, set session cookie, redirect
    const url = request.nextUrl.clone()
    url.searchParams.delete('token')
    const response = NextResponse.redirect(url)
    response.cookies.set('_dash_session', clientId, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',   // required for cross-site embed from truespot.com
      path: '/dashboard',
      maxAge: 60 * 60 * 8, // 8-hour session
    })
    return response
  }

  // No token in URL — validate session cookie
  const sessionClientId = request.cookies.get('_dash_session')?.value
  if (!sessionClientId) {
    return new NextResponse('Unauthorized', { status: 403 })
  }

  // URL shape: /dashboard/[product]/[clientId]/[dashboardKey]
  const segments = request.nextUrl.pathname.split('/')
  const urlClientId = segments[3] // index 3 = clientId

  // At product level (/dashboard/automotive) — session exists, no clientId to enforce
  if (!urlClientId) return NextResponse.next()

  // Block cross-client access (e.g. CarVision user trying to open Servco URL)
  if (urlClientId !== sessionClientId) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return NextResponse.next()
}

