import { useState, useEffect, useRef, useCallback } from 'react'
import type { MenuProps } from 'antd'
import '../styles/ContextMenu.css'

interface ContextMenuProps {
  items: MenuProps['items']
  children: React.ReactNode
}

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
      return (
        <div
          key={menuItem.key}
          className={`ctx-menu-item ${menuItem.danger ? 'danger' : ''}`}
          onClick={() => {
            menuItem.onClick?.()
            setVisible(false)
          }}
        >
          {menuItem.icon && <span className="ctx-menu-icon">{menuItem.icon}</span>}
          <span className="ctx-menu-label">{menuItem.label}</span>
          {menuItem.children && (
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
