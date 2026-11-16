# Devpost submission (copy into the form)

Fields follow the official form. ⚠ marks things only you can fill in.

| Field | Value |
|---|---|
| Submission name | **Foldlings** |
| Tagline (≤ 140 chars) | Fold paper with your bare hands, and whatever you fold comes alive. *(67 characters)* |
| Track | **Gaming** |
| Division | **New Experience** (conceived and built from Oct 10, 2026, inside the window) |
| Project link | `https://kadhim-alawi.github.io/meta-vr-hackathon/` ⚠ once hosting is live (see README → Deploy) |
| Video | ⚠ public YouTube/Vimeo link, under 3:00 (`docs/VIDEO_SCRIPT.md`) |
| Target launch date | Spring 2027, as a web app on the Meta Horizon Store, alongside Meta VR Glasses |
| Team | ⚠ name, email, role for each member |

---

## Description (about 470 words; the form suggests 500 or fewer)

### Inspiration
The first thing almost anyone makes with their hands is a paper airplane. Meta VR Glasses have no
controllers, so we asked: what is the most *hands* thing there is? Folding paper. It's tactile,
precise, universal, and impossible with a controller. Then we asked the question every child asks:
what if the plane you just folded could really fly away?

### What it is
Foldlings is a seated, hands-only mixed reality story game. A pop-up book opens on your real
table. Kit, a tiny paper courier, has a letter for a friend at the end of the book, and every page
is a problem you solve by folding the right helper:

- **Prologue:** the book is stuck. Fold a paper plane and toss it to knock the cover open.
- **The River:** fold a sailboat, set it on the river, and sweep your hand to blow Kit across.
- **The Garden:** fold a cup, dip it in the well, and tip it to water the flowers.
- **Windy Hill:** fold a fan and wave it at a windmill to lift Kit up the cliff.
- **Mo's House:** fold a heart for a friend who hasn't come outside since the rain began.

Pinch a glowing corner and the paper follows your hand around the crease. When the last fold lands,
the paper inks its own eyes and wakes up: your paper, with your creases. The story takes about 12
minutes, and the first creature is alive within about two. Afterwards there is Free fold (10
models), a Daily fold with a new model and paper every day and a streak, and a desk of Foldlings
that remember you.

### How we built it
- **Immersive Web SDK** (WebXR, Three.js). Open a link; there is nothing to install.
- **A custom origami engine** in TypeScript: crease splitting, connected-flap selection, layer
  stacking and 3D hinges, unit tested.
- **Hands:** joint-based pinch with a grace window, point-and-pinch rays, poke buttons, and throws
  judged from palm motion.
- **Your room matters:** the desk snaps to your table (plane detection, or lay your palm flat), a
  persistent anchor brings it back next time, paper casts shadows on your table, your real hands
  pass in front of the paper, and a tossed plane bumps off your real walls, lands on your sofa or
  floor, then flies home.
- **FoV-aware:** everything fits the VR Glasses' narrower view, and hints adapt to each headset's
  live field of view.
- **Accessible:** one-handed, seated, captions, a Large text setting, and a fallback for every
  physical challenge (the plane flies itself, Kit fetches the heart, pages can auto-turn).
- **Steady frame rate:** if frames get slow on a device, the game lowers its own quality in steps.
- **All procedural:** paper textures, pop-ups, characters, sound effects, voices and a generative
  music box. There are no asset downloads.
- **Automated playtesting:** scripted emulated hands play the whole story in Meta's IWER emulator on
  every change.

### What's next
More books and seasonal chapters; folding together with a friend at a shared table; Foldlings that
roam your room's shelves using scene understanding; harder origami (crane, frog) with assisted
squash folds; launch on the Horizon Store.

---

## How hand interactions are implemented (optional field)

Every interaction is a natural hand motion within about 45 cm of a seated player:

| Gesture | Implementation |
|---|---|
| **Fold** | Pinch the glowing corner; the flap angle follows your hand's angle *around the crease axis*, smoothed by a critically damped spring. Release past halfway to snap the fold. |
| **Pick up / place** | Pinch a creature; rotating your wrist tilts it (pouring water). |
| **Toss** | Release velocity from palm motion over ≥ 50 ms spans, so a tracking glitch can't fake a throw. Letting go right over a target also counts. |
| **Wave / fan** | Palm velocity near the boat or windmill makes wind; holding the fan makes more. |
| **Poke / point** | Fingertip-poke paper buttons; point-and-pinch for distant ones. |
| **Place the desk** | Lay a palm flat on your table for a moment. |

Pinch uses thumb-to-index distance with hysteresis plus a short, frame-aware grace window, so
pinching slightly off target and sliding on still grabs. Controllers work too (trigger = pinch), but
they're never needed.

**What excites us:** hands turn VR from pointing at things into *making* things. Glasses-sized
headsets and good hand tracking mean everyday crafts, folding, sketching, building, can become play
anywhere you sit.

---

## Testing notes for judges

1. Open the link in the **Meta Quest Browser**, sit at a table if you can, and tap **Enter Mixed
   Reality** (or **Enter VR** for a virtual study). Put the controllers down.
2. The story starts immediately. The **☰ Menu** tag on the desk can skip a fold, move the desk, or
   return to the hub. Progress saves after each chapter.
3. After the story, try **Free fold** and the **Daily fold**. In mixed reality, toss the paper plane
   across your room.
4. To start over: hub → **Settings → Start over**.
