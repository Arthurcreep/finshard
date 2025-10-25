import { createContext, useContext, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    apiGet('/api/auth/me')
      .then(u => on && setMe(u))
      .catch(() => on && setMe(null))
      .finally(() => on && setLoading(false))
    return () => { on = false }
  }, [])

  const logout = () => apiPost('/api/auth/logout', {}).then(() => setMe(null))

  return <AuthCtx.Provider value={{ me, setMe, loading, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
