'use client'

import { createContext, useContext, useEffect, useState } from 'react'

/** The single local user. Obliq runs on localhost as the OS user. */
export interface LocalUser {
  id: string
  username: string
  home: string
}

interface AuthContextType {
  user: LocalUser | null
  loading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
})

/**
 * Establishes the local session cookie (GET /api/session) before rendering
 * authenticated pages. API calls made after `loading` is false carry the
 * cookie automatically.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextType>({ user: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    fetch('/api/session', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) throw new Error(`Session request failed (${res.status})`)
        const body = await res.json()
        if (!cancelled) setState({ user: body.user, loading: false, error: null })
      })
      .catch(err => {
        if (!cancelled) setState({ user: null, loading: false, error: String(err?.message || err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useUser = () => useContext(AuthContext)
