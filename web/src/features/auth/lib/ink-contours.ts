type Point = { x: number; y: number }

// Argument count for each path command.
const PATH_ARGS: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
}

// Path data is authored with a few decimals; this is just enough to absorb
// floating point noise when a moveto is re-based.
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4
}

/**
 * Follows one subpath and reports where the pen ends up. Only the trailing
 * coordinate pair of each command decides that — after `l 1 2 3 4` (two
 * line-tos), `c … x y` or `a … x y` the pen sits on the final pair — and `z`
 * sends it back to where the subpath started.
 */
function endOfSubpath(segment: string, from: Point): Point {
  let point: Point = { ...from }
  let start: Point = { ...from }
  for (const match of segment.matchAll(/([a-df-z])([^a-df-z]*)/gi)) {
    const rawCommand = match[1]
    const rawArgs = match[2]
    const command = rawCommand.toLowerCase()
    if (command === 'z') {
      point = { ...start }
      continue
    }
    const numbers = (
      rawArgs.match(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []
    ).map(Number)
    const arity = PATH_ARGS[command] ?? 2
    if (numbers.length < arity) continue
    const relative = rawCommand !== rawCommand.toUpperCase()

    for (let i = 0; i + arity <= numbers.length; i += arity) {
      const chunk = numbers.slice(i, i + arity)
      if (command === 'h') {
        const x = chunk[0]
        point = { x: relative ? point.x + x : x, y: point.y }
      } else if (command === 'v') {
        const y = chunk[0]
        point = { x: point.x, y: relative ? point.y + y : y }
      } else if (command === 'm') {
        const isFirst = i === 0
        point = {
          x: relative ? point.x + chunk[0] : chunk[0],
          y: relative ? point.y + chunk[1] : chunk[1],
        }
        if (isFirst) start = { ...point }
      } else {
        const endX = chunk.at(-2) ?? 0
        const endY = chunk.at(-1) ?? 0
        point = {
          x: relative ? point.x + endX : endX,
          y: relative ? point.y + endY : endY,
        }
      }
    }
  }
  return point
}

/**
 * Splits a path's `d` into one string per subpath, turning a relative moveto
 * into an absolute one on the way. A subpath lifted into its own element would
 * otherwise be re-based on the origin instead of on the pen position it was
 * written against, and the icon would come apart into a collage of its own
 * pieces. Everything after the corrected moveto is left exactly as written,
 * because relative commands are relative to that point anyway.
 */
export function splitIntoSubpaths(d: string): string[] {
  const pieces: string[] = []
  let pen: Point = { x: 0, y: 0 }
  const segments = d
    .split(/(?=[Mm])/)
    .map((part) => part.trim())
    .filter(Boolean)
  for (const segment of segments) {
    let piece = segment
    if (segment.startsWith('m')) {
      const args = /^m([^a-df-zA-DF-Z]*)/.exec(segment)?.[1] ?? ''
      const numbers = (
        args.match(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []
      ).map(Number)
      if (numbers.length >= 2) {
        // Rounding keeps the emitted `d` readable: floating point would turn
        // `4 - 6.44` into `-2.4400000000000004`.
        const x = round(pen.x + numbers[0])
        const y = round(pen.y + numbers[1])
        piece = `M${x} ${y}${segment.slice(1 + args.length)}`
      }
    }
    pieces.push(piece)
    pen = endOfSubpath(piece, pen)
  }
  return pieces
}
