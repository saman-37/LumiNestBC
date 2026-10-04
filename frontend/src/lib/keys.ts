// Private keys kept on this device only (no accounts). Staff keys arrive in the link's
// #key= fragment, which never reaches server logs; we save it and remove it from the URL.

const staffKeyName = (shelterId: string) => `luminest.staffKey.${shelterId}`
const ADMIN_KEY = 'luminest.adminKey'

function read(name: string): string | null {
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(name)
    else localStorage.setItem(name, value)
  } catch {
    // storage blocked: the key works for this page view only
  }
}

/** If the URL has #key=..., save it for this shelter and strip it from the address bar. */
export function captureStaffKeyFromUrl(shelterId: string): string | null {
  const match = window.location.hash.match(/key=([A-Za-z0-9_-]+)/)
  if (!match) return null
  write(staffKeyName(shelterId), match[1])
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  return match[1]
}

export const getStaffKey = (shelterId: string) => read(staffKeyName(shelterId))
export const forgetStaffKey = (shelterId: string) => write(staffKeyName(shelterId), null)
export const getAdminKey = () => read(ADMIN_KEY)
export const saveAdminKey = (key: string | null) => write(ADMIN_KEY, key)
