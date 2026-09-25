import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import {
  ALLOCATION_LABELS,
  BUCKET_DETAILS,
  CATEGORY_OPTIONS,
  MAX_AMOUNT_CENTS,
  MAX_BACKUP_BYTES,
  MONTHLY_ALLOWANCE_CENTS,
  RECOMMENDED_ALLOCATION,
  STORAGE_KEY,
} from './constants'
import { ALLOCATION_KEYS, type Allocation, type MoneyMap, type Transaction, type TransactionDraft, type TransactionType } from './types'
import { createBackup, validateBackup } from './lib/backup'
import {
  createTransaction,
  deleteTransaction,
  loadMoneyMap,
  refreshMoneyMap,
  resetMoneyMap,
  restoreBackup,
  updateSettings,
  updateTransaction,
} from './lib/data-service'
import {
  allocationTotal,
  buildMonthStory,
  calculateTotals,
  centsToInput,
  dateToISO,
  formatCompactMoney,
  formatDate,
  formatMoney,
  isValidISODate,
  parseEurosToCents,
  sameMonth,
  smartTip,
  splitCents,
  todayISO,
} from './lib/money'
import { configurationIssue, getSupabaseClient, supabase } from './lib/supabase'

type ToastState = { message: string; error?: boolean } | null

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /failed to fetch|network|fetch failed|load failed|connection|offline/i.test(message)
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [moneyMap, setMoneyMap] = useState<MoneyMap | null>(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // The old device-only data is intentionally abandoned; a blocked storage API is harmless.
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }
    let active = true
    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (event === 'SIGNED_OUT') {
        setMoneyMap(null)
        setRecoveryMode(false)
      }
      setAuthLoading(false)
    })
    void supabase.auth.getSession().then(({ data: current, error }) => {
      if (!active) return
      if (error) setLoadError(error.message)
      setSession(current.session)
      setAuthLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const fetchMap = useCallback(async (userId: string, manual = false) => {
    setMapLoading(true)
    setLoadError('')
    try {
      const next = manual ? await refreshMoneyMap(userId) : await loadMoneyMap(userId)
      setMoneyMap(next)
      return next
    } catch (error) {
      setLoadError(errorMessage(error, 'The family money map could not be loaded.'))
      throw error
    } finally {
      setMapLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session || recoveryMode) return
    let active = true
    setMapLoading(true)
    setLoadError('')
    void loadMoneyMap(session.user.id)
      .then((next) => {
        if (active) setMoneyMap(next)
      })
      .catch((error) => {
        if (active) setLoadError(errorMessage(error, 'The family money map could not be loaded.'))
      })
      .finally(() => {
        if (active) setMapLoading(false)
      })
    return () => {
      active = false
    }
  }, [session?.user.id, recoveryMode])

  if (configurationIssue) return <ConfigurationScreen message={configurationIssue} />
  if (authLoading) return <LoadingScreen message="Checking the family account…" />
  if (recoveryMode && session) return <PasswordRecovery onComplete={() => setRecoveryMode(false)} />
  if (!session) return <AuthScreen />
  if (mapLoading && !moneyMap) return <LoadingScreen message="Opening Hanzo's money map…" />
  if (!moneyMap) {
    return (
      <UnavailableScreen
        message={loadError || 'The family money map is unavailable.'}
        onRetry={() => void fetchMap(session.user.id).catch(() => undefined)}
        onSignOut={() => void getSupabaseClient().auth.signOut()}
        busy={mapLoading}
      />
    )
  }

  return (
    <Dashboard
      userId={session.user.id}
      email={session.user.email ?? 'Family account'}
      moneyMap={moneyMap}
      setMoneyMap={setMoneyMap}
      refresh={async () => fetchMap(session.user.id, true)}
      signOut={async () => {
        const { error } = await getSupabaseClient().auth.signOut()
        if (error) throw error
      }}
      initialConnectionIssue={loadError}
    />
  )
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">🧭</div>
      <div>
        <p>Hanzo's balance sheet</p>
        <h1>Hanzo's Money Map</h1>
      </div>
    </div>
  )
}

function ConfigurationScreen({ message }: { message: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="configuration-title">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">Setup needed</p>
          <h2 id="configuration-title">Connect the family database</h2>
          <p>{message}</p>
        </div>
        <div className="form-error" role="alert">
          Copy <strong>.env.example</strong> to <strong>.env.local</strong>, add the two Supabase values, and restart the development server.
        </div>
      </section>
    </main>
  )
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="loading-screen" aria-live="polite">
      <div className="loading-card">
        <div className="loading-mark" aria-hidden="true">🧭</div>
        <strong>{message}</strong>
      </div>
    </main>
  )
}

function UnavailableScreen({ message, onRetry, onSignOut, busy }: { message: string; onRetry: () => void; onSignOut: () => void; busy: boolean }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="unavailable-title">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">Cloud unavailable</p>
          <h2 id="unavailable-title">The map could not open</h2>
          <p>Your data is still in Supabase. Check the connection and try again.</p>
        </div>
        <div className="form-error" role="alert">{message}</div>
        <div className="form-actions">
          <button className="button button-primary" type="button" onClick={onRetry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>
          <button className="button" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
    </main>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Enter the family account email address.')
      return
    }
    if (mode === 'signin' && !password) {
      setError('Enter the family account password.')
      return
    }
    setBusy(true)
    try {
      const client = getSupabaseClient()
      if (mode === 'signin') {
        const { error: signInError } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
        if (signInError) throw signInError
      } else {
        const { error: resetError } = await client.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: window.location.origin,
        })
        if (resetError) throw resetError
        setMessage('Check the family email for a password reset link.')
      }
    } catch (caught) {
      setError(errorMessage(caught, mode === 'signin' ? 'Sign-in failed.' : 'The reset email could not be sent.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <Brand />
        <div className="auth-copy">
          <p className="eyebrow">Private family account</p>
          <h2 id="auth-title">{mode === 'signin' ? 'Open the money map' : 'Reset the password'}</h2>
          <p>{mode === 'signin' ? 'An adult can sign in to open Hanzo’s saved map.' : 'We’ll send a secure reset link to the family email.'}</p>
        </div>
        <form className="form-stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input className="input" id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
          </div>
          {mode === 'signin' && (
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input className="input" id="auth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          {message && <div className="success-note" role="status">{message}</div>}
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>
          <button className="text-button" type="button" onClick={() => { setMode(mode === 'signin' ? 'forgot' : 'signin'); setError(''); setMessage('') }} disabled={busy}>
            {mode === 'signin' ? 'Forgot the password?' : 'Back to sign in'}
          </button>
        </form>
        <p className="auth-footnote">There is no public sign-up. The family account is created by an adult in Supabase.</p>
      </section>
    </main>
  )
}

function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Use at least 8 characters for the new password.')
      return
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await getSupabaseClient().auth.updateUser({ password })
      if (updateError) throw updateError
      onComplete()
    } catch (caught) {
      setError(errorMessage(caught, 'The password could not be updated.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="recovery-title">
        <Brand />
        <div className="auth-copy"><p className="eyebrow">Password recovery</p><h2 id="recovery-title">Choose a new password</h2></div>
        <form className="form-stack" onSubmit={submit}>
          <div className="field"><label htmlFor="new-password">New password</label><input className="input" id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input className="input" id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
        </form>
      </section>
    </main>
  )
}

interface DashboardProps {
  userId: string
  email: string
  moneyMap: MoneyMap
  setMoneyMap: (next: MoneyMap) => void
  refresh: () => Promise<MoneyMap>
  signOut: () => Promise<void>
  initialConnectionIssue: string
}

function Dashboard({ userId, email, moneyMap, setMoneyMap, refresh, signOut, initialConnectionIssue }: DashboardProps) {
  const [filter, setFilter] = useState<'all' | TransactionType>('all')
  const [storyMonth, setStoryMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [type, setType] = useState<TransactionType>('income')
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [connectionIssue, setConnectionIssue] = useState(initialConnectionIssue)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => calculateTotals(moneyMap.transactions), [moneyMap.transactions])
  const allocationSplit = useMemo(() => splitCents(totals.incomeCents, moneyMap.allocation), [totals.incomeCents, moneyMap.allocation])
  const parsedAmount = parseEurosToCents(amount)
  const previewSplit = type === 'income' && parsedAmount && parsedAmount > 0 ? splitCents(parsedAmount, moneyMap.allocation) : null
  const writeDisabled = Boolean(busy || connectionIssue)

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4300)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function notify(message: string, error = false) {
    setToast({ message, error })
  }

  function markFailure(error: unknown, fallback: string) {
    const message = errorMessage(error, fallback)
    if (isConnectionError(error)) setConnectionIssue(message)
    notify(message, true)
  }

  function resetForm() {
    setEditingId(null)
    setType('income')
    setDate(todayISO())
    setAmount('')
    setCategory('')
    setNote('')
    setFormError('')
  }

  function focusField(id: string) {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0)
  }

  function validateDraft(): TransactionDraft | null {
    if (!isValidISODate(date) || date > todayISO()) {
      setFormError('Choose a real date that is not in the future.')
      focusField('date-input')
      return null
    }
    const amountCents = parseEurosToCents(amount)
    if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      setFormError('Enter an amount from €0.01 to €1,000,000,000.00 with no more than two decimal places.')
      focusField('amount-input')
      return null
    }
    if (!CATEGORY_OPTIONS[type].includes(category)) {
      setFormError('Choose a category that matches this money move.')
      focusField('category-input')
      return null
    }
    if (note.length > 120) {
      setFormError('Keep the note to 120 characters or fewer.')
      focusField('note-input')
      return null
    }
    setFormError('')
    return { date, type, amountCents, category, note: note.trim() }
  }

  async function submitTransaction(event: FormEvent) {
    event.preventDefault()
    if (writeDisabled) return
    const draft = validateDraft()
    if (!draft) return
    setBusy('transaction')
    try {
      if (editingId) {
        const updated = await updateTransaction(userId, editingId, draft)
        setMoneyMap({ ...moneyMap, transactions: moneyMap.transactions.map((item) => item.id === updated.id ? updated : item) })
        notify('Money move updated.')
      } else {
        const created = await createTransaction(userId, draft)
        setMoneyMap({ ...moneyMap, transactions: [created, ...moneyMap.transactions] })
        notify('Money move saved to the family account.')
      }
      resetForm()
    } catch (error) {
      markFailure(error, 'The money move could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  function startEditing(transaction: Transaction) {
    setEditingId(transaction.id)
    setType(transaction.type)
    setDate(transaction.date)
    setAmount(centsToInput(transaction.amountCents))
    setCategory(transaction.category)
    setNote(transaction.note)
    setFormError('')
    document.getElementById('entry-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    focusField('date-input')
  }

  async function removeTransaction(transaction: Transaction) {
    if (writeDisabled) return
    if (!window.confirm(`${transaction.category} for ${formatMoney(transaction.amountCents)} will be removed. Continue?`)) return
    setBusy('delete')
    try {
      await deleteTransaction(userId, transaction.id)
      setMoneyMap({ ...moneyMap, transactions: moneyMap.transactions.filter((item) => item.id !== transaction.id) })
      if (editingId === transaction.id) resetForm()
      notify('Money move deleted.')
    } catch (error) {
      markFailure(error, 'The money move could not be deleted.')
    } finally {
      setBusy(null)
    }
  }

  async function handleRefresh() {
    if (busy) return
    setBusy('refresh')
    try {
      const next = await refresh()
      setMoneyMap(next)
      setConnectionIssue('')
      notify('The latest cloud data is here.')
    } catch (error) {
      setConnectionIssue(errorMessage(error, 'Supabase is unavailable.'))
      notify('The cloud data could not be refreshed.', true)
    } finally {
      setBusy(null)
    }
  }

  async function handleSignOut() {
    if (busy) return
    setBusy('signout')
    try {
      await signOut()
    } catch (error) {
      notify(errorMessage(error, 'Sign-out failed.'), true)
      setBusy(null)
    }
  }

  function exportBackup() {
    const json = JSON.stringify(createBackup(moneyMap), null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `hanzo-money-map-backup-${todayISO()}.json`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notify('Backup downloaded. Keep it somewhere safe.')
  }

  async function importFile(file: File | undefined) {
    if (!file || writeDisabled) return
    if (file.size > MAX_BACKUP_BYTES) {
      notify('That backup is larger than 1 MB.', true)
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const checked = validateBackup(parsed)
      if (!checked.ok) throw new Error(checked.error)
      if (!window.confirm(`This will replace the current map with ${checked.data.transactions.length} saved money moves. Continue?`)) return
      setBusy('restore')
      const next = await restoreBackup(userId, checked.data)
      setMoneyMap(next)
      setConnectionIssue('')
      resetForm()
      notify('Backup restored to the family account.')
    } catch (error) {
      markFailure(error, 'That file is not a valid Hanzo’s Money Map backup.')
    } finally {
      setBusy(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function savePlan(allocation: Allocation, goalName: string, targetCents: number) {
    setBusy('settings')
    try {
      const next = await updateSettings(userId, allocation, { name: goalName, targetCents })
      setMoneyMap(next)
      setConnectionIssue('')
      setSettingsOpen(false)
      notify('Your five-job plan was saved.')
    } catch (error) {
      markFailure(error, 'The money plan could not be saved.')
      throw error
    } finally {
      setBusy(null)
    }
  }

  async function clearEverything() {
    if (writeDisabled) return
    if (!window.confirm('This will delete every money move and reset the plan. This cannot be undone unless you have a backup. Continue?')) return
    setBusy('reset')
    try {
      const next = await resetMoneyMap(userId)
      setMoneyMap(next)
      setConnectionIssue('')
      setSettingsOpen(false)
      resetForm()
      notify('The money map is fresh and ready.')
    } catch (error) {
      markFailure(error, 'The money map could not be cleared.')
    } finally {
      setBusy(null)
    }
  }

  const goalPercent = moneyMap.goal.targetCents > 0
    ? Math.min(100, Math.max(0, allocationSplit.goal / moneyMap.goal.targetCents * 100))
    : 0

  return (
    <>
      <a className="skip-link" href="#main">Skip to money tracker</a>
      <div className="page-shell">
        <header className="topbar">
          <Brand />
          <div className="top-actions" aria-label="Cloud data and settings">
            <button className="button icon-button" type="button" onClick={() => void handleRefresh()} disabled={Boolean(busy)} title="Refresh cloud data">↻ <span>{busy === 'refresh' ? 'Refreshing' : 'Refresh'}</span></button>
            <button className="button icon-button" type="button" onClick={exportBackup} title="Download a backup">↓ <span>Backup</span></button>
            <button className="button icon-button" type="button" onClick={() => fileInput.current?.click()} disabled={writeDisabled} title="Restore from a backup">↑ <span>Restore</span></button>
            <button className="button button-soft icon-button" type="button" onClick={() => setSettingsOpen(true)} disabled={writeDisabled} title="Parent settings">⚙ <span>Plan</span></button>
            <button className="button icon-button" type="button" onClick={() => void handleSignOut()} disabled={Boolean(busy)} title={`Sign out ${email}`}>⇥ <span>Sign out</span></button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void importFile(event.target.files?.[0])} />
          </div>
        </header>

        <p className={`storage-note${connectionIssue ? ' warning' : ''}`}>
          {connectionIssue ? 'Cloud connection unavailable — changes are paused' : 'Saved securely to your private family account'}
        </p>
        {connectionIssue && (
          <div className="connection-banner" role="alert">
            <div><strong>Supabase needs attention.</strong><span>{connectionIssue}</span></div>
            <button className="button button-small" type="button" onClick={() => void handleRefresh()} disabled={Boolean(busy)}>Try again</button>
          </div>
        )}

        <main id="main">
          <section className="summary-grid" aria-label="Money summary">
            <SummaryCard className="balance" label="Money I have" value={formatMoney(totals.balanceCents)} helper="Income minus expenses" />
            <SummaryCard className="income" label="Money in" value={formatMoney(totals.incomeCents)} helper="Everything you earned or received" />
            <SummaryCard className="expense" label="Money out" value={formatMoney(totals.expenseCents)} helper="Everything you chose to spend" />
          </section>

          <aside className="tip-banner" aria-labelledby="tip-heading">
            <div className="tip-icon" aria-hidden="true">💡</div>
            <div><p className="tip-kicker" id="tip-heading">Smart money note</p><p className="tip-text">{smartTip(moneyMap.transactions, totals, moneyMap.goal.name, moneyMap.goal.targetCents, moneyMap.allocation)}</p></div>
          </aside>

          <div className="workspace-grid">
            <div className="reminder-rail">
              <section className="panel panel-pad plan-reminder" aria-labelledby="plan-heading">
                <div className="section-head">
                  <div><h2 id="plan-heading">Give your money five jobs</h2><p>Your guide updates whenever money comes in.</p></div>
                  <span className="total-pill">100% planned</span>
                </div>
                <div className="bucket-list">
                  {ALLOCATION_KEYS.map((key) => {
                    const detail = BUCKET_DETAILS[key]
                    return (
                      <article className={`bucket ${detail.className}`} key={key}>
                        <div className="bucket-icon" aria-hidden="true">{detail.icon}</div>
                        <div><p className="bucket-name">{detail.name}</p><p className="bucket-desc">{detail.description}</p></div>
                        <div className="bucket-value"><span className="bucket-percent">{moneyMap.allocation[key]}%</span><span className="bucket-money">{formatMoney(allocationSplit[key])}</span></div>
                      </article>
                    )
                  })}
                </div>
                <div className="goal-box" aria-labelledby="goal-name-display">
                  <div className="goal-top">
                    <strong id="goal-name-display">{moneyMap.goal.name || 'My big goal'}</strong>
                    <span>{moneyMap.goal.targetCents > 0 ? `${formatMoney(allocationSplit.goal)} of ${formatMoney(moneyMap.goal.targetCents)}` : 'Set a target with an adult'}</span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-label="Big goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goalPercent)}>
                    <div className="progress-bar" style={{ width: `${goalPercent}%` }} />
                  </div>
                  <p className="goal-caption">{moneyMap.goal.targetCents > 0 ? `${Math.round(goalPercent)}% planned from all your income.` : 'Open Plan settings to choose what you are saving for.'}</p>
                </div>
              </section>

              <AllowancePlanCard />
            </div>

            <section className="panel panel-pad entry-panel" id="entry-panel" aria-labelledby="form-title">
              <div className="section-head"><div><h2 id="form-title">{editingId ? 'Edit this money move' : 'Add a money move'}</h2><p>What changed today?</p></div></div>
              <form className="form-stack" onSubmit={submitTransaction} noValidate>
                <fieldset className="field">
                  <legend>Was money coming in or going out?</legend>
                  <div className="type-switch">
                    {(['income', 'expense'] as const).map((choice) => (
                      <div className="type-choice" key={choice}>
                        <input type="radio" name="type" id={`type-${choice}`} value={choice} checked={type === choice} onChange={() => { setType(choice); setCategory('') }} disabled={writeDisabled} />
                        <label htmlFor={`type-${choice}`}>{choice === 'income' ? '＋ Money in' : '− Money out'}</label>
                      </div>
                    ))}
                  </div>
                </fieldset>
                <div className="field-row">
                  <div className="field"><label htmlFor="date-input">Date</label><input className="input" type="date" id="date-input" max={todayISO()} value={date} onChange={(event) => setDate(event.target.value)} disabled={writeDisabled} required /></div>
                  <div className="field"><label htmlFor="amount-input">Amount in EUR</label><input className="input" type="text" id="amount-input" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={writeDisabled} required /></div>
                </div>
                <div className="field">
                  <label htmlFor="category-input">{type === 'income' ? 'Where did it come from?' : 'What was it for?'}</label>
                  <select className="select" id="category-input" value={category} onChange={(event) => setCategory(event.target.value)} disabled={writeDisabled} required>
                    <option value="">Choose one</option>
                    {CATEGORY_OPTIONS[type].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </div>
                <div className="field">
                  <div className="counter-row"><label htmlFor="note-input">Note <span className="label-optional">(optional)</span></label><span className="char-count">{note.length} / 120</span></div>
                  <textarea className="textarea" id="note-input" maxLength={120} placeholder="What do you want to remember?" value={note} onChange={(event) => setNote(event.target.value)} disabled={writeDisabled} />
                </div>
                {type === 'income' && (
                  <div className="split-preview">
                    <p>This income’s five jobs</p>
                    <div className="split-chips">
                      {previewSplit ? ALLOCATION_KEYS.map((key) => <span className="split-chip" key={key}>{ALLOCATION_LABELS[key]} {formatMoney(previewSplit[key])}</span>) : <span className="split-chip">Enter an amount to see the plan</span>}
                    </div>
                  </div>
                )}
                {formError && <div className="form-error" role="alert">{formError}</div>}
                <div className="form-actions">
                  <button className="button button-primary" type="submit" disabled={writeDisabled}>{busy === 'transaction' ? 'Saving…' : editingId ? 'Save changes' : 'Add money move'}</button>
                  {editingId && <button className="button" type="button" onClick={resetForm} disabled={Boolean(busy)}>Cancel</button>}
                </div>
              </form>
            </section>
          </div>

          <MonthlyStory transactions={moneyMap.transactions} storyMonth={storyMonth} setStoryMonth={setStoryMonth} />

          <section className="panel panel-pad ledger" aria-labelledby="ledger-heading">
            <div className="ledger-toolbar">
              <div><h2 id="ledger-heading">My money moves</h2><p>{moneyMap.transactions.length ? `${moneyMap.transactions.length} money ${moneyMap.transactions.length === 1 ? 'move' : 'moves'} saved in the family account.` : 'Your income and expenses will appear here.'}</p></div>
              <div className="field filter-control"><label htmlFor="filter-input">Show</label><select className="select" id="filter-input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All moves</option><option value="income">Money in</option><option value="expense">Money out</option></select></div>
            </div>
            <TransactionList transactions={moneyMap.transactions} filter={filter} edit={startEditing} remove={(transaction) => void removeTransaction(transaction)} disabled={writeDisabled} />
          </section>
        </main>

        <footer className="page-footer"><span>Private by design — saved to your family’s Supabase account.</span><span>Money skills grow one choice at a time.</span></footer>
      </div>

      {settingsOpen && (
        <SettingsModal
          moneyMap={moneyMap}
          saving={busy === 'settings' || busy === 'reset'}
          onClose={() => setSettingsOpen(false)}
          onSave={savePlan}
          onClear={() => void clearEverything()}
        />
      )}
      {toast && <div className={`toast${toast.error ? ' error' : ''}`} role={toast.error ? 'alert' : 'status'} aria-live={toast.error ? 'assertive' : 'polite'}>{toast.message}</div>}
    </>
  )
}

function SummaryCard({ className, label, value, helper }: { className: string; label: string; value: string; helper: string }) {
  return <article className={`summary-card ${className}`}><p className="summary-label">{label}</p><p className="summary-value">{value}</p><p className="summary-helper">{helper}</p></article>
}

function TransactionList({ transactions, filter, edit, remove, disabled }: { transactions: Transaction[]; filter: 'all' | TransactionType; edit: (transaction: Transaction) => void; remove: (transaction: Transaction) => void; disabled: boolean }) {
  const filtered = [...transactions]
    .filter((transaction) => filter === 'all' || transaction.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  if (!filtered.length) {
    return <div className="empty-state"><span className="empty-icon" aria-hidden="true">🪙</span><strong>{transactions.length ? 'No moves match this filter' : "Hanzo's map is ready"}</strong><p>{transactions.length ? 'Choose another view to see more.' : 'Add your first money move to begin.'}</p></div>
  }
  return (
    <ul className="transaction-list">
      {filtered.map((transaction) => (
        <li className={`transaction ${transaction.type}`} key={transaction.id}>
          <div className="transaction-badge" aria-hidden="true">{transaction.type === 'income' ? '↗' : '↘'}</div>
          <div className="transaction-main"><strong>{transaction.category}</strong><span>{formatDate(transaction.date)}</span></div>
          <div className="transaction-note">{transaction.note || 'No note added'}</div>
          <div className="transaction-amount">{transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amountCents)}</div>
          <div className="transaction-actions">
            <button className="button button-small" type="button" onClick={() => edit(transaction)} disabled={disabled} aria-label={`Edit ${transaction.category} ${formatMoney(transaction.amountCents)}`}>Edit</button>
            <button className="button button-small button-danger" type="button" onClick={() => remove(transaction)} disabled={disabled} aria-label={`Delete ${transaction.category} ${formatMoney(transaction.amountCents)}`}>Delete</button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AllowancePlanCard() {
  const plans = [
    { years: 1, months: 12, totalCents: MONTHLY_ALLOWANCE_CENTS * 12, coins: 3 },
    { years: 2, months: 24, totalCents: MONTHLY_ALLOWANCE_CENTS * 24, coins: 6 },
  ]

  return (
    <section className="panel allowance-card" aria-labelledby="allowance-heading">
      <div className="allowance-head">
        <div><p className="allowance-kicker">€15 each month</p><h2 id="allowance-heading">Allowance plan</h2></div>
        <span aria-hidden="true">🪙</span>
      </div>
      <div className="allowance-plans">
        {plans.map((plan) => (
          <article className="allowance-plan" key={plan.years}>
            <span className="allowance-time">{plan.years} year{plan.years > 1 ? 's' : ''}</span>
            <div className="plan-coin-pile" aria-hidden="true">
              {Array.from({ length: plan.coins }, (_, coin) => <span className="plan-coin" key={coin} />)}
            </div>
            <strong>{formatMoney(plan.totalCents)}</strong>
            <span className="allowance-months">{plan.months} months</span>
          </article>
        ))}
      </div>
      <p className="allowance-note">Planning only — not included in Hanzo’s current money.</p>
    </section>
  )
}

function MonthlyStory({ transactions, storyMonth, setStoryMonth }: { transactions: Transaction[]; storyMonth: Date; setStoryMonth: (date: Date) => void }) {
  const data = useMemo(() => buildMonthStory(transactions, storyMonth), [transactions, storyMonth])
  const now = new Date()
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const isCurrentMonth = sameMonth(storyMonth, currentMonth)
  let openWeek = -1
  if (isCurrentMonth) {
    const today = todayISO()
    openWeek = data.weeks.findIndex((week) => today >= week.firstISO && today <= week.lastISO)
  }
  if (openWeek === -1) {
    for (let index = data.weeks.length - 1; index >= 0; index -= 1) {
      if (data.weeks[index].transactions.length) { openWeek = index; break }
    }
  }
  if (openWeek === -1) openWeek = 0

  function changeMonth(offset: number) {
    const candidate = new Date(storyMonth.getFullYear(), storyMonth.getMonth() + offset, 1)
    if (candidate <= currentMonth) setStoryMonth(candidate)
  }

  const storyMessage = !data.transactions.length
    ? `No money moves in ${data.name}. The balance line stays steady.`
    : data.changeCents > 0
      ? `Hanzo kept ${formatMoney(data.changeCents)} more than he spent this month.`
      : data.changeCents < 0
        ? `Hanzo spent ${formatMoney(Math.abs(data.changeCents))} more than came in this month. That is useful to notice.`
        : 'Money in and money out are exactly even this month.'
  const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(storyMonth)

  return (
    <section className="panel panel-pad monthly-story" aria-labelledby="story-heading">
      <div className="story-head">
        <div><h2 id="story-heading">Hanzo's Monthly Money Story</h2><p>A month-sized picture, told one week at a time.</p></div>
        <nav className="month-controls" aria-label="Choose a month">
          <button className="button month-arrow" type="button" onClick={() => changeMonth(-1)} aria-label="Show previous month">‹</button>
          <span className="month-name" aria-live="polite">{data.name}</span>
          <button className="button month-arrow" type="button" onClick={() => changeMonth(1)} aria-label="Show next month" disabled={isCurrentMonth}>›</button>
          {!isCurrentMonth && <button className="button button-small this-month-button" type="button" onClick={() => setStoryMonth(currentMonth)}>This month</button>}
        </nav>
      </div>
      <div className="story-stats" aria-label="Selected month summary">
        <div className="story-stat in"><span>Money in</span><strong>{formatMoney(data.incomeCents)}</strong></div>
        <div className="story-stat out"><span>Money out</span><strong>{formatMoney(data.expenseCents)}</strong></div>
        <div className="story-stat"><span>Balance after month moves</span><strong>{formatMoney(data.endingBalanceCents)}</strong></div>
      </div>
      <StoryChart data={data} />
      <p className="story-message">{storyMessage}</p>
      <h3 className="chapters-heading">Weekly chapters</h3>
      <div className="week-chapters">
        {data.weeks.map((week, index) => (
          <details className="week-chapter" key={week.firstISO} open={index === openWeek}>
            <summary className="week-summary">
              <span className="week-title"><strong>Week {week.number}</strong><span>{week.firstDay === week.lastDay ? `${week.firstDay} ${monthShort}` : `${week.firstDay}–${week.lastDay} ${monthShort}`}</span></span>
              <span className="week-numbers"><span className="week-in">+{formatMoney(week.incomeCents)} in</span><span className="week-out">−{formatMoney(week.expenseCents)} out</span><span className="week-balance">{formatMoney(week.closingBalanceCents)} balance</span></span>
              <span className="week-caret" aria-hidden="true">⌄</span>
            </summary>
            <div className="week-lines">
              {!week.transactions.length ? <p className="week-empty">No money moves this week.</p> : week.transactions.map((transaction) => (
                <div className={`week-line ${transaction.type}`} key={transaction.id}>
                  <span className="week-line-date">{formatDate(transaction.date)}</span>
                  <span className="week-line-main"><strong>{transaction.category}</strong>{transaction.note && <span>{transaction.note}</span>}</span>
                  <span className="week-line-amount">{transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amountCents)}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function StoryChart({ data }: { data: ReturnType<typeof buildMonthStory> }) {
  const width = 720
  const height = 250
  const margin = { top: 32, right: 25, bottom: 39, left: 65 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const values = [data.startingBalanceCents, ...data.weeks.map((week) => week.closingBalanceCents)]
  const labels = ['Start', ...data.weeks.map((week) => `W${week.number}`)]
  let minimum = Math.min(0, ...values)
  let maximum = Math.max(0, ...values)
  const spread = maximum - minimum
  if (spread === 0) maximum = minimum + Math.max(1000, Math.abs(minimum) * 0.25 || 1000)
  else {
    const padding = spread * 0.12
    minimum = minimum < 0 ? minimum - padding : 0
    maximum += padding
  }
  const xAt = (index: number) => margin.left + index * plotWidth / Math.max(1, values.length - 1)
  const yAt = (value: number) => margin.top + (maximum - value) / (maximum - minimum) * plotHeight
  const points = values.map((value, index) => ({ value, x: xAt(index), y: yAt(value), label: labels[index] }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const trendDown = data.endingBalanceCents < data.startingBalanceCents
  const tickValues = [minimum, (minimum + maximum) / 2, maximum]
  const summary = `${data.name}. Starting balance ${formatMoney(data.startingBalanceCents)}. ${data.weeks.map((week) => `week ${week.number}, ${formatMoney(week.closingBalanceCents)}`).join('; ')}. Balance after this month's moves ${formatMoney(data.endingBalanceCents)}.`

  return (
    <div className="story-chart-shell">
      <svg className="story-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="story-chart-title" aria-describedby="story-chart-summary">
        <title id="story-chart-title">{data.name} running balance by week</title>
        {tickValues.map((tick, index) => {
          const y = yAt(tick)
          return <g key={index}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className={Math.abs(tick) < 0.001 ? 'chart-zero' : 'chart-grid'} /><text x={margin.left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">{formatCompactMoney(Math.round(tick))}</text></g>
        })}
        {points.map((point) => <text key={`axis-${point.label}`} x={point.x} y={height - 13} textAnchor="middle" className="chart-axis-label">{point.label}</text>)}
        <path d={path} className={`chart-line${trendDown ? ' down' : ''}`} />
        {points.map((point, index) => (
          <g key={point.label}>
            <title>{point.label}: {formatMoney(point.value)}</title>
            <circle cx={point.x} cy={point.y} r={5} className={`chart-point${trendDown ? ' down' : ''}`} />
            <text x={point.x} y={point.y < margin.top + 18 ? point.y + 20 : point.y - 11} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="chart-value-label">{formatCompactMoney(point.value)}</text>
          </g>
        ))}
        {!data.transactions.length && <text x={margin.left + plotWidth / 2} y={margin.top + 18} textAnchor="middle" className="chart-empty-note">No money moves this month yet</text>}
      </svg>
      <p className="sr-only" id="story-chart-summary">{summary}</p>
    </div>
  )
}

function SettingsModal({ moneyMap, saving, onClose, onSave, onClear }: { moneyMap: MoneyMap; saving: boolean; onClose: () => void; onSave: (allocation: Allocation, goalName: string, targetCents: number) => Promise<void>; onClear: () => void }) {
  const [allocation, setAllocation] = useState<Record<(typeof ALLOCATION_KEYS)[number], string>>(() => Object.fromEntries(ALLOCATION_KEYS.map((key) => [key, String(moneyMap.allocation[key])])) as Record<(typeof ALLOCATION_KEYS)[number], string>)
  const [goalName, setGoalName] = useState(moneyMap.goal.name)
  const [target, setTarget] = useState(moneyMap.goal.targetCents ? centsToInput(moneyMap.goal.targetCents) : '')
  const [error, setError] = useState('')
  const numericAllocation: Allocation = {
    investment: Number(allocation.investment),
    goal: Number(allocation.goal),
    planned: Number(allocation.planned),
    fun: Number(allocation.fun),
    giving: Number(allocation.giving),
  }
  const total = ALLOCATION_KEYS.reduce((sum, key) => sum + (Number.isFinite(numericAllocation[key]) ? numericAllocation[key] : 0), 0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    for (const key of ALLOCATION_KEYS) {
      const value = numericAllocation[key]
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        setError(`${ALLOCATION_LABELS[key]} must be a whole number from 0 to 100.`)
        document.getElementById(`setting-${key}`)?.focus()
        return
      }
    }
    if (allocationTotal(numericAllocation) !== 100) {
      setError('The five percentages must add up to exactly 100%.')
      document.getElementById('setting-investment')?.focus()
      return
    }
    if (goalName.trim().length > 60) {
      setError('The big goal name must be 60 characters or fewer.')
      document.getElementById('goal-name-input')?.focus()
      return
    }
    const targetCents = target.trim() ? parseEurosToCents(target) : 0
    if (targetCents === null || targetCents < 0 || targetCents > MAX_AMOUNT_CENTS) {
      setError('Enter a target from €0.00 to €1,000,000,000.00 with no more than two decimal places.')
      document.getElementById('goal-target-input')?.focus()
      return
    }
    try {
      await onSave(numericAllocation, goalName.trim(), targetCents)
    } catch {
      setError('The plan was not saved. Check the cloud connection and try again.')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <form className="dialog-inner" onSubmit={submit} noValidate>
          <div className="dialog-head"><div><h2 id="settings-title">Plan settings</h2><p>An adult can help adjust the five money jobs.</p></div><button className="button close-button" type="button" onClick={onClose} disabled={saving} aria-label="Close settings">×</button></div>
          <div className="allocation-settings">
            {ALLOCATION_KEYS.map((key) => (
              <div className="field" key={key}><label htmlFor={`setting-${key}`}>{ALLOCATION_LABELS[key]} %</label><input className="input" id={`setting-${key}`} type="number" min="0" max="100" step="1" value={allocation[key]} onChange={(event) => setAllocation({ ...allocation, [key]: event.target.value })} disabled={saving} /></div>
            ))}
          </div>
          <div className={`settings-total${total !== 100 ? ' invalid' : ''}`}><span>Total</span><span>{total}%</span></div>
          <div className="field-row">
            <div className="field"><label htmlFor="goal-name-input">What is the big goal?</label><input className="input" id="goal-name-input" type="text" maxLength={60} placeholder="Example: My first bicycle" value={goalName} onChange={(event) => setGoalName(event.target.value)} disabled={saving} /></div>
            <div className="field"><label htmlFor="goal-target-input">Target in EUR</label><input className="input" id="goal-target-input" type="text" inputMode="decimal" placeholder="0.00" value={target} onChange={(event) => setTarget(event.target.value)} disabled={saving} /></div>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="dialog-actions">
            <button className="button" type="button" disabled={saving} onClick={() => setAllocation(Object.fromEntries(ALLOCATION_KEYS.map((key) => [key, String(RECOMMENDED_ALLOCATION[key])])) as Record<(typeof ALLOCATION_KEYS)[number], string>)}>Use recommended plan</button>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save plan'}</button>
          </div>
          <div className="danger-zone"><h3>Start fresh</h3><p>This removes every cloud money move and resets the plan. Download a backup first if you might want it later.</p><button className="button button-danger" type="button" onClick={onClear} disabled={saving}>Clear everything</button></div>
        </form>
      </section>
    </div>
  )
}

export default App
