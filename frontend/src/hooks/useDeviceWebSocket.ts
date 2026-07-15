'use client'

/**
 * WebSocket hook for device terminals (RFC-010 — specs/modules/websocket.md
 * "Device Connection"). Connects /ws/device?token={device_token} with
 * exponential backoff (1s → 30s cap), PING keep-alive, and exposes `online`
 * so signage can show its reconnect glyph and fall back to polling (SGN-2).
 */
import { useEffect, useRef, useState } from 'react'

import { clearDevicePairing, getDeviceToken } from '@/lib/deviceApi'

type DeviceWsEvent = Record<string, unknown> & { type: string }

export function useDeviceWebSocket(
  deviceId: string | null,
  onMessage: (event: DeviceWsEvent) => void,
): { online: boolean } {
  const [online, setOnline] = useState(false)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!deviceId) return

    let ws: WebSocket | null = null
    let pingInterval: number | null = null
    let reconnectTimeout: number | null = null
    let attempts = 0
    let closed = false

    const connect = () => {
      const token = getDeviceToken()
      if (!token || closed) return
      const wsBase = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000').replace(/\/$/, '')
      ws = new WebSocket(`${wsBase}/ws/device?token=${encodeURIComponent(token)}`)

      ws.onopen = () => {
        attempts = 0
        setOnline(true)
        pingInterval = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }))
        }, 30_000)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as DeviceWsEvent
          if (msg.type === 'PONG') return
          if (msg.type === 'DEVICE_REVOKED' && msg.target_device_id === deviceId) {
            // DEV-3: wipe credential, return to pairing (handled by the shell).
            clearDevicePairing()
            return
          }
          onMessageRef.current(msg)
        } catch {
          /* ignore malformed frames */
        }
      }

      ws.onclose = () => {
        setOnline(false)
        if (pingInterval) window.clearInterval(pingInterval)
        pingInterval = null
        if (closed) return
        const delay = Math.min(1000 * 2 ** attempts, 30_000)
        attempts += 1
        reconnectTimeout = window.setTimeout(connect, delay)
      }

      ws.onerror = () => ws?.close()
    }

    connect()

    return () => {
      closed = true
      if (pingInterval) window.clearInterval(pingInterval)
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout)
      ws?.close()
      setOnline(false)
    }
  }, [deviceId])

  return { online }
}
