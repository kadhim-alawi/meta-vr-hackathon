# On-device test checklist (Quest 3 / 3S, Quest Browser)

Everything below was built and tested in Meta's IWER emulator with scripted hands, **not on a
physical headset**. Run through this list on a real Quest before recording the video or submitting.
Tunables are noted next to each item so fixes are quick.

## 0. Setup

- [ ] Deploy (GitHub Pages) or run `npm run dev` and open the network URL on the headset.
- [ ] Hand tracking is enabled (Settings → Movement tracking → Hand tracking), and controllers are put down.
- [ ] The landing page loads in under about 5 seconds on Wi-Fi, and both **Enter Mixed Reality** and **Enter VR** are enabled.

## 1. Comfort and placement (first 30 seconds)

- [ ] The desk appears in front of you at a comfortable seated height. Tune `Desk.SEATED_DROP` (0.46 m below the eyes) and `Desk.REACH` (0.36 m) in `src/xr/desk.ts`.
- [ ] With room setup done, the desk snaps to your real table (plane detection). If not, **lay your palm flat** on the table during the opening, and the desk should move there with a chime.
- [ ] Exit and re-enter: the desk returns to the same spot (persistent anchor).
- [ ] ☰ Menu → *Move desk here* recentres it.
- [ ] **Pause/resume:** mid-fold, press the Meta button to open the system menu. The game freezes
  and goes silent. Close the menu and everything continues where it was. Do the same by lifting
  the headset off for a few seconds.
- [ ] **A room you've never tested in** (a friend's table, a sofa, a desk against a wall): the
  desk still lands on the table, or palm calibration works, or the floating desk appears.

## 2. Folding feel (the most important part)

- [ ] Pinching the glowing corner grabs reliably. Tune `GRAB_RADIUS` (5 cm) in `src/game/fold-controller.ts` and the pinch thresholds `PINCH_START` / `PINCH_END` in `src/xr/hands.ts`.
- [ ] The flap follows your hand smoothly without jitter (spring `24` in `updateDrag`).
- [ ] Releasing past halfway snaps the fold with a crisp sound, and releasing earlier springs it back.
- [ ] Your real hands appear **in front of** the virtual paper in MR (hand occluders). If they look too big or too small, adjust `scale` in `src/xr/hand-visual.ts`.
- [ ] No z-fighting on folded layers (`LAYER_GAP`, `PAPER_BASE` in `src/render/paper-view.ts`).
- [ ] Run a fingertip along a fresh crease: you should hear a "zip" and see sparkles. This is optional.

## 3. Story beats

- [ ] **Prologue**: fold the plane (4 folds), then a gentle toss toward the book flies it in and the book bursts open. Check the throw threshold `along > 0.35` in `src/scenes/story.ts`. A toss in the wrong direction should glide, land, and hop back to the mat.
- [ ] **Stream**: pick up the boat and drop it on the glowing ring. Sweeping your open hand towards the boat from its left moves it (about 8 s of waving; rate `push * dt * 0.38` in `chapterStream`), and so does pinching and dragging the boat.
- [ ] **Garden**: dip the cup into the well (it fills), then tip it over each of the 3 flowers and they bloom. Tune the tilt threshold `0.75` rad.
- [ ] **Hill**: pick up the fan and wave it near the windmill until the basket lifts Kit to the cliff. It should take about 4–8 s with the fan, longer with a bare hand. Tune `(spin - 1) * 0.03` and the 20–40 cm falloff in `chapterHill`.
- [ ] **Night**: give the heart to Kit, Mo comes out, the rain stops and the rainbow pops up.
- [ ] **Letter**: pinch the envelope and the letter opens. The book closes and the hub appears.
- [ ] Page turns: pinch the glowing corner and sweep left. After 30 s the page turns itself.

## 3b. Your room (mixed reality)

- [ ] Run Space Setup (Settings → Physical Space) so the headset knows your walls and furniture.
- [ ] In the hub or Free fold, toss the finished paper plane towards a wall: it bumps off it and
  flutters to the floor, rests a moment, then flies back to the desk.
- [ ] Toss it onto a sofa or another table: it lands *on* that surface, not floating at desk height.
- [ ] With no Space Setup at all, tosses still land and come home (desk height fallback).

## 4. Performance (judged: at least 60 fps)

- [ ] Enable the Quest performance overlay (Meta Quest Developer Hub, or `chrome://inspect` → Performance). The target is a steady 72 fps.
- [ ] If frames drop: lower the shadow map (`sun.shadow.mapSize` 1024 → 512) in `src/render/environment.ts`, set `castShadow = false` on pop-up props in `src/game/popups.ts`, and raise foveation (`setFoveation(1)` in `src/app/app.ts`).

## 5. Controllers (optional support)

- [ ] With controllers, the trigger works as pinch for folding, grabbing and buttons.

## 6. Meta VR Glasses (no device yet)

- [ ] In the desktop emulator, use `?emulate=glasses&autostart=ar` to check that the mat and book fit in the narrower field of view.
- [ ] On real Glasses (when available): hint cards stay readable while you look down at the mat.
  They slide into view automatically using the headset's own field of view. `node scripts/e2e/fov-check.mjs` reports the angles automatically (all key objects fit at a 25° downward head tilt; set `PITCH=-15` to try a more upright posture).

## 7. Submission video capture

- [ ] Record in MR at a real table with good lighting. Use the shot list in `docs/VIDEO_SCRIPT.md`.
