import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

// 快捷键动作定义
export interface KeybindingAction {
  id: string
  title: string
  description: string
  category: '全局' | '会话' | '终端'
  defaultKey: string
}

// 默认快捷键动作列表
const DEFAULT_ACTIONS: KeybindingAction[] = [
  {
    id: 'command-palette',
    title: '命令面板',
    description: '打开命令面板搜索和执行操作',
    category: '全局',
    defaultKey: 'Ctrl+K',
  },
  {
    id: 'new-session',
    title: '新建会话',
    description: '创建一个新的 AI 对话会话',
    category: '全局',
    defaultKey: 'Ctrl+N',
  },
  {
    id: 'close-session',
    title: '关闭会话',
    description: '关闭当前活跃的会话标签',
    category: '会话',
    defaultKey: 'Ctrl+W',
  },
  {
    id: 'prev-session',
    title: '上一个标签',
    description: '切换到左侧的会话标签',
    category: '会话',
    defaultKey: 'Ctrl+PageUp',
  },
  {
    id: 'next-session',
    title: '下一个标签',
    description: '切换到右侧的会话标签',
    category: '会话',
    defaultKey: 'Ctrl+PageDown',
  },
  {
    id: 'open-settings',
    title: '打开设置',
    description: '打开应用设置面板',
    category: '全局',
    defaultKey: 'Ctrl+,',
  },
  {
    id: 'token-stats',
    title: 'Token 统计',
    description: '查看 API Token 使用统计',
    category: '全局',
    defaultKey: 'Ctrl+Shift+T',
  },
  {
    id: 'toggle-pin',
    title: '窗口置顶',
    description: '切换窗口置顶状态',
    category: '全局',
    defaultKey: 'Ctrl+Shift+P',
  },
]

interface KeybindingState {
  // 所有可绑定的动作定义
  actions: KeybindingAction[]
  // 用户自定义绑定：actionId -> keyCombo
  customBindings: Record<string, string>

  // 初始化：从配置中加载自定义绑定
  loadBindings: () => void
  // 获取某个动作的实际快捷键（自定义 > 默认）
  getKeybinding: (actionId: string) => string
  // 格式化快捷键用于显示
  formatKey: (key: string) => string
  // 检测键盘事件是否匹配某个快捷键
  matchesKeybinding: (e: KeyboardEvent, keyCombo: string) => boolean
  // 设置自定义绑定
  setCustomBinding: (actionId: string, key: string) => void
  // 移除自定义绑定（恢复默认）
  removeCustomBinding: (actionId: string) => void
  // 全部恢复默认
  resetAllBindings: () => void
  // 获取所有动作及其当前快捷键
  getAllKeybindings: () => Array<KeybindingAction & { currentKey: string }>
}

export const useKeybindingStore = create<KeybindingState>((set, get) => ({
  actions: DEFAULT_ACTIONS,
  customBindings: {},

  loadBindings: () => {
    const config = useSettingsStore.getState().config
    const bindings = config.general?.keybindings
    if (bindings) {
      set({ customBindings: bindings })
    }
  },

  getKeybinding: (actionId: string) => {
    const { customBindings, actions } = get()
    if (customBindings[actionId]) {
      return customBindings[actionId]
    }
    const action = actions.find(a => a.id === actionId)
    return action?.defaultKey || ''
  },

  formatKey: (key: string) => {
    // 统一格式化快捷键显示
    return key
      .replace('Ctrl', 'Ctrl')
      .replace('Shift', 'Shift')
      .replace('Alt', 'Alt')
      .replace('PageUp', 'PgUp')
      .replace('PageDown', 'PgDn')
  },

  matchesKeybinding: (e: KeyboardEvent, keyCombo: string) => {
    // 解析快捷键组合，如 "Ctrl+Shift+T"
    const parts = keyCombo.split('+').map(s => s.trim())
    const key = parts[parts.length - 1]
    const needCtrl = parts.includes('Ctrl')
    const needShift = parts.includes('Shift')
    const needAlt = parts.includes('Alt')

    // 检查修饰键
    if (needCtrl !== e.ctrlKey) return false
    if (needShift !== e.shiftKey) return false
    if (needAlt !== e.altKey) return false

    // 检查主键
    const eventKey = e.key.toLowerCase()
    const targetKey = key.toLowerCase()

    // 特殊键映射
    const keyMap: Record<string, string> = {
      'pageup': 'pageup',
      'pagedown': 'pagedown',
      ',': ',',
    }

    if (keyMap[targetKey]) {
      return eventKey === keyMap[targetKey]
    }

    return eventKey === targetKey
  },

  setCustomBinding: (actionId: string, key: string) => {
    const { customBindings } = get()
    const newBindings = { ...customBindings, [actionId]: key }
    set({ customBindings: newBindings })
    // 持久化到配置
    const config = useSettingsStore.getState().config
    useSettingsStore.getState().updateGeneralConfig({
      ...config.general,
      keybindings: newBindings,
    })
  },

  removeCustomBinding: (actionId: string) => {
    const { customBindings } = get()
    const newBindings = { ...customBindings }
    delete newBindings[actionId]
    set({ customBindings: newBindings })
    // 持久化到配置
    const config = useSettingsStore.getState().config
    useSettingsStore.getState().updateGeneralConfig({
      ...config.general,
      keybindings: newBindings,
    })
  },

  resetAllBindings: () => {
    set({ customBindings: {} })
    const config = useSettingsStore.getState().config
    useSettingsStore.getState().updateGeneralConfig({
      ...config.general,
      keybindings: {},
    })
  },

  getAllKeybindings: () => {
    const { actions, customBindings } = get()
    return actions.map(action => ({
      ...action,
      currentKey: customBindings[action.id] || action.defaultKey,
    }))
  },
}))
