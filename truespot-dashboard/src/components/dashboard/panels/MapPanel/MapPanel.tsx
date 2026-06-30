'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlaceIcon from '@mui/icons-material/Place'
import GpsOffIcon from '@mui/icons-material/GpsOff'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  geofence: string
  subGeoZone: string
  dotColor: string
}

interface MapPanelProps {
  markers: MapMarker[]
  subscriptionKey: string
}

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
    .mapboxgl-popup { z-index: 10 !important; }
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

function makeMarkerEl(color: string): HTMLElement {
  injectMapStyles()
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:44px;height:44px;cursor:pointer'
  wrapper.innerHTML = `
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};
      animation:dashSonarRing 2.3s ease-out infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};
      animation:dashSonarRing 2.3s ease-out .9s infinite;pointer-events:none"></div>
    <div style="position:absolute;inset:11px;border-radius:50%;background:${color};
      border:2.5px solid #fff;box-shadow:0 0 0 3px ${color}35,0 2px 10px rgba(0,0,0,.5)"></div>
  `
  return wrapper
}

function popupHtml(m: MapMarker): string {
  const sub = m.subGeoZone && m.subGeoZone !== m.geofence
    ? `<div style="font-size:11px;color:#999;padding-left:19px;margin-top:2px">${m.subGeoZone}</div>`
    : ''
  return `
    <div style="padding:14px 16px;font-family:system-ui,-apple-system,sans-serif;min-width:200px;line-height:1.7">
      <div style="font-weight:700;font-size:13.5px;color:#111;margin-bottom:8px;letter-spacing:-.1px">${m.label}</div>
      <div style="display:flex;align-items:center;gap:7px">
        <div style="width:10px;height:10px;border-radius:50%;background:${m.dotColor};
          box-shadow:0 0 0 2px ${m.dotColor}30;flex-shrink:0"></div>
        <span style="font-size:12px;color:#444;font-weight:600">${m.geofence}</span>
      </div>
      ${sub}
    </div>`
}

export default function MapPanel({ markers, subscriptionKey }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const popupRef     = useRef<mapboxgl.Popup | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Initialise map once
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

        const popup = new mapboxgl.Popup({
          closeButton: true, anchor: 'top', offset: [0, 26], maxWidth: '280px',
        })
        popupRef.current = popup

        markers.forEach((m) => {
          const el = makeMarkerEl(m.dotColor)
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([m.lng, m.lat])
            .addTo(map)

          el.addEventListener('click', () => {
            popup.setLngLat([m.lng, m.lat]).setHTML(popupHtml(m)).addTo(map)
          })

          // Keep reference for cleanup
          ;(marker as unknown as { _el: HTMLElement })._el
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
      popupRef.current?.remove()
      popupRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  // Re-initialise when key or markers change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey, JSON.stringify(markers)])

  return (
    // No overflow:hidden — lets popups float above panel without being clipped
    <Paper variant="outlined" sx={{ borderRadius: 2, bgcolor: 'background.paper', position: 'relative' }}>
      {/* Header */}
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
        <PlaceIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', textTransform: 'uppercase', lineHeight: 1 }}
        >
          Last Known Positions
        </Typography>
        <Box sx={{ flex: 1 }} />

        {/* Vehicle legend dots */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 1 }}>
          {markers.map((m, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.dotColor }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                {m.label.split(' ').slice(-1)[0]}
              </Typography>
            </Box>
          ))}
        </Box>

        <Typography variant="caption" color="text.disabled">satellite</Typography>
        <IconButton size="small" tabIndex={-1} sx={{ ml: 0.5 }}>
          {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Map or no-data placeholder */}
      <Collapse in={!collapsed}>
        {markers.length === 0 ? (
          <Box sx={{
            height: 180, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 1, color: 'text.disabled', bgcolor: 'grey.50',
          }}>
            <GpsOffIcon sx={{ fontSize: 32 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>No location coordinates in data</Typography>
            <Typography variant="caption" align="center" sx={{ maxWidth: 340 }}>
              Latitude / Longitude columns were not found for this vehicle.
              Restart the dev server to clear the query cache, then reload.
            </Typography>
          </Box>
        ) : (
          <Box ref={containerRef} sx={{ height: 360, width: '100%' }} />
        )}
      </Collapse>
    </Paper>
  )
}
