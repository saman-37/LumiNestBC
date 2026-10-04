import { Check, Copy, Printer } from 'lucide-react'
import { useState } from 'react'
import { formatAgo } from '../../lib/format'
import type { TagAction, TagLink } from '../../lib/types'
import { Button } from '../Button'
import { useToast } from '../Toast'
import { PrintSheet } from './PrintSheet'
import { ConfirmRow, Section } from './Section'

function status(tag: TagLink): string {
  if (!tag.path) return 'Not set up yet'
  if (tag.minutes_since_tap === null) return 'Never tapped'
  return `Last tapped ${formatAgo(tag.minutes_since_tap)}`
}

interface Props {
  shelterName: string
  tags: TagLink[]
  busy: boolean
  /** returns the fresh tag list after rotating */
  onRotate: (action: TagAction) => Promise<TagLink[] | null>
}

/** The four Tap Board tags: status, "Rewrite this tag" (new secret), and a printable sheet. */
export function TagsPanel({ shelterName, tags, busy, onRotate }: Props) {
  const toast = useToast()
  const [confirming, setConfirming] = useState<TagAction | null>(null)
  const [rewritten, setRewritten] = useState<TagLink | null>(null)
  const [copied, setCopied] = useState(false)

  async function rotate(action: TagAction) {
    setConfirming(null)
    const fresh = await onRotate(action)
    const tag = fresh?.find((t) => t.action === action) ?? null
    setRewritten(tag)
    setCopied(false)
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", 'error')
    }
  }

  return (
    <Section
      title="Tap Board tags"
      id="tags"
      aside={
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-2 text-[15px] font-semibold text-green-text hover:bg-green-tint"
        >
          <Printer aria-hidden size={18} /> Print
        </button>
      }
    >
      <ul className="grid gap-2">
        {tags.map((tag) => (
          <li key={tag.action} className="rounded-[14px] border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{tag.label}</p>
                <p className="text-[13px] text-text-muted">{status(tag)}</p>
              </div>
              {confirming !== tag.action && (
                <button
                  type="button"
                  onClick={() => setConfirming(tag.action)}
                  disabled={busy}
                  className="min-h-11 shrink-0 rounded-[12px] border border-border-strong px-3 text-[15px] font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  {tag.path ? 'Rewrite' : 'Set up'}
                </button>
              )}
            </div>
            {confirming === tag.action && (
              <ConfirmRow
                question={tag.path ? 'Make a new link for this tag? The old tag stops working right away.' : 'Create a link for this tag?'}
                confirmLabel="New link"
                busy={busy}
                onCancel={() => setConfirming(null)}
                onConfirm={() => rotate(tag.action)}
              />
            )}
            {rewritten?.action === tag.action && rewritten.url && (
              <div className="mt-3 rounded-[12px] bg-green-tint p-3">
                <p className="text-[13px] font-semibold text-green-text">New link for "{tag.label}"</p>
                <p className="mt-1 break-all rounded-[8px] bg-surface px-2 py-1.5 font-mono text-[13px]">{rewritten.url}</p>
                <Button size="md" className="mt-2" onClick={() => copy(rewritten.url!)}>
                  {copied ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />} {copied ? 'Copied' : 'Copy link'}
                </Button>
                <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[13px] text-text-2">
                  <li>Open the NFC Tools app → Write → Add a record → URL.</li>
                  <li>Paste the link and tap OK.</li>
                  <li>Tap Write and hold your phone to the "{tag.label}" tag.</li>
                </ol>
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Only this sheet prints (see .print-sheet in index.css). */}
      <PrintSheet shelterName={shelterName} tags={tags} />
    </Section>
  )
}
