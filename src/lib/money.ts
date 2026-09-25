import { ALLOCATION_KEYS, type Allocation, type MonthStory, type Totals, type Transaction } from '../types'

const euroFormatter = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const compactNumberFormatter = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })

export function todayISO(): string {
  return dateToISO(new Date())
}

export function dateToISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function parseEurosToCents(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmed)) return null
  const normalized = trimmed.replace(',', '.')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function formatMoney(cents: number): string {
  return euroFormatter.format(cents / 100)
}

export function formatCompactMoney(cents: number): string {
  const sign = cents < 0 ? '−' : ''
  const absoluteEuros = Math.abs(cents) / 100
  if (absoluteEuros < 1000) {
    return `${sign}€${absoluteEuros.toFixed(Number.isInteger(absoluteEuros) ? 0 : 2)}`
  }
  return `${sign}€${compactNumberFormatter.format(absoluteEuros)}`
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return dateFormatter.format(new Date(year, month - 1, day))
}

export function allocationTotal(allocation: Allocation): number {
  return ALLOCATION_KEYS.reduce((sum, key) => sum + allocation[key], 0)
}

export function splitCents(amountCents: number, allocation: Allocation): Record<(typeof ALLOCATION_KEYS)[number], number> {
  const safeCents = Math.max(0, Math.round(amountCents))
  const parts = ALLOCATION_KEYS.map((key, index) => {
    const weighted = safeCents * allocation[key]
    return { key, index, cents: Math.floor(weighted / 100), remainder: weighted % 100 }
  })
  let remaining = safeCents - parts.reduce((sum, part) => sum + part.cents, 0)
  const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let index = 0; index < remaining; index += 1) {
    byRemainder[index % byRemainder.length].cents += 1
  }
  return Object.fromEntries(parts.map((part) => [part.key, part.cents])) as Record<(typeof ALLOCATION_KEYS)[number], number>
}

export function calculateTotals(transactions: Transaction[]): Totals {
  return transactions.reduce<Totals>((totals, transaction) => {
    if (transaction.type === 'income') totals.incomeCents += transaction.amountCents
    else totals.expenseCents += transaction.amountCents
    totals.balanceCents = totals.incomeCents - totals.expenseCents
    return totals
  }, { incomeCents: 0, expenseCents: 0, balanceCents: 0 })
}

export function buildAllowanceYear(transactions: Transaction[], year: number) {
  const months = Array.from({ length: 12 }, () => 0)
  const yearPrefix = `${year}-`

  for (const transaction of transactions) {
    if (transaction.type !== 'income' || transaction.category !== 'Allowance' || !transaction.date.startsWith(yearPrefix)) continue
    const month = Number(transaction.date.slice(5, 7)) - 1
    if (month >= 0 && month < 12) months[month] += transaction.amountCents
  }

  return {
    year,
    months,
    totalCents: months.reduce((total, amount) => total + amount, 0),
  }
}

export function smartTip(transactions: Transaction[], totals: Totals, goalName: string, goalTargetCents: number, allocation: Allocation): string {
  if (!transactions.length) return 'Hanzo, add your first money move and give every euro a job.'
  if (totals.balanceCents < 0) return 'Your spending is bigger than your income. Pause, check the list, and make a new plan with an adult.'
  const split = splitCents(totals.incomeCents, allocation)
  if (goalTargetCents > 0 && split.goal >= goalTargetCents) {
    return `${goalName || 'Big goal'} is fully planned for — brilliant patience!`
  }
  const funSpent = transactions
    .filter((transaction) => transaction.type === 'expense' && transaction.category === 'Fun')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0)
  if (totals.incomeCents > 0 && funSpent > split.fun) {
    return 'Fun spending is above its guide. That is useful to notice — choose what matters most next time.'
  }
  if (transactions.some((transaction) => transaction.type === 'expense' && transaction.category === 'Giving')) {
    return 'You used some money to help or celebrate someone else. Kind choices count too.'
  }
  if (totals.expenseCents === 0 && totals.incomeCents > 0) return 'Great start! You have a full plan before spending anything.'
  if (totals.incomeCents > 0 && totals.expenseCents <= totals.incomeCents * 0.4) {
    return 'You are keeping more than half of your income. Your future self will be glad.'
  }
  return 'Before buying, ask: Do I want this more than my big goal?'
}

function transactionEffect(transaction: Transaction): number {
  return transaction.type === 'income' ? transaction.amountCents : -transaction.amountCents
}

export function sameMonth(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth()
}

export function buildMonthStory(transactions: Transaction[], storyMonth: Date): MonthStory {
  const year = storyMonth.getFullYear()
  const month = storyMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstISO = dateToISO(new Date(year, month, 1))
  const lastISO = dateToISO(new Date(year, month, daysInMonth))
  const startingBalanceCents = transactions
    .filter((transaction) => transaction.date < firstISO)
    .reduce((sum, transaction) => sum + transactionEffect(transaction), 0)
  const monthTransactions = transactions
    .filter((transaction) => transaction.date >= firstISO && transaction.date <= lastISO)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

  const weeks: MonthStory['weeks'] = []
  let firstDay = 1
  let runningBalanceCents = startingBalanceCents
  while (firstDay <= daysInMonth) {
    const firstDate = new Date(year, month, firstDay)
    const mondayBasedDay = (firstDate.getDay() + 6) % 7
    const lastDay = Math.min(daysInMonth, firstDay + (6 - mondayBasedDay))
    const weekFirstISO = dateToISO(new Date(year, month, firstDay))
    const weekLastISO = dateToISO(new Date(year, month, lastDay))
    const weekTransactions = monthTransactions.filter(
      (transaction) => transaction.date >= weekFirstISO && transaction.date <= weekLastISO,
    )
    const incomeCents = weekTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + transaction.amountCents, 0)
    const expenseCents = weekTransactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + transaction.amountCents, 0)
    runningBalanceCents += incomeCents - expenseCents
    weeks.push({
      number: weeks.length + 1,
      firstDay,
      lastDay,
      firstISO: weekFirstISO,
      lastISO: weekLastISO,
      transactions: weekTransactions,
      incomeCents,
      expenseCents,
      closingBalanceCents: runningBalanceCents,
    })
    firstDay = lastDay + 1
  }

  const incomeCents = monthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0)
  const expenseCents = monthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0)

  return {
    year,
    month,
    name: monthFormatter.format(storyMonth),
    firstISO,
    lastISO,
    startingBalanceCents,
    endingBalanceCents: startingBalanceCents + incomeCents - expenseCents,
    incomeCents,
    expenseCents,
    changeCents: incomeCents - expenseCents,
    transactions: monthTransactions,
    weeks,
  }
}
