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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ModelPerfBadge } from '../model-perf-badge'

const hour = Date.parse('2026-09-07T12:00:00.000Z') / 1000
const perf = { avg_latency_ms: 120, avg_tps: 1400, success_rate: 100 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T12:37:00.000Z'))
})

afterEach(() => vi.useRealTimers())

it('places sparse hourly samples at their actual hours and keeps missing hours neutral', () => {
  render(
    <ModelPerfBadge
      perf={{
        ...perf,
        recent_success_rates: [100, 100, 100],
        recent_success_series: [
          {
            ts: hour,
            success_rate: 100,
          },
          {
            ts: hour - 5 * 3600,
            success_rate: 80,
          },
        ],
      }}
    />
  )
  const slots = [
    ...screen.getByRole('img', {
      name: 'Recent success-rate samples; gray bars indicate missing data.',
    }).children,
  ]
  expect(slots).toHaveLength(24)
  expect(slots[23]).toHaveClass('bg-emerald-500')
  expect(slots[18]).toHaveClass('bg-amber-500')
  for (const [index, slot] of slots.entries()) {
    if (index !== 23 && index !== 18) {
      expect(slot).toHaveClass('bg-muted-foreground/15')
    }
  }
})

it('ignores out-of-window and invalid rates instead of showing healthy hours', () => {
  render(
    <ModelPerfBadge
      perf={{
        ...perf,
        recent_success_series: [
          {
            ts: hour - 24 * 3600,
            success_rate: 100,
          },
          {
            ts: hour + 3600,
            success_rate: 100,
          },
          {
            ts: hour,
            success_rate: 101,
          },
          {
            ts: hour - 3600,
            success_rate: -1,
          },
        ],
      }}
    />
  )
  const slots = [...screen.getByRole('img').children]
  expect(slots).toHaveLength(24)
  for (const slot of slots) expect(slot).toHaveClass('bg-muted-foreground/15')
})

it('keeps legacy recent samples and the downstream compact latency and throughput', () => {
  render(
    <ModelPerfBadge perf={{ ...perf, recent_success_rates: [100, 80, 0] }} />
  )
  const slots = [...screen.getByRole('img').children]
  expect(slots).toHaveLength(24)
  expect(slots[21]).toHaveClass('bg-emerald-500')
  expect(slots[22]).toHaveClass('bg-amber-500')
  expect(slots[23]).toHaveClass('bg-red-500')
  for (const slot of slots.slice(0, 21)) {
    expect(slot).toHaveClass('bg-muted-foreground/15')
  }
  expect(screen.getByText('120ms')).toBeVisible()
  expect(screen.getByText('1Kt')).toBeVisible()
})

it('does not invent history from an aggregate success rate or an empty new series', () => {
  const view = render(<ModelPerfBadge perf={perf} />)
  for (const slot of screen.getByRole('img').children) {
    expect(slot).toHaveClass('bg-muted-foreground/15')
  }
  view.rerender(
    <ModelPerfBadge
      perf={{
        ...perf,
        recent_success_series: [],
        recent_success_rates: [100],
      }}
    />
  )
  for (const slot of screen.getByRole('img').children) {
    expect(slot).toHaveClass('bg-muted-foreground/15')
  }
})
