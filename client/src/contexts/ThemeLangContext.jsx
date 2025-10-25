// src/contexts/ThemeLangContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import i18n from '../i18n/i18n' // важно: подключи i18n в проекте

const Ctx = createContext({
    theme: 'light',
    setTheme: () => { },
    lang: 'ru',
    setLang: () => { }
})

function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([$?*|{}\]\\^])/g, '\\$1') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : ''
}
function setCookie(name, value, days = 365) {
    const d = new Date()
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000)
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${d.toUTCString()}; path=/; SameSite=Lax`
}

export function ThemeLangProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const c = getCookie('theme')
        return (c === 'dark' || c === 'light') ? c : 'light'
    })
    const [lang, setLang] = useState(() => {
        const c = getCookie('lang')
        const allowed = ['ru', 'en', 'ar', 'zh', 'ko', 'ja']
        return allowed.includes(c) ? c : 'ru'
    })

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        setCookie('theme', theme)
    }, [theme])

    useEffect(() => {
        document.documentElement.lang = lang
        document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr'
        setCookie('lang', lang)
        try { i18n.changeLanguage(lang) } catch { }
    }, [lang])

    const value = useMemo(() => ({ theme, setTheme, lang, setLang }), [theme, lang])
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useThemeLang() {
    return useContext(Ctx)
}
