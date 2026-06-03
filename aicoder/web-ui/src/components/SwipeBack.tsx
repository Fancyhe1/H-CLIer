import { useEffect, useRef, useState } from 'react'

interface SwipeBackProps {
  onSwipeBack: () => void
  threshold?: number
  children: React.ReactNode
}

export function SwipeBack({ onSwipeBack, threshold = 80, children }: SwipeBackProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [swiping, setSwiping] = useState(false)
  const [startX, setStartX] = useState(0)
  const [currentX, setCurrentX] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      // 只在屏幕左边缘 30px 内触发
      if (touch.clientX <= 30) {
        setStartX(touch.clientX)
        setSwiping(true)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!swiping) return
      const touch = e.touches[0]
      setCurrentX(touch.clientX)
    }

    const handleTouchEnd = () => {
      if (!swiping) return

      const distance = currentX - startX
      if (distance > threshold) {
        onSwipeBack()
      }

      setSwiping(false)
      setStartX(0)
      setCurrentX(0)
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [swiping, startX, currentX, threshold, onSwipeBack])

  const swipeProgress = swiping ? Math.min((currentX - startX) / threshold, 1) : 0

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%' }}>
      {/* 滑动返回提示 */}
      <div
        className={`swipe-back-hint ${swiping ? 'visible' : ''}`}
        style={{ opacity: swipeProgress * 0.5 }}
      />
      {/* 内容 */}
      <div
        style={{
          transform: swiping ? `translateX(${Math.min(currentX - startX, threshold) * 0.3}px)` : 'none',
          transition: swiping ? 'none' : 'transform 0.2s ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
