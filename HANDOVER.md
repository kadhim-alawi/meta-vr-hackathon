# Foldlings: handover

Written October 30, 2026. **Deadline: November 18, 2026, 12:00 PM PT** (19 days). Judges assess
the build as it is at that moment, so nothing deploys after it.

Branch: `claude/zealous-goldberg-8dk4f4` on `kadhim-alawi/meta-vr-hackathon`. It is the repo's only
branch and its default. There is no `main` yet. The working tree is clean and pushed.

The ready-to-paste prompt for Claude Code on your machine is at the end of this file.

---

## 1. Where things stand

Foldlings is a hands-only mixed reality origami story game for Meta Quest 3/3S and Meta VR Glasses,
built with the Immersive Web SDK (IWSDK, WebXR). The submission targets the **Gaming track, New
Experience division**.

**Done and verified in the emulator** (Meta's IWER, headless Chromium, scripted hands):

- The full story plays from start to finish on hand interactions alone: prologue, river, garden,
  hill, night, letter, hub. No console errors, and no accessibility fallback had to finish a beat
  (the test fails if one does).
- Hub → Free fold → Daily fold (streak) → Settings, by poking buttons with an emulated fingertip.
- Pause/resume: the system menu (`visible-blurred`) and headset off (`hidden`) freeze game time and
  sound.
- Room behaviour with a synthetic floor, sofa and wall: a tossed plane stops at the wall, lands on
  the floor or sofa, then flies home.
- Field of view: everything fits the VR Glasses' view (37° left/right, 25° up, 43° down) at a
  natural head tilt, and the hint card clamps into the live field of view.
- Rendering cost: 30–170 draw calls and about 19–25k triangles per frame for both eyes.
- 34 unit tests (fold engine, models, script runner, save data).

**Never verified on real hardware.** This is the biggest risk. Unknowns:

- 60+ fps on Quest 3 (a judged minimum)
- how pinching and folding feel with real hand tracking (thresholds are in the checklist)
- desk placement on real tables via plane detection, palm calibration and persistent anchors
- real room planes for the plane toss (IWER reports none offline, so only synthetic planes were
  tested)
- hand occluders in passthrough
- Meta VR Glasses (the emulator doesn't narrow its projection; the real device reports the narrow
  view)

## 2. What's left, in order

| # | Task | Who |
|---|---|---|
| 1 | Join **Meta VR Start** and enable **Developer Access** on your Meta account (required before submitting). Check eligibility: 18+, not in Brazil, Quebec or a sanctioned region. | You |
| 2 | Run it on a Quest and work through `docs/DEVICE_TEST_CHECKLIST.md`. Fix and tune what fails. | You + Claude |
| 3 | Measure fps on the Quest. If it's under 72, apply the levers in checklist §4. | You + Claude |
| 4 | Host it: make the repo public and enable GitHub Pages (Settings → Pages → Source: GitHub Actions), then create `main` from this branch or run the workflow manually. Or use Vercel (`npm run build`, output `dist`). | You |
| 5 | Record a video under 3:00, preferably real mixed reality footage on a Quest (`docs/VIDEO_SCRIPT.md`), and upload it publicly to YouTube or Vimeo. | You |
| 6 | Fill in Devpost from `docs/SUBMISSION.md` (fields marked ⚠ are yours) and submit **well before** Nov 18, 12:00 PM PT. | You |
| 7 | After the deadline, don't push changes that redeploy. The workflow blocks it anyway. Keep the site live until about Dec 11. | You |

Optional improvements, if time allows after device testing:

- **Best Accessibility Forward** ideas: high-contrast mode, bigger handles (a `bigUI` field and save
  setting exist but aren't wired to anything yet), voice alternatives.
- A settings toggle to turn shadows down if fps is tight.
- More gallery screenshots taken in mixed reality on the device.

## 3. Run it locally

```bash
git clone https://github.com/kadhim-alawi/meta-vr-hackathon.git
cd meta-vr-hackathon
git checkout claude/zealous-goldberg-8dk4f4
npm install                  # Node 20.19+ or 22.12+
npm run dev                  # IWSDK dev server + managed browser with the emulator
```

Day-to-day checks:

```bash
npm run typecheck && npm test
npm run build                # → dist/
npx playwright install chromium    # once, for the e2e scripts
node scripts/e2e/playthrough.mjs quest3   # full story, about 10 minutes headless
node scripts/e2e/modes.mjs                # hub / free / daily / settings
node scripts/e2e/room-check.mjs           # walls and surfaces in mixed reality
node scripts/e2e/pause-check.mjs          # pause/resume
node scripts/e2e/fov-check.mjs            # Glasses field of view (PITCH=-45 to try)
node scripts/e2e/perf.mjs                 # draw calls / triangles per scene
```

The e2e scripts test `dist/`, so build first. Each run serves on a free port, which also gives it
fresh save data.

**On a Quest:**

- **Easiest:** with the Quest on the same Wi-Fi, run `npx @iwsdk/cli dev status` and open a URL from
  `data.runtimeUrls.network` in the Quest Browser. Accept the local certificate warning.
- **Scripted on device:** connect the Quest by USB (ADB). The project skill `iwsdk-native-xr-test`
  drives a real Quest session via `npx @iwsdk/cli runtime pair-headset ...`; see `AGENTS.md`.
- **Useful URL parameters:** `?stats=1` (fps/draw-call HUD), `&scene=story:2` (jump to a chapter),
  `&scene=free:cup`, `&scene=daily`, `&scene=menu`.
- **Emulator on desktop:** `?emulate=quest3&autostart=ar` (or `glasses`, `vr`; `&input=controller`).

## 4. Map of the code

```
iwsdk.config.json        IWSDK project authority (AR, hand tracking, anchors, plane detection)
src/index.ts             World.create, registers scenes, first scene
src/app/app.ts           App: hands, desk, room, audio, scene switching, pause, live FoV
src/fold/                pure-TS origami engine + models (unit tested; no Three.js)
src/render/              paper meshes/textures, environment, sparkles, merge/dispose helpers
src/xr/hands.ts          pinch (hysteresis + frame-aware grace window), rays, throw velocity
src/xr/desk.ts           desk placement: anchor → table plane → palm → floating
src/xr/room.ts           detected planes as surfaces and walls (mixed reality)
src/game/fold-controller.ts   drag a flap around a crease, guides, ghost, snap
src/game/foldling.ts     living creatures: wake, hold, throw/fly, fall, land, go home
src/game/book.ts, spreads.ts, popups.ts, kit.ts   pop-up book, chapters' scenery, Kit and Mo
src/scenes/story.ts      the story script (beats, fallbacks, debugState for tests)
src/scenes/menu.ts, daily.ts, stage.ts             hub, free/daily fold, shared stagecraft
scripts/e2e/             headless emulator tests (harness.mjs has the hand helpers)
docs/                    rules brief, Devpost draft, video script, device checklist, media
```

Coordinate spaces: **world**; **desk-local** (`app.toDesk` / `app.fromDesk`; Foldling positions,
hint goals and beat targets); **book-local** (Kit, Mo, spreads; `story.bookToDesk` /
`story.deskToBook`). Mixing them up was the most common bug class.

## 5. Lessons worth knowing before you change things

- **Scratch-vector aliasing.** A helper that writes into an `out` argument must not use the same
  scratch vector the caller passes as `out`. `Foldling.centreLocal` had exactly this bug, so pick-up
  only worked at the desk origin. Keep scratch vectors private to their function's job.
- **Hand claims.** `HandState.claimedBy` marks a pinch as used; it clears on pinch end. Only clear
  it if you own it (`if (h.claimedBy === this)`).
- **Ground under fast falls.** `groundAt(p, fromY)` takes the height before the step; otherwise a
  fast fall passes through a surface in one frame and misses it.
- **Throws** use palm velocity over spans of at least 50 ms, capped at 6 m/s, from the last 0.25 s
  or 5 samples (whichever is longer). Letting go over the book also counts in the prologue.
- **Emulator quirks:** headless runs at about 5–12 fps, so the harness uses `?ts=3` (game clock ×3)
  and hands run on real dt. Move emulated hands frame by frame (`sweepTo`, `throwToward`), never
  teleport them, or velocities are wrong. IWER can't fetch its CDN room assets offline, so there are
  no detected planes; `room-check.mjs` injects synthetic ones.
- **Don't import `three` directly.** Import from `@iwsdk/core` (see `AGENTS.md`). Run typecheck
  before testing; type errors can silently stop systems.
- **Performance:** static decor is merged (`render/merge.ts`), rain is instanced, and everything is
  disposed on scene exit (`render/dispose.ts`; shared cached materials are skipped).
- **Accessibility fallbacks** (plane flies itself after 35 s, pages auto-turn after 30 s, Kit
  fetches the heart after 40 s, the letter opens itself after 30 s) are recorded in
  `story.fallbacks`. The playthrough fails if any fire, so a pass means the real interaction worked.

## 6. Rules that matter (full digest in `docs/COMPETITION_BRIEF.md`)

- **Hands-first** end to end; controllers optional. Seated, within a 2 ft radius. A complete moment
  in ≤ 10 minutes; clean pause/resume.
- Judged 25% each: **Innovation**, **Experience Design** (purposeful passthrough, FoV-aware),
  **Technical** (≥ 60 fps on Quest, reliable, anchors/planes, holds up in untested rooms), **Polish
  & Presentation** (honest gameplay video that leads with the story).
- Submit a hosted link, a public video under 3 minutes (device or emulator footage), and the form
  (tagline ≤ 140 characters, description ≤ about 500 words, track, division, launch date).
- No changes after the deadline; keep the site live until the winners are announced.

---

## 7. Prompt for Claude Code on your machine

Open a terminal in the cloned repo (on the branch above) and paste this:

```text
You're picking up Foldlings, my entry for the Meta VR Start Developer Competition 2026
(Gaming track, New Experience). It's a hands-only mixed reality origami story game built
with the Immersive Web SDK (WebXR, TypeScript, Vite). The deadline is Nov 18, 2026,
12:00 PM PT, and nothing may change after it. I mainly write Flutter, so explain
XR-specific things briefly when they matter, but I'm not a beginner.

First read, in this order: HANDOVER.md, AGENTS.md (IWSDK rules for this repo; invoke the
iwsdk-dev skill before changing app code), docs/DEVICE_TEST_CHECKLIST.md and
docs/COMPETITION_BRIEF.md. Work on branch claude/zealous-goldberg-8dk4f4 and commit in
small, clear steps. Don't push without asking me.

Goal for this session: make it solid on a real Meta Quest 3, because it has only ever
run in the IWER emulator.

1. Get it running: npm install, npm run typecheck, npm test, npm run build, then
   npm run dev. Show me how to open it on my Quest (network URL from
   `npx @iwsdk/cli dev status`). If my Quest is connected over USB, use the
   iwsdk-native-xr-test skill to drive it directly.
2. Walk me through docs/DEVICE_TEST_CHECKLIST.md one section at a time. I'll report
   what I see; you diagnose and fix (tuning constants are named in the checklist).
   Priorities: folding feel (pinch grab, flap follow, snapping), desk placement on my
   real table, the prologue throw, then each chapter's physical challenge.
3. Measure performance on the headset with ?stats=1. We need at least 60 fps (target
   72). If it's short, propose the cheapest fixes first (shadow map size, castShadow on
   small props, foveation) and measure again.
4. After each fix, run the relevant automated checks before I retest:
   node scripts/e2e/playthrough.mjs quest3 (must end with "no fallbacks used" and
   "no errors"), plus modes.mjs, room-check.mjs and pause-check.mjs when relevant.
   Build first; Playwright needs `npx playwright install chromium` once.
5. Keep README.md and the docs honest: only claim what we've verified on device.

Later, help me with hosting (GitHub Pages or Vercel), recording the video with
docs/VIDEO_SCRIPT.md, and filling in the Devpost form from docs/SUBMISSION.md.
```
