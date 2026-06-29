'use client'
import { useEffect, useRef, useState } from 'react'
import * as atlas from 'azure-maps-control'
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

function markerHtml(color: string): string {
  return `<div style="
    width:18px;height:18px;border-radius:50%;
    background:${color};border:3px solid #fff;
    box-shadow:0 2px 12px rgba(0,0,0,0.5);
    cursor:pointer;
  "></div>`
}

function popupHtml(m: MapMarker): string {
  const sub = m.subGeoZone && m.subGeoZone !== m.geofence
    ? `<div style="color:#888;font-size:11px;margin-top:2px">${m.subGeoZone}</div>`
    : ''
  return `
    <div style="font-family:system-ui,sans-serif;padding:10px 14px;min-width:160px">
      <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:6px">${m.label}</div>
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:9px;height:9px;border-radius:50%;background:${m.dotColor};flex-shrink:0"></div>
        <span style="font-size:12px;color:#333;font-weight:600">${m.geofence}</span>
      </div>
      ${sub}
    </div>`
}

export default function MapPanel({ markers, subscriptionKey }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<atlas.Map | null>(null)
  const markerRefs   = useRef<atlas.HtmlMarker[]>([])
  const popupRef     = useRef<atlas.Popup | null>(null)
  const [ready, setReady]       = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || !subscriptionKey) return
    const map = new atlas.Map(containerRef.current, {
      authOptions: { authType: atlas.AuthenticationType.subscriptionKey, subscriptionKey },
      style: 'satellite_road_labels',
      zoom: 14,
      language: 'en-US',
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.events.addOnce('ready', () => setReady(true))
    return () => { map.dispose(); mapRef.current = null; setReady(false) }
  }, [subscriptionKey])

  // Re-place markers whenever data or readiness changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || markers.length === 0) return

    // Remove stale markers and shared popup
    markerRefs.current.forEach((m) => map.markers.remove(m))
    markerRefs.current = []
    popupRef.current?.close()
    if (!popupRef.current) {
      popupRef.current = new atlas.Popup({ closeButton: true, pixelOffset: [0, -12] })
    }
    const popup = popupRef.current

    markers.forEach((m) => {
      const marker = new atlas.HtmlMarker({
        position: [m.lng, m.lat],
        htmlContent: markerHtml(m.dotColor),
        anchor: 'center',
      })
      map.events.add('click', marker, () => {
        popup.setOptions({ position: [m.lng, m.lat], content: popupHtml(m) })
        popup.open(map)
      })
      map.markers.add(marker)
      markerRefs.current.push(marker)
    })

    const positions = markers.map((m) => new atlas.data.Position(m.lng, m.lat))
    if (positions.length === 1) {
      map.setCamera({ center: positions[0], zoom: 17, type: 'ease', duration: 600 })
    } else {
      map.setCamera({
        bounds: atlas.data.BoundingBox.fromPositions(positions),
        padding: 80,
        type: 'ease',
        duration: 600,
      })
    }
  }, [markers, ready])

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        onClick={() => setCollapsed((v) => !v)}
        sx={{
          px: 2.5,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: collapsed ? 'none' : '1px solid',
          borderColor: 'divider',
          cursor: 'pointer',
          userSelect: 'none',
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

        {/* Coloured vehicle legend dots */}
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
          <Box
            sx={{
              height: 180,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              color: 'text.disabled',
              bgcolor: 'grey.50',
            }}
          >
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
