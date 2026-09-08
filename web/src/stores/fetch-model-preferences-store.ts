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
