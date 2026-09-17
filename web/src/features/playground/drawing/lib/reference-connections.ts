import type { Connection } from '@xyflow/react'

import type { DrawingNode } from '../types'
import { getImageModelFamily } from './image-settings'

export function canConnectReference(
  nodes: DrawingNode[],
  connection: Pick<Connection, 'source' | 'target'>
): boolean {
  if (connection.source === connection.target) return false
  const source = nodes.find((node) => node.id === connection.source)
  const target = nodes.find((node) => node.id === connection.target)
  if (
    !source?.data.asset ||
    source.data.status !== 'complete' ||
    !target ||
    target.data.status === 'pending'
  ) {
    return false
  }

  const family = getImageModelFamily(target.data.settings.model)
  const references = target.data.referenceIds || []
  if (
    family === 'dall-e-3' ||
    references.includes(source.id) ||
    references.length >= (family === 'dall-e-2' ? 1 : 16)
  ) {
    return false
  }

  // A reference must not depend on the image it is being attached to.
  const ancestors = [source.id]
  const visited = new Set<string>()
  while (ancestors.length) {
    const id = ancestors.pop()
    if (id === undefined) continue
    if (id === target.id) return false
    if (visited.has(id)) continue
    visited.add(id)
    ancestors.push(
      ...(nodes.find((node) => node.id === id)?.data.referenceIds || [])
    )
  }
  return true
}
