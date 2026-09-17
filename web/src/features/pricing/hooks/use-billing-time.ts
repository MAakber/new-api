import { useSyncExternalStore } from 'react'

import { compileBillingExpression } from '../lib/billing-expression/parser'
import { TIME_FUNCTIONS } from '../lib/billing-expression/types'

const listeners = new Set<() => void>()
let timestamp = Date.now()
let timer: ReturnType<typeof setTimeout> | undefined

function refreshBillingTime(): void {
  timestamp = Date.now()
  listeners.forEach((listener) => listener())
  if (timer) clearTimeout(timer)
  if (listeners.size > 0 && document.visibilityState !== 'hidden') {
    timer = setTimeout(refreshBillingTime, 60000 - (Date.now() % 60000))
  }
}

function subscribeBillingTime(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', refreshBillingTime)
    refreshBillingTime()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', refreshBillingTime)
    }
  }
}

function getBillingTime(): number {
  return timestamp
}
function subscribeWithoutTime(): () => void {
  return () => {}
}
function getNoTime(): undefined {
  return undefined
}

/** One minute clock for active time-dependent previews; never used by settlement logs. */
export function useBillingTime(
  expression: string | null | undefined,
  enabled = true
): number | undefined {
  const compiled =
    expression && enabled ? compileBillingExpression(expression) : null
  const needsTime =
    compiled?.status === 'ready' &&
    TIME_FUNCTIONS.some((name) => compiled.functions.has(name))
  return useSyncExternalStore(
    needsTime ? subscribeBillingTime : subscribeWithoutTime,
    needsTime ? getBillingTime : getNoTime,
    getNoTime
  )
}
