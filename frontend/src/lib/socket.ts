import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './api'
import type { Shelter } from './types'

let socket: Socket | null = null

// Production: Socket.IO's default (connect by long-polling, then upgrade to WebSocket; stays on
// polling if something blocks WebSockets). Dev: long-polling only, because Flask's dev server
// (Werkzeug) can't close WebSockets cleanly behind Vite's proxy.
const OPTIONS = import.meta.env.DEV ? { transports: ['polling'] } : {}

function getSocket(): Socket {
  socket ??= API_BASE ? io(API_BASE, OPTIONS) : io(OPTIONS)
  return socket
}

/** Calls onUpdate with the public shelter object every time the server emits shelter_update. */
export function useShelterUpdates(onUpdate: (shelter: Shelter) => void) {
  const handler = useRef(onUpdate)
  useEffect(() => {
    handler.current = onUpdate
  })
  useEffect(() => {
    const s = getSocket()
    const listener = (shelter: Shelter) => handler.current(shelter)
    s.on('shelter_update', listener)
    return () => {
      s.off('shelter_update', listener)
    }
  }, [])
}

/** Live connection state; onReconnect fires when a dropped socket comes back. */
export function useSocketConnected(onReconnect?: () => void): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected)
  const reconnect = useRef(onReconnect)
  useEffect(() => {
    reconnect.current = onReconnect
  })
  useEffect(() => {
    const s = getSocket()
    let wasDown = false
    const up = () => {
      setConnected(true)
      if (wasDown) reconnect.current?.()
      wasDown = false
    }
    const down = () => {
      setConnected(false)
      wasDown = true
    }
    s.on('connect', up)
    s.on('disconnect', down)
    s.io.on('reconnect_attempt', down)
    setConnected(s.connected)
    return () => {
      s.off('connect', up)
      s.off('disconnect', down)
      s.io.off('reconnect_attempt', down)
    }
  }, [])
  return connected
}
