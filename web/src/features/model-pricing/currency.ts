import { formatPricingNumber } from '@/features/system-settings/models/pricing-format'
import type { CurrencyConfig } from '@/stores/system-config-store'

export type PricingCurrency = {
  label: string
  symbol: string
  exchangeRate: number
}

export const USD_PRICING_CURRENCY: PricingCurrency = {
  label: 'USD',
  symbol: '$',
  exchangeRate: 1,
}

export function getSitePricingCurrency(
  config: CurrencyConfig
): PricingCurrency | null {
  if (config.quotaDisplayType === 'CNY') {
    return { label: 'CNY', symbol: '¥', exchangeRate: config.usdExchangeRate }
  }
  if (config.quotaDisplayType === 'CUSTOM') {
    const symbol = config.customCurrencySymbol?.trim() || '¤'
    return {
      label: symbol,
      symbol,
      exchangeRate: config.customCurrencyExchangeRate,
    }
  }
  return null
}

export function isValidPricingCurrency(
  currency: PricingCurrency | null
): currency is PricingCurrency {
  return (
    currency !== null &&
    Number.isFinite(currency.exchangeRate) &&
    currency.exchangeRate > 0
  )
}

export function formatPricingAmount(
  value: string | number,
  currency = USD_PRICING_CURRENCY
): string {
  if (value === '') return ''
  const amount = Number(value) * currency.exchangeRate
  if (!Number.isFinite(amount)) return '—'
  return `${currency.symbol}${formatPricingNumber(amount)}`
}
