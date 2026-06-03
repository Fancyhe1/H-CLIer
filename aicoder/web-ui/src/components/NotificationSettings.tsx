import { useState, useEffect } from 'react'
import { notificationManager } from '../utils/notifications'

export function NotificationSettings() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported(notificationManager.getIsSupported())
    setPermission(notificationManager.getPermission())
  }, [])

  const handleRequestPermission = async () => {
    const result = await notificationManager.requestPermission()
    setPermission(result)
  }

  const handleTestNotification = async () => {
    await notificationManager.sendNotification('测试通知', {
      body: '这是一条测试通知，用于验证通知功能是否正常工作',
    })
  }

  if (!isSupported) {
    return (
      <div className="notification-settings">
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          ⚠️ 您的浏览器不支持通知功能
        </p>
      </div>
    )
  }

  return (
    <div className="notification-settings">
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          通知状态：
          <span style={{
            color: permission === 'granted' ? 'var(--accent)' : 'var(--danger)',
            fontWeight: 600,
          }}>
            {permission === 'granted' ? '✅ 已开启' : permission === 'denied' ? '❌ 已拒绝' : '⏳ 未设置'}
          </span>
        </p>
      </div>

      {permission !== 'granted' && (
        <button
          className="btn-primary"
          onClick={handleRequestPermission}
          style={{ marginBottom: 8 }}
        >
          开启通知
        </button>
      )}

      {permission === 'granted' && (
        <button
          className="btn-primary"
          onClick={handleTestNotification}
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        >
          发送测试通知
        </button>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        开启通知后，当 Claude 完成响应时会收到提醒
      </p>
    </div>
  )
}
