import { describe, expect, it } from 'vitest'

import {
  chatLinkRequiresApiKey,
  parseChatConfig,
  resolveChatUrl,
} from '../chat-links'

describe('AQBot provider import', () => {
  it('requires an API key before opening the configured custom protocol', () => {
    const presets = parseChatConfig([
      { AQBot: 'aqbot://providers?{aqbotConfig}' },
    ])
    expect(presets).toEqual([
      {
        id: '0',
        name: 'AQBot',
        type: 'custom-protocol',
        url: 'aqbot://providers?{aqbotConfig}',
      },
    ])
    expect(chatLinkRequiresApiKey(presets[0].url)).toBe(true)
  })

  it.each(['fixture&key=1', 'sk-fixture&key=1'])(
    'encodes the address and normalized key without injecting query fields: %s',
    (apiKey) => {
      const resolved = new URL(
        resolveChatUrl({
          template: 'aqbot://providers?{aqbotConfig}',
          serverAddress:
            'https://gateway.example.test/api?tenant=one&region=two',
          apiKey,
        })
      )

      expect(resolved.protocol).toBe('aqbot:')
      expect(resolved.host).toBe('providers')
      expect(Object.fromEntries(resolved.searchParams)).toEqual({
        name: 'New API',
        baseurl: 'https://gateway.example.test/api?tenant=one&region=two',
        apikey: 'sk-fixture&key=1',
        type: 'openai',
      })
    }
  )

  it('preserves DeepChat configuration and existing web-link substitutions', () => {
    const resolved = new URL(
      resolveChatUrl({
        template: 'deepchat://provider/install?v=1&data={deepchatConfig}',
        serverAddress: 'https://gateway.example.test',
        apiKey: 'fixture',
      })
    )
    expect(JSON.parse(atob(resolved.searchParams.get('data') ?? ''))).toEqual({
      id: 'new-api',
      baseUrl: 'https://gateway.example.test',
      apiKey: 'sk-fixture',
    })
    expect(
      resolveChatUrl({
        template: 'https://chat.example.test/?url={address}&key={key}',
        serverAddress: 'https://gateway.example.test',
        apiKey: 'fixture',
      })
    ).toBe(
      'https://chat.example.test/?url=https%3A%2F%2Fgateway.example.test&key=sk-fixture'
    )
  })
})
