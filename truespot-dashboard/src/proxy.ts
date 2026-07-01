import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const expected = process.env.EMBED_ACCESS_TOKEN

  if (!expected || token !== expected) {
    return new NextResponse('Unauthorized', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
