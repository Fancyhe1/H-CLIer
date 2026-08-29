class NotificationManager {
  private static instance: NotificationManager
  private permission: NotificationPermission = 'default'
  private isSupported: boolean = false

  private constructor() {
    // 检查是否支持 Notification API
    this.isSupported = typeof window !== 'undefined' && 'Notification' in window
    if (this.isSupported) {
      this.permission = Notification.permission
    }
  }

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager()
    }
    return NotificationManager.instance
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      console.warn('Notifications not supported in this environment')
      return 'denied'
    }

    if (this.permission === 'granted') {
      return 'granted'
    }

    try {
      const result = await Notification.requestPermission()
      this.permission = result
      return result
    } catch (e) {
      console.warn('Failed to request notification permission:', e)
      return 'denied'
    }
  }

  async sendNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!this.isSupported) {
      console.log('Notifications not supported, skipping:', title)
      return
    }

    if (this.permission !== 'granted') {
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        return
      }
    }

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(title, {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          ...options,
        } as any)
      } else {
        new Notification(title, {
          icon: '/icons/icon-192.png',
          ...options,
        })
      }
    } catch (error) {
      console.warn('Failed to send notification:', error)
    }
  }

  async notifySessionComplete(sessionTitle: string): Promise<void> {
    await this.sendNotification('会话完成', {
      body: `"${sessionTitle}" 已完成响应`,
      tag: 'session-complete',
    })
  }

  async notifyNewMessage(sessionTitle: string): Promise<void> {
    await this.sendNotification('新消息', {
      body: `"${sessionTitle}" 有新消息`,
      tag: 'new-message',
    })
  }

  getIsSupported(): boolean {
    return this.isSupported
  }

  getPermission(): NotificationPermission {
    return this.permission
  }
}

export const notificationManager = NotificationManager.getInstance()
