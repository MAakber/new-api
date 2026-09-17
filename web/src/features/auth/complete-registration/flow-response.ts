import type { PendingRegistrationChallenge } from '@/features/auth/types'

export function isPendingRegistrationChallenge(
  value: unknown
): value is PendingRegistrationChallenge {
  if (!value || typeof value !== 'object') return false
  const challenge = value as Partial<PendingRegistrationChallenge>
  return (
    challenge.require_registration_code === true &&
    typeof challenge.flow_token === 'string' &&
    challenge.flow_token.length > 0 &&
    typeof challenge.expires_at === 'number'
  )
}
