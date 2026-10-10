# Meta VR Start Developer Competition 2026: what wins, and how Foldlings maps to it

Researched October 2026. The official Devpost page (start-developer-competition-26.devpost.com) and
developers.meta.com were not reachable from the build environment, so this brief is assembled from
Meta's announcement as quoted by press, community posts, and secondary coverage. **Verify every item
marked ⚠ against the official rules on Devpost before submitting.**

## Key facts

| Item | Value |
|---|---|
| Deadline | **Nov 18, 2026** (8:00 PM UTC per one secondary source ⚠) |
| Winners | on or around Dec 11, 2026 (livestream) |
| Eligibility | Must be a **Meta VR Start program member** at submission time (apply first) |
| Devices | Meta Quest and the new **Meta VR Glasses** (controller-free, ~70°×66° FoV, ships spring 2027) |
| Hard rule | **Fully usable with hands, end-to-end.** Controller support optional. |
| Tracks | Entertainment, Gaming, Productivity |
| Divisions | New Experience (built from Sept 24, 2026) / Adapted or Significantly Updated |
| Prize pool | $1M across 20 cash prizes, $20k–$100k each; one prize per entry |
| Top prizes | Best New Gaming $100k / $50k · Best New Entertainment $100k / $50k · Best New Productivity $70k / $35k ⚠ |
| Special awards | Best Social & Multiplayer, Best Agentic Interaction, Best Accessibility Forward, **Best First Five Minutes**, **Best Reason to Come Back**, **Boldest Original Concept**, Judge's Choice ⚠ amounts vary by source |
| WebXR | Immersive Web SDK entries submit a hosted HTTPS link ⚠ (confirm the field on the Devpost form) |
| Video | Under 3 minutes, real on-device footage, public on YouTube/Vimeo ⚠ |

## Judging criteria (equally weighted, per secondary sources ⚠)

1. **Innovation & Creativity**: originality, relevance to the track, unique use of Meta device capabilities (spatial depth, hands-first) to drive repeat usage.
2. **Experience Design**: seated, hands-first, intuitive onboarding, habit-forming, *purposeful* passthrough, FoV-aware.
3. **Technical Implementation**: reliability, platform features (hand tracking, passthrough, anchors), **≥ 60 fps on Quest 3/3S**.
4. **Polish & Presentation**: UI/UX, art direction, sound, and submission materials.

Meta's stated wishes (announcement): seated play, "something satisfying in 10 minutes or less," and quick to enter and exit. Secondary write-ups add an "airplane seat test" (everything within a ~2 ft radius).

## Lessons from 2025 (Meta Horizon Start Developer Competition)

- About 2,900 developers and 650+ submissions, with $1.5M across 32 awards.
- Category winners included **Tiny Golf** (casual MR on your table) and **Saber Punks** (social PvP).
- Two **IWSDK/WebXR** entries won a dedicated $30k Immersive Web SDK award. That category is not listed for 2026, so a WebXR entry now competes head-to-head on quality.

## Competitive landscape check

- **Silhouette** (Team Panoptes) already ships hand-shadow puzzles on Quest. We rejected a shadow-puppet concept for that reason.
- Origami tutorials exist (*Origami Dojo* on Rift, a paper-plane AR demo), but we found no game where **what you fold comes alive and becomes the tool you play with**. That is Foldlings' originality claim.

## How Foldlings scores

| Criterion | Foldlings |
|---|---|
| Innovation | Folding paper is the archetypal hands-only activity; it can't be done with a controller. A real flat-folding simulation turns *your* fold into *your* creature. Story-wise: "fold what the story needs". |
| Experience design | Seated on your real table (passthrough + table detection, or palm-on-table calibration), everything within ~45 cm. First fold within ~20 s, first creature alive in about 2 minutes, story in about 12 minutes. Guides (glowing handle, motion arc, target ring, ghost preview) mean no tutorial text is needed. Daily fold, streak and a desk of collected Foldlings give you reasons to come back. |
| Technical | Custom origami engine (crease splitting, flap physics, layer stacking, 3D hinges), articulated hand input with pinch grace and point-and-pinch fallback, depth-only hand occluders in MR, persistent anchors, shadow catcher on the real table, procedural audio. Unit tests plus a fully automated emulated-hands playthrough. |
| Polish | One coherent paper-craft art direction (washi patterns, crease marks, ink eyes, pop-up book), generative music box, voices, sparkles. |

## Track recommendation

**Gaming → Best New Gaming Experience ($100k)**: a narrative casual puzzle game, seated and hands-first, which matches the Gaming track description almost word for word.
The alternative is **Entertainment** (it is an "interactive storybook" and "immersive storytelling" is named in the track). Pick based on the final Devpost wording. The special awards Best First Five Minutes, Boldest Original Concept and Best Reason to Come Back are realistic fallbacks.

## Sources

- Meta announcement (via search snippets): https://developers.meta.com/blog/meta-connect-2026-vr-start-developer-competition/
- Devpost hub: https://start-developer-competition-26.devpost.com/
- Meta community post: https://communityforums.atmeta.com/discussions/News_and_Announcements/meta-vr-start-developer-competition-2026/1384076
- UploadVR: https://www.uploadvr.com/meta-launches-1-million-competition-for-hands-first-apps-ahead-of-vr-glasses/
- Road to VR: https://roadtovr.com/meta-vr-glasses-dev-competition-1m-2026/
- Mixed News: https://mixed-news.com/en/meta-vr-start-developer-competition-1-million-hands-only/
- The Technology Express (prize list): https://thetechnologyexpress.com/meta-launches-1-million-hands-first-vr-app-competition/
- 2025 winners: https://developers.meta.com/vr/blog/meta-horizon-start-developer-competition-meet-the-winners/
- VR Glasses specs: https://www.uploadvr.com/meta-vr-glasses-officially-announced-connect-2026/
- Silhouette: https://www.uploadvr.com/silhouette-hand-tracking-quest/
