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
    .mapboxgl-popup-content {
      padding: 0 !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 30px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.12) !important;
      border: 1px solid rgba(0,0,0,.07) !important;
      overflow: hidden;
    }
    .mapboxgl-popup-tip { display:none !important; }
    .mapboxgl-popup    { z-index: 10 !important; }
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

function fmtCoord(v: number): string {
  return v.toFixed(5)
}

function popupHtml(m: MapMarker): string {
  const sub = m.subGeoZone && m.subGeoZone !== m.geofence
    ? `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#888;padding-left:18px;margin-top:1px">
         <span>↳</span><span>${m.subGeoZone}</span>
       </div>`
    : ''
  const time  = fmtTime(m.lastSeenAt)
  const vinStr = m.vin ? m.vin.slice(-6) : ''
  const stkStr = m.stockNumber || ''

  const metaRow = (time || vinStr || stkStr)
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:8px;
         border-top:1px solid #f0f0f0;font-size:10.5px;color:#aaa">
         ${time    ? `<span>🕐 <b style="color:#555">${time}</b></span>` : ''}
         ${vinStr  ? `<span>VIN ···<b style="color:#555">${vinStr}</b></span>` : ''}
         ${stkStr  ? `<span>Stock <b style="color:#555">${stkStr}</b></span>` : ''}
       </div>`
    : ''

  const coordRow = `<div style="margin-top:4px;font-size:10px;color:#ccc;letter-spacing:.2px">
    ${fmtCoord(m.lat)}, ${fmtCoord(m.lng)}
  </div>`

  return `
    <div style="padding:13px 15px;font-family:system-ui,-apple-system,sans-serif;min-width:220px;line-height:1.6">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${LIVE_GREEN};
          box-shadow:0 0 0 3px ${LIVE_GREEN}28;flex-shrink:0"></div>
        <span style="font-weight:700;font-size:13px;color:#111;letter-spacing:-.1px;flex:1">${m.label}</span>
        <span style="font-size:9px;font-weight:700;color:#16a34a;letter-spacing:.8px;
          background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;padding:2px 6px">LIVE</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:5px;font-size:12px;color:#333">
        <span style="margin-top:1px;font-size:13px">📍</span>
        <div>
          <div style="font-weight:600">${m.geofence}</div>
          ${sub}
        </div>
      </div>
      ${metaRow}
      ${coordRow}
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

        {/* LIVE badge + vehicle legend */}
        {hasMarkers && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 1 }}>
            {/* Pulsing LIVE badge */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.25, py: 0.4,
              bgcolor: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 1.5,
            }}>
              <Box sx={{
                width: 7, height: 7, borderRadius: '50%', bgcolor: '#22c55e', flexShrink: 0,
                '@keyframes livePulse': {
                  '0%,100%': { boxShadow: '0 0 0 0 #22c55e80' },
                  '50%':     { boxShadow: '0 0 0 4px transparent' },
                },
                animation: 'livePulse 1.8s ease-in-out infinite',
              }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '.7px', color: '#16a34a', lineHeight: 1 }}>
                LIVE
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
