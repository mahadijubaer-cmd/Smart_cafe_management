'use client'

import { useEffect, useRef, useState } from 'react'

type WebSocketEvent = Record<string, unknown>

type UseWebSocketResult = {
  isConnected: boolean
  sendMessage: (data: object) => void
}

export function useWebSocket(
  userId: string,
  token: string,
  onMessage: (event: WebSocketEvent) => void,
): UseWebSocketResult {
  const wsRef = useRef<WebSocket | null>(null)
  const pingIntervalRef = useRef<number | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectCountRef = useRef(0)
  const mountedRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    mountedRef.current = true

    if (!userId || !token) {
      setIsConnected(false)
      return () => {
        mountedRef.current = false
      }
    }

    const wsBaseUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '')
    let manualClose = false

    const clearTimers = () => {
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }

      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }

    const connect = () => {
      clearTimers()

      const socket = new WebSocket(`${wsBaseUrl}/${userId}?token=${encodeURIComponent(token)}`)
      wsRef.current = socket

      socket.onopen = () => {
        if (!mountedRef.current) {
          socket.close()
          return
        }

        reconnectCountRef.current = 0
        setIsConnected(true)

        pingIntervalRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }))
          }
        }, 30000)
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WebSocketEvent
          onMessageRef.current(parsed)
        } catch {
          // ignore malformed payloads
        }
      }

      socket.onclose = () => {
        clearTimers()
        wsRef.current = null
        setIsConnected(false)

        if (!mountedRef.current || manualClose) {
          return
        }

        if (reconnectCountRef.current < 5) {
          reconnectCountRef.current += 1
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (mountedRef.current) {
              connect()
            }
          }, 3000)
        }
      }

      socket.onerror = () => {
        // Let onclose handle reconnect behavior.
      }
    }

    connect()

    return () => {
      mountedRef.current = false
      manualClose = true
      clearTimers()

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
      setIsConnected(false)
    }
  }, [token, userId])

  const sendMessage = (data: object) => {
    const socket = wsRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data))
    }
  }

  return { isConnected, sendMessage }
}

export default useWebSocket