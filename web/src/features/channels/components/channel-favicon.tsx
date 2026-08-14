/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
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
