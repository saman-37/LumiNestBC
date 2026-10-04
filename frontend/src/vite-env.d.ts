/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://api.luminestbc.tech. Empty = same origin (Vite proxy in dev). */
  readonly VITE_API_URL?: string
  /** Free CARTO basemaps key for dark tiles. Empty = darkened OSM fallback. */
  readonly VITE_CARTO_KEY?: string
  /** Google Street View Static API key (browser key). Empty = fallback tiles instead of photos. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
}

interface SpeechRecognitionEvent extends Event {
  results: {
    length: number
    item(index: number): {
      length: number
      item(index: number): { transcript: string }
      [index: number]: { transcript: string }
      isFinal?: boolean
    }
    [index: number]: {
      length: number
      item(index: number): { transcript: string }
      [index: number]: { transcript: string }
      isFinal?: boolean
    }
  }
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null
}

interface Window {
  SpeechRecognition?: {
    new (): SpeechRecognitionInstance
  }
  webkitSpeechRecognition?: {
    new (): SpeechRecognitionInstance
  }
}

declare module 'qrcode-generator' {
  function qrcode(typeNumber: number, errorCorrectionLevel: string): {
    addData(data: string): void
    make(): void
    createDataURL(cellSize?: number, margin?: number): string
    createImgTag(cellSize?: number, margin?: number): string
  }
  export default qrcode
}
