import { apiGet, apiPost } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useAccount, useSignMessage } from 'wagmi'

export default function WalletLoginButton() {
  const { me, setMe, logout } = useAuth()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  async function login() {
    try {
      if (!isConnected || !address) return alert('Подключи кошелёк')
      const { nonce } = await apiGet('/api/auth/nonce')
      const message = `Login to App\nNonce: ${nonce}`
      const signature = await signMessageAsync({ message })
      await apiPost('/api/auth/wc-login', { address, message, signature })
      const user = await apiGet('/api/auth/me')
      setMe(user)
    } catch (e) {
      console.error(e)
      alert('Вход не удался')
    }
  }

  return me ? (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <span>{me.address} · {me.role}</span>
      <button onClick={logout}>Выйти</button>
    </div>
  ) : (
    <button onClick={login}>Войти кошельком</button>
  )
}
