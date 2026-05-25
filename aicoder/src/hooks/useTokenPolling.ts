import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTokenStore } from '../stores/tokenStore'
import { useSessionStore } from '../stores/sessionStore'
import type { SessionUsageDelta } from '../types/token'

const POLL_INTERVAL = 15000 // 15 seconds

export function useTokenPolling() {
  const offsetMapRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const backfilledRef = useRef(false)

  // 启动时全量扫描所有 Claude 会话
  useEffect(() => {
    if (backfilledRef.current) return
    backfilledRef.current = true

    const backfill = async () => {
      const { sessions } = useSessionStore.getState()
      const claudeSessions = sessions.filter(
        s => s.sessionType === 'claude' && s.cliSessionId
      )

      for (const session of claudeSessions) {
        const cliId = session.cliSessionId!
        // 已有偏移量则跳过（避免重复扫描）
        if (offsetMapRef.current.has(cliId)) continue

        try {
          const delta = await invoke<SessionUsageDelta>('get_session_token_usage', {
            sessionId: cliId,
            projectPath: session.projectPath,
            lastOffset: 0,
          })
          offsetMapRef.current.set(cliId, delta.newFileOffset)
          useTokenStore.getState().processSessionDelta(delta)
        } catch {
          // 文件不存在等情况，静默跳过
        }
      }
    }

    backfill()
  }, [])

  // 持续轮询活跃会话（增量更新）
  useEffect(() => {
    const poll = async () => {
      const { sessions, activeSessionId } = useSessionStore.getState()
      if (!activeSessionId) return

      const session = sessions.find(s => s.id === activeSessionId)
      if (!session || session.sessionType !== 'claude' || !session.cliSessionId) return

      const cliId = session.cliSessionId
      const lastOffset = offsetMapRef.current.get(cliId) || 0

      try {
        const delta = await invoke<SessionUsageDelta>('get_session_token_usage', {
          sessionId: cliId,
          projectPath: session.projectPath,
          lastOffset,
        })

        offsetMapRef.current.set(cliId, delta.newFileOffset)
        useTokenStore.getState().processSessionDelta(delta)
      } catch {
        // 静默忽略
      }
    }

    // 首次轮询
    poll()

    // 定时轮询
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])
}
