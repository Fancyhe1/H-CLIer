import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type { MenuProps } from 'antd'
import '../styles/ContextMenu.css'

interface ContextMenuProps {
  items: MenuProps['items']
  children: React.ReactNode
}

const MENU_MARGIN = 16 // 距离窗口边缘的最小间距

function ContextMenu({ items, children }: ContextMenuProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
    setVisible(true)
  }, [])

  // 菜单渲染后检测边界，自动调整位置
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return
    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const { innerWidth, innerHeight } = window

    let x = position.x
    let y = position.y

    // 右边界溢出 → 菜单显示在鼠标左侧
    if (x + rect.width + MENU_MARGIN > innerWidth) {
      x = innerWidth - rect.width - MENU_MARGIN
    }
    // 左边界溢出
    if (x < MENU_MARGIN) {
      x = MENU_MARGIN
    }
    // 下边界溢出 → 菜单显示在鼠标上方
    if (y + rect.height + MENU_MARGIN > innerHeight) {
      y = innerHeight - rect.height - MENU_MARGIN
    }
    // 上边界溢出
    if (y < MENU_MARGIN) {
      y = MENU_MARGIN
    }

    // 位置有变化时更新
    if (x !== position.x || y !== position.y) {
      setPosition({ x, y })
    }
  }, [visible, position.x, position.y])

  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }

    const handleScroll = () => setVisible(false)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [visible])

  const renderItems = (menuItems: MenuProps['items']) => {
    if (!menuItems) return null
    return menuItems.map((item) => {
      if (!item) return null
      if ('type' in item && item.type === 'divider') {
        return <div key={item.key} className="ctx-menu-divider" />
      }

      const menuItem = item as { key: string; label?: React.ReactNode; icon?: React.ReactNode; danger?: boolean; onClick?: () => void; children?: MenuProps['items'] }
      const hasChildren = Array.isArray(menuItem.children) && menuItem.children.length > 0
      return (
        <div
          key={menuItem.key}
          className={`ctx-menu-item ${menuItem.danger ? 'danger' : ''}`}
          onClick={(e) => {
            if (hasChildren) {
              // 有子菜单的项，阻止冒泡避免关闭整个菜单
              e.stopPropagation()
              return
            }
            menuItem.onClick?.()
            setVisible(false)
          }}
        >
          {menuItem.icon && <span className="ctx-menu-icon">{menuItem.icon}</span>}
          <span className="ctx-menu-label">{menuItem.label}</span>
          {hasChildren && (
            <>
              <span className="ctx-menu-arrow">▸</span>
              <div className="ctx-menu-sub">
                {renderItems(menuItem.children)}
              </div>
            </>
          )}
        </div>
      )
    })
  }

  return (
    <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
      {children}
      {visible && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ left: position.x, top: position.y }}
        >
          {renderItems(items)}
        </div>
      )}
    </div>
  )
}

export default ContextMenu
