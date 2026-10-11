# Meta VR Start Developer Competition 2026: rules and how Foldlings maps to them

Source: the official Devpost overview and Official Rules
(https://start-developer-competition-26.devpost.com/ and `/rules`), as of October 11, 2026.

## Key facts

| Item | Value |
|---|---|
| Entry period | Sept 24, 2026, 10:00 AM PT → **Nov 18, 2026, 12:00 PM PT** (3:00 PM ET, 20:00 UTC) |
| Judging | about Nov 18 – Dec 9, 2026 |
| Winners announced | on or around Dec 11, 2026 |
| Eligibility | 18+ and the age of majority where you live. Not a resident of Brazil, Quebec, or a sanctioned region (Crimea, Russia, Cuba, Iran, North Korea, Syria, or OFAC-designated). An active Meta account with **Developer Access**. The person submitting must be a **Meta VR Start program member** by the time of submission. |
| Entries | One per individual (solo, or as a Team/Organization Representative, not both) |
| Tracks | Entertainment, Gaming, Productivity (Sponsor may reassign) |
| Divisions | New Experience (built from Sept 24, 2026; no pre-existing code) / Adapted or Significantly Updated |
| Hard requirement | **Hands-first:** the entire experience can be completed without ever pairing a controller |
| Guidelines | Seated ("airplane seat test", 2 ft radius); fast cold start, clean pause/resume, a complete moment in ≤ 10 minutes ("one bus stop test"); original, not a wrapper |
| IWSDK / WebXR build | A **link** judges can open, e.g. GitHub Pages (or Vercel, etc.). It must stay available and free until the winner announcement. |
| Video | **Under 3 minutes**, footage of the project on a Meta VR device **or via XR Simulator or an equivalent emulator**, public on YouTube or Vimeo. Judges need not watch past 3:00. |
| After the deadline | **No changes** to the submission; judging uses its state at the deadline |
| Language | English (or English subtitles) |
| Content | Meta content guidelines for 10+/13+/18+; no identifiable people other than entrants; no brands, logos or commercial artwork; no implied association with Meta |
| Tools | Publicly available (or Start-released) SDKs; licensed third-party assets only |
| Funding | Must not have received Meta development funding |
| Judging may use AI tools | Final decisions are by human judges |

### Submission form fields

Name · tagline (**140 characters**) · track · division · text description covering **inspiration,
how you built it, future plans** (suggested **≤ 500 words**) · (Adapted only) what's new · optional:
**how hand interactions are implemented** and what excites you about the future of VR · **target
launch date** · team members (name, email, role) · project link · video link.

## Prizes ($1M total, one prize per entry)

| Award | New Experience | Adapted / Updated |
|---|---|---|
| Gaming | **$100k** winner, $50k runner-up | $100k / $50k |
| Entertainment | $100k / $50k | $100k / $50k |
| Productivity | $70k / $35k | $70k / $35k |

Special awards, $25k each: Best Social & Multiplayer · Best Agentic Interaction · **Best Reason to
Come Back** · **Best First Five Minutes** · **Best Accessibility Forward** · **Boldest Original
Concept**. Judge's Choice: 2 × $20k.

## Judging

**Stage one (pass/fail):** the entry reasonably fits the theme and applies the required tools and
features (hands-first).

**Stage two:** four criteria, 25% each. The official wording is quoted below, followed by how
Foldlings answers each one.

### Innovation & Creativity (25%)
> Originality, creative ambition, relevance to the track … uniquely leverage Meta device
> capabilities (spatial depth, hands-first design, gaze, passthrough, scene understanding,
> persistent anchors) to drive repeat usage.

Folding paper is the archetypal hands-only activity, and here the paper you fold, with your own
creases, comes alive and becomes the tool the story needs. No controller version of this game could
exist. Persistent anchors keep your desk on your table; the daily fold, streak and Foldling
collection drive repeat use.

### Experience Design (25%)
> Seated, hands-first … intuitive navigation, clear onboarding, habit-forming purpose.
> **Passthrough should be purposeful**: the player's real room meaningfully changes the
> experience. **FoV-aware**: keep essential UI within a comfortable, narrower FoV and adapt across
> devices.

- Onboarding without text walls: the glowing corner, motion arc, target ring and ghost preview teach
  folding in the first 20 seconds; Kit's story gives every fold a purpose.
- **Purposeful passthrough:** the book lives on *your* table (plane detection or palm calibration),
  paper casts shadows on it, your real hands occlude the paper, and **tossed Foldlings use your real
  room**. They bump off your walls, land on your sofa, shelf or floor, then fly home.
- **FoV-aware:** everything happens in one compact zone measured against the VR Glasses' view (37°
  left/right, 25° up, 43° down; `scripts/e2e/fov-check.mjs`), and the hint card reads the headset's
  live projection each frame to stay inside a comfortable cone on any device.
- Habit: daily fold with a streak, and a growing desk of Foldlings that remember you.

### Technical Implementation (25%)
> Reliability … hand tracking, passthrough, spatial anchoring, FoV-aware design … **min 60 fps** on
> Quest, bug-free … for passthrough: anchoring to detected planes/surfaces/room geometry and
> **holding up in rooms the developer never tested**.

- Custom origami engine (crease splitting, connected-flap selection, layer stacking, 3D hinges),
  unit tested.
- Hand input from joint poses: pinch with hysteresis and a frame-aware grace window, poke buttons,
  point-and-pinch rays, palm-velocity throws measured over ≥ 50 ms spans (robust to tracking
  glitches).
- WebXR plane detection (the web counterpart of MRUK's surfaces), persistent anchors, and graceful
  fallbacks for untested rooms: palm calibration when no table is detected, a floating desk when
  neither works, and room surfaces used only when present.
- Clean pause/resume on the system menu or headset removal.
- Automated: full story playthrough with emulated hands (fails if any accessibility fallback has
  to finish a beat), hub/modes test, room test, pause test, FoV check, draw-call budget (≤ about 170
  calls per frame for both eyes). **60 fps must still be confirmed on a Quest.**
- Gaze: not used. The Quest Browser doesn't expose eye tracking to WebXR, and the rules name gaze
  for the Unity/Unreal ISDK.

### Polish & Presentation (25%)
> UI/UX, art direction, sound … high-quality submission materials … **show real gameplay that
> honestly represents the experience. Lead with the story and what makes your project distinct.**
> Don't lean on AI-generated video.

One paper-craft art direction, procedural sound and a generative music box. The video script
(`docs/VIDEO_SCRIPT.md`) opens on the story and the first fold.

## Track choice

**Gaming → Best New Gaming Experience ($100k).** The track text, "games designed for hands-first …
puzzle, casual, narrative … that thrive seated, without controllers", describes Foldlings almost
word for word. Entertainment ("immersive storytelling") is the alternative, but Foldlings is
interactive throughout, not lean-back. Realistic special-award fits: Best First Five Minutes,
Boldest Original Concept, Best Reason to Come Back.

## Compliance checklist

- [x] Hands-only end to end (controllers optional)
- [x] Built from scratch inside the window (repo history starts Oct 10, 2026)
- [x] English text and captions
- [x] Original art, sound and music (procedural); fonts under the SIL Open Font License
- [x] No brands, logos or real people; suitable for 10+
- [x] Free; static hosting, no accounts, no third-party services
- [ ] Join Meta VR Start and enable Developer Access on the Meta account **before submitting**
- [ ] Host the build and keep it live until Dec 11; **don't deploy changes after Nov 18, 12:00 PM PT**
- [ ] Public video under 3:00 on YouTube or Vimeo

## Lessons from 2025

The 2025 competition had about 2,900 developers and 650+ submissions. Category winners included
**Tiny Golf** (casual MR on your table) and **Saber Punks**. Two IWSDK/WebXR entries won a dedicated
web award; 2026 has no web-only category, so a WebXR entry competes head-to-head on quality.
