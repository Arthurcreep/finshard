import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig, initWeb3Modal } from './wallet/config.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeLangProvider } from './contexts/ThemeLangContext'
import { AuthProvider } from './contexts/AuthContext.jsx'
import RequireAdmin from './components/RequireAdmin.jsx'
import Start from './pages/Start.jsx'
import Dashboard from './components/Dashboard'
import Admin from './pages/Admin.jsx'
import './styles/globals.css'
import './i18n/i18n'

initWeb3Modal()
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeLangProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Start />} />
                <Route path="/app" element={<Dashboard />} />
                <Route path="/admin" element={
                  <RequireAdmin><Admin /></RequireAdmin>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </ThemeLangProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
