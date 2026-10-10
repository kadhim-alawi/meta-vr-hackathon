# Devpost submission draft

> Copy into the Devpost form. Fields marked ⚠ depend on the final form wording.

**Project name:** Foldlings

**Tagline:** Fold paper with your bare hands, and whatever you fold comes alive.

**Track:** Gaming ⚠ (alternative: Entertainment, as "immersive storytelling")
**Division:** New Experience (built from scratch during the competition window, from September 24, 2026)
**Platform:** Meta Quest 3 / 3S and Meta VR Glasses (WebXR, Immersive Web SDK). Hosted link: `https://kadhim-alawi.github.io/meta-vr-hackathon/` (once GitHub Pages is enabled; see README → Deploy)

---

## Inspiration

The first thing almost anyone makes with their hands is a paper airplane. Meta VR Glasses ship
without controllers, so we asked: what's the most *hands* thing there is? Folding paper. It is
tactile, precise, universal, and impossible with a controller. Then we asked the question every
child asks: what if the paper plane you just folded could actually fly away? What if the boat could
carry someone?

## What it does

Foldlings is a seated, hands-only mixed reality adventure. A pop-up storybook opens on your real
table. Inside, Kit, a tiny paper messenger, has a letter to deliver to a friend at the end of the
book. Each page is a problem, and you solve it by folding the right helper with your own hands:

- **Prologue:** the book is stuck shut. Fold a paper plane and toss it to knock the cover open.
- **The River:** fold a sailboat, set it on the river, and wave your hand to blow Kit downstream.
- **The Thirsty Garden:** fold a cup, dip it in the well, and tip it to water three wilting flowers.
- **Windy Hill:** fold a fan and wave it at a windmill to power a basket lift up a cliff.
- **Mo's Window:** fold a heart for the friend who hasn't come outside since the rain started.

Every model is folded step by step: pinch a glowing corner and move your hand, and the paper follows
around the crease. When the last fold lands, the paper glows, inks its own eyes, and comes alive
with a voice and a personality. It is the *actual* paper you folded, with your creases.

After the story there are **Free fold** (10 models, including a puppy, kitten, fox, whale and
tulip), a **Daily fold** with a new model and paper colour every day plus a streak, and a desk full
of the Foldlings you've made, who remember you between sessions.

## How we built it

- **Immersive Web SDK** (Meta's WebXR framework on Three.js): XR session, ECS frame loop, input
  sources. Players open a link; there is nothing to install.
- **A custom origami engine** in TypeScript: facets in paper space with isometries into the folded
  frame, crease splitting, connected-flap selection by paper adjacency, layer stacking with local
  overlap heights, and 3D shaping hinges with forward kinematics. Creases and ink are drawn in paper
  space, so they land correctly however the sheet is folded. Unit tested, with every model rendered
  step by step to contact sheets.
- **Hands:** articulated joints via `fillPoses`, pinch with hysteresis plus a short grace window,
  point-and-pinch rays, throw velocity from a motion history, poke buttons, flat-palm detection to
  place the desk on your real table. Controllers are optional.
- **Mixed reality:** plane detection or palm calibration to find the table, **persistent spatial
  anchors** so the desk is where you left it, a shadow catcher so paper casts shadows on your real
  table, and depth-only hand occluders so your real hands appear in front of the virtual paper.
- **Everything procedural:** paper textures (washi patterns, fibres, creases), pop-up dioramas,
  characters, and all audio, including paper rustles and crease snaps from filtered noise, FM bells,
  babbling voices and a generative music-box score. There are no asset downloads, and it works
  offline once loaded.
- **Automated verification:** a headless playthrough drives Meta's IWER headset emulator with
  scripted hands through the entire story.

## Challenges we ran into

- Making folds feel physical with imperfect hand tracking. The flap angle is the angle of your hand
  *around the crease axis*, smoothed by a critically damped spring, so lifting over the crease and
  dragging straight across both work. There is a magnet near the end and a forgiving release threshold.
- Multi-layer folds: deciding which layers move. Flood-filling over paper-space adjacency makes
  connected layers move together, exactly as real paper does.
- Designing origami that reads well flat, comes alive in 3D, and can be folded in 3–5 moves.
- Designing for a 70° field of view and a seated, airplane-sized space: one compact zone, and the
  book slides to you when it's time to play.

## Accomplishments that we're proud of

- The moment the paper you just folded blinks at you.
- A complete story with a real ending and an emotional beat, not a demo.
- Accessibility built in: one-handed with either hand, captions, a fallback for every physical
  challenge, and *Skip this fold* in the menu.

## What we learned

Hands-first design means designing for the hand's natural motion, not for gestures. The best
interactions here (fold, toss, pour, wave) need no explanation.

## What's next for Foldlings

- More chapters and seasonal books.
- Shared tables: fold together with a friend (Best Social & Multiplayer).
- Your Foldlings roaming your room, using scene mesh to hop onto shelves.
- Harder origami (crane, frog) with assisted squash and petal folds.
- Shipping as a PWA on the Meta Horizon Store.

**Target launch date:** spring 2027, alongside Meta VR Glasses ⚠

## Built with

`webxr` · `immersive-web-sdk` · `three.js` · `typescript` · `web-audio` · `vite` · `vitest` · `playwright` · `iwer`
