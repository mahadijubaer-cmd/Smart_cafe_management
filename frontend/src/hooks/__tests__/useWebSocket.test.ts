import { renderHook, act } from '@testing-library/react'

import { useWebSocket } from '../useWebSocket'

type MockSocket = {
  url: string
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  send: jest.Mock
  close: jest.Mock
}

describe('useWebSocket', () => {
  const originalWebSocket = global.WebSocket
  const socketInstances: MockSocket[] = []
  let MockWebSocket: jest.Mock

  beforeEach(() => {
    jest.useFakeTimers()
    socketInstances.length = 0

    MockWebSocket = jest.fn().mockImplementation((url: string) => {
      const socket: MockSocket = {
        url,
        readyState: 1,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send: jest.fn(),
        close: jest.fn(),
      }

      socketInstances.push(socket)
      return socket
    })

    // @ts-expect-error mock global WebSocket for test
    global.WebSocket = MockWebSocket
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    global.WebSocket = originalWebSocket
  })

  it('creates WebSocket with token in the url and handles messages', () => {
    const onMessage = jest.fn()

    renderHook(() => useWebSocket('user-123', 'token-abc', onMessage))

    expect(MockWebSocket).toHaveBeenCalledWith('ws://localhost:8000/user-123?token=token-abc')

    const socket = socketInstances[0]
    act(() => {
      socket.onmessage?.({ data: JSON.stringify({ type: 'ORDER_READY', order_id: '1' }) } as MessageEvent)
    })

    expect(onMessage).toHaveBeenCalledWith({ type: 'ORDER_READY', order_id: '1' })
  })

  it('reconnects after close with a delay', () => {
    const onMessage = jest.fn()

    renderHook(() => useWebSocket('user-123', 'token-abc', onMessage))

    const firstSocket = socketInstances[0]

    act(() => {
      firstSocket.onclose?.(new CloseEvent('close'))
    })

    expect(socketInstances).toHaveLength(1)

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(socketInstances).toHaveLength(2)
    expect(MockWebSocket).toHaveBeenNthCalledWith(2, 'ws://localhost:8000/user-123?token=token-abc')
  })
})