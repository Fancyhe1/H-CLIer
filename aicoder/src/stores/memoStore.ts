import { create } from 'zustand'

export type MemoPriority = 'high' | 'medium' | 'low'
export type MemoFilter = 'all' | 'pending' | 'done'

export interface MemoItem {
  id: string
  title: string
  content: string
  done: boolean
  priority: MemoPriority
  dueDate: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'hcl-ier_memos_v3'

function migrateFromV2(items: any[]): MemoItem[] {
  return items.map(m => ({
    id: m.id,
    title: m.text || m.title || '',
    content: m.content || '',
    done: m.done,
    priority: m.priority || 'medium',
    dueDate: m.dueDate || '',
    createdAt: m.createdAt || new Date().toISOString(),
    updatedAt: m.updatedAt || m.createdAt || new Date().toISOString(),
  }))
}

function loadMemos(): MemoItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (data) return JSON.parse(data)
    // 迁移 v2
    const v2 = localStorage.getItem('hcl-ier_memos_v2')
    if (v2) {
      const migrated = migrateFromV2(JSON.parse(v2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      localStorage.removeItem('hcl-ier_memos_v2')
      return migrated
    }
    // 迁移 v1
    const v1 = localStorage.getItem('hcl-ier_memos')
    if (v1) {
      const items = JSON.parse(v1)
      const migrated = items.map((m: any) => ({
        id: m.id,
        title: m.text || '',
        content: '',
        done: m.done,
        priority: 'medium' as MemoPriority,
        dueDate: '',
        createdAt: m.createdAt || new Date().toISOString(),
        updatedAt: m.createdAt || new Date().toISOString(),
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      localStorage.removeItem('hcl-ier_memos')
      return migrated
    }
    return []
  } catch {
    return []
  }
}

function saveMemos(memos: MemoItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memos))
}

interface MemoStore {
  memos: MemoItem[]
  filter: MemoFilter
  setFilter: (f: MemoFilter) => void
  addMemo: (title: string, content: string, priority?: MemoPriority, dueDate?: string) => void
  updateMemo: (id: string, updates: Partial<Pick<MemoItem, 'title' | 'content' | 'priority' | 'dueDate'>>) => void
  toggleMemo: (id: string) => void
  deleteMemo: (id: string) => void
  clearDone: () => void
}

export const useMemoStore = create<MemoStore>((set) => ({
  memos: loadMemos(),
  filter: 'all',

  setFilter: (f) => set({ filter: f }),

  addMemo: (title, content = '', priority = 'medium', dueDate = '') => {
    set((state) => {
      const now = new Date().toISOString()
      const updated = [{ id: crypto.randomUUID(), title, content, done: false, priority, dueDate, createdAt: now, updatedAt: now }, ...state.memos]
      saveMemos(updated)
      return { memos: updated }
    })
  },

  updateMemo: (id, updates) => {
    set((state) => {
      const updated = state.memos.map(m =>
        m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
      )
      saveMemos(updated)
      return { memos: updated }
    })
  },

  toggleMemo: (id) => {
    set((state) => {
      const updated = state.memos.map(m =>
        m.id === id ? { ...m, done: !m.done, updatedAt: new Date().toISOString() } : m
      )
      saveMemos(updated)
      return { memos: updated }
    })
  },

  deleteMemo: (id) => {
    set((state) => {
      const updated = state.memos.filter(m => m.id !== id)
      saveMemos(updated)
      return { memos: updated }
    })
  },

  clearDone: () => {
    set((state) => {
      const updated = state.memos.filter(m => !m.done)
      saveMemos(updated)
      return { memos: updated }
    })
  },
}))
