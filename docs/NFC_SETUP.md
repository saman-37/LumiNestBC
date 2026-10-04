# NFC tag setup

Each shelter has four tags: three on the **Tap Board** (Bed freed, Bed filled, We're full) and an
**Arrival** tag by the door. A tag holds nothing but a URL, like
`https://lumi-nest-bc.vercel.app/t/shelter-01/freed?k=SECRET`. Tapping it opens that page in the
phone's browser, and only the page's own request changes the count, so no app is needed.

You need: blank NFC stickers, the free **NFC Tools** app (iPhone or Android), and the shelter's
links (the staff portal's **Tap Board tags** section, or `data/tag_links_production.csv` from
`scripts/seed_production.py`).

## 1. Check the tag type

NFC Tools → **Read** → hold the phone on the tag.

- Look at **Tag type**. You want **NTAG213**, **NTAG215** or **NTAG216** (NFC Forum Type 2). All
  three work with every NFC phone. NTAG213 holds 144 bytes, which fits our links.
- **MIFARE Classic tags don't work with iPhones** (and some Android phones). Don't use them.
- "Writable: Yes" should show. If it says read-only, the tag was locked: use another one.

## 2. Write the URL

1. Copy the tag's link (staff portal → Tap Board tags → Rewrite shows a **Copy link** button, or copy
   it from the CSV).
2. NFC Tools → **Write** → **Add a record** → **URL / URI**. Paste the whole link (the `https://`
   part is a dropdown; pick `https://` and paste the rest, or paste it all into the field).
3. Tap **Write**, then hold the phone on the tag until it says "Write complete".
4. Stick the tag on its zone of the printed Tap Board (staff portal → Tap Board tags → **Print**). The
   printout also has a QR code of the same link next to each zone, for phones without NFC.

## 3. Test it

- **iPhone (XS or newer, iOS 14+):** no app needed. Unlock the phone and hold the **top edge** (near
  the camera) on the tag. A banner appears; tap it to open the page.
- **Android:** turn NFC on (Settings → Connected devices → Connection preferences → NFC). Unlock the
  phone and hold the **middle of the back** on the tag; the browser opens.
- You should see the shelter name, the new count, and an **Undo** button for 10 seconds. With the
  map open on another phone, the count changes there within a second.
- If the page says **"Tag not recognised"**, the link is old or mistyped: rewrite it (step 2).

## 4. Don't lock tags during the event

NFC Tools can **lock** a tag (make it read-only) forever. Don't, at least until the event is over:
if a link has to change (a lost tag, a new base URL like `https://luminestbc.tech`), an unlocked tag
can simply be rewritten. Lock only once the links are final, if at all.

## 5. A tag was lost, copied or photographed

Anyone with the link can change the count, so replace it:

1. Open the shelter's **staff portal** → **Tap Board tags** → **Rewrite** next to that tag → **New link**.
   The old link stops working at once.
2. Copy the new link and write it onto a fresh tag (step 2). Reprint the sheet if you use the QR codes.

Lost every tag, or the staff link itself? Ask the coordinator to run
`python scripts/generate_tag_links.py --base-url https://lumi-nest-bc.vercel.app --shelter shelter-XX --rotate --rotate-staff-keys`.
It writes `data/tag_links_shelter-XX.csv` (git-ignored) with fresh links.
