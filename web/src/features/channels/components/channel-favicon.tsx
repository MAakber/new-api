import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getChannelFaviconUrl, parseChannelBaseUrl } from '../lib'

interface ChannelFaviconProps {
  baseUrl: string | null | undefined
}

export function ChannelFavicon(props: ChannelFaviconProps) {
  const { t } = useTranslation()
  const parsedBaseUrl = parseChannelBaseUrl(props.baseUrl)
  const faviconUrl = getChannelFaviconUrl(props.baseUrl)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!parsedBaseUrl || !faviconUrl || failedUrl === faviconUrl) {
    return null
  }

  return (
    <a
      href={parsedBaseUrl.href}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={t('Open in new tab')}
      title={t('Open in new tab')}
      onClick={(event) => event.stopPropagation()}
      className='focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2'
    >
      <img
        src={faviconUrl}
        alt=''
        className='size-4 object-contain'
        loading='lazy'
        decoding='async'
        referrerPolicy='no-referrer'
        onError={() => setFailedUrl(faviconUrl)}
      />
    </a>
  )
}
