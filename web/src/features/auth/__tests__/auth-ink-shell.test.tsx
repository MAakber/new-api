import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'
import { InkIconReel } from '../components/ink-icon-reel'

const DESKTOP_QUERY = '(min-width: 1024px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Mirrors REEL_STEP_MS in ink-icon-reel.tsx: pinning the number here is the
// point, so changing the pace has to be deliberate on both sides.
const REEL_STEP_MS = 2800

const SHOWCASE_ORDER = ['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Qwen']

function mockMatchMedia(matches: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: matches[query] ?? false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

async function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const content = (
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
  const rootRoute = createRootRoute({ component: Outlet })
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => content,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

function activeBrand() {
  return document.querySelector('.ink-reel-item.is-active .ink-reel-name')
    ?.textContent
}

afterEach(() => {
  mockMatchMedia({})
})

describe('InkIconReel', () => {
  it('walks the showcase order with exactly one brand on stage', () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    render(<InkIconReel />)

    const names = [
      ...document.querySelectorAll('.ink-reel-item .ink-reel-name'),
    ].map((node) => node.textContent)
    expect(names).toEqual(SHOWCASE_ORDER)

    const items = [...document.querySelectorAll('.ink-reel-item')]
    expect(items).toHaveLength(SHOWCASE_ORDER.length)
    const active = items.filter((item) => item.classList.contains('is-active'))
    expect(active).toHaveLength(1)
    expect(activeBrand()).toBe('OpenAI')
    expect(document.querySelectorAll('.ink-reel-dot')).toHaveLength(
      SHOWCASE_ORDER.length
    )
    expect(document.querySelectorAll('.ink-reel-dot.is-active')).toHaveLength(1)
  })

  it('hands the stage over every step and wraps back to the first brand', () => {
    vi.useFakeTimers()
    try {
      mockMatchMedia({ [DESKTOP_QUERY]: true })
      render(<InkIconReel />)
      expect(activeBrand()).toBe('OpenAI')

      act(() => {
        vi.advanceTimersByTime(REEL_STEP_MS)
      })
      expect(activeBrand()).toBe('Anthropic')

      act(() => {
        vi.advanceTimersByTime(REEL_STEP_MS * (SHOWCASE_ORDER.length - 1))
      })
      expect(activeBrand()).toBe('OpenAI')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stacks an outline, a highlight and a logo layer for every brand', () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    render(<InkIconReel />)

    // Three beats, three layers carrying the same mark: the contour that gets
    // drawn, the highlight that runs over it, the logo that settles inside it.
    for (const layer of [
      '.ink-reel-trace',
      '.ink-reel-sheen',
      '.ink-reel-fill',
    ]) {
      expect(document.querySelectorAll(`${layer} svg`)).toHaveLength(
        SHOWCASE_ORDER.length
      )
    }
  })

  it('splits every contour, dashes it at its own length and staggers both strokes', () => {
    // jsdom has no layout, so pretend the contours measure like a browser's.
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
      configurable: true,
      value: () => 120,
    })
    const styleOf = (node: Element) => node.getAttribute('style') ?? ''
    const contoursIn = (layer: string) => [
      ...document.querySelectorAll(
        `${layer} svg path, ${layer} svg circle, ${layer} svg rect, ${layer} svg ellipse, ${layer} svg line, ${layer} svg polyline, ${layer} svg polygon`
      ),
    ]
    try {
      mockMatchMedia({ [DESKTOP_QUERY]: true })
      render(<InkIconReel />)

      const outline = contoursIn('.ink-reel-trace')
      const sheen = contoursIn('.ink-reel-sheen')
      // Icons whose path holds several subpaths must be split, because the dash
      // pattern restarts at every subpath: one dash cannot walk them all.
      expect(outline.length).toBeGreaterThan(SHOWCASE_ORDER.length)
      expect(sheen).toHaveLength(outline.length)

      for (const shape of outline) {
        // A full-length dash walks the whole piece from its own start point.
        expect(shape).toHaveAttribute('stroke-dasharray', '120')
        expect(styleOf(shape)).toContain('--ink-contour-length: 120')
        expect(styleOf(shape)).toMatch(/--ink-contour-index: \d+/)
        expect(styleOf(shape)).toMatch(/--ink-contour-duration: \d+ms/)
      }
      for (const shape of sheen) {
        // A short dash (the highlight) with the whole length as its gap.
        expect(shape.getAttribute('stroke-dasharray')).toMatch(/^[\d.]+ 120$/)
        expect(styleOf(shape)).toMatch(/--ink-sheen-span: [\d.]+/)
      }
      for (const svg of document.querySelectorAll(
        '.ink-reel-trace svg, .ink-reel-sheen svg'
      )) {
        expect(styleOf(svg)).toMatch(/--ink-contour-step: \d+ms/)
      }
    } finally {
      Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength')
    }
  })

  it('is decorative: hidden from assistive technology and out of the tab order', () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    const { container } = render(<InkIconReel />)

    expect(container.querySelector('.auth-ink-reel')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(
      container.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length
    ).toBe(0)
    expect(screen.getByText('Unified gateway')).toBeInTheDocument()
  })

  it('holds the first brand still when reduced motion is preferred', () => {
    vi.useFakeTimers()
    try {
      mockMatchMedia({
        [DESKTOP_QUERY]: true,
        [REDUCED_MOTION_QUERY]: true,
      })
      render(<InkIconReel />)

      expect(document.querySelector('.auth-ink-reel')).not.toHaveClass(
        'is-animated'
      )
      act(() => {
        vi.advanceTimersByTime(REEL_STEP_MS * 3)
      })
      expect(activeBrand()).toBe('OpenAI')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('AuthLayout sign-in shell', () => {
  it('places the form pane before the decorative stage pane in DOM order', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(
      <AuthLayout variant='sign-in' footer={<div>pane footer</div>}>
        <div>sign-in form content</div>
      </AuthLayout>
    )

    const formPane = document.querySelector('.auth-ink-form-pane')
    const stagePane = document.querySelector('.auth-ink-stage-pane')

    expect(formPane).not.toBeNull()
    expect(stagePane).not.toBeNull()
    if (formPane && stagePane) {
      expect(
        formPane.compareDocumentPosition(stagePane) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
    expect(screen.getByText('sign-in form content')).toBeInTheDocument()
    expect(screen.getByText('pane footer')).toBeInTheDocument()
  })

  it('marks the whole stage pane as decorative', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(
      <AuthLayout variant='sign-in'>
        <div>sign-in form content</div>
      </AuthLayout>
    )

    const stagePane = document.querySelector('.auth-ink-stage-pane')
    expect(stagePane).toHaveAttribute('aria-hidden', 'true')
    expect(stagePane?.querySelector('svg')).toBeInTheDocument()
    // The reel must stay out of the keyboard tab order entirely.
    expect(
      stagePane?.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length
    ).toBe(0)
  })

  it('keeps the default variant a single centered pane without the reel', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(
      <AuthLayout>
        <div>default auth content</div>
      </AuthLayout>
    )

    expect(screen.queryByText('Unified gateway')).not.toBeInTheDocument()
    expect(
      document.querySelector('.auth-ink-stage-pane')
    ).not.toBeInTheDocument()
    expect(screen.getByText('default auth content')).toBeInTheDocument()
  })
})
