export type AutoBanMode = 'observe' | 'enforce'

export type AutoBanRuleConfig = {
  enabled: boolean
  mode: AutoBanMode
  threshold: number
  window_minutes: number
  ban_duration_minutes: number
  response_status: number
  response_message: string
  response_code: string
}

export type AutoBanSensitiveWordViolationResponseConfig = {
  status: number
  code: string
  message: string
}

export type AutoBanConfig = {
  enabled: boolean
  exempt_user_ids: number[]
  exempt_groups: string[]
  exempt_ip_cidrs: string[]
  sensitive_word_violation_response: AutoBanSensitiveWordViolationResponseConfig
  sensitive_words: AutoBanRuleConfig
  user_agent: AutoBanRuleConfig
  excessive_ips: AutoBanRuleConfig
  model_probing: AutoBanRuleConfig
}

export type AutoBanFormValues = Omit<
  AutoBanConfig,
  'exempt_user_ids' | 'exempt_groups' | 'exempt_ip_cidrs'
> & {
  exempt_user_ids_text: string
  exempt_groups_text: string
  exempt_ip_cidrs_text: string
}

export type AutoBanRecord = {
  id: number
  user_id: number
  username: string
  user_group: string
  rule_type: string
  mode: AutoBanMode
  status: 'observed' | 'active' | 'released' | 'expired'
  trigger_count: number
  threshold: number
  window_minutes: number
  ban_duration_minutes: number
  response_status: number
  response_code: string
  response_message: string
  ip: string
  user_agent: string
  evidence: string
  created_at: number
  expires_at: number
  released_at: number
  released_by: number
  release_reason: string
}

const defaultRule = (
  threshold: number,
  windowMinutes: number,
  banDurationMinutes: number
): AutoBanRuleConfig => ({
  enabled: false,
  mode: 'observe',
  threshold,
  window_minutes: windowMinutes,
  ban_duration_minutes: banDurationMinutes,
  response_status: 403,
  response_message:
    'Account temporarily restricted by an automated security rule.',
  response_code: 'account_temporarily_banned',
})

export const DEFAULT_AUTO_BAN_CONFIG: AutoBanConfig = {
  enabled: false,
  exempt_user_ids: [],
  exempt_groups: [],
  exempt_ip_cidrs: [],
  sensitive_word_violation_response: {
    status: 400,
    code: 'sensitive_words_detected',
    message: 'Content policy violation ({count}/{threshold}).',
  },
  sensitive_words: defaultRule(5, 1440, 10080),
  user_agent: defaultRule(3, 10, 10080),
  excessive_ips: defaultRule(10, 1440, 1440),
  model_probing: defaultRule(20, 5, 10080),
}

export const AUTO_BAN_RULE_KEYS = [
  'sensitive_words',
  'user_agent',
  'excessive_ips',
  'model_probing',
] as const

export type AutoBanRuleKey = (typeof AUTO_BAN_RULE_KEYS)[number]

export const AUTO_BAN_RULE_LABELS: Record<AutoBanRuleKey, string> = {
  sensitive_words: 'Repeated sensitive-word violations',
  user_agent: 'Blocked User-Agent attempts',
  excessive_ips: 'Excessive account IP addresses',
  model_probing: 'Bulk model probing',
}

export const AUTO_BAN_RULE_DESCRIPTIONS: Record<AutoBanRuleKey, string> = {
  sensitive_words:
    'Counts requests rejected by the existing sensitive-word detector.',
  user_agent:
    'Counts requests matched by the existing User-Agent regular-expression blacklist.',
  excessive_ips:
    'Counts distinct client IPs per account; IPv6 addresses are grouped by /64.',
  model_probing:
    'Counts distinct model names requested by the same account within the configured window.',
}
