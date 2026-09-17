import { useTranslation } from 'react-i18next'

import { ActivityTimeCell } from '@/components/activity-time-cell'
import dayjs from '@/lib/dayjs'

import type { ApiKey } from '../types'

export { TimestampCell as ApiKeyTimestampCell } from '@/components/activity-time-cell'

export function ApiKeyActivityCell(props: {
  apiKey: ApiKey
  now: number
  layout?: 'rows' | 'columns'
}) {
  const { t } = useTranslation()
  const accessedTime = props.apiKey.accessed_time
  const isStale =
    accessedTime > 0 &&
    accessedTime * 1000 < dayjs(props.now).subtract(3, 'month').valueOf()

  return (
    <ActivityTimeCell
      createdAt={props.apiKey.created_time}
      lastAt={accessedTime}
      lastLabel={t('Last Used')}
      lastClassName={isStale ? 'text-warning' : 'text-muted-foreground'}
      now={props.now}
      layout={props.layout}
    />
  )
}
