import { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Input, Typography } from 'antd'
import { SearchOutlined, DownOutlined } from '@ant-design/icons'
import { claudeCommandCategories, getAllCommands } from '../data/claudeCommands'
import '../styles/ClaudeCommandsPanel.css'

const { Text } = Typography

interface ClaudeCommandsPanelProps {
  visible: boolean
  onClose: () => void
}

function ClaudeCommandsPanel({ visible, onClose }: ClaudeCommandsPanelProps) {
  const [search, setSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [selectedIdx, setSelectedIdx] = useState(0)

  // 所有指令的扁平列表（用于键盘导航）
  const allCommands = useMemo(() => getAllCommands(), [])

  // 搜索过滤
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return claudeCommandCategories

    const query = search.toLowerCase()
    return claudeCommandCategories
      .map(cat => ({
        ...cat,
        commands: cat.commands.filter(cmd =>
          cmd.command.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query) ||
          cmd.args?.toLowerCase().includes(query)
        )
      }))
      .filter(cat => cat.commands.length > 0)
  }, [search])

  // 过滤后的扁平列表
  const filteredFlat = useMemo(() => {
    return filteredCategories.flatMap(cat =>
      cat.commands.map(cmd => ({ ...cmd, category: cat.name }))
    )
  }, [filteredCategories])

  // 切换分类折叠
  const toggleCategory = useCallback((name: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  // 将指令输入到终端输入框
  const inputCommand = useCallback((command: string) => {
    window.dispatchEvent(new CustomEvent('append-to-terminal', {
      detail: { text: command + ' ' }
    }))
    onClose()
  }, [onClose])

  // 搜索高亮
  const highlightText = useCallback((text: string, query: string) => {
    if (!query.trim()) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <span className="claude-cmd-highlight">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }, [])

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIdx(i => Math.min(i + 1, filteredFlat.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIdx(i => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredFlat[selectedIdx]) {
            inputCommand(filteredFlat[selectedIdx].command)
          }
          break
        case 'Escape':
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, filteredFlat, selectedIdx, inputCommand, onClose])

  // 重置状态
  useEffect(() => {
    if (!visible) {
      setSearch('')
      setSelectedIdx(0)
    }
  }, [visible])

  // 搜索时重置选中
  useEffect(() => {
    setSelectedIdx(0)
  }, [search])

  // 计算全局选中索引映射
  let globalIdx = 0

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={650}
      className="claude-cmd-modal"
      closable
      maskClosable
      title="Claude Code 指令"
    >
      <div className="claude-cmd-panel">
        <div className="claude-cmd-header">
          <SearchOutlined className="claude-cmd-search-icon" />
          <Input
            placeholder="搜索指令（支持指令名和中文描述）..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="claude-cmd-search"
            variant="borderless"
            autoFocus
          />
          <span className="claude-cmd-count">
            {filteredFlat.length} / {allCommands.length} 条指令
          </span>
        </div>

        <div className="claude-cmd-body">
          {filteredCategories.length === 0 ? (
            <div className="claude-cmd-empty">
              <Text type="secondary">未找到匹配的指令</Text>
            </div>
          ) : (
            filteredCategories.map(cat => {
              const isCollapsed = collapsedCategories.has(cat.name)
              return (
                <div key={cat.name} className="claude-cmd-category">
                  <div
                    className="claude-cmd-category-header"
                    onClick={() => toggleCategory(cat.name)}
                  >
                    <span className="claude-cmd-category-icon">{cat.icon}</span>
                    <span className="claude-cmd-category-name">
                      {cat.name}
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 11, fontWeight: 'normal' }}>
                        ({cat.commands.length})
                      </Text>
                    </span>
                    <DownOutlined
                      className={`claude-cmd-category-arrow ${isCollapsed ? 'collapsed' : ''}`}
                    />
                  </div>
                  {!isCollapsed && (
                    <div className="claude-cmd-list">
                      {cat.commands.map(cmd => {
                        const currentIdx = globalIdx++
                        return (
                          <div
                            key={cmd.command}
                            className={`claude-cmd-item ${currentIdx === selectedIdx ? 'selected' : ''}`}
                            onClick={() => inputCommand(cmd.command)}
                            onMouseEnter={() => setSelectedIdx(currentIdx)}
                          >
                            <span className="claude-cmd-name">
                              {highlightText(cmd.command, search)}
                            </span>
                            <span className="claude-cmd-desc">
                              {highlightText(cmd.description, search)}
                            </span>
                            {cmd.args && (
                              <span className="claude-cmd-args">{cmd.args}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="claude-cmd-footer">
          <Text className="claude-cmd-footer-text">
            <kbd>↑</kbd> <kbd>↓</kbd> 选择
          </Text>
          <Text className="claude-cmd-footer-text">
            <kbd>Enter</kbd> 输入指令
          </Text>
          <Text className="claude-cmd-footer-text">
            <kbd>Esc</kbd> 关闭
          </Text>
        </div>
      </div>
    </Modal>
  )
}

export default ClaudeCommandsPanel
