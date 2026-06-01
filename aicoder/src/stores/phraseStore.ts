import { create } from 'zustand'
import { useSettingsStore, PhraseItem } from './settingsStore'

interface PhraseState {
  phrases: PhraseItem[]

  // 从配置加载
  loadPhrases: () => void
  // 添加常用语
  addPhrase: (label: string, content: string) => void
  // 更新常用语
  updatePhrase: (id: string, label: string, content: string) => void
  // 删除常用语
  removePhrase: (id: string) => void
  // 持久化到配置
  savePhrases: (phrases: PhraseItem[]) => void
}

// 生成简单唯一ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export const usePhraseStore = create<PhraseState>((set, get) => ({
  phrases: [],

  loadPhrases: () => {
    const config = useSettingsStore.getState().config
    const phrases = config.general?.phrases || []
    set({ phrases })
  },

  addPhrase: (label: string, content: string) => {
    const { phrases } = get()
    const newPhrase: PhraseItem = { id: generateId(), label, content }
    const newPhrases = [...phrases, newPhrase]
    set({ phrases: newPhrases })
    get().savePhrases(newPhrases)
  },

  updatePhrase: (id: string, label: string, content: string) => {
    const { phrases } = get()
    const newPhrases = phrases.map(p =>
      p.id === id ? { ...p, label, content } : p
    )
    set({ phrases: newPhrases })
    get().savePhrases(newPhrases)
  },

  removePhrase: (id: string) => {
    const { phrases } = get()
    const newPhrases = phrases.filter(p => p.id !== id)
    set({ phrases: newPhrases })
    get().savePhrases(newPhrases)
  },

  savePhrases: (phrases: PhraseItem[]) => {
    const config = useSettingsStore.getState().config
    useSettingsStore.getState().updateGeneralConfig({
      ...config.general,
      phrases,
    })
  },
}))
