interface TaskMobileSummaryField {
  id: string
  label: string
  primaryOnly?: boolean
}

export const TASK_MOBILE_SUMMARY_FIELDS: readonly TaskMobileSummaryField[] = [
  { id: 'submit_time', label: 'Submit Time' },
  { id: 'user', label: 'User', primaryOnly: true },
  { id: 'plugin', label: 'Plugin' },
  { id: 'channel_id', label: 'Channel', primaryOnly: true },
  { id: 'duration', label: 'Duration', primaryOnly: true },
  { id: 'progress', label: 'Progress' },
  { id: 'artifacts', label: 'Artifacts' },
]
