import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// 类型定义（与Rust后端对应）
export interface ApiConfig {
  use_custom_api: boolean
  api_base_url: string | null
  api_key: string | null
}

export interface ClaudeConfig {
  cli_path: string | null
  default_args: string[]
  env_vars: Array<[string, string]>
  api_config: ApiConfig
}

export interface GeneralConfig {
  theme: string
  terminal_font_size: number
  auto_start_claude: boolean
  default_export_path: string | null
}

export interface AppConfig {
  claude: ClaudeConfig
  general: GeneralConfig
}

// 更新相关类型
export interface UpdateInfo {
  version: string
  download_url: string
  body: string
  published_at: string
  file_size: number
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error' | 'up_to_date'

// 默认配置
const defaultConfig: AppConfig = {
  claude: {
    cli_path: null,
    default_args: [],
    env_vars: [],
    api_config: {
      use_custom_api: false,
      api_base_url: null,
      api_key: null,
    },
  },
  general: {
    theme: 'dark',
    terminal_font_size: 14,
    auto_start_claude: false,
    default_export_path: null,
  },
}

interface SettingsState {
  config: AppConfig
  isLoading: boolean
  claudeInstalled: boolean | null
  claudeVersion: string | null
  claudeVersions: string[]  // 可用版本列表
  currentTheme: 'light' | 'dark'  // 当前生效的主题
  checkpointVisible: boolean  // 检查点弹窗是否显示

  // 更新相关
  appVersion: string
  updateStatus: UpdateStatus
  updateInfo: UpdateInfo | null
  updateError: string | null

  // Actions
  loadConfig: () => Promise<void>
  saveConfig: (config: AppConfig) => Promise<void>
  updateClaudeConfig: (config: ClaudeConfig) => Promise<void>
  updateGeneralConfig: (config: GeneralConfig) => Promise<void>
  checkClaudeInstallation: () => Promise<boolean>
  getClaudeVersion: () => Promise<string | null>
  getClaudeVersions: () => Promise<string[]>
  setTerminalFontSize: (size: number) => void
  setTheme: (theme: string) => void
  setAutoStartClaude: (auto: boolean) => void
  setDefaultExportPath: (path: string | null) => void
  setCurrentTheme: (theme: 'light' | 'dark') => void
  setCheckpointVisible: (visible: boolean) => void
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<UpdateInfo | null>
  downloadAndInstallUpdate: () => Promise<void>
  setUpdateStatus: (status: UpdateStatus) => void
  clearUpdateError: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: defaultConfig,
  isLoading: false,
  claudeInstalled: null,
  claudeVersion: null,
  claudeVersions: [],
  currentTheme: 'dark',
  checkpointVisible: false,

  // 更新相关状态
  appVersion: '',
  updateStatus: 'idle',
  updateInfo: null,
  updateError: null,

  // 加载配置
  loadConfig: async () => {
    set({ isLoading: true })
    try {
      const config = await invoke<AppConfig>('get_config')
      set({ config, isLoading: false })
    } catch (err) {
      console.error('加载配置失败:', err)
      set({ isLoading: false })
    }
  },

  // 保存完整配置
  saveConfig: async (config) => {
    set({ isLoading: true })
    try {
      await invoke('save_config', { config })
      set({ config, isLoading: false })
    } catch (err) {
      console.error('保存配置失败:', err)
      set({ isLoading: false })
    }
  },

  // 更新 Claude 配置
  updateClaudeConfig: async (claudeConfig) => {
    set({ isLoading: true })
    try {
      await invoke('update_claude_config', { config: claudeConfig })
      set((state) => ({
        config: { ...state.config, claude: claudeConfig },
        isLoading: false,
      }))
    } catch (err) {
      console.error('更新 Claude 配置失败:', err)
      set({ isLoading: false })
    }
  },

  // 更新通用配置
  updateGeneralConfig: async (generalConfig) => {
    set({ isLoading: true })
    try {
      await invoke('update_general_config', { config: generalConfig })
      set((state) => ({
        config: { ...state.config, general: generalConfig },
        isLoading: false,
      }))
    } catch (err) {
      console.error('更新通用配置失败:', err)
      set({ isLoading: false })
    }
  },

  // 检查 Claude 安装
  checkClaudeInstallation: async () => {
    try {
      const installed = await invoke<boolean>('check_claude_installation')
      set({ claudeInstalled: installed })
      return installed
    } catch (err) {
      console.error('检查 Claude 安装失败:', err)
      set({ claudeInstalled: false })
      return false
    }
  },

  // 获取 Claude 版本
  getClaudeVersion: async () => {
    try {
      const version = await invoke<string>('get_claude_version')
      set({ claudeVersion: version })
      return version
    } catch (err) {
      console.error('获取 Claude 版本失败:', err)
      set({ claudeVersion: null })
      return null
    }
  },

  // 获取 Claude 可用版本列表
  getClaudeVersions: async () => {
    try {
      const versions = await invoke<string[]>('get_claude_versions')
      set({ claudeVersions: versions })
      return versions
    } catch (err) {
      console.error('获取 Claude 版本列表失败:', err)
      set({ claudeVersions: [] })
      return []
    }
  },

  // 快速设置终端字体大小
  setTerminalFontSize: (size) => {
    const { config, updateGeneralConfig } = get()
    updateGeneralConfig({ ...config.general, terminal_font_size: size })
  },

  // 快速设置主题
  setTheme: (theme) => {
    const { config, updateGeneralConfig } = get()
    updateGeneralConfig({ ...config.general, theme })
  },

  // 快速设置自动启动
  setAutoStartClaude: (auto) => {
    const { config, updateGeneralConfig } = get()
    updateGeneralConfig({ ...config.general, auto_start_claude: auto })
  },

  // 设置默认导出路径
  setDefaultExportPath: (path: string | null) => {
    const { config, updateGeneralConfig } = get()
    updateGeneralConfig({ ...config.general, default_export_path: path })
  },

  // 设置当前生效的主题
  setCurrentTheme: (theme: 'light' | 'dark') => {
    set({ currentTheme: theme })
  },

  // 设置检查点弹窗可见性
  setCheckpointVisible: (visible: boolean) => {
    set({ checkpointVisible: visible })
  },

  // 获取应用版本
  getAppVersion: async () => {
    try {
      const version = await invoke<string>('get_app_version')
      set({ appVersion: version })
      return version
    } catch (err) {
      console.error('获取应用版本失败:', err)
      return '0.0.0'
    }
  },

  // 检查更新（使用自定义 GitHub API）
  checkForUpdates: async () => {
    set({ updateStatus: 'checking', updateError: null })
    try {
      const updateInfo = await invoke<UpdateInfo>('check_github_update')
      set({ updateStatus: 'available', updateInfo })
      return updateInfo
    } catch (err) {
      const errStr = String(err)
      console.error('检查更新失败:', errStr)
      // 如果是"当前已是最新版本"，显示 up_to_date 状态
      if (errStr.includes('当前已是最新版本')) {
        set({ updateStatus: 'up_to_date' })
      } else {
        set({ updateStatus: 'error', updateError: errStr })
      }
      return null
    }
  },

  // 下载并安装更新
  downloadAndInstallUpdate: async () => {
    const { updateInfo } = get()
    if (!updateInfo) {
      set({ updateStatus: 'error', updateError: '没有可用更新' })
      return
    }

    set({ updateStatus: 'downloading' })
    try {
      const filePath = await invoke<string>('download_update', {
        url: updateInfo.download_url,
      })
      set({ updateStatus: 'installing' })
      await invoke('install_update', { filePath })
    } catch (err) {
      console.error('安装更新失败:', err)
      set({ updateStatus: 'error', updateError: String(err) })
    }
  },

  // 设置更新状态
  setUpdateStatus: (status: UpdateStatus) => {
    set({ updateStatus: status })
  },

  // 清除更新错误
  clearUpdateError: () => {
    set({ updateError: null, updateStatus: 'idle' })
  },
}))
