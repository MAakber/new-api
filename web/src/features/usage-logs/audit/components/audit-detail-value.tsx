import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { cn } from '@/lib/utils'

export function AuditDetailValue(props: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className='flex min-w-0 items-start gap-1 text-xs'>
      <span
        className={cn(
          'min-w-0 flex-1 leading-5 wrap-anywhere break-normal whitespace-pre-wrap',
          props.mono && 'font-mono'
        )}
      >
        {props.value}
      </span>
      {(props.copyable || props.value.length > 48) && (
        <CopyButton
          value={props.value}
          className='size-5'
          iconClassName='size-3'
          aria-label={t('Copy {{field}}', { field: props.label })}
        />
      )}
    </div>
  )
}
