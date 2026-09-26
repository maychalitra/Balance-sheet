import type { PostgrestError } from '@supabase/supabase-js'
import { DEFAULT_BACKGROUND_THEME, DEFAULT_BUCKET_WISHES, MAX_WISH_LENGTH, RECOMMENDED_ALLOCATION } from '../constants'
import { BACKGROUND_THEMES, type Allocation, type AllocationKey, type BackgroundTheme, type MoneyMap, type Transaction, type TransactionDraft } from '../types'
import type { BackupV1 } from './backup'
import { isSupportedCurrency } from './exchange-rates'
import { getSupabaseClient } from './supabase'

interface SettingsRow {
  user_id: string
  currency: string
  investment_percent: number
  goal_percent: number
  planned_percent: number
  fun_percent: number
  giving_percent: number
  goal_name: string
  goal_target_cents: number
  background_theme?: string
  investment_wish?: string
  goal_wish?: string
  planned_wish?: string
  fun_wish?: string
  giving_wish?: string
  updated_at: string
}

interface TransactionRow {
  user_id: string
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  amount_cents: number
  original_currency?: string | null
  original_amount_cents?: number | null
  exchange_rate_to_eur?: number | string | null
  exchange_rate_date?: string | null
  category: string
  note: string
  created_at: string
  updated_at: string
}

function dataError(error: PostgrestError | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

function mapTransaction(row: TransactionRow): Transaction {
  const originalCurrency = isSupportedCurrency(row.original_currency) ? row.original_currency : 'EUR'
  return {
    id: row.id,
    date: row.transaction_date,
    type: row.type,
    amountCents: Number(row.amount_cents),
    originalCurrency,
    originalAmountCents: Number(row.original_amount_cents ?? row.amount_cents),
    exchangeRateToEur: Number(row.exchange_rate_to_eur ?? 1),
    exchangeRateDate: row.exchange_rate_date ?? row.transaction_date,
    category: row.category,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBackgroundTheme(value: unknown): BackgroundTheme {
  return typeof value === 'string' && BACKGROUND_THEMES.includes(value as BackgroundTheme)
    ? value as BackgroundTheme
    : DEFAULT_BACKGROUND_THEME
}

async function ensureSettings(userId: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('money_map_settings').upsert(
    { user_id: userId },
    { onConflict: 'user_id', ignoreDuplicates: true },
  )
  dataError(error, 'The family money map could not be prepared.')
}

export async function loadMoneyMap(userId: string): Promise<MoneyMap> {
  const client = getSupabaseClient()
  await ensureSettings(userId)
  const [settingsResult, transactionResult] = await Promise.all([
    client.from('money_map_settings').select('*').eq('user_id', userId).single(),
    client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])
  dataError(settingsResult.error, 'The plan settings could not be loaded.')
  dataError(transactionResult.error, 'The money moves could not be loaded.')
  const settings = settingsResult.data as SettingsRow
  return {
    allocation: {
      investment: settings.investment_percent,
      goal: settings.goal_percent,
      planned: settings.planned_percent,
      fun: settings.fun_percent,
      giving: settings.giving_percent,
    },
    backgroundTheme: mapBackgroundTheme(settings.background_theme),
    goal: {
      name: settings.goal_name,
      targetCents: Number(settings.goal_target_cents),
    },
    wishes: {
      investment: settings.investment_wish ?? '',
      goal: settings.goal_wish ?? '',
      planned: settings.planned_wish ?? '',
      fun: settings.fun_wish ?? '',
      giving: settings.giving_wish ?? '',
    },
    updatedAt: settings.updated_at,
    transactions: ((transactionResult.data ?? []) as TransactionRow[]).map(mapTransaction),
  }
}

export const refreshMoneyMap = loadMoneyMap

export async function createTransaction(userId: string, draft: TransactionDraft): Promise<Transaction> {
  const client = getSupabaseClient()
  const now = new Date().toISOString()
  const id = draft.id ?? (globalThis.crypto?.randomUUID?.() || `move-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const { data, error } = await client
    .from('transactions')
    .insert({
      user_id: userId,
      id,
      transaction_date: draft.date,
      type: draft.type,
      amount_cents: draft.amountCents,
      original_currency: draft.originalCurrency,
      original_amount_cents: draft.originalAmountCents,
      exchange_rate_to_eur: draft.exchangeRateToEur,
      exchange_rate_date: draft.exchangeRateDate,
      category: draft.category,
      note: draft.note,
      created_at: draft.createdAt ?? now,
      updated_at: now,
    })
    .select('*')
    .single()
  dataError(error, 'The money move could not be saved.')
  return mapTransaction(data as TransactionRow)
}

export async function updateTransaction(userId: string, id: string, draft: TransactionDraft): Promise<Transaction> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('transactions')
    .update({
      transaction_date: draft.date,
      type: draft.type,
      amount_cents: draft.amountCents,
      original_currency: draft.originalCurrency,
      original_amount_cents: draft.originalAmountCents,
      exchange_rate_to_eur: draft.exchangeRateToEur,
      exchange_rate_date: draft.exchangeRateDate,
      category: draft.category,
      note: draft.note,
    })
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .single()
  dataError(error, 'The money move could not be updated.')
  return mapTransaction(data as TransactionRow)
}

export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.from('transactions').delete().eq('user_id', userId).eq('id', id)
  dataError(error, 'The money move could not be deleted.')
}

export async function updateSettings(
  userId: string,
  allocation: Allocation,
  goal: { name: string; targetCents: number },
): Promise<MoneyMap> {
  const client = getSupabaseClient()
  const { error } = await client.from('money_map_settings').upsert({
    user_id: userId,
    currency: 'EUR',
    investment_percent: allocation.investment,
    goal_percent: allocation.goal,
    planned_percent: allocation.planned,
    fun_percent: allocation.fun,
    giving_percent: allocation.giving,
    goal_name: goal.name,
    goal_target_cents: goal.targetCents,
  })
  dataError(error, 'The money plan could not be saved.')
  return loadMoneyMap(userId)
}

export async function updateBackgroundTheme(userId: string, backgroundTheme: BackgroundTheme): Promise<MoneyMap> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('money_map_settings')
    .update({ background_theme: backgroundTheme })
    .eq('user_id', userId)
  dataError(error, 'The background color could not be saved.')
  return loadMoneyMap(userId)
}

const WISH_COLUMNS: Record<AllocationKey, string> = {
  investment: 'investment_wish',
  goal: 'goal_wish',
  planned: 'planned_wish',
  fun: 'fun_wish',
  giving: 'giving_wish',
}

export async function updateBucketWish(userId: string, key: AllocationKey, wish: string): Promise<MoneyMap> {
  const cleanWish = wish.trim()
  if (cleanWish.length > MAX_WISH_LENGTH) throw new Error(`Keep each wish to ${MAX_WISH_LENGTH} characters or fewer.`)
  const client = getSupabaseClient()
  const { error } = await client
    .from('money_map_settings')
    .update({ [WISH_COLUMNS[key]]: cleanWish })
    .eq('user_id', userId)
  dataError(error, 'The wish could not be saved.')
  return loadMoneyMap(userId)
}

export async function restoreBackup(userId: string, backup: BackupV1): Promise<MoneyMap> {
  const client = getSupabaseClient()
  const { error } = await client.rpc('replace_money_map', { payload: backup })
  dataError(error, 'The backup could not be restored.')
  return loadMoneyMap(userId)
}

export async function resetMoneyMap(userId: string): Promise<MoneyMap> {
  const client = getSupabaseClient()
  const { error } = await client.rpc('reset_money_map')
  dataError(error, 'The money map could not be cleared.')
  return loadMoneyMap(userId)
}

export function defaultMoneyMap(): MoneyMap {
  return {
    allocation: { ...RECOMMENDED_ALLOCATION },
    backgroundTheme: DEFAULT_BACKGROUND_THEME,
    goal: { name: '', targetCents: 0 },
    wishes: { ...DEFAULT_BUCKET_WISHES },
    transactions: [],
    updatedAt: new Date(0).toISOString(),
  }
}
