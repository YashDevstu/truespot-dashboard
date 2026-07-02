'use client'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import GpsOffIcon from '@mui/icons-material/GpsOff'
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap'
import Tooltip from '@mui/material/Tooltip'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  geofence: string
  subGeoZone: string
  dotColor: string
  lastSeenAt?: string
  vin?: string
  stockNumber?: string
  isLive?: boolean
  assetType?: 'Vehicle' | 'Key' | 'Mixed'
}

export interface RouteSegment {
  coords: Array<{ lat: number; lng: number }>
  color: string
}

export interface StopFocus {
  lat: number
  lng: number
  label: string
  geofence: string
  subGeoZone: string
  startMs?: number
  endMs?: number
  assetType?: 'Vehicle' | 'Key' | 'Mixed'
}

export interface MapStop {
  lat: number
  lng: number
  geofence: string
  subGeoZone: string
  color: string
  index: number       // matches stop index in Journey Timeline
  startMs?: number
  endMs?: number
  assetType?: 'Vehicle' | 'Key' | 'Mixed'
}

interface MapPanelProps {
  markers: MapMarker[]
  subscriptionKey: string
  routeLines?: RouteSegment[]
  stopFocus?: StopFocus | null
  stops?: MapStop[]
  onStopClick?: (index: number) => void
  loading?: boolean
}

const LIVE_GREEN = '#22c55e'

// Convert a 6-char hex color to rgba() string — needed for line-gradient expressions
function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// Build a tiny right-pointing-chevron image for the direction-arrow symbol layer
function buildArrowImage(size = 14): { width: number; height: number; data: Uint8ClampedArray } {
  const canvas  = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.beginPath()
  // Simple right-pointing triangle as a direction indicator
  ctx.moveTo(size * 0.15, size * 0.18)
  ctx.lineTo(size * 0.85, size * 0.5)
  ctx.lineTo(size * 0.15, size * 0.82)
  ctx.closePath()
  ctx.fill()
  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data }
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

// SVG icons for the asset-type badge on position markers
const CAR_SVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.29l1.04 3H5.81L6.85 6zM19 17H5v-6h14v6z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>`
const KEY_SVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`
const MIX_SVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`

function assetBadgeHtml(assetType: 'Vehicle' | 'Key' | 'Mixed' = 'Vehicle'): string {
  const isKey   = assetType === 'Key'
  const isMixed = assetType === 'Mixed'
  const bg    = isKey ? '#f59e0b' : isMixed ? '#a855f7' : '#3b82f6'
  const icon  = isKey ? KEY_SVG  : isMixed ? MIX_SVG  : CAR_SVG
  return `<div style="position:absolute;bottom:-3px;right:-3px;
    width:18px;height:18px;border-radius:50%;
    background:${bg};border:2px solid #fff;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 5px rgba(0,0,0,0.45);pointer-events:none">${icon}</div>`
}

// Live → green sonar ping  |  Last seen → orange solid dot
function makePositionMarker(isLive: boolean, assetType: 'Vehicle' | 'Key' | 'Mixed' = 'Vehicle'): HTMLElement {
  injectMapStyles()
  const color = isLive ? LIVE_GREEN : '#f59e0b'
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:44px;height:44px;cursor:pointer'

  if (isLive) {
    wrapper.innerHTML = `
      <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};
        animation:dashSonarRing 2.3s ease-out infinite;pointer-events:none"></div>
      <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};
        animation:dashSonarRing 2.3s ease-out .9s infinite;pointer-events:none"></div>
      <div style="position:absolute;inset:11px;border-radius:50%;background:${color};
        border:2.5px solid #fff;box-shadow:0 0 0 3px ${color}35,0 2px 10px rgba(0,0,0,.5)"></div>
      ${assetBadgeHtml(assetType)}
    `
  } else {
    wrapper.innerHTML = `
      <div style="position:absolute;inset:0;border-radius:50%;border:2px solid ${color};
        animation:dashSonarRing 3.5s ease-out infinite;pointer-events:none;opacity:.55"></div>
      <div style="position:absolute;inset:11px;border-radius:50%;background:${color};
        border:2.5px solid #fff;box-shadow:0 0 0 3px ${color}40,0 2px 10px rgba(0,0,0,.45)"></div>
      ${assetBadgeHtml(assetType)}
    `
  }
  return wrapper
}

// Small solid dot marking each journey stop — no transform (avoids Mapbox anchor shift)
// Key stops get an amber ring border; Vehicle stops get a white border.
function makeStopDot(color: string, assetType: 'Vehicle' | 'Key' | 'Mixed' = 'Vehicle'): HTMLElement {
  const isKey   = assetType === 'Key'
  const isMixed = assetType === 'Mixed'
  const borderColor = isKey ? '#f59e0b' : isMixed ? '#a855f7' : '#fff'
  const size        = isKey || isMixed ? '12px' : '10px'  // slightly larger for non-Vehicle
  const el = document.createElement('div')
  el.style.cssText = [
    `width:${size}`, `height:${size}`, 'border-radius:50%',
    `background:${color}`,
    `border:2px solid ${borderColor}`,
    'box-shadow:0 1px 5px rgba(0,0,0,0.55)',
    'cursor:pointer',
    'transition:box-shadow 0.15s ease',
  ].join(';')
  el.addEventListener('mouseenter', () => {
    el.style.boxShadow = `0 0 0 5px ${color}55, 0 2px 8px rgba(0,0,0,0.55)`
  })
  el.addEventListener('mouseleave', () => {
    el.style.boxShadow = '0 1px 5px rgba(0,0,0,0.55)'
  })
  return el
}

// Blue teardrop pin for the journey-selected stop
function makeStopPin(): HTMLElement {
  const PIN_COLOR = '#3b82f6'
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'cursor:pointer;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))'
  wrapper.innerHTML = `
    <svg viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 6.179 3.478 11.558 8.593 14.322L16 42l7.407-11.678C28.522 27.558 32 22.179 32 16 32 7.163 24.837 0 16 0z"
        fill="${PIN_COLOR}"/>
      <circle cx="16" cy="16" r="7" fill="white"/>
      <circle cx="16" cy="16" r="4" fill="${PIN_COLOR}"/>
    </svg>
  `
  return wrapper
}

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtMs(ms?: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const PIN_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="#f87171" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;margin-top:1px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
const CLK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`

// Clean pill badge for asset type — icon directly in pill, no nested circles.
// Used in both position-marker hover popup and selected-stop popup.
function makeAssetPill(asset: 'Vehicle' | 'Key' | 'Mixed'): string {
  const isKey   = asset === 'Key'
  const isMixed = asset === 'Mixed'

  const pillBg     = isKey ? 'rgba(245,158,11,.15)' : isMixed ? 'rgba(168,85,247,.15)' : 'rgba(59,130,246,.15)'
  const pillBorder = isKey ? 'rgba(245,158,11,.40)' : isMixed ? 'rgba(168,85,247,.40)' : 'rgba(59,130,246,.40)'
  const textColor  = isKey ? '#fbbf24'              : isMixed ? '#c084fc'               : '#60a5fa'
  const label      = isKey ? 'Key Tag'              : isMixed ? 'Mixed'                 : 'Vehicle'

  const icon = isKey
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="${textColor}" style="flex-shrink:0"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`
    : isMixed
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="${textColor}" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="${textColor}" style="flex-shrink:0"><path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.29l1.04 3H5.81L6.85 6zM19 17H5v-6h14v6z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>`

  return `<div style="display:inline-flex;align-items:center;gap:6px;background:${pillBg};border:1.5px solid ${pillBorder};border-radius:20px;padding:4px 11px 4px 8px">${icon}<span style="font-size:11.5px;font-weight:700;color:${textColor};letter-spacing:.15px;line-height:1">${label}</span></div>`
}

function popupHtml(m: MapMarker): string {
  const time    = fmtTime(m.lastSeenAt)
  const vinFull = m.vin && m.vin.trim() && m.vin.trim() !== 'undefined' ? m.vin.trim() : ''
  const stk     = m.stockNumber && m.stockNumber.trim() && m.stockNumber.trim() !== 'undefined' ? m.stockNumber.trim() : ''
  const sub     = m.subGeoZone && m.subGeoZone !== m.geofence ? m.subGeoZone : ''
  const live    = m.isLive !== false
  const asset   = m.assetType ?? 'Vehicle'

  const statusBadge = live
    ? `<div style="background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.32);
        border-radius:20px;padding:2px 9px;font-size:9px;font-weight:800;
        color:#4ade80;letter-spacing:1.3px;white-space:nowrap">LIVE</div>`
    : `<div style="background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.32);
        border-radius:20px;padding:2px 9px;font-size:9px;font-weight:800;
        color:#fbbf24;letter-spacing:1px;white-space:nowrap">LAST SEEN</div>`

  const dotStyle = live
    ? `background:${LIVE_GREEN};animation:popupDotPulse 1.8s ease-in-out infinite`
    : `background:#f59e0b`

  // Asset-type pill badge
  const assetRow = `<div style="margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08)">${makeAssetPill(asset)}</div>`

  // VIN + Stock row — lighter text colours for dark header background
  const metaSub = (vinFull || stk)
    ? `<div style="display:flex;gap:14px;margin-top:6px">
         ${vinFull ? `<span style="font-size:10px;color:rgba(255,255,255,.38);font-weight:500">VIN&nbsp;<span style="color:rgba(255,255,255,.72);font-weight:700;letter-spacing:.4px">${vinFull}</span></span>` : ''}
         ${stk     ? `<span style="font-size:10px;color:rgba(255,255,255,.38);font-weight:500">Stock&nbsp;<span style="color:rgba(255,255,255,.72);font-weight:700">${stk}</span></span>` : ''}
       </div>`
    : ''

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
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:14px 16px">
    <div style="display:flex;align-items:center;gap:9px">
      <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;${dotStyle}"></div>
      <span style="color:#f8fafc;font-weight:700;font-size:14px;letter-spacing:-.2px;flex:1;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.label}</span>
      ${statusBadge}
    </div>
    ${assetRow}
    ${metaSub}
  </div>
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

function stopFocusHtml(sf: StopFocus): string {
  const sub   = sf.subGeoZone && sf.subGeoZone !== sf.geofence ? sf.subGeoZone : ''
  const t0    = fmtMs(sf.startMs)
  const t1    = fmtMs(sf.endMs)
  const range = t0 && t1 ? `${t0} → ${t1}` : t0 || ''
  const asset = sf.assetType ?? 'Vehicle'

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;width:250px">
  <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:12px 15px">
    <div style="display:flex;align-items:center;gap:8px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="flex-shrink:0"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><circle cx="12" cy="11" r="3"/></svg>
      <span style="color:#f8fafc;font-weight:700;font-size:13px;flex:1;letter-spacing:-.1px">${sf.label}</span>
      <div style="background:rgba(148,163,184,.15);border:1px solid rgba(148,163,184,.3);
        border-radius:20px;padding:2px 8px;font-size:9px;font-weight:700;color:#94a3b8;letter-spacing:.8px">SELECTED</div>
    </div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)">${makeAssetPill(asset)}</div>
  </div>
  <div style="background:#fff;padding:12px 15px">
    <div style="display:flex;gap:7px;align-items:flex-start">
      ${PIN_SVG}
      <div>
        <div style="font-weight:700;font-size:12.5px;color:#1e293b;line-height:1.35">${sf.geofence || '—'}</div>
        ${sub ? `<div style="font-size:11px;color:#64748b;margin-top:2px">↳&nbsp;${sub}</div>` : ''}
      </div>
    </div>
    ${range ? `
    <div style="display:flex;align-items:center;gap:7px;margin-top:9px;padding-top:9px;border-top:1px solid #f1f5f9">
      ${CLK_SVG}
      <span style="font-size:11.5px;font-weight:600;color:#0f172a">${range}</span>
    </div>` : ''}
  </div>
</div>`
}

export default function MapPanel({ markers, subscriptionKey, routeLines, stopFocus, stops, onStopClick, loading }: MapPanelProps) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const mapRef         = useRef<mapboxgl.Map | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapboxglRef    = useRef<any>(null)
  const focusPopupRef  = useRef<mapboxgl.Popup   | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stopMarkerRef  = useRef<any>(null)
  // Stable ref to a function that fits the map to the full route + markers
  const fitFnRef       = useRef<(() => void) | null>(null)
  // Keep onStopClick in a ref so the map effect closure never goes stale
  const onStopClickRef = useRef(onStopClick)
  useEffect(() => { onStopClickRef.current = onStopClick }, [onStopClick])

  const [collapsed, setCollapsed] = useState(false)

  // Stable cheap change-keys — avoid JSON.stringify on large coord arrays
  const routeLinesKey = routeLines?.map(l => `${l.color}:${l.coords.length}`).join(',') ?? ''
  const stopsKey      = stops?.map(s => `${s.index}:${s.lat.toFixed(5)}:${s.lng.toFixed(5)}`).join(',') ?? ''

  // ── Main effect: initialize map, markers, and route lines ─────────────────
  useEffect(() => {
    if (!containerRef.current || !subscriptionKey) return
    let destroyed = false

    import('mapbox-gl').then((mod) => {
      if (destroyed || !containerRef.current) return
      const mapboxgl = mod.default
      mapboxglRef.current = mapboxgl

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

        // ── Route trail polylines (professional gradient + direction arrows) ──
        // Register the direction-arrow icon once per map instance
        if (!map.hasImage('route-arrow')) {
          map.addImage('route-arrow', buildArrowImage(14))
        }

        routeLines?.forEach((line, li) => {
          if (line.coords.length < 2) return
          const coordinates = line.coords.map(c => [c.lng, c.lat])

          // lineMetrics: true is required for line-gradient to work
          map.addSource(`route-${li}`, {
            type: 'geojson',
            lineMetrics: true,
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates },
            },
          })

          // Layer 1 — dark outer case for contrast on bright/dark satellite tiles
          map.addLayer({
            id: `route-case-${li}`, type: 'line', source: `route-${li}`,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#000000', 'line-width': 7, 'line-opacity': 0.22 },
          })

          // Layer 2 — gradient trail: fades from near-transparent (trip start)
          // to full color (most recent position), so direction is obvious at a glance
          map.addLayer({
            id: `route-line-${li}`, type: 'line', source: `route-${li}`,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-width': 3.5,
              'line-gradient': [
                'interpolate', ['linear'], ['line-progress'],
                0,    hexAlpha(line.color, 0.10),
                0.25, hexAlpha(line.color, 0.38),
                0.6,  hexAlpha(line.color, 0.72),
                1,    line.color,
              ],
            },
          })

          // Layer 3 — white directional chevrons every ~90px, rotated with the line
          map.addLayer({
            id: `route-arrows-${li}`,
            type: 'symbol',
            source: `route-${li}`,
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 90,
              'icon-image': 'route-arrow',
              'icon-size': 0.85,
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
            paint: { 'icon-opacity': 0.72 },
          })

          // Make the route line clickable — clicking finds the nearest stop by distance
          // and selects it in the Journey Timeline (same effect as clicking the timeline bar)
          map.on('mouseenter', `route-line-${li}`, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', `route-line-${li}`, () => { map.getCanvas().style.cursor = '' })
          map.on('click', `route-line-${li}`, (e) => {
            if (!stops || stops.length === 0) return
            const clickLat = e.lngLat.lat
            const clickLng = e.lngLat.lng
            let bestIdx = stops[0].index
            let bestDist = Infinity
            stops.forEach((stop) => {
              const d = Math.hypot(stop.lat - clickLat, stop.lng - clickLng)
              if (d < bestDist) { bestDist = d; bestIdx = stop.index }
            })
            onStopClickRef.current?.(bestIdx)
          })

          // Trip-start dot — small hollow circle at the oldest GPS position
          const [startLng, startLat] = coordinates[0]
          const startEl = document.createElement('div')
          startEl.style.cssText = [
            'width:9px', 'height:9px', 'border-radius:50%',
            `background:white`, `border:2.5px solid ${line.color}`,
            'box-shadow:0 1px 5px rgba(0,0,0,0.55)',
            'pointer-events:none',
          ].join(';')
          new mapboxgl.Marker({ element: startEl, anchor: 'center' })
            .setLngLat([startLng as number, startLat as number])
            .addTo(map)
        })

        // ── Live markers ───────────────────────────────────────────────────
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

          const cardEl = popup.getElement()
          if (cardEl) {
            cardEl.addEventListener('mouseenter', clearHide)
            cardEl.addEventListener('mouseleave', scheduleHide)
          }
        }

        // ── Stop dots: small clickable circles at each journey stop ──────────
        // Rendered before position markers so live/amber dots sit on top.
        // No CSS transforms — avoids the Mapbox anchor-shift bug.
        stops?.forEach((stop) => {
          const el = makeStopDot(stop.color, stop.assetType)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            onStopClickRef.current?.(stop.index)
          })
          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([stop.lng, stop.lat])
            .addTo(map)
        })

        markers.forEach((m) => {
          const el = makePositionMarker(m.isLive ?? true, m.assetType)
          new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([m.lng, m.lat])
            .addTo(map)
          el.addEventListener('mouseenter', () => openPopup(m))
          el.addEventListener('mouseleave', scheduleHide)
        })

        // Build a fit function that encompasses all route coords + markers
        const buildBounds = () => {
          const bounds = new mapboxgl.LngLatBounds()
          let hasPoints = false
          routeLines?.forEach((line) => {
            line.coords.forEach((c) => { bounds.extend([c.lng, c.lat]); hasPoints = true })
          })
          markers.forEach((m) => { bounds.extend([m.lng, m.lat]); hasPoints = true })
          return hasPoints ? bounds : null
        }

        const fitToJourney = () => {
          const bounds = buildBounds()
          if (!bounds) return
          map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 700 })
        }
        fitFnRef.current = fitToJourney

        // Initial view: fit the entire journey (route trail + current positions)
        fitToJourney()
      })
    })

    return () => {
      destroyed = true
      fitFnRef.current = null
      focusPopupRef.current?.remove()
      focusPopupRef.current = null
      stopMarkerRef.current?.remove()
      stopMarkerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey, JSON.stringify(markers), routeLinesKey, stopsKey])

  // ── Focus effect: fly to selected stop + place a hoverable teardrop pin ──
  useEffect(() => {
    // Always clear previous pin + popup (handles deselect when stopFocus=null)
    focusPopupRef.current?.remove()
    focusPopupRef.current = null
    stopMarkerRef.current?.remove()
    stopMarkerRef.current = null

    if (!stopFocus || !mapRef.current || !mapboxglRef.current) return
    const map      = mapRef.current
    const mapboxgl = mapboxglRef.current

    map.flyTo({ center: [stopFocus.lng, stopFocus.lat], zoom: 17, duration: 500, essential: true })

    // Teardrop pin — anchor 'bottom' so the tip points to the exact coord
    const pinEl = makeStopPin()
    stopMarkerRef.current = new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([stopFocus.lng, stopFocus.lat])
      .addTo(map)

    // Hover-intent: popup appears on mouseenter, hides 180ms after mouseleave
    let stopHideTimer: ReturnType<typeof setTimeout> | null = null
    const clearStopHide = () => { if (stopHideTimer) { clearTimeout(stopHideTimer); stopHideTimer = null } }
    const scheduleStopHide = () => {
      clearStopHide()
      stopHideTimer = setTimeout(() => {
        focusPopupRef.current?.remove()
        focusPopupRef.current = null
      }, 180)
    }
    const showStopPopup = () => {
      clearStopHide()
      if (focusPopupRef.current) return // already visible
      const popup = new mapboxgl.Popup({
        closeButton: false, anchor: 'bottom', offset: [0, -46], maxWidth: '280px',
      })
        .setLngLat([stopFocus.lng, stopFocus.lat])
        .setHTML(stopFocusHtml(stopFocus))
        .addTo(map)
      focusPopupRef.current = popup

      const cardEl = popup.getElement()
      if (cardEl) {
        cardEl.addEventListener('mouseenter', clearStopHide)
        cardEl.addEventListener('mouseleave', scheduleStopHide)
      }
    }

    pinEl.addEventListener('mouseenter', showStopPopup)
    pinEl.addEventListener('mouseleave', scheduleStopHide)
  }, [stopFocus])

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

        {hasMarkers && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 1 }}>
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

        {/* Fit-to-journey button — resets map view to show the entire route */}
        {hasMarkers && !collapsed && (
          <Tooltip title="Fit entire journey in view" placement="top">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); fitFnRef.current?.() }}
              sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <ZoomOutMapIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        <Typography variant="caption" color="text.disabled">Satellite</Typography>
        <IconButton size="small" tabIndex={-1} sx={{ ml: 0.5 }}>
          {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* ── Map / placeholder ─────────────────────────────────────────────── */}
      <Collapse in={!collapsed}>
        {!hasMarkers ? (
          loading ? (
            <Skeleton variant="rectangular" height={420} sx={{ borderRadius: '0 0 8px 8px' }} />
          ) : (
          <Box sx={{
            height: 200, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 1, color: 'text.disabled', bgcolor: 'grey.50',
            borderRadius: '0 0 8px 8px',
          }}>
            <GpsOffIcon sx={{ fontSize: 36 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>No GPS data available</Typography>
            <Typography variant="caption" align="center" sx={{ maxWidth: 340 }}>
              No location data found for this vehicle on the selected date.
              Try selecting a different date range.
            </Typography>
          </Box>
          )
        ) : (
          <Box sx={{ position: 'relative', height: 420, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
            <Box ref={containerRef} sx={{ height: '100%', width: '100%' }} />

            {/* Map legend overlay — bottom-right corner */}
            <Box sx={{
              position: 'absolute', bottom: 28, right: 8, zIndex: 1,
              background: 'rgba(15,23,42,0.82)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '10px',
              px: 1.5, py: 1,
              display: 'flex', flexDirection: 'column', gap: 0.75,
              pointerEvents: 'none',
            }}>
              <Typography sx={{ fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, lineHeight: 1, mb: 0.25 }}>
                LEGEND
              </Typography>

              {/* Status rows */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e', flexShrink: 0,
                  '@keyframes lgPulse': { '0%,100%': { boxShadow: '0 0 0 0 #22c55e80' }, '50%': { boxShadow: '0 0 0 4px transparent' } },
                  animation: 'lgPulse 1.8s ease-in-out infinite',
                }} />
                <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>Live position</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>Last known</Typography>
              </Box>

              {/* Divider */}
              <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.10)', my: 0.25 }} />

              {/* Asset type rows */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M18.92 5.01C18.72 4.42 18.16 4 17.5 4h-11c-.66 0-1.21.42-1.42 1.01L3 11v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 6h10.29l1.04 3H5.81L6.85 6zM19 17H5v-6h14v6z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>
                </Box>
                <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>Vehicle</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                </Box>
                <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>Key tag</Typography>
              </Box>
              {markers.some((m) => m.assetType === 'Mixed') && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  </Box>
                  <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1 }}>Mixed</Typography>
                </Box>
              )}

              {/* Stop dot hint */}
              <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.10)', mt: 0.25, pt: 0.5 }}>
                <Typography sx={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>
                  Tap dots on route to<br/>select a journey stop
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Collapse>
    </Paper>
  )
}
