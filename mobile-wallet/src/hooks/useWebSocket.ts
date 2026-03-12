/**
 * WebSocket hook — auto-reconnect pattern
 * Receives real-time events from backend (credential status changes, etc.)
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import Constants from 'expo-constants'

interface WSMessage {
  type: string
  data: unknown
  timestamp: string
}

interface UseWebSocketOptions {
  onMessage?: (msg: WSMessage) => void
  autoConnect?: boolean
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(options.onMessage)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const [connected, setConnected] = useState(false)

  // Keep callback ref stable
  onMessageRef.current = options.onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const wsUrl = Constants.expoConfig?.extra?.wsUrl || 'ws://localhost:3000/ws'

    try {
      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage
          onMessageRef.current?.(msg)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        // Auto-reconnect after 5s
        reconnectTimer.current = setTimeout(connect, 5000)
      }

      ws.onerror = () => {
        ws.close()
      }

      wsRef.current = ws
    } catch {
      reconnectTimer.current = setTimeout(connect, 5000)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
    }
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
  }, [])

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        connect()
      } else if (state === 'background') {
        disconnect()
      }
    }

    const subscription = AppState.addEventListener('change', handleAppState)

    if (options.autoConnect !== false) {
      connect()
    }

    return () => {
      subscription.remove()
      disconnect()
    }
  }, [connect, disconnect, options.autoConnect])

  return { connected, connect, disconnect }
}
