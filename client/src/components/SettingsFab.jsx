// src/components/SettingsFab.jsx
import { useState } from 'react'
import { useThemeLang } from '../contexts/ThemeLangContext'
import { useTranslation } from 'react-i18next'
import s from '../styles/SettingsFab.module.css'

export default function SettingsFab() {
    const [open, setOpen] = useState(false)
    const { theme, setTheme, lang, setLang } = useThemeLang()
    const { t } = useTranslation()

    // в i18n: common.langName.{ru,en,ar,zh,ko,ja}
    const LANG_LABELS = t('common.langName', { returnObjects: true })

    return (
        <>
            <button
                aria-label={t('common.settings')}
                title={t('common.settings')}
                onClick={() => setOpen(v => !v)}
                className={s.fab}
            >
                ⚙️
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('common.settings')}
                    className={s.dialog}
                >
                    <div className={s.grid}>
                        <label className={s.row}>
                            <span>{t('common.theme')}</span>
                            <select
                                className={s.select}
                                value={theme}
                                onChange={e => setTheme(e.target.value)}
                            >
                                <option value="dark">{t('common.dark')}</option>
                                <option value="light">{t('common.light')}</option>
                            </select>
                        </label>

                        <label className={s.row}>
                            <span>{t('common.language')}</span>
                            <select
                                className={s.select}
                                value={lang}
                                onChange={e => setLang(e.target.value)}
                            >
                                <option value="ru">{LANG_LABELS.ru}</option>
                                <option value="en">{LANG_LABELS.en}</option>
                                <option value="ar">{LANG_LABELS.ar}</option>
                                <option value="zh">{LANG_LABELS.zh}</option>
                                <option value="ko">{LANG_LABELS.ko}</option>
                                <option value="ja">{LANG_LABELS.ja}</option>
                            </select>
                        </label>

                        <button className={s.closeBtn} onClick={() => setOpen(false)}>
                            {t('common.close')}
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
