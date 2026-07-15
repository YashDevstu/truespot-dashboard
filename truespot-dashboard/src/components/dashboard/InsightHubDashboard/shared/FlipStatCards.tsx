'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const TEAL = '#0d9488'

export interface StatFace {
  metric: string
  suffix: string
  why:    React.ReactNode
}

export interface StatCardConfig {
  label:       string
  faces:       StatFace[]
  description: React.ReactNode
}

interface FlipStatCardsProps {
  card1: StatCardConfig
  card2: StatCardConfig
  card3: StatCardConfig | null
}

export default function FlipStatCards({ card1, card2, card3 }: FlipStatCardsProps) {
  const [faceIdx, setFaceIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const [openWhy, setOpenWhy] = useState<number | null>(null)
  const inTransition = useRef(false)
  const faceIdxRef   = useRef(0)
  faceIdxRef.current = faceIdx

  const NUM_FACES = 3

  const goTo = useCallback((next: number) => {
    if (inTransition.current) return
    inTransition.current = true
    setVisible(false)
    setTimeout(() => {
      setFaceIdx(next)
      setVisible(true)
      setTimeout(() => { inTransition.current = false }, 250)
    }, 180)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      goTo((faceIdxRef.current + 1) % NUM_FACES)
    }, 4000)
    return () => clearInterval(id)
  }, [goTo])

  const cards = [card1, card2, ...(card3 ? [card3] : [])]

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {cards.map((card, ci) => {
        const dark   = ci === 2 && !!card3
        const face   = card.faces[Math.min(faceIdx, card.faces.length - 1)]
        const isOpen = openWhy === ci

        return (
          <Box
            key={ci}
            sx={{
              flex:          '1 1 200px',
              bgcolor:       dark ? '#0f1923' : 'background.paper',
              borderRadius:  3,
              p:             { xs: 2.5, sm: 3 },
              boxShadow:     dark
                ? '0 4px 20px rgba(0,0,0,0.28)'
                : '0 1px 3px rgba(0,0,0,0.06)',
              border:        dark
                ? '1px solid rgba(255,255,255,0.06)'
                : '1px solid #e8eef4',
              display:       'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header: label + pill dots */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.38)' : '#94a3b8', lineHeight: 1.3 }}>
                {card.label}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0, mt: '2px' }}>
                {Array.from({ length: NUM_FACES }).map((_, fi) => (
                  <Box
                    key={fi}
                    onClick={() => goTo(fi)}
                    sx={{
                      height:       6,
                      width:        fi === faceIdx ? 14 : 6,
                      borderRadius: 3,
                      bgcolor:      fi === faceIdx
                        ? (dark ? '#5eead4' : TEAL)
                        : (dark ? 'rgba(255,255,255,0.15)' : '#dde4ed'),
                      cursor:     'pointer',
                      transition: 'all 0.22s ease',
                    }}
                  />
                ))}
              </Box>
            </Box>

            {/* Metric area — fades + slides on face change */}
            <Box
              sx={{
                transition: 'opacity 0.18s ease, transform 0.18s ease',
                opacity:    visible ? 1 : 0,
                transform:  visible ? 'translateY(0)' : 'translateY(-8px)',
                mb:         1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                <Typography
                  sx={{
                    fontSize:      { xs: 36, sm: 44 },
                    fontWeight:    800,
                    letterSpacing: '-0.03em',
                    lineHeight:    1,
                    color:         dark ? '#5eead4' : '#0f172a',
                  }}
                >
                  {face?.metric ?? '—'}
                </Typography>
                <Typography
                  sx={{
                    fontSize:   { xs: 15, sm: 17 },
                    fontWeight: 600,
                    color:      dark ? '#5eead4' : '#374151',
                    lineHeight: 1.2,
                    alignSelf:  'flex-end',
                    mb:         '3px',
                    opacity:    dark ? 0.85 : 1,
                  }}
                >
                  {face?.suffix ?? ''}
                </Typography>
              </Box>
            </Box>

            {/* Description — static across faces */}
            <Typography sx={{ fontSize: 13, color: dark ? 'rgba(255,255,255,0.5)' : '#6b7280', lineHeight: 1.65, flex: 1 }}>
              {card.description}
            </Typography>

            {/* "Why this number?" expandable */}
            <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : '#f0f4f8'}` }}>
              <Box
                onClick={() => setOpenWhy(isOpen ? null : ci)}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75,
                  cursor: 'pointer', userSelect: 'none', transition: 'opacity 0.12s',
                  '&:hover': { opacity: 0.7 },
                }}
              >
                <Box
                  sx={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: `1.5px solid ${dark ? 'rgba(94,234,212,0.3)' : '#c8d5e0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Typography sx={{ fontSize: 9, fontWeight: 800, fontStyle: 'italic', color: dark ? 'rgba(94,234,212,0.5)' : '#94a3b8', lineHeight: 1 }}>
                    i
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: dark ? 'rgba(255,255,255,0.38)' : '#94a3b8' }}>
                  Why this number?
                </Typography>
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center',
                    color: dark ? 'rgba(255,255,255,0.25)' : '#b0bec5',
                    transition: 'transform 0.2s ease',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Box>
              </Box>

              {isOpen && (
                <Box sx={{ mt: 1.25, pl: '26px', fontSize: 12, color: dark ? 'rgba(255,255,255,0.38)' : '#6b7280', lineHeight: 1.65 }}>
                  {face?.why}
                </Box>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
