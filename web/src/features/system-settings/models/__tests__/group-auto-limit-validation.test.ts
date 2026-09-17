import { describe, expect, test } from 'vitest'

import { positiveIntegerSchema } from '../../utils/numeric-field'

const t = (key: string) => key
const schema = positiveIntegerSchema(t('Enter a positive integer'))

describe('per-token Auto group limit validation', () => {
  test('accepts any positive integer without a product upper bound', () => {
    expect(schema.safeParse(1000).success).toBe(true)
  })

  test('rejects zero, negative, and fractional limits', () => {
    for (const maxTokenAutoGroups of [0, -1, 1.5]) {
      const result = schema.safeParse(maxTokenAutoGroups)
      expect(result.success).toBe(false)
      if (result.success) continue
      expect(result.error.issues[0]?.message).toBe('Enter a positive integer')
    }
  })
})
