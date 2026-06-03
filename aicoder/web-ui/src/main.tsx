import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'
import { OfflineIndicator } from './components/OfflineIndicator'
import './styles/mobile.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PWAInstallPrompt />
    <OfflineIndicator />
  </React.StrictMode>,
)
