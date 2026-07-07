import { NextRequest, NextResponse } from 'next/server'

// EMBED_TOKENS env var: JSON map of clientId → secret token
// e.g. '{"carvision":"abc123","servco":"xyz789"}'
function buildTokenMap(): Record<string, string> {
  const raw = process.env.EMBED_TOKENS
  if (!raw) return {}
  try {
    const clientTokens: Record<string, string> = JSON.parse(raw)
    return Object.fromEntries(Object.entries(clientTokens).map(([k, v]) => [v, k]))
  } catch {
    return {}
  }
}

export function middleware(request: NextRequest) {
  const tokenMap = buildTokenMap()

  // No tokens configured (local dev) — pass through
  if (Object.keys(tokenMap).length === 0) return NextResponse.next()

  const tokenInUrl = request.nextUrl.searchParams.get('token')

  if (tokenInUrl) {
    const clientId = tokenMap[tokenInUrl]
    if (!clientId) {
      return new NextResponse('Unauthorized', { status: 403 })
    }
    // Valid token: strip from URL, set session cookie, redirect to clean URL
    const cleanUrl = new URL(request.nextUrl.pathname, request.url)
    const response = NextResponse.redirect(cleanUrl)
    response.cookies.set('_dash_session', clientId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/dashboard',
      maxAge: 60 * 60 * 8,
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
  const urlClientId = segments[3]

  // At product level (/dashboard/automotive) — session exists, no clientId to enforce
  if (!urlClientId) return NextResponse.next()

  // Block cross-client access
  if (urlClientId !== sessionClientId) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
