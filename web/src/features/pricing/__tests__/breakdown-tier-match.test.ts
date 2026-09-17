import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { parseTiersFromExpr, type ParsedTaskTier } from '../lib/billing-expr'
import { isBreakdownTierMatched } from '../lib/breakdown-tier-match'
import { getTaskMatrixDisplayTiers } from '../lib/task-matrix-display'
import type { BillingUsageSchema } from '../types'

const seedanceSchema: BillingUsageSchema = {
  tokens: { type: 'number', unit: 'token' },
  resolution: { enum: ['480p', '720p', '1080p', '4k'] },
  video_input: { enum: ['none', 'video'] },
}

const uniformSeedanceExpr = 'tier("base", u("tokens") * 10 / 1000000)'

function seedanceDisplayTiers(): ParsedTaskTier[] {
  const tiers = getTaskMatrixDisplayTiers(uniformSeedanceExpr, seedanceSchema)
  assert.ok(tiers)
  assert.equal(tiers.length, 8)
  return tiers
}

function matchedLabels(
  tiers: ParsedTaskTier[],
  matchedTierLabel?: string | null,
  usageFacts?: Record<string, string | number>
): string[] {
  return tiers
    .filter((tier) =>
      isBreakdownTierMatched(tier, tiers, matchedTierLabel, usageFacts)
    )
    .map((tier) => tier.label)
}

describe('breakdown tier matched-row highlight', () => {
  test('uses the recorded unit and fixed price when token and request branches share a label', () => {
    const tiers = parseTiersFromExpr(
      'len < 1000 ? tier("base", p * 2) : tier("base", fixed(0.01))'
    )
    assert.equal(
      tiers.filter((tier) =>
        isBreakdownTierMatched(tier, tiers, 'base', undefined, 'request', 0.01)
      ).length,
      1
    )
  })
  test('highlights only the 720p·video row when a uniform matrix log matches base with those usage facts', () => {
    const tiers = seedanceDisplayTiers()

    assert.deepEqual(
      matchedLabels(tiers, 'base', {
        resolution: '720p',
        video_input: 'video',
      }),
      ['720p·video']
    )
  })

  test('does not highlight any row when a uniform matrix log matches base without usage facts', () => {
    const tiers = seedanceDisplayTiers()

    assert.deepEqual(matchedLabels(tiers, 'base'), [])
  })

  test('does not highlight any row when usage facts omit a condition field', () => {
    const tiers = seedanceDisplayTiers()

    assert.deepEqual(
      matchedLabels(tiers, 'base', {
        resolution: '720p',
      }),
      []
    )
  })

  test('highlights the labeled non-matrix row and does not facts-match another row', () => {
    const tiers: ParsedTaskTier[] = [
      {
        label: 'pro',
        conditions: [{ field: 'mode', value: 'pro' }],
        constant: 0,
        unitPrices: { seconds: 0.8 },
      },
      {
        label: 'std',
        conditions: [{ field: 'mode', value: 'std' }],
        constant: 0,
        unitPrices: { seconds: 0.4 },
      },
    ]

    assert.deepEqual(matchedLabels(tiers, 'pro', { mode: 'std' }), ['pro'])
  })
})
