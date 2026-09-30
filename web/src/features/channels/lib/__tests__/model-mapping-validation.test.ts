import { describe, expect, it } from 'vitest'

import { mergeModelMappingPairs } from '../model-mapping-rules'
import {
  findMissingModelsInMapping,
  validateModelMappingJson,
} from '../model-mapping-validation'

describe('model mapping validation', () => {
  it.each(['', '{}', '{"a":"b","b":"c"}', '{"a":"a"}', '{"a":"b","b":"b"}'])(
    'accepts empty, chained and self mappings: %s',
    (value) => {
      expect(validateModelMappingJson(value)).toEqual({ valid: true })
    }
  )

  it.each([
    ['{"a":"b","b":"a"}', 'Model mapping contains a cycle'],
    ['{"a":"b","a":"c"}', 'Duplicate source model mappings are not allowed'],
    [
      '{"a":"b","\\u0061":"c"}',
      'Duplicate source model mappings are not allowed',
    ],
    ['{" a":"b"}', 'Model names must not start or end with whitespace'],
    ['{"a":" b "}', 'Model names must not start or end with whitespace'],
    ['{"a":""}', 'Both request and upstream model names are required'],
    ['{"a":1}', 'Model mapping values must be strings'],
    ['[]', 'Model mapping must be a valid JSON object'],
    ['{', 'Model mapping must be valid JSON format'],
  ])('rejects unusable mappings: %s', (value, error) => {
    expect(validateModelMappingJson(value)).toEqual({ valid: false, error })
  })

  it('does not interpret quoted text in values as duplicate keys', () => {
    expect(
      validateModelMappingJson(
        JSON.stringify({ a: 'model-"a":"other"', b: 'target' })
      ).valid
    ).toBe(true)
  })

  it('preserves special model names and only publishes missing request aliases', () => {
    const json = mergeModelMappingPairs('', [
      { from: '__proto__', to: 'provider' },
    ])
    expect(JSON.parse(json ?? '')).toEqual(
      JSON.parse('{"__proto__":"provider"}')
    )
    expect(findMissingModelsInMapping(json ?? '', ['provider'])).toEqual([
      '__proto__',
    ])
  })
})
