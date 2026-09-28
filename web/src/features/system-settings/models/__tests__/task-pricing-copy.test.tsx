import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { TaskUsagePricingEditor } from '../task-usage-pricing-editor'

function renderPricing(unitLabel?: Record<string, string>) {
  const onBillingExprChange = vi.fn()
  render(
    <TaskUsagePricingEditor
      billingExpr='tier("music", 1 + u("clips") * 11)'
      requestRuleExpr=''
      usageSchema={{
        action: {
          enum: ['music', 'lyrics'],
          enumLabels: {
            music: { en: 'Generate songs', zh: '生成歌曲' },
            lyrics: { en: 'Generate lyrics', zh: '生成歌词' },
          },
          description: { en: 'Generate songs or lyrics', zh: '生成歌曲或歌词' },
        },
        clips: {
          type: 'number',
          unit: 'count',
          unitLabel,
          description: { en: 'Song generation unit price', zh: '生成歌曲单价' },
        },
      }}
      onBillingExprChange={onBillingExprChange}
      onRequestRuleExprChange={vi.fn()}
    />
  )
  return onBillingExprChange
}

afterEach(async () => {
  await act(() => i18next.changeLanguage('en'))
})

it('shows localized schema explanations in the price table and calculator', async () => {
  renderPricing()
  const table = screen.getByRole('table')
  expect(within(table).getByText('Song generation unit price')).toBeVisible()
  expect(within(table).getByText('Generate songs or lyrics')).toBeVisible()
  expect(
    screen.getByRole('spinbutton', {
      name: 'Usage · Song generation unit price',
    })
  ).toBeVisible()
  expect(
    within(table).getByText(
      'Added to the usage cost. Set to 0 for no additional charge.'
    )
  ).toBeVisible()
  await act(() => i18next.changeLanguage('zhCN'))
  expect(within(table).getByText('生成歌曲单价')).toBeVisible()
  expect(screen.getByRole('combobox', { name: '生成歌曲或歌词' })).toBeVisible()
})

it('uses count unit labels in the price matrix and calculator without changing the charge', async () => {
  renderPricing({ en: 'song', zh: '首' })
  expect(within(screen.getByRole('table')).getByText('$/song')).toBeVisible()
  expect(
    screen.getByText(
      'Additional charge: $1 + Song generation unit price: 1 song × $11/song = $12'
    )
  ).toBeVisible()
  await act(() => i18next.changeLanguage('zhCN'))
  expect(within(screen.getByRole('table')).getByText('$/首')).toBeVisible()
  expect(screen.getByText('首')).toBeVisible()
  expect(screen.getByText(/1 首 × \$11\/首 = \$12/)).toBeVisible()
})

it('identifies pricing conditions and keeps the additional charge unchanged when sample usage changes', async () => {
  renderPricing()
  expect(
    screen.getByText('Current pricing conditions: Generate songs')
  ).toBeVisible()
  expect(
    screen.getByText(
      'Additional charge: $1 + Song generation unit price: 1 unit × $11/unit = $12'
    )
  ).toBeVisible()
  const user = userEvent.setup()
  const quantity = screen.getByRole('spinbutton', {
    name: 'Usage · Song generation unit price',
  })
  await user.clear(quantity)
  await user.type(quantity, '2')
  expect(
    screen.getByText(
      'Additional charge: $1 + Song generation unit price: 2 unit × $11/unit = $23'
    )
  ).toBeVisible()
})

it('shows localized enum choices while preserving raw values in generated billing expressions', async () => {
  const onChange = renderPricing()
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('combobox', { name: 'Generate songs or lyrics' })
  )
  await user.click(screen.getByRole('option', { name: 'Generate lyrics' }))
  expect(
    screen.getByText('Current pricing conditions: Generate lyrics')
  ).toBeVisible()
  const price = screen.getByRole('textbox', {
    name: 'Song generation unit price: Generate lyrics',
  })
  await user.clear(price)
  await user.type(price, '3')
  const expression = onChange.mock.lastCall?.[0]
  expect(expression).toContain('u("action") == "music"')
  expect(expression).toContain('tier("lyrics"')
  expect(expression).not.toContain('Generate lyrics')
})

it.each(['image', 'video'] as const)(
  'limits pricing fields to the resolved %s model schema',
  (kind) => {
    const usageSchema = {
      image: {
        image_count: {
          type: 'number' as const,
          unit: 'count' as const,
          unitLabel: { en: 'image', zh: '张' },
          description: { en: 'Image quantity' },
        },
      },
      video: {
        seconds: {
          type: 'number' as const,
          unit: 'second' as const,
          description: { en: 'Video duration' },
        },
        resolution: {
          enum: ['720P', '1080P'],
          description: { en: 'Resolution' },
        },
      },
    }
    const field = kind === 'image' ? 'image_count' : 'seconds'
    render(
      <TaskUsagePricingEditor
        billingExpr={`tier("base", u("${field}") * 1)`}
        requestRuleExpr=''
        usageSchema={usageSchema[kind]}
        onBillingExprChange={vi.fn()}
        onRequestRuleExprChange={vi.fn()}
      />
    )
    const presentLabel = kind === 'image' ? 'Image quantity' : 'Video duration'
    const absentLabel = kind === 'image' ? 'Video duration' : 'Image quantity'
    expect(
      screen.getByRole('spinbutton', { name: `Usage · ${presentLabel}` })
    ).toBeVisible()
    expect(
      screen.queryByRole('spinbutton', { name: `Usage · ${absentLabel}` })
    ).not.toBeInTheDocument()
    if (kind === 'image') {
      expect(screen.getByText('$/image')).toBeVisible()
      expect(
        screen.queryByRole('combobox', { name: 'Resolution' })
      ).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeVisible()
    }
  }
)
