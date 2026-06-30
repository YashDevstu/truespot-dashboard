'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import GpsOffIcon from '@mui/icons-material/GpsOff'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  geofence: string
  subGeoZone: string
  dotColor: string
  lastSeenAt?: string   // ISO timestamp of the most recent position row
  vin?: string
  stockNumber?: string
  isLive?: boolean      // true only when lastSeenAt is from today
}

interface MapPanelProps {
  markers: MapMarker[]
  subscriptionKey: string
}

const LIVE_GREEN = '#22c55e'

function injectMapStyles() {
  if (document.getElementById('mbDashMapStyles')) return
  const s = document.createElement('style')
  s.id = 'mbDashMapStyles'
  s.textContent = `
    @keyframes dashSonarRing {
      0%   { transform:scale(.35); opacity:.9 }
      100% { transform:scale(2.9); opacity:0  }
    }
    @keyframes popupDotPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.55) }
      50%     { box-shadow: 0 0 0 6px rgba(34,197,94,0)  }
    }
    .mapboxgl-popup-content {
      padding: 0 !important;
      border-radius: 14px !important;
      box-shadow: 0 24px 64px rgba(0,0,0,.26), 0 6px 20px rgba(0,0,0,.16) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      overflow: hidden;
      backdrop-filter: blur(2px);
    }
    .mapboxgl-popup-tip { display:none !important; }
    .mapboxgl-popup    { z-index: 10 !important; }
    .mbpopup-row { display:flex; align-items:center; gap:8px }
    .mapboxgl-ctrl-group {
      border-radius: 8px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,.3) !important;
      overflow: hidden; border: none !important;
    }
    .mapboxgl-ctrl-group button {
      width: 32px !important; height: 32px !important;
      background: rgba(20,20,20,.85) !important;
      backdrop-filter: blur(6px);
      border: none !important;
      border-bottom: 1px solid rgba(255,255,255,.08) !important;
    }
    .mapboxgl-ctrl-group button:last-child { border-bottom: none !important; }
    .mapboxgl-ctrl-group button:hover { background: rgba(50,50,50,.92) !important; }
    .mapboxgl-ctrl-icon { filter: invert(1) !important; }
  `
  document.head.appendChild(s)
}

// Always green sonar-ping live marker
function makeLiveMarker(): HTMLElement {
  injectMapStyles()
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:44px;height:44px;cursor:pointer'
  wrapper.innerHTML = `
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${LIVE_GREEN};
      animation:dashSonarRing 2.3s ease-out infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${LIVE_GREEN};
      animation:dashSonarRing 2.3s ease-out .9s infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:11px;border-radius:50%;background:${LIVE_GREEN};
      border:2.5px solid #fff;box-shadow:0 0 0 3px ${LIVE_GREEN}35,0 2px 10px rgba(0,0,0,.5)"></div>
  `
  return wrapper
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Inline SVG icons — no emoji, consistent cross-platform rendering
const PIN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#f87171" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;margin-top:1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
const CLK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`

function popupHtml(m: MapMarker): string {
  const time    = fmtTime(m.lastSeenAt)
  const vinFull = m.vin && m.vin.trim() && m.vin.trim() !== 'undefined' ? m.vin.trim() : ''
  const stk     = m.stockNumber && m.stockNumber.trim() && m.stockNumber.trim() !== 'undefined' ? m.stockNumber.trim() : ''
  const sub     = m.subGeoZone && m.subGeoZone !== m.geofence ? m.subGeoZone : ''
  const live    = m.isLive !== false   // default true for backwards compat

  // Status badge — green LIVE when today, amber LAST SEEN for historical
  const statusBadge = live
    ? `<div style="background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.32);
        border-radius:20px;padding:2px 9px;font-size:9px;font-weight:800;
        color:#4ade80;letter-spacing:1.3px;white-space:nowrap">LIVE</div>`
    : `<div style="background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.32);
        border-radius:20px;padding:2px 9px;font-size:9px;font-weight:800;
        color:#fbbf24;letter-spacing:1px;white-space:nowrap">LAST SEEN</div>`

  // Header dot — pulsing green when live, static amber when historical
  const dotStyle = live
    ? `background:${LIVE_GREEN};animation:popupDotPulse 1.8s ease-in-out infinite`
    : `background:#f59e0b`

  // Header meta (VIN / Stock)
  const metaSub = (vinFull || stk)
    ? `<div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)">
         ${vinFull ? `<span style="font-size:10px;color:#64748b;font-weight:500">VIN&nbsp;<span style="color:#94a3b8;font-weight:700;letter-spacing:.4px">${vinFull}</span></span>` : ''}
         ${stk     ? `<span style="font-size:10px;color:#64748b;font-weight:500">Stock&nbsp;<span style="color:#94a3b8;font-weight:700">${stk}</span></span>` : ''}
       </div>`
    : ''

  // Time row label changes with live state
  const timeLabel = live ? 'Last seen' : 'Last recorded'
  const timeRow = time
    ? `<div style="display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #f1f5f9">
         ${CLK_SVG}
         <span style="font-size:11.5px;color:#64748b">${timeLabel}</span>
         <span style="font-size:11.5px;font-weight:700;color:#0f172a;margin-left:auto">${time}</span>
       </div>`
    : ''

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;width:270px">

  <!-- ── Dark header ─────────────────────────────────────────── -->
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:14px 16px">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;${dotStyle}"></div>
      <span style="color:#f8fafc;font-weight:700;font-size:14px;letter-spacing:-.2px;flex:1;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.label}</span>
      ${statusBadge}
    </div>
    ${metaSub}
  </div>

  <!-- ── White body ──────────────────────────────────────────── -->
  <div style="background:#fff;padding:14px 16px">
    <div style="display:flex;gap:8px;align-items:flex-start">
      ${PIN_SVG}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12.5px;color:#1e293b;line-height:1.35">${m.geofence || '—'}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:2px;line-height:1.35">↳&nbsp;${sub}</div>` : ''}
      </div>
    </div>
    ${timeRow}
  </div>

</div>`
}

export default function MapPanel({ markers, subscriptionKey }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !subscriptionKey) return
    let destroyed = false

    import('mapbox-gl').then((mod) => {
      if (destroyed || !containerRef.current) return
      const mapboxgl = mod.default

      const avgLat = markers.length ? markers.reduce((s, m) => s + m.lat, 0) / markers.length : 39.5
      const avgLng = markers.length ? markers.reduce((s, m) => s + m.lng, 0) / markers.length : -98.3

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        accessToken: subscriptionKey,
        center: [avgLng, avgLat],
        zoom: 14,
        attributionControl: false,
      })
      mapRef.current = map

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

      map.on('load', () => {
        if (destroyed) return

        // Shared popup + hover-intent timer — prevents flicker when mouse
        // moves from marker to popup card (they are separate DOM elements).
        let activePopup: mapboxgl.Popup | null = null
        let hideTimer: ReturnType<typeof setTimeout> | null = null

        const clearHide = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null } }
        const scheduleHide = () => {
          clearHide()
          hideTimer = setTimeout(() => { activePopup?.remove(); activePopup = null }, 180)
        }

        const openPopup = (m: MapMarker) => {
          clearHide()
          activePopup?.remove()
          const popup = new mapboxgl.Popup({
            closeButton: false, anchor: 'top', offset: [0, 26], maxWidth: '300px',
          }).setLngLat([m.lng, m.lat]).setHTML(popupHtml(m)).addTo(map)
          activePopup = popup

          // Keep popup alive while the mouse is over the card itself
          const cardEl = popup.getElement()
          if (cardEl) {
            cardEl.addEventListener('mouseenter', clearHide)
            cardEl.addEventListener('mouseleave', scheduleHide)
          }
        }

        markers.forEach((m) => {
          const el = makeLiveMarker()
          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([m.lng, m.lat])
            .addTo(map)

          el.addEventListener('mouseenter', () => openPopup(m))
          el.addEventListener('mouseleave', scheduleHide)
        })

        if (markers.length === 1) {
          map.flyTo({ center: [markers[0].lng, markers[0].lat], zoom: 17, duration: 600 })
        } else if (markers.length > 1) {
          const bounds = new mapboxgl.LngLatBounds()
          markers.forEach((m) => bounds.extend([m.lng, m.lat]))
          map.fitBounds(bounds, { padding: 80, maxZoom: 17, duration: 600 })
        }
      })
    })

    return () => {
      destroyed = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey, JSON.stringify(markers)])

  const hasMarkers = markers.length > 0
  const anyLive    = hasMarkers && markers.some((m) => m.isLive !== false)

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper', position: 'relative' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Box
        onClick={() => setCollapsed((v) => !v)}
        sx={{
          px: 2.5, py: 1.25,
          display: 'flex', alignItems: 'center', gap: 1,
          borderBottom: collapsed ? 'none' : '1px solid',
          borderColor: 'divider',
          cursor: 'pointer', userSelect: 'none', borderRadius: '8px 8px 0 0',
          '&:hover': { bgcolor: 'grey.50' },
        }}
      >
        <MyLocationIcon sx={{ fontSize: 16, color: '#22c55e' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', textTransform: 'uppercase', lineHeight: 1 }}
        >
          Last Known Positions
        </Typography>
        <Box sx={{ flex: 1 }} />

        {/* Status badge + vehicle legend */}
        {hasMarkers && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 1 }}>
            {/* LIVE (green) or LAST KNOWN (amber) */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.25, py: 0.4,
              bgcolor: anyLive ? '#f0fdf4' : '#fffbeb',
              border: '1px solid',
              borderColor: anyLive ? '#bbf7d0' : '#fde68a',
              borderRadius: 1.5,
            }}>
              <Box sx={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                bgcolor: anyLive ? '#22c55e' : '#f59e0b',
                ...(anyLive ? {
                  '@keyframes livePulse': {
                    '0%,100%': { boxShadow: '0 0 0 0 #22c55e80' },
                    '50%':     { boxShadow: '0 0 0 4px transparent' },
                  },
                  animation: 'livePulse 1.8s ease-in-out infinite',
                } : {}),
              }} />
              <Typography sx={{
                fontSize: 10, fontWeight: 700, letterSpacing: '.7px', lineHeight: 1,
                color: anyLive ? '#16a34a' : '#d97706',
              }}>
                {anyLive ? 'LIVE' : 'LAST KNOWN'}
              </Typography>
            </Box>

            {/* One dot + short label per vehicle */}
            {markers.map((m, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.dotColor, boxShadow: `0 0 0 2px ${m.dotColor}30` }} />
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                  {m.label.split(' ').slice(-1)[0]}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        <Typography variant="caption" color="text.disabled">satellite</Typography>
        <IconButton size="small" tabIndex={-1} sx={{ ml: 0.5 }}>
          {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* ── Map / placeholder ─────────────────────────────────────────────── */}
      <Collapse in={!collapsed}>
        {!hasMarkers ? (
          <Box sx={{
            height: 200, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 1, color: 'text.disabled', bgcolor: 'grey.50',
            borderRadius: '0 0 8px 8px',
          }}>
            <GpsOffIcon sx={{ fontSize: 36 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>No location coordinates in data</Typography>
            <Typography variant="caption" align="center" sx={{ maxWidth: 340 }}>
              Latitude / Longitude columns were not found for this vehicle.
              Restart the dev server to clear the query cache, then reload.
            </Typography>
          </Box>
        ) : (
          <Box ref={containerRef} sx={{ height: 420, width: '100%', borderRadius: '0 0 8px 8px', overflow: 'hidden' }} />
        )}
      </Collapse>
    </Paper>
  )
}
