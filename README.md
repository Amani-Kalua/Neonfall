# NEONFALL

A browser cyberpunk city sandbox built in the spirit of **Dystopika** (Voids Within, 2024) — "the dark side of cozy." No goals, no resources, no failure states. You place towers, wake up their windows, hang holograms over the street, and push the fog and the filters around until the skyline feels like something.

Everything renders in a hand-written 2.5D Canvas2D engine. No frameworks, no build step, no external assets — the buildings, facade textures, billboard art, and the soundtrack are all generated at runtime.

## Play it

Double-click `index.html`. That's it.

Saving to browser storage is more reliable over `http://` than `file://` (Safari in particular blocks storage on local files), so if you want your cities to persist, serve the folder:

```bash
cd "/Users/amani/World build game" && python3 -m http.server 8123
```

Then open <http://localhost:8123>. Headphones recommended — the soundtrack is generative and quiet.

## Put it online (GitHub Pages etc.)

Upload **`index.html` plus all ten files from `js/`** — eleven files total.

The layout doesn't matter. The loader probes `js/util.js` first and falls back to `util.js`, then loads the remaining nine from whichever base worked. So the scripts can sit inside a `js/` folder *or* flattened next to `index.html` — which is what GitHub's web uploader does to dropped folders.

Upload all eleven **in one commit**. Uploading a few at a time can leave a stale file mixed with fresh ones, and startup will fail (it will tell you why rather than hanging).

GitHub Pages serves with `cache-control: max-age=600`, so after a push your browser may show the previous version for up to ten minutes. Hard-reload (**CMD-SHIFT-R**) before concluding something is broken.

## Controls

### Sound
There's an audio control in the **top-right corner**, always visible: click the **♫** to mute or unmute, drag the slider (or scroll over it) to set the volume, and click the track name to change the soundtrack. `M` mutes, `N` cycles tracks. Your volume, mute state and chosen track are remembered between sessions.

### Mouse
| | |
|---|---|
| Left click | place / select |
| Left drag on empty ground | pan the city |
| Left drag a tower's **base** | move it |
| Left drag a tower's **middle** | rotate it |
| Left drag a tower's **top** | stretch its height |
| Right / middle drag | orbit |
| Wheel | zoom |

### Keys
| | |
|---|---|
| `1` `2` `3` `4` | districts · decorations · light brush · bulldozer |
| `W A S D` / arrows | move camera |
| `Q` `E` | rotate camera |
| `+` `−` | zoom |
| `R` | reroll the silhouette (or cycle a screen's image) |
| `SPACE` | place at the cursor |
| `SHIFT` hold | small brush / allow overlapping placement |
| `CTRL` hold | snap to grid |
| `ALT` hold | clone what you click / invert the light brush |
| `[` `]` | brush size |
| `Z` `X` | undo · redo |
| `DELETE` | remove selection |
| `I` | upload your own image onto the selected screen |
| `C` | My City settings |
| `P` | photo mode |
| `F3` | hide the interface |
| `F5` | save |
| `M` `N` | mute · next track |
| `F1` | controls |
| `ESC` | menu |

## What's in it

**Five districts**, each with its own silhouette grammar, window palette and rooftop clutter:

- **CENTRAL BD** — corporate spires, setbacks, needles, cold white glass
- **LOWTOWN** — squat mismatched stacks, water tanks, pipes, sodium and red neon
- **NEW EDEN** — octagonal arcologies, terraces, roof gardens, bio-green light
- **OMEGA CORP.** — brutalist monoliths, inverted tapers, violet cores, rotating logos
- **ALPHA CORP.** — ziggurats, crowns, flared tops, amber light

**Reactive filler.** You only place the megastructures. The low city grows around them procedurally — taller placements pull their neighbours up, gaps between towers fill with smaller blocks, street lanes stay clear, and skyways link nearby towers on their own. Move or demolish a tower and the neighbourhood regenerates.

**Light brush.** New towers start dark. Paint over the city to wake the windows (or hold `ALT` to put them back to sleep). Brush radius and flow are adjustable; `SHIFT` gives a fine brush.

**14 decorations**, unlocked as you build: billboards, neon signs, holo screens, towering holo figures, swimming koi projections, rotating corporate seals, helipads, antennas, searchlights, ad airships, drone swarms, steam vents, radio towers, skyways.

**Your own images on the screens.** Select a billboard, holo screen or airship and press `I` to upload a picture. It's stored with the city.

**My City panel** (`C`) — time of day across a full 24-hour sky model, six weather states (clear, haze, smog, rain, downpour, ash), fog density, mist height, brightness, bloom intensity and threshold, anamorphic light streaks and threshold, window glow, neon glow, traffic density, seven colour-grade filters, vignette, grain, scanlines, volume, soundtrack, and a render-quality switch.

**Photo mode** (`P`) — hides the interface, letterboxes to 16:9 / 21:9 / 4:5 / 1:1, saves a PNG.

**Generative soundtrack** — four moods (Lowtown Drift, Void Choir, Rain Church, Null Sector), each a slow chord bed with sparse bells over a delay, plus rain and wind beds tied to the weather. All synthesized in WebAudio; nothing is downloaded. Mute and volume live in the top-right corner and in the My City panel; both are persisted.

## How the look is done

The renderer is a painter's-algorithm 2.5D engine on a plain 2D canvas:

- Buildings are stacks of prisms. Each segment gets a procedurally generated facade texture pair — a dark body and a separate lit-windows layer — mapped onto each visible face in perspective-corrected horizontal strips.
- **Aerial perspective** is per-strip and height-aware: fog is denser near the ground, so the lower city dissolves into mist while towers keep their silhouettes. That's the trick that makes the absent streets read as fog instead of emptiness.
- Emissive surfaces are drawn into a separate half-resolution buffer, which is then thresholded, blurred, and composited additively for bloom, and squashed horizontally before blurring to produce anamorphic streaks. Solid geometry paints black into that buffer as it draws, so lights behind a tower are properly occluded.
- The sky is a time-of-day keyframed gradient with sun/moon, haze bloom, drifting cloud bands and stars; three parallaxed procedural skyline layers sit on the horizon and fade out as the air thickens.

## Files

| | |
|---|---|
| `index.html` | shell, HUD markup, all CSS |
| `js/util.js` | math, seeded RNG, noise, colour |
| `js/camera.js` | orbit camera, projection, ground picking |
| `js/render.js` | sky, fog, far skyline, bloom / streaks, colour grade |
| `js/buildings.js` | district grammars, facade textures, prism drawing |
| `js/props.js` | rooftop clutter, decorations, billboard art, traffic, gizmos |
| `js/city.js` | city model, reactive filler, environment, save format |
| `js/weather.js` | rain / ash particles, lightning |
| `js/audio.js` | generative soundtrack and weather beds |
| `js/ui.js` | rail, palettes, settings, help, save list |
| `js/game.js` | input, tools, editing, progression, saves, main loop |

## If it won't start

The startup screen tells you what went wrong instead of hanging:

- **`COULD NOT LOAD`** — the ten scripts aren't reachable. It names both paths it tried. Check they were all uploaded.
- **`COULD NOT START`** — the scripts loaded but one threw, usually a stale file mixed with fresh ones. Hard-reload (**CMD-SHIFT-R**); if it survives that, the message names the actual error.

All ten scripts load with one shared cache-busting token, so a reload can't mix versions from different builds.

If browser storage is blocked (Safari on `file://`, private windows, or site data disabled), the game still runs — it just can't save cities, and it says so.

## Notes

This is an original implementation inspired by Dystopika's design — it shares no code or assets with it. If you like this, buy the real thing; it's the better game and it's cheap.

Not implemented from the original: Steam Workshop / mod support, achievements, video (as opposed to image) billboards, and the `TAB` advanced-object menu.
