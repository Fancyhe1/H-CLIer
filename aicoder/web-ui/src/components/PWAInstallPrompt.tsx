import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // 检查是否已安装
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    // 监听 beforeinstallprompt 事件
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // 延迟显示安装提示，避免打扰用户
      setTimeout(() => setShowInstallPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // 监听安装完成事件
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowInstallPrompt(false)
      setDeferredPrompt(null)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowInstallPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowInstallPrompt(false)
    // 24小时后再次提示
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  // 检查是否在24小时内被拒绝过
  const dismissedTime = localStorage.getItem('pwa-install-dismissed')
  if (dismissedTime && Date.now() - Number(dismissedTime) < 24 * 60 * 60 * 1000) {
    return null
  }

  if (isInstalled || !showInstallPrompt || !deferredPrompt) {
    return null
  }

  return (
    <div className="pwa-install-prompt">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>📱 安装 H CLIer</span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>添加到主屏幕，获得更好体验</span>
      </div>
      <button onClick={handleInstall}>安装</button>
      <button onClick={handleDismiss} style={{ background: 'transparent', opacity: 0.6 }}>
        ✕
      </button>
    </div>
  )
}
