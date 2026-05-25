import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTokenStore } from '../stores/tokenStore'
import { useSessionStore } from '../stores/sessionStore'
import type { SessionUsageDelta } from '../types/token'

const POLL_INTERVAL = 15000 // 15 seconds

export function useTokenPolling() {
  const offsetMapRef = useRef<Map<string, number>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const poll = async () => {
      const { sessions, activeSessionId } = useSessionStore.getState()
      if (!activeSessionId) return

      const session = sessions.find(s => s.id === activeSessionId)
      if (!session || session.sessionType !== 'claude' || !session.cliSessionId) return

      const sessionId = session.cliSessionId
      const lastOffset = offsetMapRef.current.get(sessionId) || 0

      try {
        const delta = await invoke<SessionUsageDelta>('get_session_token_usage', {
          sessionId,
          projectPath: session.projectPath,
          lastOffset,
        })

        // Update offset for next poll
        offsetMapRef.current.set(sessionId, delta.newFileOffset)

        // Feed into token store
        useTokenStore.getState().processSessionDelta(delta)
      } catch (err) {
        // Silently ignore - file may not exist yet
        console.debug('[TokenPolling] Error:', err)
      }
    }

    // Initial poll
    poll()

    // Set up interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, []) // Empty deps - reads from store directly
}
