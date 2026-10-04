import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

/** Circular countdown: green, amber under 10 min, red under 3 min. */
export function CountdownRing({ progress, color, children }: { progress: number; color: string; children: ReactNode }) {
  const size = 180
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  return (
    <div className="relative mx-auto grid h-[180px] w-[180px] place-items-center">
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease' }}
        />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  )
}

export type StepState = 'done' | 'current' | 'upcoming'

export function Steps({ steps }: { steps: { label: string; detail?: string; state: StepState }[] }) {
  return (
    <ol className="grid gap-0">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 && (
            <span aria-hidden className={`absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5 ${step.state === 'done' ? 'bg-green-tint-border' : 'bg-border'}`} />
          )}
          <span
            aria-hidden
            className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              step.state === 'done'
                ? 'bg-green-strong text-white'
                : step.state === 'current'
                  ? 'border-2 border-green-strong bg-green-tint'
                  : 'border-2 border-border-strong'
            }`}
          >
            {step.state === 'done' && <Check size={16} strokeWidth={3} />}
            {step.state === 'current' && <span className="h-2 w-2 rounded-full bg-green-strong" />}
          </span>
          <span className="pt-0.5">
            <span className={`block text-[15px] font-bold ${step.state === 'upcoming' ? 'text-text-muted' : 'text-text'}`}>
              {step.label}
              <span className="sr-only"> ({step.state})</span>
            </span>
            {step.detail && <span className="block text-[13px] text-text-muted">{step.detail}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
