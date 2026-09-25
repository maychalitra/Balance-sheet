import type { Allocation, AllocationKey, TransactionType } from './types'

export const STORAGE_KEY = 'kidMoneyTracker.v1'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 1024 * 1024
export const MAX_AMOUNT_CENTS = 100_000_000_000
export const MAX_TRANSACTIONS = 10_000

export const RECOMMENDED_ALLOCATION: Allocation = Object.freeze({
  investment: 20,
  goal: 30,
  planned: 30,
  fun: 10,
  giving: 10,
})

export const ALLOCATION_LABELS: Record<AllocationKey, string> = {
  investment: 'Investment',
  goal: 'Big goal',
  planned: 'Planned',
  fun: 'Fun',
  giving: 'Giving',
}

export const CATEGORY_OPTIONS: Record<TransactionType, readonly string[]> = {
  income: ['Allowance', 'Chore', 'Gift', 'Sale', 'Other'],
  expense: ['Food & Drink', 'School', 'Transport', 'Planned Purchase', 'Fun', 'Giving', 'Goal Purchase', 'Other'],
}

export const BUCKET_DETAILS: Record<AllocationKey, { icon: string; name: string; description: string; className: string }> = {
  investment: {
    icon: '🌱',
    name: 'Long-term investment',
    description: 'Grow it for the future with an adult. It can go up or down.',
    className: 'bucket-invest',
  },
  goal: {
    icon: '🎯',
    name: 'Big goal',
    description: 'Save for something that matters to you.',
    className: 'bucket-goal',
  },
  planned: {
    icon: '📝',
    name: 'Planned spending',
    description: 'Think first, then choose what is worth it.',
    className: 'bucket-plan',
  },
  fun: {
    icon: '🎉',
    name: 'Fun now',
    description: 'A little money to enjoy without worry.',
    className: 'bucket-fun',
  },
  giving: {
    icon: '💛',
    name: 'Giving',
    description: 'Help a person or cause you care about.',
    className: 'bucket-give',
  },
}
