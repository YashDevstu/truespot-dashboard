import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@azure/msal-node'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Only allow truespot.com and its subdomains to embed this app in an iframe
            value: "frame-ancestors 'self' https://truespot.com https://*.truespot.com",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
