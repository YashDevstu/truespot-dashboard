import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const expected = process.env.EMBED_ACCESS_TOKEN

  // No token configured (local dev without EMBED_ACCESS_TOKEN set) — pass through
  if (!expected) return NextResponse.next()

  const tokenInUrl = request.nextUrl.searchParams.get('token')

  if (tokenInUrl) {
    // Token provided in URL — validate it
    if (tokenInUrl !== expected) {
      return new NextResponse('Unauthorized', { status: 403 })
    }
    // Valid: strip token from URL, set session cookie, redirect
    const url = request.nextUrl.clone()
    url.searchParams.delete('token')
    const response = NextResponse.redirect(url)
    response.cookies.set('_dash_session', expected, {
      httpOnly: true,
      secure: true,        // HTTPS only — always true on Vercel; Chrome/Firefox also allow on localhost
      sameSite: 'none',    // Required for cross-site iframe (truespot.com embeds dashboard)
      path: '/dashboard',
      maxAge: 60 * 60 * 8, // 8-hour session
    })
    return response
  }

  // No token in URL — check session cookie
  const sessionCookie = request.cookies.get('_dash_session')?.value
  if (sessionCookie !== expected) {
    return new NextResponse('Unauthorized', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
