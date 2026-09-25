import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'test'
    ? {
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
        'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
      }
    : undefined,
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
}))
