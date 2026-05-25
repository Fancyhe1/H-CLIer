import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTokenStore } from '../stores/tokenStore'
import { useSessionStore } from '../stores/sessionStore'
import type { SessionUsageResult } from '../types/token'

const POLL_INTERVAL = 15000 // 15 seconds

// 模块级偏移量表，供 refreshAllStats 外部访问
const offsetMap = new Map<string, number>()

async function scanAllSessions() {
  const { sessions } = useSessionStore.getState()
  const claudeSessions = sessions.filter(
    s => s.sessionType === 'claude' && s.cliSessionId
  )

  for (const session of claudeSessions) {
    const cliId = session.cliSessionId!
    try {
      const result = await invoke<SessionUsageResult>('get_session_token_usage', {
        sessionId: cliId,
        projectPath: session.projectPath,
        lastOffset: offsetMap.get(cliId) || 0,
      })
      offsetMap.set(cliId, result.newFileOffset)
      useTokenStore.getState().processSessionResult(result)
    } catch {
      // 文件不存在等情况，静默跳过
    }
  }
}

/** 外部调用：清空偏移量，重新全量扫描所有会话 */
export async function refreshAllStats() {
  offsetMap.clear()
  useTokenStore.getState().clearStats()
  await scanAllSessions()
}

export function useTokenPolling() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 启动时全量扫描所有 Claude 会话
  useEffect(() => {
    scanAllSessions()
  }, [])

  // 持续轮询活跃会话（增量更新）
  useEffect(() => {
    const poll = async () => {
      const { sessions, activeSessionId } = useSessionStore.getState()
      if (!activeSessionId) return

      const session = sessions.find(s => s.id === activeSessionId)
      if (!session || session.sessionType !== 'claude' || !session.cliSessionId) return

      const cliId = session.cliSessionId
      const lastOffset = offsetMap.get(cliId) || 0

      try {
        const result = await invoke<SessionUsageResult>('get_session_token_usage', {
          sessionId: cliId,
          projectPath: session.projectPath,
          lastOffset,
        })

        offsetMap.set(cliId, result.newFileOffset)
        useTokenStore.getState().processSessionResult(result)
      } catch {
        // 静默忽略
      }
    }

    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])
}
