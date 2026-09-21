import { useState } from 'react'
import { Button, Input } from 'antd'
import { CloseOutlined, PlusOutlined, CheckOutlined, LeftOutlined, DeleteOutlined } from '@ant-design/icons'
import { useMemoStore } from '../stores/memoStore'
import type { MemoPriority, MemoItem } from '../stores/memoStore'
import '../styles/MemoPanel.css'

const PRI: Record<MemoPriority, { label: string; color: string }> = {
  high: { label: '高', color: '#EF4444' },
  medium: { label: '中', color: '#F59E0B' },
  low: { label: '低', color: '#3B82F6' },
}

const fmtDate = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── 列表视图 ──
function ListView({ onSelect, onCreate }: { onSelect: (m: MemoItem) => void; onCreate: () => void }) {
  const { memos, filter, setFilter, toggleMemo, deleteMemo, clearDone } = useMemoStore()

  const filtered = memos.filter(m => {
    if (filter === 'pending') return !m.done
    if (filter === 'done') return m.done
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const ord = { high: 0, medium: 1, low: 2 }
    if (a.done !== b.done) return a.done ? 1 : -1
    return ord[a.priority] - ord[b.priority]
  })

  const pending = memos.filter(m => !m.done).length
  const done = memos.filter(m => m.done).length

  return (
    <>
      <div className="memo-filters">
        {([['all', '全部'], ['pending', '待完成'], ['done', '已完成']] as const).map(([k, l]) => (
          <button key={k} className={`memo-filter-btn ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <span className="memo-list-count">{pending}/{memos.length}</span>
      </div>

      <div className="memo-list">
        {sorted.length === 0 ? (
          <div className="memo-empty">{filter === 'all' ? '暂无备忘事项' : '无匹配项'}</div>
        ) : (
          sorted.map(m => (
            <div key={m.id} className={`memo-row ${m.done ? 'is-done' : ''}`}>
              <button className={`memo-check ${m.done ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); toggleMemo(m.id) }}>
                {m.done && <CheckOutlined />}
              </button>
              <div className="memo-row-main" onClick={() => onSelect(m)}>
                <span className="memo-row-title">{m.title}</span>
                <span className="memo-row-sub">
                  <span className="memo-pri-dot" style={{ background: PRI[m.priority].color }} />
                  {m.dueDate && <span className="memo-row-due">{fmtDate(m.dueDate)}</span>}
                  {!m.dueDate && <span className="memo-row-time">{fmtTime(m.createdAt)}</span>}
                </span>
              </div>
              <button className="memo-row-del" onClick={(e) => { e.stopPropagation(); deleteMemo(m.id) }}>✕</button>
            </div>
          ))
        )}
      </div>

      {done > 0 && (
        <div className="memo-footer">
          <button className="memo-clear-btn" onClick={clearDone}><DeleteOutlined /> 清除已完成 ({done})</button>
        </div>
      )}

      <button className="memo-fab" onClick={onCreate} title="新建备忘">
        <PlusOutlined />
      </button>
    </>
  )
}

// ── 编辑/新建视图 ──
function EditView({ memo, onBack }: { memo?: MemoItem; onBack: () => void }) {
  const { addMemo, updateMemo, deleteMemo } = useMemoStore()
  const [title, setTitle] = useState(memo?.title || '')
  const [content, setContent] = useState(memo?.content || '')
  const [priority, setPriority] = useState<MemoPriority>(memo?.priority || 'medium')
  const [dueDate, setDueDate] = useState(memo?.dueDate || '')

  const isNew = !memo

  const handleSave = () => {
    if (!title.trim()) return
    if (isNew) {
      addMemo(title.trim(), content.trim(), priority, dueDate)
    } else {
      updateMemo(memo.id, { title: title.trim(), content: content.trim(), priority, dueDate })
    }
    onBack()
  }

  const handleDelete = () => {
    if (memo) deleteMemo(memo.id)
    onBack()
  }

  return (
    <>
      <div className="memo-edit-header">
        <button className="memo-back-btn" onClick={onBack}><LeftOutlined /> 返回</button>
        <span className="memo-edit-label">{isNew ? '新建备忘' : '编辑备忘'}</span>
        {!isNew && (
          <button className="memo-edit-del-btn" onClick={handleDelete}><DeleteOutlined /></button>
        )}
      </div>

      <div className="memo-edit-body">
        <div className="memo-field">
          <label className="memo-field-label">标题</label>
          <Input
            className="memo-field-input"
            placeholder="输入标题..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="memo-field">
          <label className="memo-field-label">优先级</label>
          <div className="memo-pri-select">
            {(['high', 'medium', 'low'] as MemoPriority[]).map(p => (
              <button
                key={p}
                className={`memo-pri-opt ${priority === p ? 'active' : ''}`}
                style={{ '--pri-color': PRI[p].color } as React.CSSProperties}
                onClick={() => setPriority(p)}
              >
                {PRI[p].label}
              </button>
            ))}
          </div>
        </div>

        <div className="memo-field">
          <label className="memo-field-label">截止日期 <span className="memo-field-optional">（可选）</span></label>
          <Input
            className="memo-field-input"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </div>

        <div className="memo-field memo-field-grow">
          <label className="memo-field-label">内容</label>
          <Input.TextArea
            className="memo-field-textarea"
            placeholder="详细内容..."
            value={content}
            onChange={e => setContent(e.target.value)}
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </div>
      </div>

      <div className="memo-edit-footer">
        <Button onClick={onBack}>取消</Button>
        <Button type="primary" onClick={handleSave} disabled={!title.trim()}>
          {isNew ? '创建' : '保存'}
        </Button>
      </div>
    </>
  )
}

// ── 主面板 ──
interface MemoPanelProps {
  visible: boolean
  onClose: () => void
}

type View = { type: 'list' } | { type: 'create' } | { type: 'edit'; memo: MemoItem }

function MemoPanel({ visible, onClose }: MemoPanelProps) {
  const [view, setView] = useState<View>({ type: 'list' })

  if (!visible) return null

  return (
    <>
      <div className="memo-overlay" onClick={onClose} />
      <div className="memo-panel">
        <div className="memo-header">
          <span className="memo-header-title">备忘录</span>
          <Button type="text" icon={<CloseOutlined />} className="memo-close-btn" onClick={onClose} />
        </div>

        <div className="memo-body">
          {view.type === 'list' && (
            <ListView
              onSelect={(m) => setView({ type: 'edit', memo: m })}
              onCreate={() => setView({ type: 'create' })}
            />
          )}
          {(view.type === 'create' || view.type === 'edit') && (
            <EditView
              memo={view.type === 'edit' ? view.memo : undefined}
              onBack={() => setView({ type: 'list' })}
            />
          )}
        </div>
      </div>
    </>
  )
}

export default MemoPanel
