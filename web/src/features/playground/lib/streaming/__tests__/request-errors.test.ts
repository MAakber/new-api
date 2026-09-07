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
import { describe, expect, it } from 'vitest'

import { parseRequestErrorDetails } from '../request-error-utils'
import { parseStreamErrorDetails } from '../stream-utils'

const gatewayPage =
  '<!DOCTYPE html><html><head><title>example.com | 502: Bad gateway</title></head><body>Cloudflare error details</body></html>'

describe('Playground request errors', () => {
  it('replaces a gateway HTML page with a concise error in both request modes', () => {
    const expected = {
      errorCode: 'http_502',
      errorMessage: 'A gateway error occurred (502). Please try again later.',
    }
    expect(parseStreamErrorDetails(gatewayPage, 502)).toEqual(expected)
    expect(
      parseRequestErrorDetails({
        message: 'Request failed',
        response: { status: 502, data: gatewayPage },
      })
    ).toEqual(expected)
  })

  it('recognizes HTML wrapped inside an API error and preserves the API error code', () => {
    const details = parseStreamErrorDetails(
      JSON.stringify({
        error: { message: gatewayPage, code: 'bad_response_status_code' },
      })
    )
    expect(details.errorCode).toBe('bad_response_status_code')
    expect(details.errorMessage).toBe(
      'A gateway error occurred (502). Please try again later.'
    )
  })

  it('keeps actionable nested JSON errors and model pricing codes', () => {
    const payload = {
      error: {
        message: 'Model price is not configured',
        code: 'model_price_error',
      },
    }
    const expected = {
      errorMessage: 'Model price is not configured',
      errorCode: 'model_price_error',
    }
    expect(
      parseRequestErrorDetails({ response: { status: 400, data: payload } })
    ).toEqual(expected)
    expect(parseStreamErrorDetails(JSON.stringify(payload), 400)).toEqual(
      expected
    )
  })

  it.each([
    [
      503,
      'The service is temporarily unavailable (503). Please try again later.',
    ],
    [
      504,
      'The request timed out at the gateway (504). Please try again later.',
    ],
  ])(
    'explains HTTP %s when the response body is empty',
    (status, errorMessage) => {
      expect(parseStreamErrorDetails('', status)).toEqual({
        errorCode: `http_${status}`,
        errorMessage,
      })
    }
  )

  it('hides unrecognized HTML and preserves ordinary text errors', () => {
    expect(
      parseStreamErrorDetails('<html><body>Proxy unavailable</body></html>')
        .errorMessage
    ).toBe('The server returned an error page. Please try again later.')
    expect(parseStreamErrorDetails('Quota exceeded').errorMessage).toBe(
      'Quota exceeded'
    )
    expect(
      parseRequestErrorDetails(new Error('Connection refused')).errorMessage
    ).toBe('Connection refused')
  })
})
