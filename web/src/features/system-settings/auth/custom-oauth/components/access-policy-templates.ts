export const ACCESS_POLICY_TEMPLATES = {
  levelAndActive: `{
  "logic": "and",
  "conditions": [
    { "field": "trust_level", "op": "gte", "value": 2 },
    { "field": "active", "op": "eq", "value": true }
  ]
}`,
  orgOrRole: `{
  "logic": "or",
  "conditions": [
    { "field": "org", "op": "eq", "value": "core" },
    { "field": "roles", "op": "contains", "value": "admin" }
  ]
}`,
} as const

export const ACCESS_DENIED_MESSAGE_TEMPLATES = {
  level:
    'Requires level {{required}}; your current level is {{current}} (field: {{field}}).',
  org: 'Access is limited to approved organizations or roles. Organization: {{current.org}}; roles: {{current.roles}}.',
} as const
