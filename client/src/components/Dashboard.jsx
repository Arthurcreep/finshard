import App from '../App'
import PortfolioPanel from './PortfolioPanel'
import InvestmentCards from './InvestmentCards'
import Footer from './Footer'
import '../styles/Dashboard.css'
import { useTranslation } from 'react-i18next'
import { useThemeLang } from '../contexts/ThemeLangContext'
import i18n from '../i18n/i18n'

export default function Dashboard() {
    const { t } = useTranslation()
    const { theme, lang } = useThemeLang()

    // Синхронизируем и атрибуты, и i18n
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme || 'light')
        document.documentElement.setAttribute('lang', lang || 'ru')
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
    }
    if (lang && i18n.language !== lang) {
        i18n.changeLanguage(lang)
    }

    return (
        <div className="dash-shell">
            <main className="dash-content" role="main" aria-label={t('dashboard.workspace')}>
                <section className="dash-left" aria-label={t('dashboard.chartControls')}>
                    <App />
                </section>

                <aside className="dash-right" aria-label={t('dashboard.portfolioProducts')}>
                    <div className="box-cards">
                        <InvestmentCards layout="row" />
                    </div>

                    <div className="right-grid">
                        <div className="box-portfolio">
                            <PortfolioPanel />
                        </div>
                    </div>
                </aside>
            </main>

            <Footer />
        </div>
    )
}
