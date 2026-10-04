import os
import sys

sys.path.insert(0, "/mnt/c/Users/khush/OneDrive/Projects/LumiNestBC/backend")

from app import config
from app.comms.voice import text_to_speech

SCRIPT_PARTS = [
    (
        "01_hook.mp3",
        "It's 11 PM on East Hastings. Rain is falling. An outreach worker is standing with someone who needs a warm bed tonight. "
        "The official BC211 public shelter list updates only twice a day on weekdays. At night and over weekends, it is completely frozen. "
        "Outreach workers spend 45 minutes making blind phone calls to full shelters while someone shivers outside. "
        "This is LuminestBC: a live shelter-bed network for Metro Vancouver. A bed tonight, found in 60 seconds, not 60 phone calls."
    ),
    (
        "02_tap_board.mp3",
        "Cities have tried shelter apps before, but they failed because entering data was too slow. We made updating take two seconds. "
        "Here is the front desk of a shelter. Beside the register are physical NFC tags. When a guest leaves, staff tap 'Bed Freed'. "
        "No login, no typing, no app install. Instantly, across every phone in Metro Vancouver, the bed count updates in under 300 milliseconds. "
        "And if they mistap, a 10-second instant undo fixes it immediately."
    ),
    (
        "03_live_map.mp3",
        "On the outreach side, workers open the live dark map. Shelters with open beds glow in emerald green. "
        "Notice the halos: green means staff confirmed within the hour, amber means call to verify, and red means over 3 hours old. "
        "Outreach workers filter for women only, youth, pets, or wheelchair accessibility with one tap. "
        "Real-time clustering tracks over 1,800 beds across 67 Metro Vancouver facilities."
    ),
    (
        "04_voice_match_and_hold.mp3",
        "Now the magic: the worker taps the mic button: 'Woman with a small dog near Main and Hastings, uses a walker.' "
        "Gemini extracts the structured criteria without touching personal names. Plain Python filters real shelters by proximity and freshness. "
        "ElevenLabs speaks back the best match, complete with reasoning traces: Accessible, Pets Allowed, 3-minute walk. "
        "The worker taps 'Hold Bed'. Using database row-level locking on Tiger Data TimescaleDB, the bed is guaranteed for 60 minutes with a live countdown timer. Zero risk of double-booking."
    ),
    (
        "05_closing.mp3",
        "Built with Tiger Data TimescaleDB, Gemini 2.5 Flash, ElevenLabs voice synthesis, and React. "
        "With LuminestBC, no one is left out in the cold while an open bed sits empty. Thank you."
    ),
]

output_dir = "/mnt/c/Users/khush/OneDrive/Projects/LumiNestBC/docs/pitch/audio"
os.makedirs(output_dir, exist_ok=True)

print("Generating voiceover audio chunks via ElevenLabs...")
all_bytes = bytearray()

for filename, text in SCRIPT_PARTS:
    print(f"Generating {filename}...")
    audio = text_to_speech(text)
    if audio:
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(audio)
        all_bytes.extend(audio)
        print(f"  -> Saved {filepath} ({len(audio)} bytes)")
    else:
        print(f"  -> Failed to generate {filename} (check ElevenLabs quota/key)")

if all_bytes:
    full_path = os.path.join(output_dir, "demo_full_voiceover.mp3")
    with open(full_path, "wb") as f:
        f.write(all_bytes)
    print(f"\nSuccessfully combined full demo voiceover into: {full_path} ({len(all_bytes)} bytes)")
else:
    print("\nNo audio was generated.")
