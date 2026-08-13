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
import { useEffect, useState } from 'react'

import { AvatarImage } from '@/components/ui/avatar'
import { getFreshAuthHeaders } from '@/lib/api'

interface AuthenticatedAvatarImageProps {
  avatarUrl?: string
  alt: string
  className?: string
}

// Avatar images are private API resources. Fetching them here preserves the
// dashboard Bearer authentication that a browser-managed <img> cannot attach.
export function AuthenticatedAvatarImage(props: AuthenticatedAvatarImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    const avatarUrl = props.avatarUrl
    if (!avatarUrl) {
      setObjectUrl(null)
      return
    }

    const controller = new AbortController()
    let disposed = false
    let createdUrl: string | null = null
    setObjectUrl(null)

    const load = async () => {
      try {
        const headers = await getFreshAuthHeaders()
        const response = await fetch(avatarUrl, {
          headers,
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) return

        const contentType = response.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) return

        const blob = await response.blob()
        if (blob.size === 0) return

        createdUrl = URL.createObjectURL(blob)
        if (disposed) {
          URL.revokeObjectURL(createdUrl)
          return
        }
        setObjectUrl(createdUrl)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    void load()
    return () => {
      disposed = true
      controller.abort()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [props.avatarUrl])

  if (!objectUrl) return null
  return (
    <AvatarImage src={objectUrl} alt={props.alt} className={props.className} />
  )
}
