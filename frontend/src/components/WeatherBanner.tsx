import { Sun } from 'lucide-react'

/** Extreme Weather Mode banner. Built now; Tier 3 (/api/weather-layer) decides when it shows. */
export function WeatherBanner({
  title = 'Extreme Weather Mode is on',
  body = 'Extra beds and warming centres may be open tonight.',
}: {
  title?: string
  body?: string
}) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-[16px] border border-banner-border bg-banner-bg px-3.5 py-3">
      <Sun aria-hidden size={20} className="mt-0.5 shrink-0 text-amber" />
      <div>
        <p className="text-[15px] font-semibold text-banner-title">{title}</p>
        <p className="text-[13px] text-banner-body">{body}</p>
      </div>
    </div>
  )
}
