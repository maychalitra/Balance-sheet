# Hanzo's Money Map

Hanzo's Money Map is a private, family-owned income and expense tracker for an 11-year-old. It uses React and Supabase so money moves and plan settings are stored in the family's cloud account rather than in browser storage.

## What is included

- Email/password sign-in for one pre-created family account
- Supabase-only storage protected by Row Level Security
- Income and expense entry in EUR or a chosen spending currency, with historical conversion and exact-cent EUR calculations
- Five-job income plan with saved wish lines, goal tracking, smart notes, and monthly weekly-balance story
- A child-friendly background picker saved to the family account
- Version 1 JSON backup export and atomic restore
- Manual cloud refresh, password recovery, connection-error handling, and destructive-action confirmations

The app does not offer public registration and does not store financial records in `localStorage`, `sessionStorage`, IndexedDB, or Cache Storage. Supabase may store its authentication session in `localStorage` so the family remains signed in.

## 1. Create and configure Supabase

1. Create a Supabase project in the nearest available EU region. Keep the database password in a password manager.
2. Open the project's SQL Editor and run every file in `supabase/migrations` in filename order. The first migration creates the secure money-map schema and RPCs; later migrations add the saved background theme, five-job wishes, and original-currency transaction details.
3. In **Authentication → Providers → Email**, keep email/password enabled and disable new-user sign-up.
4. In **Authentication → Users**, create and confirm one family user with the adult's email and a strong password.
5. In **Authentication → URL Configuration**, set the local Site URL and allowed redirect URL to `http://localhost:5173`. Add the deployed HTTPS URL later if the app is published.
6. In the project's **Connect** dialog, copy the project URL and publishable key. Never use a secret or service-role key in this frontend.

## 2. Configure the local app

Install a supported Node.js LTS release. Node.js 24 LTS was used for this implementation.

```powershell
Copy-Item .env.example .env.local
npm install
```

Edit `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Start the app:

```powershell
npm run dev
```

Open `http://localhost:5173`, then sign in with the pre-created family account.

## Validation

```powershell
npm test
npm run build
```

If the Supabase CLI and its local Docker stack are available, `supabase test db` also runs [`supabase/tests/rls.test.sql`](supabase/tests/rls.test.sql) against the migrated local database.

The production build is written to `dist/`. The project is intentionally local-only for now and has not been deployed.

## Data and recovery notes

- Supabase is the source of truth. A page reload always fetches the current cloud data.
- A money move can be entered in EUR or one of the currencies in the form. The app retrieves the historical daily reference rate for the selected date from [Frankfurter](https://frankfurter.dev/), stores the original amount and rate, and converts the value to integer EUR cents. All balances, charts, plans, and goals stay in EUR.
- Historical reference rates are useful for a consistent family overview, but they can differ from the rate charged by a bank or card provider.
- The former `kidMoneyTracker.v1` browser record is removed at startup and is not imported.
- When the cloud is unavailable, already loaded information remains visible only in memory and writes are paused until refresh succeeds.
- Backups remain readable version 1 EUR JSON. Export writes each money move's converted EUR value; restore therefore preserves balances while treating restored moves as EUR-only records.
- Version 1 backups contain the money plan and transactions. The background theme and wish lines stay with the cloud account and are not replaced during restore.
- Other open devices update after reload or the **Refresh** button; Realtime is intentionally disabled.
