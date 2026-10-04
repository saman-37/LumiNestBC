import qrcode from 'qrcode-generator'
import { createPortal } from 'react-dom'
import type { TagAction, TagLink } from '../../lib/types'

// The printable Tap Board (letter paper, see .print-sheet in index.css). Page 1: the three bed
// zones; page 2: the Door / Arrival card. Each zone has its NFC tag stuck on it, plus a QR code
// of the same link as a backup for phones without NFC.

const ZONES: { action: TagAction; title: string; hint: string; mark: string }[] = [
  { action: 'freed', title: 'Bed freed', hint: 'Tap when someone leaves and a bed opens up', mark: '+1' },
  { action: 'filled', title: 'Bed filled', hint: 'Tap when someone takes a bed', mark: '−1' },
  { action: 'full', title: "We're full", hint: 'Tap when every bed is taken', mark: '0' },
]

function qrDataUrl(url: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(url)
  qr.make()
  return qr.createDataURL(6, 2)
}

function Zone({ title, hint, mark, tag, big = false }: { title: string; hint: string; mark: string; tag?: TagLink; big?: boolean }) {
  return (
    <div className={`print-zone${big ? ' print-zone--big' : ''}`}>
      <div className="print-zone__text">
        <span className="print-zone__mark">{mark}</span>
        <h2>{title}</h2>
        <p>{hint}</p>
        <p className="print-zone__nfc">NFC tag here</p>
      </div>
      <div className="print-zone__qr">
        {tag?.url ? (
          <>
            <img src={qrDataUrl(tag.url)} alt="" />
            <span>No NFC? Scan this</span>
          </>
        ) : (
          <span>Tag not set up yet</span>
        )}
      </div>
      {tag?.url && <p className="print-zone__url">{tag.url}</p>}
    </div>
  )
}

export function PrintSheet({ shelterName, tags }: { shelterName: string; tags: TagLink[] }) {
  const byAction = new Map(tags.map((t) => [t.action, t]))
  return createPortal(
    <div className="print-sheet" aria-hidden>
      <section className="print-page">
        <header className="print-head">
          <p>LuminestBC Tap Board</p>
          <h1>{shelterName}</h1>
          <p>Hold your phone flat on a zone for a second. The count updates for outreach workers right away; you get 10 seconds to undo.</p>
        </header>
        {ZONES.map((z) => (
          <Zone key={z.action} {...z} tag={byAction.get(z.action)} />
        ))}
        <footer className="print-foot">
          Keep this sheet private: anyone with these links can change your count. Lost or copied a tag? Staff portal →
          Tap Board tags → Rewrite, then write the new link onto the tag.
        </footer>
      </section>
      <section className="print-page">
        <header className="print-head">
          <p>LuminestBC · put this by the door</p>
          <h1>{shelterName}</h1>
        </header>
        <Zone
          big
          title="Arrival"
          mark="✓"
          hint="Tap when someone with a held bed walks in. It confirms their outreach worker's hold."
          tag={byAction.get('arrive')}
        />
        <footer className="print-foot">Several people held beds? The page asks who just arrived.</footer>
      </section>
    </div>,
    document.body,
  )
}
