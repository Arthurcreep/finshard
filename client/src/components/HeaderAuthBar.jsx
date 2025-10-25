import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import WalletLoginButton from './WalletLoginButton'

/**
 * Полоска авторизации + индикатор роли.
 * - Если вошёл: показывает адрес и роль (admin/user)
 * - Если admin: добавляет ссылку "Админ-панель"
 * - Если не вошёл: показывает кнопку "Войти кошельком"
 */
export default function HeaderAuthBar() {
  const { me } = useAuth()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 12px', borderBottom: '1px solid #e5e7eb',
      background: '#fff', position: 'sticky', top: 0, zIndex: 50
    }}>
      <div style={{ fontWeight: 700 }}>App</div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {me && (
          <>
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 999,
              background: me.role === 'admin' ? '#DCFCE7' : '#E5E7EB',
              color: '#111827', border: '1px solid #D1D5DB'
            }}>
              {me.address} · {me.role}
            </span>

            {me.role === 'admin' && (
              <Link
                to="/admin"
                style={{
                  fontSize: 14, padding: '6px 10px', borderRadius: 8,
                  border: '1px solid #111827', color: '#111827', textDecoration: 'none'
                }}
              >
                Админ-панель
              </Link>
            )}
          </>
        )}

        {/* Кнопка логина/логаута и отображение статуса */}
        <WalletLoginButton />
      </div>
    </div>
  )
}
