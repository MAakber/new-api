import { Waypoints } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks/use-media-query'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

type InkRouteProvider = {
  key: string
  name: string
  icon: string
  x: number
  y: number
  path: string
}

// Route geometry lives in a 720x480 viewBox on a locked 3:2 canvas, so SVG
// line endpoints and node anchors (percentages of the canvas) always align.
const VIEWBOX_WIDTH = 720
const VIEWBOX_HEIGHT = 480
const GATEWAY = { x: 120, y: 240 }

// Desktop composition: five providers fanned around the gateway, ordered so
// the routes never cross a node. The draw order follows the default
// showcase list from the design brief.
const DESKTOP_PROVIDERS: InkRouteProvider[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    icon: 'OpenAI',
    x: 430,
    y: 100,
    path: 'M 120 240 Q 235 168 430 100',
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    icon: 'Anthropic',
    x: 360,
    y: 262,
    path: 'M 120 240 Q 242 254 360 262',
  },
  {
    key: 'google',
    name: 'Google',
    icon: 'Google',
    x: 590,
    y: 180,
    path: 'M 120 240 Q 332 214 590 180',
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    icon: 'DeepSeek',
    x: 390,
    y: 390,
    path: 'M 120 240 Q 242 330 390 390',
  },
  {
    key: 'qwen',
    name: 'Qwen',
    icon: 'Qwen',
    x: 600,
    y: 332,
    path: 'M 120 240 Q 330 292 600 332',
  },
]

// Compact composition: three providers with a wider spread so fixed-size
// node rings keep clear of the routes on narrow canvases.
const COMPACT_PROVIDERS: InkRouteProvider[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    icon: 'OpenAI',
    x: 450,
    y: 96,
    path: 'M 120 240 Q 250 150 450 96',
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    icon: 'Anthropic',
    x: 380,
    y: 372,
    path: 'M 120 240 Q 235 320 380 372',
  },
  {
    key: 'google',
    name: 'Google',
    icon: 'Google',
    x: 608,
    y: 240,
    path: 'M 120 240 Q 340 210 608 240',
  },
]

// One-shot sequence: the gateway appears first, then each route draws and
// settles before the next one starts. The whole run stays under ~3s.
const FIRST_ROUTE_DELAY_MS = 200
const ROUTE_STEP_MS = 440
const NODE_REVEAL_LEAD_MS = 340

// A viewport this short on the single-column layout usually means a phone
// keyboard is up; the map settles into its final drawing instead of playing.
const COMPACT_STATIC_VIEWPORT_HEIGHT = 560

function toMapPercentX(x: number): string {
  return `${((x / VIEWBOX_WIDTH) * 100).toFixed(3)}%`
}

function toMapPercentY(y: number): string {
  return `${((y / VIEWBOX_HEIGHT) * 100).toFixed(3)}%`
}

function nodeStyle(x: number, y: number, delay: number): CSSProperties {
  return {
    left: toMapPercentX(x),
    top: toMapPercentY(y),
    '--ink-delay': `${delay}ms`,
  } as CSSProperties
}

export function InkRouteMap() {
  const { t } = useTranslation()
  const desktopLayout = useMediaQuery('(min-width: 1024px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [staticViewport, setStaticViewport] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    // Latch: once the viewport turns short, keep the map static instead of
    // replaying the drawing when the keyboard closes again.
    const settle = () => {
      if (viewport.height < COMPACT_STATIC_VIEWPORT_HEIGHT) {
        setStaticViewport(true)
      }
    }
    settle()
    viewport.addEventListener('resize', settle)
    return () => viewport.removeEventListener('resize', settle)
  }, [])

  const providers = desktopLayout ? DESKTOP_PROVIDERS : COMPACT_PROVIDERS
  const animated = !reducedMotion && !staticViewport

  return (
    <div
      className={cn(
        'auth-ink-map',
        !desktopLayout && 'is-compact',
        animated && 'is-animated'
      )}
      aria-hidden='true'
    >
      <div className='auth-ink-map-canvas'>
        <svg
          className='auth-ink-map-lines'
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio='none'
          fill='none'
        >
          {providers.map((provider, index) => (
            <path
              key={provider.key}
              className='ink-route-line'
              d={provider.path}
              pathLength={1}
              style={
                {
                  '--ink-delay': `${FIRST_ROUTE_DELAY_MS + index * ROUTE_STEP_MS}ms`,
                } as CSSProperties
              }
            />
          ))}
        </svg>
        <div
          className='ink-node ink-gateway'
          style={nodeStyle(GATEWAY.x, GATEWAY.y, 0)}
        >
          <div className='ink-node-ring ink-gateway-ring'>
            <Waypoints className='ink-gateway-icon' />
          </div>
          <p className='ink-node-label'>{t('Unified gateway')}</p>
        </div>
        {providers.map((provider, index) => (
          <div
            key={provider.key}
            className='ink-node'
            style={nodeStyle(
              provider.x,
              provider.y,
              FIRST_ROUTE_DELAY_MS + index * ROUTE_STEP_MS + NODE_REVEAL_LEAD_MS
            )}
          >
            <div className='ink-node-ring'>
              <span className='ink-node-icon'>
                {getLobeIcon(provider.icon, desktopLayout ? 24 : 20)}
              </span>
            </div>
            <p className='ink-node-label'>{provider.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
