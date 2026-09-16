export type OfficialState =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance'
  | 'unknown'
export type HistoryDays = 30 | 90

export interface OfficialDay {
  date: string
  status: OfficialState
  complete: boolean
  incident_ids: string[]
}

export interface OfficialComponent {
  id: string
  name: string
  status: OfficialState
  availability?: {
    days: HistoryDays
    percent: number
    from: string
    to: string
  }[]
}

export interface OfficialService {
  id: string
  name: string
  kind: 'api' | 'chat' | 'other'
  url: string
  status: OfficialState
  components: OfficialComponent[]
  coverage: { from?: string; to?: string; reason?: string }
  history: OfficialDay[]
}

export interface OfficialIncident {
  id: string
  title: string
  body: string
  url: string
  status: string
  impact: OfficialState
  start_at: string
  end_at?: string
  updated_at: string
  component_ids: string[]
  service_ids?: string[]
  impacts: {
    component_ids: string[]
    service_ids?: string[]
    status: OfficialState
    start_at: string
    end_at?: string
  }[]
}

export interface OfficialProvider {
  id: string
  name: string
  icon: string
  url: string
  sources: string[]
  status: OfficialState
  sync: {
    state: 'live' | 'stale' | 'unavailable' | 'unconfigured'
    checked_at: string
    last_success_at?: string
    error?: string
  }
  services: OfficialService[]
  incidents: OfficialIncident[]
  history: OfficialDay[]
}

export interface OfficialSnapshot {
  days: HistoryDays
  timezone: 'UTC'
  generated_at: string
  providers: OfficialProvider[]
}
