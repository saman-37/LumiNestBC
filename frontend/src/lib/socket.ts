import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './api'
import type { Shelter } from './types'

let socket: Socket | null = null

function getSocket(): Socket {
  socket ??= API_BASE ? io(API_BASE) : io()
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
