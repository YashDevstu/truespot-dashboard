import Image from 'next/image'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: '24px',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '48px' }}>
        <Image
          src="/images/logo.jpg"
          alt="TrueSpot"
          width={140}
          height={40}
          style={{ objectFit: 'contain' }}
          priority
        />
      </div>

      {/* 404 number */}
      <div
        style={{
          fontSize: '120px',
          fontWeight: 800,
          lineHeight: 1,
          color: '#e2e8f0',
          letterSpacing: '-4px',
          marginBottom: '24px',
          userSelect: 'none',
        }}
      >
        404
      </div>

      {/* Divider line */}
      <div
        style={{
          width: '48px',
          height: '3px',
          backgroundColor: '#2563eb',
          borderRadius: '2px',
          marginBottom: '24px',
        }}
      />

      {/* Heading */}
      <h1
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: '#0f172a',
          margin: '0 0 10px',
          textAlign: 'center',
        }}
      >
        Page not found
      </h1>

      {/* Subtext */}
      <p
        style={{
          fontSize: '14px',
          color: '#64748b',
          margin: '0 0 40px',
          textAlign: 'center',
          maxWidth: '340px',
          lineHeight: 1.6,
        }}
      >
        This page isn&apos;t available. Please access your dashboard through
        the link provided by your TrueSpot account manager.
      </p>

      {/* Support contact */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#475569',
        }}
      >
        <span>Need help?</span>
        <a
          href="mailto:support@truespot.com"
          style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
        >
          Contact support
        </a>
      </div>
    </div>
  )
}
