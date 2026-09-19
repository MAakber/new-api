import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { AuthLayout } from '../auth-layout'
import { InkRouteMap } from '../components/ink-route-map'

const DESKTOP_QUERY = '(min-width: 1024px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

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

afterEach(() => {
  mockMatchMedia({})
})

describe('InkRouteMap', async () => {
  it('renders the gateway and all five showcase providers with visible names on desktop', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(<InkRouteMap />)

    expect(
      screen.getByText('Unified gateway', { selector: '.ink-node-label' })
    ).toBeInTheDocument()
    for (const name of ['OpenAI', 'Anthropic', 'Google', 'DeepSeek', 'Qwen']) {
      expect(
        screen.getByText(name, { selector: '.ink-node-label' })
      ).toBeInTheDocument()
    }
  })

  it('shows only the three primary providers on compact layouts', async () => {
    mockMatchMedia({})
    await renderWithProviders(<InkRouteMap />)

    expect(
      screen.getByText('Unified gateway', { selector: '.ink-node-label' })
    ).toBeInTheDocument()
    for (const name of ['OpenAI', 'Anthropic', 'Google']) {
      expect(
        screen.getByText(name, { selector: '.ink-node-label' })
      ).toBeInTheDocument()
    }
    expect(
      screen.queryByText('DeepSeek', { selector: '.ink-node-label' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Qwen', { selector: '.ink-node-label' })
    ).not.toBeInTheDocument()
  })

  it('stays decorative and is excluded from assistive technology', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(<InkRouteMap />)

    const map = document.querySelector('.auth-ink-map')
    expect(map).toHaveAttribute('aria-hidden', 'true')
  })

  it('plays the one-shot drawing when motion is allowed', async () => {
    mockMatchMedia({ [DESKTOP_QUERY]: true })
    await renderWithProviders(<InkRouteMap />)

    expect(document.querySelector('.auth-ink-map')).toHaveClass('is-animated')
    expect(document.querySelector('.auth-ink-map')).not.toHaveClass(
      'is-compact'
    )
  })

  it('renders the finished static drawing when reduced motion is preferred', async () => {
    mockMatchMedia({
      [DESKTOP_QUERY]: true,
      [REDUCED_MOTION_QUERY]: true,
    })
    await renderWithProviders(<InkRouteMap />)

    const map = document.querySelector('.auth-ink-map')
    expect(map).not.toHaveClass('is-animated')
    expect(
      screen.getByText('Qwen', { selector: '.ink-node-label' })
    ).toBeInTheDocument()
  })
})

describe('AuthLayout sign-in shell', async () => {
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
    // The route map must stay out of the keyboard tab order entirely.
    expect(
      stagePane?.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length
    ).toBe(0)
  })

  it('keeps the default variant a single centered pane without the route map', async () => {
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
