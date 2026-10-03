/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://api.luminestbc.tech. Empty = same origin (Vite proxy in dev). */
  readonly VITE_API_URL?: string
  /** Free CARTO basemaps key for dark tiles. Empty = darkened OSM fallback. */
  readonly VITE_CARTO_KEY?: string
}
