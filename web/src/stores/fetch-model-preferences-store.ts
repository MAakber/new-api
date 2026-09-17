import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { MODEL_TYPES, type ModelType } from '@/lib/model-classification'

interface FetchModelPreferences {
  types: ModelType[]
  setTypes: (types: readonly ModelType[]) => void
}

export const useFetchModelPreferences = create<FetchModelPreferences>()(
  persist(
    (set) => ({
      types: [],
      setTypes: (types) =>
        set({ types: MODEL_TYPES.filter((type) => types.includes(type)) }),
    }),
    {
      name: 'fetch-models-preferences:v1',
      version: 1,
      partialize: (state) => ({ types: state.types }),
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name)
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value)
          } catch {
            // Filtering still works when browser storage is unavailable.
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name)
          } catch {
            // A browser preference must not block the model picker.
          }
        },
      })),
      merge: (persisted, current) => {
        const saved = persisted as { types?: unknown } | null
        const types = saved?.types
        return {
          ...current,
          types: Array.isArray(types)
            ? MODEL_TYPES.filter((type) => types.includes(type))
            : [],
        }
      },
    }
  )
)
