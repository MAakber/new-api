import { createContext } from 'react'

export const ImageRetryContext = createContext<
  ((nodeId: string) => boolean) | null
>(null)
