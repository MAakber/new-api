import { useEffect, useState } from 'react'

import { AvatarImage } from '@/components/ui/avatar'
import { getFreshAuthHeaders } from '@/lib/api'

interface AuthenticatedAvatarImageProps {
  avatarUrl?: string
  alt: string
  className?: string
}

interface AvatarRequestEntry {
  controller: AbortController
  promise: Promise<Blob | null>
  consumers: number
  settled: boolean
}

const avatarRequestCache = new Map<string, AvatarRequestEntry>()

async function loadAvatarBlob(
  avatarUrl: string,
  signal: AbortSignal
): Promise<Blob | null> {
  try {
    const headers = await getFreshAuthHeaders()
    const response = await fetch(avatarUrl, {
      headers,
      credentials: 'include',
      signal,
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) return null

    const blob = await response.blob()
    return blob.size > 0 ? blob : null
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null
    }
    return null
  }
}

function createAvatarRequest(avatarUrl: string): AvatarRequestEntry {
  const controller = new AbortController()
  const entry: AvatarRequestEntry = {
    controller,
    promise: Promise.resolve(null),
    consumers: 0,
    settled: false,
  }
  entry.promise = loadAvatarBlob(avatarUrl, controller.signal).then((blob) => {
    entry.settled = true
    return blob
  })
  return entry
}

function acquireAvatarRequest(avatarUrl: string) {
  let entry = avatarRequestCache.get(avatarUrl)
  if (!entry) {
    entry = createAvatarRequest(avatarUrl)
    avatarRequestCache.set(avatarUrl, entry)
  }

  entry.consumers += 1
  let released = false

  return {
    promise: entry.promise,
    release: () => {
      if (released) return
      released = true
      entry.consumers -= 1
      if (entry.consumers !== 0) return

      entry.controller.abort()
      if (!entry.settled && avatarRequestCache.get(avatarUrl) === entry) {
        avatarRequestCache.delete(avatarUrl)
      }
    },
  }
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

    const request = acquireAvatarRequest(avatarUrl)
    let disposed = false
    let createdUrl: string | null = null
    setObjectUrl(null)

    void request.promise.then((blob) => {
      if (disposed || !blob) return

      try {
        const nextObjectUrl = URL.createObjectURL(blob)
        if (disposed) {
          URL.revokeObjectURL(nextObjectUrl)
          return
        }
        createdUrl = nextObjectUrl
        setObjectUrl(nextObjectUrl)
      } catch {
        return
      }
    })

    return () => {
      disposed = true
      request.release()
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl)
      }
    }
  }, [props.avatarUrl])

  if (!objectUrl) return null
  return (
    <AvatarImage src={objectUrl} alt={props.alt} className={props.className} />
  )
}
