import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useSubscriptions } from './subscriptions-provider'

export function SubscriptionsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, complianceConfirmed } = useSubscriptions()
  return (
    <div className='flex gap-2'>
      <Button
        size='sm'
        onClick={() => setOpen('create')}
        disabled={!complianceConfirmed}
      >
        <Plus className='h-4 w-4' />
        {t('Create Plan')}
      </Button>
    </div>
  )
}
