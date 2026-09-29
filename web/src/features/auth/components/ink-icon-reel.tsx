import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaQuery } from '@/hooks/use-media-query'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { splitIntoSubpaths } from '../lib/ink-contours'

type InkReelProvider = {
  key: string
  name: string
  icon: string
}

// Showcase order from the design brief. The reel walks this list once and
// starts over, so the first brand a visitor sees is always OpenAI.
const PROVIDERS: InkReelProvider[] = [
  { key: 'openai', name: 'OpenAI', icon: 'OpenAI' },
  { key: 'anthropic', name: 'Anthropic', icon: 'Anthropic' },
  { key: 'google', name: 'Google', icon: 'Google' },
  { key: 'deepseek', name: 'DeepSeek', icon: 'DeepSeek' },
  { key: 'qwen', name: 'Qwen', icon: 'Qwen' },
]

// One brand every 2.8s, so five brands loop in 14s. Each brand plays three
// beats, in order: the outline is drawn (80-880ms), a highlight runs along that
// outline (880-1400ms), then the solid logo fades up inside it (1360-1860ms)
// and holds. The beats themselves live in `styles/auth.css` as --reel-* tokens.
const REEL_STEP_MS = 2800

const GLYPH_SIZE = 56

// A viewport this short usually means an on-screen keyboard is up and the
// stage would be half off-screen; the reel settles on the first brand instead
// of restarting the loop when the viewport grows back.
const STATIC_VIEWPORT_HEIGHT = 560

// Every shape that can carry a stroke and be walked by a dash.
const STROKEABLE_SHAPES = [
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
].join(', ')

// Longest stagger between two contour pieces of the same layer; the drawn
// outline may use more of its budget for staggering than the highlight does,
// because the highlight has to read as one light passing over the mark.
const MAX_TRACE_STEP_MS = 90
const MAX_SHEEN_STEP_MS = 45
const TRACE_BUDGET_FALLBACK_MS = 800
const SHEEN_BUDGET_FALLBACK_MS = 520

// Share of a contour piece the highlight covers, and the floor that keeps short
// pieces from being invisible.
const SHEEN_SPAN_RATIO = 0.32
const SHEEN_SPAN_MIN = 4

function readMs(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// jsdom has no layout, so `getTotalLength` is either missing or throws there.
function contourLength(shape: SVGGeometryElement): number {
  try {
    return typeof shape.getTotalLength === 'function'
      ? shape.getTotalLength()
      : 0
  } catch {
    return 0
  }
}

/**
 * A `<path>` can hold several subpaths, and the dash pattern restarts at each
 * of them — one dash can therefore never walk a whole multi-part contour.
 * Splitting every subpath into its own element is what makes the outline
 * drawable piece by piece, each against its own measured length. Shapes that
 * cannot hold subpaths (circle, rect, ...) are handed back untouched.
 */
function prepareContours(svg: SVGSVGElement): SVGGeometryElement[] {
  const pieces: SVGGeometryElement[] = []
  // Snapshot first: the loop rewrites the subtree it is walking.
  const shapes = [
    ...svg.querySelectorAll<SVGGeometryElement>(STROKEABLE_SHAPES),
  ]
  for (const shape of shapes) {
    const d = shape.getAttribute('d')
    const segments =
      d && shape.tagName.toLowerCase() === 'path' ? splitIntoSubpaths(d) : []
    if (!shape.parentNode || segments.length < 2) {
      pieces.push(shape)
      continue
    }
    for (const segment of segments) {
      const piece = shape.cloneNode(false) as SVGGeometryElement
      piece.setAttribute('d', segment)
      shape.parentNode.insertBefore(piece, shape)
      pieces.push(piece)
    }
    shape.remove()
  }
  return pieces
}

/**
 * Decorative provider reel for the sign-in stage pane: one AI brand at a time,
 * in three beats — the outline is drawn along its own path, a highlight runs
 * along that freshly drawn outline, and then the solid logo fades up inside it
 * — before handing over to the next brand. Below 1024px the whole stage pane is
 * hidden by CSS, and reduced motion (or a short viewport) leaves the first
 * brand standing still, fully drawn.
 */
export function InkIconReel() {
  const { t } = useTranslation()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [activeIndex, setActiveIndex] = useState(0)
  const [staticViewport, setStaticViewport] = useState(false)
  const animated = !reducedMotion && !staticViewport
  const reelRef = useRef<HTMLDivElement>(null)

  // Both the drawn outline and the highlight are stroke walks, so both need
  // their contours dashed in their own user units: the dash pattern has to be
  // the measured length and the walk runs along it. `pathLength` cannot be used
  // here — the engine scales a dash *pattern* by `pathLength / length` but
  // applies the dash *offset* in user units, so the two end up on different
  // scales and the line never clips proportionally. Budgets come from CSS
  // (--reel-trace-duration / --reel-sheen-duration); the pieces of one icon
  // share their budget, staggered, so every icon finishes its beat on time
  // however many subpaths it happens to have.
  useEffect(() => {
    const reel = reelRef.current
    if (!reel) return

    const dressContours = (
      selector: string,
      token: string,
      stepCap: number,
      budgetFallback: number,
      dress: (piece: SVGGeometryElement, length: number) => void
    ) => {
      const budget = readMs(
        getComputedStyle(reel).getPropertyValue(token),
        budgetFallback
      )
      for (const svg of reel.querySelectorAll<SVGSVGElement>(selector)) {
        const pieces = prepareContours(svg)
        const step =
          pieces.length > 1
            ? Math.min(stepCap, budget / (pieces.length * 2))
            : 0
        const duration = Math.max(
          budget / 2,
          budget - step * (pieces.length - 1)
        )
        svg.style.setProperty('--ink-contour-step', `${Math.round(step)}ms`)
        pieces.forEach((piece, index) => {
          const length = contourLength(piece)
          piece.style.setProperty('--ink-contour-index', String(index))
          piece.style.setProperty(
            '--ink-contour-duration',
            `${Math.round(duration)}ms`
          )
          if (length <= 0) return
          piece.style.setProperty('--ink-contour-length', String(length))
          dress(piece, length)
        })
      }
    }

    // Beat 1: one full-length dash that walks the contour from start to end.
    dressContours(
      '.ink-reel-trace svg',
      '--reel-trace-duration',
      MAX_TRACE_STEP_MS,
      TRACE_BUDGET_FALLBACK_MS,
      (piece, length) => {
        piece.setAttribute('stroke-dasharray', String(length))
      }
    )

    // Beat 2: a shorter dash — the highlight — travelling over the same path.
    dressContours(
      '.ink-reel-sheen svg',
      '--reel-sheen-duration',
      MAX_SHEEN_STEP_MS,
      SHEEN_BUDGET_FALLBACK_MS,
      (piece, length) => {
        const span = Math.max(length * SHEEN_SPAN_RATIO, SHEEN_SPAN_MIN)
        piece.setAttribute('stroke-dasharray', `${span} ${length}`)
        piece.style.setProperty('--ink-sheen-span', String(span))
      }
    )
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    // Latch: once the viewport turns short, keep the reel static instead of
    // replaying the loop when the keyboard closes again.
    const settle = () => {
      if (viewport.height < STATIC_VIEWPORT_HEIGHT) {
        setStaticViewport(true)
      }
    }
    settle()
    viewport.addEventListener('resize', settle)
    return () => viewport.removeEventListener('resize', settle)
  }, [])

  useEffect(() => {
    if (!animated) return
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % PROVIDERS.length)
    }, REEL_STEP_MS)
    return () => window.clearInterval(timer)
  }, [animated])

  return (
    <div
      ref={reelRef}
      className={cn('auth-ink-reel', animated && 'is-animated')}
      aria-hidden='true'
    >
      <div className='auth-ink-reel-stage'>
        {PROVIDERS.map((provider, index) => (
          <div
            key={provider.key}
            className={cn(
              'ink-reel-item',
              index === activeIndex && 'is-active'
            )}
          >
            <div className='ink-reel-ring'>
              <span className='ink-reel-glyph'>
                <span className='ink-reel-glyph-layer ink-reel-trace'>
                  {getLobeIcon(provider.icon, GLYPH_SIZE)}
                </span>
                <span className='ink-reel-glyph-layer ink-reel-sheen'>
                  {getLobeIcon(provider.icon, GLYPH_SIZE)}
                </span>
                <span className='ink-reel-glyph-layer ink-reel-fill'>
                  {getLobeIcon(provider.icon, GLYPH_SIZE)}
                </span>
              </span>
              <span className='ink-reel-sheen-beam' />
            </div>
            <p className='ink-reel-name'>{provider.name}</p>
          </div>
        ))}
      </div>
      <ul className='ink-reel-dots'>
        {PROVIDERS.map((provider, index) => (
          <li
            key={provider.key}
            className={cn('ink-reel-dot', index === activeIndex && 'is-active')}
          />
        ))}
      </ul>
      <p className='auth-ink-reel-caption'>{t('Unified gateway')}</p>
    </div>
  )
}
