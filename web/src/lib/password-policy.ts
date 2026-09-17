import { z } from 'zod'

// Match the backend's Unicode character count without modifying the password.
export const accountPasswordSchema = z.string().refine((password) => {
  const length = [...password].length
  return length >= 8 && length <= 128
}, 'Password must contain between 8 and 128 characters.')
