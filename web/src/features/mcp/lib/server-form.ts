import type { TFunction } from 'i18next'
import { z } from 'zod'

import type { MCPCredentials, MCPServerConfig } from '../types'

const credentialFieldsSchema = z.record(
  z.string().min(1).max(128),
  z.string().max(4096)
)

export function createMCPServerSchema(t: TFunction) {
  const credentialJSON = z
    .string()
    .max(80_000)
    .refine((value) => {
      if (!value.trim()) return true
      try {
        return credentialFieldsSchema.safeParse(JSON.parse(value)).success
      } catch {
        return false
      }
    }, t('Enter a JSON object with string values'))
  return z.object({
    name: z.string().trim().min(1, t('Name is required')).max(100),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value)
          return (
            ['http:', 'https:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          )
        } catch {
          return false
        }
      }, t('Enter an HTTP(S) endpoint without credentials or query parameters')),
    enabled: z.boolean(),
    groups: z
      .array(z.string().min(1).max(128))
      .min(1, t('Select at least one user group'))
      .max(64),
    timeout_seconds: z.number().int().min(1).max(120),
    max_concurrency: z.number().int().min(1).max(8),
    headersJSON: credentialJSON,
    queryJSON: credentialJSON,
    clearCredentials: z.boolean(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          enabled: z.boolean(),
          read_only: z.boolean(),
          kind: z.enum(['search', 'fetch', 'tool']),
          schema_hash: z.string(),
        })
      )
      .max(64),
  })
}

export type MCPServerFormValues = z.infer<
  ReturnType<typeof createMCPServerSchema>
>

export function buildMCPServerInput(
  server: MCPServerConfig,
  values: MCPServerFormValues
): MCPServerConfig {
  let credentials: MCPCredentials | undefined
  if (values.clearCredentials) credentials = {}
  else if (values.headersJSON.trim() || values.queryJSON.trim()) {
    credentials = {
      headers: values.headersJSON.trim()
        ? credentialFieldsSchema.parse(JSON.parse(values.headersJSON))
        : {},
      query: values.queryJSON.trim()
        ? credentialFieldsSchema.parse(JSON.parse(values.queryJSON))
        : {},
    }
  }
  return {
    ...server,
    name: values.name,
    url: values.url,
    enabled: values.enabled,
    groups: values.groups,
    timeout_seconds: values.timeout_seconds,
    max_concurrency: values.max_concurrency,
    tools: values.tools,
    credentials,
  }
}
