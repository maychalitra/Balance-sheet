import { describe, expect, it } from 'vitest'
import { RECOMMENDED_ALLOCATION } from '../constants'
import type { Transaction } from '../types'
import { buildMonthStory, calculateTotals, parseEurosToCents, smartTip, splitCents } from './money'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'move-1',
    date: '2026-01-05',
    type: 'income',
    amountCents: 1000,
    originalCurrency: 'EUR',
    originalAmountCents: 1000,
    exchangeRateToEur: 1,
    exchangeRateDate: '2026-01-05',
    category: 'Allowance',
    note: '',
    createdAt: '2026-01-05T12:00:00.000Z',
    updatedAt: '2026-01-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('euro parsing and allocation', () => {
  it('parses only values with at most two decimal places', () => {
    expect(parseEurosToCents('10')).toBe(1000)
    expect(parseEurosToCents('10.4')).toBe(1040)
    expect(parseEurosToCents('10,45')).toBe(1045)
    expect(parseEurosToCents('10.456')).toBeNull()
    expect(parseEurosToCents('-1')).toBeNull()
  })

  it('always distributes every cent exactly once', () => {
    for (const amount of [1, 2, 3, 7, 11, 999, 1001]) {
      const split = splitCents(amount, RECOMMENDED_ALLOCATION)
      expect(Object.values(split).reduce((sum, value) => sum + value, 0)).toBe(amount)
    }
    expect(splitCents(1000, RECOMMENDED_ALLOCATION)).toEqual({
      investment: 200,
      goal: 300,
      planned: 300,
      fun: 100,
      giving: 100,
    })
  })
})

describe('totals and smart notes', () => {
  it('calculates income, expenses, and balance in cents', () => {
    const transactions = [
      transaction(),
      transaction({ id: 'move-2', type: 'expense', category: 'Fun', amountCents: 275 }),
    ]
    expect(calculateTotals(transactions)).toEqual({ incomeCents: 1000, expenseCents: 275, balanceCents: 725 })
  })

  it('uses the converted EUR cents rather than the original foreign amount', () => {
    const thaiBahtExpense = transaction({
      type: 'expense',
      category: 'Food & Drink',
      amountCents: 263,
      originalCurrency: 'THB',
      originalAmountCents: 10_000,
      exchangeRateToEur: 0.02626,
    })
    expect(calculateTotals([thaiBahtExpense])).toEqual({ incomeCents: 0, expenseCents: 263, balanceCents: -263 })
  })

  it('prioritizes the overspending warning', () => {
    const transactions = [transaction({ type: 'expense', category: 'Fun', amountCents: 1100 })]
    const totals = calculateTotals(transactions)
    expect(smartTip(transactions, totals, '', 0, RECOMMENDED_ALLOCATION)).toContain('spending is bigger')
  })
})

describe('monthly story', () => {
  it('carries the prior balance across a year boundary', () => {
    const transactions = [
      transaction({ id: 'dec-income', date: '2025-12-31', amountCents: 2500 }),
      transaction({ id: 'jan-expense', date: '2026-01-02', type: 'expense', category: 'Food & Drink', amountCents: 400 }),
      transaction({ id: 'jan-income', date: '2026-01-31', amountCents: 900 }),
    ]
    const story = buildMonthStory(transactions, new Date(2026, 0, 1))
    expect(story.startingBalanceCents).toBe(2500)
    expect(story.incomeCents).toBe(900)
    expect(story.expenseCents).toBe(400)
    expect(story.endingBalanceCents).toBe(3000)
    expect(story.weeks.at(-1)?.closingBalanceCents).toBe(3000)
  })
})
