import { describe, expect, it } from 'vitest'
import { createBackup, validateBackup, type BackupV1 } from './backup'
import type { MoneyMap } from '../types'

const validBackup: BackupV1 = {
  version: 1,
  currency: 'EUR',
  allocation: { investment: 20, goal: 30, planned: 30, fun: 10, giving: 10 },
  goal: { name: 'Bicycle', targetAmount: 250 },
  transactions: [
    {
      id: 'd230911e-98ab-4c85-9179-a38d65433f78',
      date: '2026-01-05',
      type: 'income',
      amount: 10,
      category: 'Allowance',
      note: 'January',
      createdAt: 1767614400000,
    },
  ],
}

describe('backup validation', () => {
  it('accepts a valid version 1 backup', () => {
    expect(validateBackup(validBackup)).toEqual({ ok: true, data: validBackup })
  })

  it('rejects duplicate transaction IDs without returning partial data', () => {
    const duplicate = { ...validBackup, transactions: [validBackup.transactions[0], { ...validBackup.transactions[0] }] }
    const result = validateBackup(duplicate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('repeated ID')
  })

  it('rejects incompatible currency and allocation totals', () => {
    expect(validateBackup({ ...validBackup, currency: 'USD' }).ok).toBe(false)
    expect(validateBackup({ ...validBackup, allocation: { ...validBackup.allocation, giving: 9 } }).ok).toBe(false)
  })

  it('rejects backups above the 10,000 transaction limit', () => {
    const oversized = {
      ...validBackup,
      transactions: Array.from({ length: 10_001 }, (_, index) => ({
        ...validBackup.transactions[0],
        id: `move-${index}`,
      })),
    }
    const result = validateBackup(oversized)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('too large')
  })
})

describe('backup export', () => {
  it('converts integer cents and timestamps to the version 1 contract', () => {
    const moneyMap: MoneyMap = {
      allocation: validBackup.allocation,
      goal: { name: 'Bicycle', targetCents: 25000 },
      updatedAt: '2026-01-05T12:00:00.000Z',
      transactions: [{
        id: validBackup.transactions[0].id,
        date: '2026-01-05',
        type: 'income',
        amountCents: 1000,
        category: 'Allowance',
        note: 'January',
        createdAt: '2026-01-05T12:00:00.000Z',
        updatedAt: '2026-01-05T12:00:00.000Z',
      }],
    }
    const exported = createBackup(moneyMap)
    expect(exported.goal.targetAmount).toBe(250)
    expect(exported.transactions[0].amount).toBe(10)
    expect(exported.transactions[0].createdAt).toBe(1767614400000)
  })
})
