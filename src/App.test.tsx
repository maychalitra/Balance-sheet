import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './constants'

describe('application bootstrap', () => {
  beforeEach(() => window.localStorage.clear())

  it('removes the retired browser data and shows safe setup guidance without credentials', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions: [{ id: 'old' }] }))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Connect the family database' })).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull())
    expect(window.localStorage.length).toBe(0)
  })
})
