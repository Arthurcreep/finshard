import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function RequireAdmin({ children }) {
  const { me, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div style={{ padding: 16 }}>Проверяем доступ…</div>
  if (!me) return <Navigate to="/" state={{ from: loc }} replace />
  if (me.role !== 'admin') return <Navigate to="/" replace />
  return children
}
