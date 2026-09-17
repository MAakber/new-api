export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface PasskeyStatus {
  enabled: boolean
  count?: number
  last_used_at?: string | null
  backup_eligible?: boolean
  backup_state?: boolean
  [key: string]: unknown
}

export interface PasskeyCredentialSummary {
  id: number
  display_name: string
  created_at: string
  last_used_at?: string | null
  attachment?: string
  transports?: string[]
  backup_eligible: boolean
  backup_state: boolean
}

export interface PasskeyCredentialList {
  credentials: PasskeyCredentialSummary[]
  count: number
}

export interface PasskeyOptionsPayload {
  options?: unknown
  flow_token?: string
  expires_at?: number
  publicKey?: unknown
  response?: unknown
  Response?: unknown
}
