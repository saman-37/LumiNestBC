// The outreach worker's name and org, asked once and kept on this phone. No accounts.

export interface Worker {
  name: string
  org: string
}

const KEY = 'luminest.worker'

export function loadWorker(): Worker | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return value?.name && value?.org ? { name: value.name, org: value.org } : null
  } catch {
    return null
  }
}

export function saveWorker(worker: Worker): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(worker))
  } catch {
    // private mode or storage blocked: we'll just ask again next time
  }
}
