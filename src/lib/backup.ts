import { ALLOCATION_KEYS, type Allocation, type MoneyMap, type TransactionType } from '../types'
import {
  ALLOCATION_LABELS,
  BACKUP_VERSION,
  CATEGORY_OPTIONS,
  MAX_AMOUNT_CENTS,
  MAX_TRANSACTIONS,
} from '../constants'
import { allocationTotal, isValidISODate, todayISO } from './money'

export interface BackupTransactionV1 {
  id: string
  date: string
  type: TransactionType
  amount: number
  category: string
  note: string
  createdAt: number
}

export interface BackupV1 {
  version: 1
  currency: 'EUR'
  allocation: Allocation
  goal: { name: string; targetAmount: number }
  transactions: BackupTransactionV1[]
}

export type BackupValidation = { ok: true; data: BackupV1 } | { ok: false; error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
}

export function validateBackup(candidate: unknown): BackupValidation {
  if (!isObject(candidate)) return { ok: false, error: 'The backup must contain one data object.' }
  if (candidate.version !== BACKUP_VERSION) return { ok: false, error: 'This backup version is not supported.' }
  if (candidate.currency !== 'EUR') return { ok: false, error: 'This tracker only supports EUR backups.' }
  if (!isObject(candidate.allocation)) return { ok: false, error: 'The five-part money plan is missing.' }

  const allocation = {} as Allocation
  for (const key of ALLOCATION_KEYS) {
    const value = candidate.allocation[key]
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100) {
      return { ok: false, error: `The ${ALLOCATION_LABELS[key]} percentage is invalid.` }
    }
    allocation[key] = value as number
  }
  if (allocationTotal(allocation) !== 100) return { ok: false, error: 'The five percentages must add up to 100%.' }

  if (!isObject(candidate.goal)) return { ok: false, error: 'The big goal details are missing.' }
  if (typeof candidate.goal.name !== 'string') return { ok: false, error: 'The big goal name is invalid.' }
  const goalName = candidate.goal.name.trim()
  const targetAmount = candidate.goal.targetAmount
  if (
    goalName.length > 60 ||
    typeof targetAmount !== 'number' ||
    !Number.isFinite(targetAmount) ||
    targetAmount < 0 ||
    targetAmount * 100 > MAX_AMOUNT_CENTS ||
    !hasAtMostTwoDecimals(targetAmount)
  ) {
    return { ok: false, error: 'The big goal details are invalid.' }
  }

  if (!Array.isArray(candidate.transactions) || candidate.transactions.length > MAX_TRANSACTIONS) {
    return { ok: false, error: 'The transaction list is invalid or too large.' }
  }

  const ids = new Set<string>()
  const transactions: BackupTransactionV1[] = []
  for (let index = 0; index < candidate.transactions.length; index += 1) {
    const item = candidate.transactions[index]
    const position = index + 1
    if (!isObject(item)) return { ok: false, error: `Money move ${position} is invalid.` }
    if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 120 || ids.has(item.id)) {
      return { ok: false, error: `Money move ${position} has an invalid or repeated ID.` }
    }
    if (!isValidISODate(item.date) || item.date > todayISO()) {
      return { ok: false, error: `Money move ${position} has an invalid or future date.` }
    }
    if (item.type !== 'income' && item.type !== 'expense') {
      return { ok: false, error: `Money move ${position} has an invalid type.` }
    }
    if (
      typeof item.amount !== 'number' ||
      !Number.isFinite(item.amount) ||
      item.amount <= 0 ||
      item.amount * 100 > MAX_AMOUNT_CENTS ||
      !hasAtMostTwoDecimals(item.amount)
    ) {
      return { ok: false, error: `Money move ${position} has an invalid amount.` }
    }
    if (typeof item.category !== 'string' || !CATEGORY_OPTIONS[item.type].includes(item.category)) {
      return { ok: false, error: `Money move ${position} has an unknown category.` }
    }
    if (typeof item.note !== 'string' || item.note.length > 120) {
      return { ok: false, error: `Money move ${position} has an invalid note.` }
    }
    if (typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt) || item.createdAt <= 0) {
      return { ok: false, error: `Money move ${position} has an invalid creation time.` }
    }
    ids.add(item.id)
    transactions.push({
      id: item.id,
      date: item.date,
      type: item.type,
      amount: Math.round(item.amount * 100) / 100,
      category: item.category,
      note: item.note.trim(),
      createdAt: item.createdAt,
    })
  }

  return {
    ok: true,
    data: {
      version: 1,
      currency: 'EUR',
      allocation,
      goal: { name: goalName, targetAmount: Math.round(targetAmount * 100) / 100 },
      transactions,
    },
  }
}

export function createBackup(moneyMap: MoneyMap): BackupV1 {
  return {
    version: 1,
    currency: 'EUR',
    allocation: { ...moneyMap.allocation },
    goal: {
      name: moneyMap.goal.name,
      targetAmount: moneyMap.goal.targetCents / 100,
    },
    transactions: moneyMap.transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amountCents / 100,
      category: transaction.category,
      note: transaction.note,
      createdAt: new Date(transaction.createdAt).getTime(),
    })),
  }
}
