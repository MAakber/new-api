import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { TitledCard } from '@/components/ui/titled-card'

export function PrivacyCard() {
  const { t } = useTranslation()

  return (
    <TitledCard
      title={t('Record IP Address')}
      description={t('Log IP address for usage and error logs')}
      disableHoverEffect
    >
      <Badge variant='secondary'>{t('Enabled')}</Badge>
    </TitledCard>
  )
}
