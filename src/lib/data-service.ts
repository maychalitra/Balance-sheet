import type { PostgrestError } from '@supabase/supabase-js'
import { RECOMMENDED_ALLOCATION } from '../constants'
import type { Allocation, MoneyMap, Transaction, TransactionDraft } from '../types'
import type { BackupV1 } from './backup'
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
  updated_at: string
}

interface TransactionRow {
  user_id: string
  id: string
  transaction_date: string
  type: 'income' | 'expense'
  amount_cents: number
  category: string
  note: string
  created_at: string
  updated_at: string
}

function dataError(error: PostgrestError | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

function mapTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.transaction_date,
    type: row.type,
    amountCents: Number(row.amount_cents),
    category: row.category,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
    goal: {
      name: settings.goal_name,
      targetCents: Number(settings.goal_target_cents),
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
    goal: { name: '', targetCents: 0 },
    transactions: [],
    updatedAt: new Date(0).toISOString(),
  }
}
