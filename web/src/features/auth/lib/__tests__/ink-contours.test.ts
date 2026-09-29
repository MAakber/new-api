import { describe, expect, it } from 'vitest'

import { splitIntoSubpaths } from '../ink-contours'

describe('splitIntoSubpaths', () => {
  it('keeps absolute movetos exactly as written', () => {
    expect(splitIntoSubpaths('M0 0h4v4z M10 0h4v4z')).toEqual([
      'M0 0h4v4z',
      'M10 0h4v4z',
    ])
  })

  it('re-bases a relative moveto on the point the previous subpath ended on', () => {
    // `m20 0` after a *closed* subpath means "20 right of that subpath's own
    // start point" — the z put the pen back on it.
    expect(splitIntoSubpaths('M0 0h10v10z m20 0h4v4z')).toEqual([
      'M0 0h10v10z',
      'M20 0h4v4z',
    ])
  })

  it('uses the current point when the previous subpath was left open', () => {
    // The pen stays on (15,15) after `l5 5`, so `m3 3` lands on (18,18).
    expect(splitIntoSubpaths('M10 10l5 5m3 3h4')).toEqual([
      'M10 10l5 5',
      'M18 18h4',
    ])
  })

  it('reads compact numbers, decimals and the pen after a curve', () => {
    // `c1 1 2 2 3 3` leaves the pen on (4,4), so `m-1-6.44` lands on (3,-2.44).
    expect(
      splitIntoSubpaths('M1 1c1 1 2 2 3 3m-1-6.44a.3.3 0 010 0h2')
    ).toEqual(['M1 1c1 1 2 2 3 3', 'M3 -2.44a.3.3 0 010 0h2'])
  })

  it('leaves a single-subpath path alone', () => {
    expect(splitIntoSubpaths('M4 4h16v16H4z')).toEqual(['M4 4h16v16H4z'])
  })

  it('correctly tracks pen position across chained curves with multiple coordinate pairs', () => {
    // c has 2 curves: curve 1 (1 1 2 2 3 3) -> pen (4,4), curve 2 (1 1 2 2 2 2) -> pen (6,6)
    // m1 1 lands on (7,7)
    expect(splitIntoSubpaths('M1 1c1 1 2 2 3 3 1 1 2 2 2 2m1 1h2')).toEqual([
      'M1 1c1 1 2 2 3 3 1 1 2 2 2 2',
      'M7 7h2',
    ])
  })
})
