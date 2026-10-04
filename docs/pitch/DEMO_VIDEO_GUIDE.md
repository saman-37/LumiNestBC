# LuminestBC — 2-Minute Demo Video Guide

> **Target Length:** Exactly 2 minutes (120 seconds) — ideal for Devpost & StormHacks judging.  
> **Tagline:** *"Find the lights still on."* · *Live shelter-bed network for Metro Vancouver.*

---

## 🎬 Two Ways to Make Your Video

### Option A: The 1-Click Automated Video Studio (Fastest)
We built an automated web video player with synchronized voiceover narration and built-in screen recording:
1. Double-click **[`docs/pitch/demo_video.html`](file:///c:/Users/khush/OneDrive/Projects/LumiNestBC/docs/pitch/demo_video.html)** to open it in Chrome or Edge.
2. Click **"Record Screen (MP4/WebM)"** at the top right and select the browser tab.
3. The demo will automatically speak the voiceover aloud and animate through all 5 scenes for 2 minutes.
4. When finished, click **"Stop & Save Video"** — it instantly downloads `luminestbc_demo_recording.webm` to your computer, ready to upload to YouTube!

---

### Option B: Live App Screen Recording (Loom / OBS / Windows Game Bar)
If you want to record the actual live running web app (`http://localhost:8000`):
1. **Shortcut to record on Windows:** Press `Win + Alt + R` (built-in Windows Game Bar screen recorder).
2. Follow the 5-scene storyboard below:

---

## ⏱️ Storyboard & Spoken Script (0:00 – 2:00)

| Timestamp | Visual Action On Screen | Voiceover Script (What You Say) |
|---|---|---|
| **0:00 – 0:25**<br/>*(25 sec)* | **Show stale BC211 page or cold street photo.**<br/>Transition to the LuminestBC map on `http://localhost:8000`. | *"It's 11 PM on East Hastings. Rain is falling. An outreach worker is standing with someone who needs a warm bed tonight. The official BC211 public shelter list updates only twice a day on weekdays. At night and over weekends, it is completely frozen. Outreach workers spend 45 minutes making blind phone calls to full shelters while someone shivers outside. This is LuminestBC: a live shelter-bed network for Metro Vancouver. Find the lights still on."* |
| **0:25 – 0:50**<br/>*(25 sec)* | **Show the Tap Board (`http://localhost:8000/t/...`).**<br/>Click **+1 Bed Freed**, then switch to another window to show the map bed count update in real-time. | *"Cities have tried shelter apps before, but they failed because entering data was too slow. We made updating take two seconds. Here is the front desk of a shelter. Beside the register are physical NFC tags. When a guest leaves, staff tap 'Bed Freed'. No login, no typing, no app install. Instantly, across every phone in Metro Vancouver, the bed count updates in under 300 milliseconds. And if they mistap, a 10-second instant undo fixes it immediately."* |
| **0:50 – 1:15**<br/>*(25 sec)* | **Show the Live Map (`http://localhost:8000`).**<br/>Zoom in, show green, amber, red halos. Click the filters (Women Only, Pets OK, Accessible). | *"On the outreach side, workers open the live dark map. Shelters with open beds glow in emerald green. Notice the halos: green means staff confirmed within the hour, amber means call to verify, and red means over 3 hours old. Outreach workers filter for women only, youth, pets, or wheelchair accessibility with one tap. Real-time clustering tracks over 1,800 beds across 67 Metro Vancouver facilities."* |
| **1:15 – 1:45**<br/>*(30 sec)* | **Click the Voice Match Mic button.**<br/>Speak or type: *"Woman with a small dog near Main and Hastings, uses a walker"*. Show reasoning badges, then click **Hold Bed (60 min)** to show countdown timer. | *"Now the magic: the worker taps the mic button: 'Woman with a small dog near Main and Hastings, uses a walker.' Gemini extracts the structured criteria without touching personal names. Plain Python filters real shelters by proximity and freshness. ElevenLabs speaks back the best match, complete with reasoning traces: Accessible, Pets Allowed, 3-minute walk. The worker taps 'Hold Bed'. Using database row-level locking on Tiger Data TimescaleDB, the bed is guaranteed for 60 minutes with a live countdown timer. Zero risk of double-booking."* |
| **1:45 – 2:00**<br/>*(15 sec)* | **Show the GitHub repository or Architecture summary.** | *"Built with Tiger Data TimescaleDB, Gemini 2.5 Flash, ElevenLabs voice synthesis, and React. With LuminestBC, no one is left out in the cold while an open bed sits empty. Thank you."* |

---

## 📤 Submission Checklist
- [ ] Record video (MP4 or WebM format, under 2:30 min).
- [ ] Upload as **Unlisted** on YouTube or Vimeo.
- [ ] Paste video link into your Devpost project submission.
