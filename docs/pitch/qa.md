# Judge Q&A

Two sentences each. Items marked "planned" aren't built yet.

**Why would shelters actually use it?**
Updating takes one tap on a tag at the front desk, with no app, no login and an instant undo.
It also cuts the phone calls staff field all night asking "do you have a bed?"

**What about stale data?**
Every shelter shows how long ago staff confirmed its count, in green, amber or red, so workers know how much to trust it.
Holds and expiries don't reset that clock, and we plan to text shelters whose count is over three hours old (planned).

**What if someone copies a tag?**
Each tag URL carries a secret, every tap is logged, and the same tag is ignored if tapped again within 5 seconds.
If a tag leaks, one script rotates the secrets and we rewrite the tags, and opening a link alone never changes anything.

**What do you store about people?**
Nothing about the people being sheltered: no names, no case notes, no locations.
A hold keeps only the outreach worker's name and org, and the voice line won't store caller numbers, transcripts or recordings.

**How do you handle DV shelters?**
Domestic violence shelters never send an address, coordinates or staff phone from the server, in any API response or live update.
The app shows no pin, only "DV bed available: call [phone]".

**Two workers race for the last bed. What happens?**
The hold locks the shelter's row in the database before checking for a bed, so only one request can take it.
One worker gets the hold, and the other is told "just taken" right away.

**What if the AI makes a mistake?**
AI is only used to turn a caller's words into a small JSON form, and Python checks it and falls back to safe defaults (planned).
Filtering, ranking and the spoken reply are plain code and fixed templates, so the AI never picks a shelter or makes up a bed.

**What about people without smartphones?**
They can call a phone number, say who needs a bed and roughly where, and hear the two best open beds read back (planned).
The greeting works today; if nothing matches, the line points them to BC211.

**How is this different from BC211?**
[BC211's list](https://bc.211.ca/shelter-lists/) updates twice a day on weekdays, so at midnight or on a Sunday it can be hours or days old.
We update the moment staff tap, show the age of every count, and let workers hold a bed.

**What does it cost?**
Each shelter needs a few NFC stickers and a phone it already has, and the software runs on standard cloud hosting.
We haven't priced a full rollout yet; the voice line would add per-call phone and AI costs (planned).
