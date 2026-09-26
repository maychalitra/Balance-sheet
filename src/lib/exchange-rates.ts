import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types'
import { isValidISODate } from './money'

const API_BASE = 'https://api.frankfurter.dev/v2'
const RATE_PRECISION = 10
const rateCache = new Map<string, Promise<HistoricalRate>>()

interface RateResponse {
  date?: unknown
  base?: unknown
  quote?: unknown
  rate?: unknown
}

export interface HistoricalRate {
  rateToEur: number
  rateDate: string
}

export class ExchangeRateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExchangeRateError'
  }
}

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === 'string' && SUPPORTED_CURRENCIES.includes(value as SupportedCurrency)
}

export function normalizeRate(rate: number): number {
  return Number(rate.toFixed(RATE_PRECISION))
}

export function convertToEurCents(originalAmountCents: number, rateToEur: number): number {
  return Math.round(originalAmountCents * normalizeRate(rateToEur))
}

async function requestHistoricalRate(date: string, currency: SupportedCurrency): Promise<HistoricalRate> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`${API_BASE}/rate/${currency.toLowerCase()}/eur?date=${date}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new ExchangeRateError(`No ${currency} rate was found for that date.`)
    const data = await response.json() as RateResponse
    const rate = Number(data.rate)
    const returnedDate = data.date
    if (
      String(data.base).toUpperCase() !== currency
      || String(data.quote).toUpperCase() !== 'EUR'
      || !Number.isFinite(rate)
      || rate <= 0
      || !isValidISODate(returnedDate)
      || returnedDate > date
    ) {
      throw new ExchangeRateError('The exchange-rate service returned an unexpected answer.')
    }
    return { rateToEur: normalizeRate(rate), rateDate: returnedDate }
  } catch (error) {
    if (error instanceof ExchangeRateError) throw error
    throw new ExchangeRateError('The exchange rate could not be loaded. Check the connection and try again.')
  } finally {
    window.clearTimeout(timeout)
  }
}

export function getHistoricalRateToEur(date: string, currency: SupportedCurrency): Promise<HistoricalRate> {
  if (currency === 'EUR') return Promise.resolve({ rateToEur: 1, rateDate: date })
  const key = `${date}:${currency}`
  const cached = rateCache.get(key)
  if (cached) return cached
  const pending = requestHistoricalRate(date, currency).catch((error) => {
    rateCache.delete(key)
    throw error
  })
  rateCache.set(key, pending)
  return pending
}

export function clearExchangeRateCache(): void {
  rateCache.clear()
}
