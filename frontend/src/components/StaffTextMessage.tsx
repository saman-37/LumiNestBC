import { MessageSquareText } from 'lucide-react'

/**
 * A staff SMS shown in the dashboard feed (Tier 2). The API doesn't return message text
 * yet, so `text` is optional; chips come from what Gemini parsed.
 */
export function StaffTextMessage({ text, chips }: { text?: string; chips: string[] }) {
  return (
    <div className="min-w-0">
      <p className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-text">
        <MessageSquareText aria-hidden size={16} className="text-blue" /> Staff text
      </p>
      {text && (
        <blockquote className="mt-1 rounded-[12px] rounded-tl-sm border border-border bg-surface-2 px-3 py-2 text-[15px] italic text-text-2">
          “{text}”
        </blockquote>
      )}
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <li key={chip} className="rounded-full border border-blue-tint-border bg-blue-tint px-2 py-0.5 text-[13px] font-semibold text-blue-light">
            {chip}
          </li>
        ))}
      </ul>
    </div>
  )
}
