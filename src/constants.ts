import type { Allocation, AllocationKey, BackgroundTheme, BucketWishes, SupportedCurrency, TransactionType } from './types'

export const STORAGE_KEY = 'kidMoneyTracker.v1'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 1024 * 1024
export const MAX_AMOUNT_CENTS = 100_000_000_000
export const MAX_TRANSACTIONS = 10_000
export const MONTHLY_ALLOWANCE_CENTS = 1_500
export const MAX_WISH_LENGTH = 80
export const DEFAULT_BACKGROUND_THEME: BackgroundTheme = 'mint'

export const DEFAULT_BUCKET_WISHES: BucketWishes = Object.freeze({
  investment: '',
  goal: '',
  planned: '',
  fun: '',
  giving: '',
})

export const BACKGROUND_THEME_OPTIONS: readonly { value: BackgroundTheme; label: string }[] = [
  { value: 'mint', label: 'Mint Meadow' },
  { value: 'sky', label: 'Blue Sky' },
  { value: 'sunny', label: 'Sunny Day' },
  { value: 'peach', label: 'Peach Pop' },
  { value: 'lilac', label: 'Purple Dream' },
]

export const CURRENCY_OPTIONS: readonly { value: SupportedCurrency; label: string }[] = [
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'THB', label: 'THB — Thai baht' },
  { value: 'USD', label: 'USD — US dollar' },
  { value: 'GBP', label: 'GBP — British pound' },
  { value: 'CHF', label: 'CHF — Swiss franc' },
  { value: 'JPY', label: 'JPY — Japanese yen' },
  { value: 'CAD', label: 'CAD — Canadian dollar' },
  { value: 'AUD', label: 'AUD — Australian dollar' },
  { value: 'CNY', label: 'CNY — Chinese yuan' },
  { value: 'HKD', label: 'HKD — Hong Kong dollar' },
  { value: 'SGD', label: 'SGD — Singapore dollar' },
  { value: 'SEK', label: 'SEK — Swedish krona' },
  { value: 'NOK', label: 'NOK — Norwegian krone' },
  { value: 'DKK', label: 'DKK — Danish krone' },
  { value: 'PLN', label: 'PLN — Polish złoty' },
  { value: 'CZK', label: 'CZK — Czech koruna' },
  { value: 'HUF', label: 'HUF — Hungarian forint' },
  { value: 'RON', label: 'RON — Romanian leu' },
  { value: 'TRY', label: 'TRY — Turkish lira' },
  { value: 'INR', label: 'INR — Indian rupee' },
  { value: 'KRW', label: 'KRW — South Korean won' },
  { value: 'NZD', label: 'NZD — New Zealand dollar' },
]

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

export const BUCKET_DETAILS: Record<AllocationKey, { icon: string; name: string; description: string; wishPlaceholder: string; className: string }> = {
  investment: {
    icon: '🌱',
    name: 'Long-term investment',
    description: 'Grow it for the future with an adult. It can go up or down.',
    wishPlaceholder: 'What would you grow money for?',
    className: 'bucket-invest',
  },
  goal: {
    icon: '🎯',
    name: 'Big goal',
    description: 'Save for something that matters to you.',
    wishPlaceholder: 'What big thing do you wish for?',
    className: 'bucket-goal',
  },
  planned: {
    icon: '📝',
    name: 'Planned spending',
    description: 'Think first, then choose what is worth it.',
    wishPlaceholder: 'What would you like to plan for?',
    className: 'bucket-plan',
  },
  fun: {
    icon: '🎉',
    name: 'Fun now',
    description: 'A little money to enjoy without worry.',
    wishPlaceholder: 'What fun thing would you enjoy?',
    className: 'bucket-fun',
  },
  giving: {
    icon: '💛',
    name: 'Giving',
    description: 'Help a person or cause you care about.',
    wishPlaceholder: 'Who or what would you like to help?',
    className: 'bucket-give',
  },
}
