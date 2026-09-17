import assert from 'node:assert/strict'

import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, test } from 'vitest'

import { AvailabilitySection } from '../availability-section'

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  returnNull: false,
})

describe('rankings availability compatibility', () => {
  test('renders models when recent rates are null in a legacy response', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AvailabilitySection
          error={false}
          loading={false}
          snapshot={{
            generated_at: 1_750_000_000,
            models: [
              {
                model_name: 'legacy-model',
                vendor: 'test-vendor',
                success_rate: 100,
                avg_latency_ms: 120,
                request_count: 10,
                recent_success_rates: null as unknown as number[],
              },
            ],
          }}
        />
      </I18nextProvider>
    )

    assert.equal(markup.includes('legacy-model'), true)
  })

  test('gives the success-rate trend a wider column', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AvailabilitySection
          error={false}
          loading={false}
          snapshot={{
            generated_at: 1_750_000_000,
            models: [
              {
                model_name: 'wide-trend-model',
                vendor: 'test-vendor',
                success_rate: 98,
                avg_latency_ms: 120,
                request_count: 10,
                recent_success_rates: [97, 98, 99],
              },
            ],
          }}
        />
      </I18nextProvider>
    )

    assert.equal(markup.includes('grid-cols-[minmax(0,1fr)_120px]'), true)
    assert.equal(
      markup.includes('sm:grid-cols-[minmax(0,1fr)_200px_100px_90px]'),
      true
    )
  })
})
