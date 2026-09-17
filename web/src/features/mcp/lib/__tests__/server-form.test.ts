import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import type { MCPServerConfig } from '../../types'
import { buildMCPServerInput, createMCPServerSchema } from '../server-form'

const server: MCPServerConfig = {
  id: 1,
  name: 'Search',
  url: 'https://example.com/mcp',
  enabled: true,
  groups: ['default'],
  tools: [],
  revision: 1,
  credential_set: true,
  timeout_seconds: 30,
  max_concurrency: 2,
}

describe('MCP server form', () => {
  it('preserves stored secrets when fields are blank and supports explicit replacement and removal', () => {
    const values = {
      ...server,
      headersJSON: '',
      queryJSON: '',
      clearCredentials: false,
    }
    expect(buildMCPServerInput(server, values).credentials).toBeUndefined()
    expect(
      buildMCPServerInput(server, {
        ...values,
        headersJSON: '{"Authorization":"Bearer replacement"}',
      }).credentials
    ).toEqual({ headers: { Authorization: 'Bearer replacement' }, query: {} })
    expect(
      buildMCPServerInput(server, { ...values, clearCredentials: true })
        .credentials
    ).toEqual({})
  })

  it('rejects credential URLs, malformed authentication JSON and an empty access list', () => {
    const schema = createMCPServerSchema(i18next.t)
    const values = {
      ...server,
      headersJSON: '',
      queryJSON: '',
      clearCredentials: false,
    }
    expect(schema.safeParse(values).success).toBe(true)
    for (const patch of [
      { url: 'https://user:password@example.com/mcp' },
      { url: 'https://example.com/mcp?key=secret' },
      { headersJSON: '{"Authorization":42}' },
      { groups: [] },
    ]) {
      expect(schema.safeParse({ ...values, ...patch }).success).toBe(false)
    }
  })
})
