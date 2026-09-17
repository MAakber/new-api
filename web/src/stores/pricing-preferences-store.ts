import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PricingCurrencyPreference = 'USD' | 'site'

type PricingPreferences = {
  currency: PricingCurrencyPreference
  setCurrency: (currency: PricingCurrencyPreference) => void
}

export const usePricingPreferencesStore = create<PricingPreferences>()(
  persist(
    (set) => ({
      currency: 'USD',
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'model-pricing-preferences',
      partialize: (state) => ({ currency: state.currency }),
    }
  )
)
