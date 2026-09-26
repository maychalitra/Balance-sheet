import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearExchangeRateCache, convertToEurCents, ExchangeRateError, getHistoricalRateToEur } from './exchange-rates'

afterEach(() => {
  clearExchangeRateCache()
  vi.unstubAllGlobals()
})

describe('historical exchange rates', () => {
  it('keeps EUR amounts unchanged without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getHistoricalRateToEur('2026-09-25', 'EUR')).resolves.toEqual({ rateToEur: 1, rateDate: '2026-09-25' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads and caches the returned observation date for a foreign currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: '2026-09-25', base: 'THB', quote: 'EUR', rate: 0.026543219876 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await getHistoricalRateToEur('2026-09-27', 'THB')
    const second = await getHistoricalRateToEur('2026-09-27', 'THB')

    expect(first).toEqual({ rateToEur: 0.0265432199, rateDate: '2026-09-25' })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(convertToEurCents(10_000, first.rateToEur)).toBe(265)
  })

  it('rejects an unexpected response instead of guessing a conversion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: '2026-09-25', base: 'USD', quote: 'GBP', rate: 0.75 }),
    }))
    await expect(getHistoricalRateToEur('2026-09-25', 'USD')).rejects.toBeInstanceOf(ExchangeRateError)
  })
})
