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

// GET /api/auth/verify?token=ABC&redirect=/dashboard/automotive/carvision/locationhistory
// Called by the dashboard page when it detects a token in the URL.
// Validates the token, sets an 8-hour session cookie, redirects to the clean URL.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const redirectTo = searchParams.get('redirect') ?? '/dashboard'

  const tokenMap = buildTokenMap()

  // No auth configured (local dev) → pass straight through
  if (Object.keys(tokenMap).length === 0) {
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  if (!token) {
    return new NextResponse('Missing token', { status: 400 })
  }

  const clientId = tokenMap[token]
  if (!clientId) {
    return new NextResponse('Unauthorized — invalid token', { status: 403 })
  }

  const destination = new URL(redirectTo, request.url)
  const response = NextResponse.redirect(destination)
  response.cookies.set('_dash_session', clientId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/dashboard',
    maxAge: 60 * 60 * 8,
  })
  return response
}
