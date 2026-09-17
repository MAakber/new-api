import { LinkSquare01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { getPluginWebsite } from '../lib/plugin-website'

export function PluginWebsiteLink(props: { website?: string }) {
  const { t } = useTranslation()
  const website = getPluginWebsite(props.website)
  if (!website) return null

  return (
    <Button
      role='link'
      variant='link'
      size='xs'
      className='h-auto max-w-full justify-start px-0 text-xs whitespace-normal'
      render={<a href={website} target='_blank' rel='noopener noreferrer' />}
    >
      <HugeiconsIcon icon={LinkSquare01Icon} aria-hidden='true' />
      {t('Plugin website')}
    </Button>
  )
}
