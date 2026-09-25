import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const configurationIssue = !supabaseUrl || !supabasePublishableKey
  ? 'Supabase is not configured. Add the project URL and publishable key to .env.local, then restart the app.'
  : null

export const supabase: SupabaseClient | null = configurationIssue
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) throw new Error(configurationIssue ?? 'Supabase is unavailable.')
  return supabase
}
