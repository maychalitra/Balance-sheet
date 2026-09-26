export const ALLOCATION_KEYS = ['investment', 'goal', 'planned', 'fun', 'giving'] as const
export const BACKGROUND_THEMES = ['mint', 'sky', 'sunny', 'peach', 'lilac'] as const
export const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'THB', 'CHF', 'JPY', 'CAD', 'AUD', 'CNY', 'HKD',
  'SGD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'INR',
  'KRW', 'NZD',
] as const

export type AllocationKey = (typeof ALLOCATION_KEYS)[number]
export type BackgroundTheme = (typeof BACKGROUND_THEMES)[number]
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export type TransactionType = 'income' | 'expense'

export interface Allocation {
  investment: number
  goal: number
  planned: number
  fun: number
  giving: number
}

export type BucketWishes = Record<AllocationKey, string>

export interface Goal {
  name: string
  targetCents: number
}

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amountCents: number
  originalCurrency: SupportedCurrency
  originalAmountCents: number
  exchangeRateToEur: number
  exchangeRateDate: string
  category: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface MoneyMap {
  allocation: Allocation
  backgroundTheme: BackgroundTheme
  goal: Goal
  wishes: BucketWishes
  transactions: Transaction[]
  updatedAt: string
}

export interface TransactionDraft {
  id?: string
  date: string
  type: TransactionType
  amountCents: number
  originalCurrency: SupportedCurrency
  originalAmountCents: number
  exchangeRateToEur: number
  exchangeRateDate: string
  category: string
  note: string
  createdAt?: string
}

export interface Totals {
  incomeCents: number
  expenseCents: number
  balanceCents: number
}

export interface WeekStory {
  number: number
  firstDay: number
  lastDay: number
  firstISO: string
  lastISO: string
  transactions: Transaction[]
  incomeCents: number
  expenseCents: number
  closingBalanceCents: number
}

export interface MonthStory {
  year: number
  month: number
  name: string
  firstISO: string
  lastISO: string
  startingBalanceCents: number
  endingBalanceCents: number
  incomeCents: number
  expenseCents: number
  changeCents: number
  transactions: Transaction[]
  weeks: WeekStory[]
}
