import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'

export type ConflictItem = {
  channel: string
  model: string
  current: string
  newVal: string
}
type ConflictConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: ConflictItem[]
  onConfirm: () => void
  isLoading?: boolean
  error?: string
  onReload?: () => void
}
export function ConflictConfirmDialog(props: ConflictConfirmDialogProps) {
  const { t } = useTranslation()
  const conflicts = props.conflicts
  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Preview price changes')}
      desc={t('Review and confirm the selected prices.')}
      className='max-h-[90vh] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-4xl'
      confirmText={t('Confirm Changes')}
      isLoading={props.isLoading}
      handleConfirm={props.onConfirm}
      disabled={Boolean(props.error)}
    >
      {props.error && (
        <ErrorState
          description={props.error}
          action={
            <Button variant='outline' onClick={props.onReload}>
              {t('Reload pricing')}
            </Button>
          }
        />
      )}
      <StaticDataTable
        className='max-h-96 overflow-y-auto'
        tableClassName='min-w-[640px]'
        data={conflicts}
        columns={[
          {
            id: 'channel',
            header: t('Price source'),
            cellClassName: 'font-medium',
            cell: (conflict) => conflict.channel,
          },
          {
            id: 'model',
            header: t('Model'),
            cellClassName: 'font-mono text-sm',
            cell: (conflict) => conflict.model,
          },
          {
            id: 'current',
            header: t('Current Billing'),
            cell: (conflict) => (
              <pre className='text-sm whitespace-pre-wrap'>
                {conflict.current}
              </pre>
            ),
          },
          {
            id: 'new',
            header: t('Change To'),
            cell: (conflict) => (
              <pre className='text-sm whitespace-pre-wrap'>
                {conflict.newVal}
              </pre>
            ),
          },
        ]}
      />
    </ConfirmDialog>
  )
}
