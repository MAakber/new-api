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
import { describe, expect, it, vi } from 'vitest'

import { createStreamRequestController } from '../use-stream-request'

function streamFixture() {
  const source = Object.assign(new EventTarget(), {
    readyState: 0,
    close: vi.fn(),
    stream: vi.fn(),
  })
  const callbacks = { onUpdate: vi.fn(), onError: vi.fn(), onComplete: vi.fn() }
  const setStreaming = vi.fn()
  const controller = createStreamRequestController({
    getHeaders: async () => ({}),
    createSource: () => source,
    setStreaming,
  })
  return { source, callbacks, setStreaming, controller }
}

describe('Chat stream failures', () => {
  it('uses the HTTP responseCode on an SSE error and terminates the failed request once', async () => {
    const fixture = streamFixture()
    await fixture.controller.send(
      { model: 'test-model', stream: true, messages: [] },
      fixture.callbacks
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('error'), {
        data: '<html>Bad gateway</html>',
        responseCode: 502,
      })
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('readystatechange'), { readyState: 2 })
    )
    expect(fixture.callbacks.onError).toHaveBeenCalledExactlyOnceWith(
      'A gateway error occurred (502). Please try again later.',
      'http_502'
    )
    expect(fixture.callbacks.onComplete).not.toHaveBeenCalled()
    expect(fixture.source.close).toHaveBeenCalledOnce()
    expect(fixture.setStreaming).toHaveBeenLastCalledWith(false)
  })

  it('surfaces a JSON error sent inside a successful HTTP stream instead of ignoring it', async () => {
    const fixture = streamFixture()
    await fixture.controller.send(
      { model: 'test-model', stream: true, messages: [] },
      fixture.callbacks
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('message'), {
        data: JSON.stringify({
          error: {
            message: 'Model price is not configured',
            code: 'model_price_error',
          },
        }),
      })
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('message'), { data: '[DONE]' })
    )
    expect(fixture.callbacks.onError).toHaveBeenCalledExactlyOnceWith(
      'Model price is not configured',
      'model_price_error'
    )
    expect(fixture.callbacks.onComplete).not.toHaveBeenCalled()
    expect(fixture.callbacks.onUpdate).not.toHaveBeenCalled()
  })

  it('stops loading when a stream closes without a completion event', async () => {
    const fixture = streamFixture()
    await fixture.controller.send(
      { model: 'test-model', stream: true, messages: [] },
      fixture.callbacks
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('open'), { responseCode: 200 })
    )
    fixture.source.dispatchEvent(
      Object.assign(new Event('readystatechange'), { readyState: 2 })
    )
    expect(fixture.callbacks.onError).toHaveBeenCalledWith(
      'Generation was interrupted',
      undefined
    )
    expect(fixture.setStreaming).toHaveBeenLastCalledWith(false)
  })
})
