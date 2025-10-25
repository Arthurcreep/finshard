import { useEffect, useMemo, useState, lazy, Suspense } from "react"
import { useAccount, useSignMessage } from "wagmi"
import IntroScene from "../components/IntroScene"
import s from "../styles/Start.module.css"
import { useTranslation } from "react-i18next"
import { initWeb3Modal } from "../wallet/config.jsx"
import { useThemeLang } from "../contexts/ThemeLangContext"
import { useI18nSync } from "../hook/useI18nSync.js"
import { apiGet, apiPost } from "../lib/api" // <— базовый URL берётся из VITE_API_URL
// Если хочешь отдельную кнопку логина — можешь подключить:
// import WalletLoginButton from '../components/WalletLoginButton'

const SettingsFab = lazy(() => import("../components/SettingsFab"))

export default function Start() {
  const { t } = useTranslation()
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { lang, setLang } = useThemeLang?.() || { lang: "ru" }

  useI18nSync(lang, setLang)

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")

  const messageFor = useMemo(
    () => (addr, nonce) => `Login with address ${addr}\nNonce: ${nonce}`,
    []
  )

  // Отложенная инициализация Web3Modal (как у тебя)
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 0))
    let inited = false
    idle(() => {
      if (!inited) {
        try { initWeb3Modal() } catch {}
        inited = true
      }
    })
  }, [])

  // Авто-вход когда кошелёк уже подключён
  useEffect(() => {
    let canceled = false
    async function login() {
      if (!isConnected || !address) return
      setLoading(true)
      setErr("")
      try {
        // 1) получаем nonce с бэка
        const { nonce } = await apiGet("/api/auth/nonce")

        // 2) подписываем сообщение
        const msg = messageFor(address, nonce)
        const signature = await signMessageAsync({ message: msg })

        // 3) логинимся на бэке
        await apiPost("/api/auth/wc-login", { address, message: msg, signature })

        // 4) узнаём роль
        const me = await apiGet("/api/auth/me")
        if (!canceled) {
          window.location.replace(me.role !== "admin" ? "/admin" : "/app")
        }
      } catch (e) {
        if (!canceled) setErr(t("start.authError"))
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    login()
    return () => { canceled = true }
  }, [isConnected, address, signMessageAsync, messageFor, t])

  return (
    <div
      className={s.wrap}
      onPointerDown={() => {
        try { initWeb3Modal() } catch {}
      }}
    >
      <IntroScene />

      <main className={s.card} role="main" aria-label={t("start.title")}>
        <div style={{ display: "inline-block", minWidth: 280 }}>
          <h1 className={s.title}>{t("start.title")}</h1>
          <p className={s.subtitle}>{t("start.subtitle")}</p>

          {/* Кнопка подключения кошелька от Web3Modal */}
          <w3m-button size="md" balance="hide" />

          {loading && <div className={s.note}>{t("start.checkingSignature")}</div>}
          {err && <div className={s.err}>{err}</div>}
        </div>
      </main>

      <Suspense fallback={null}>
        <SettingsFab />
      </Suspense>

      {/* Если хочешь ручной вход отдельной кнопкой — сними комментарий:
      <div style={{ padding: 16 }}>
        <WalletLoginButton />
      </div>
      */}
    </div>
  )
}
