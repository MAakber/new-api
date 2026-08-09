/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

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
