/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://api.luminestbc.tech. Empty = same origin (Vite proxy in dev). */
  readonly VITE_API_URL?: string
  /** Free CARTO basemaps key for dark tiles. Empty = darkened OSM fallback. */
  readonly VITE_CARTO_KEY?: string
  /** Google Street View Static API key (browser key). Empty = fallback tiles instead of photos. */
  readonly VITE_GOOGLE_MAPS_KEY?: string
}
