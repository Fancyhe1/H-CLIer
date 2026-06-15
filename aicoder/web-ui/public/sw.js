// Custom Service Worker for notification handling

self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.tag)

  event.notification.close()

  // 打开或聚焦到应用窗口
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 如果已经有打开的窗口，聚焦到它
      for (const client of clientList) {
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus()
        }
      }
      // 否则打开新窗口
      if (clients.openWindow) {
        return clients.openWindow('/')
      }
    })
  )
})

// 处理推送消息（如果需要）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json()
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'default',
      })
    )
  }
})
