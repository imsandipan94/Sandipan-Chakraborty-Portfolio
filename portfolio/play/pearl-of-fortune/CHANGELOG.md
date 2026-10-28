# Changelog

This file tracks top-level release milestones. Full detailed
history lives in `docs/changelog.md`.

---

## v5.8 - Mobile Readiness (iOS audio unlock, info.html scroll fix, viewport/touch)

**Goal:** fix two confirmed real-device mobile bugs and get the
project ready for itch.io/GitHub Pages mobile play. (1) iOS Safari
never played any audio because every SFX after the very first
click fires from inside the rAF-driven reel loop or a setTimeout
animation step, outside the originating gesture's callstack -
added a one-time gesture-synchronous unlock play()+pause() on the
first pointerdown/touchend/click. (2) info.html's vertical scroll
broke on iOS from `body{background-attachment:fixed}` plus
`#info-nav`'s `position:sticky` + `backdrop-filter:blur()`
combination - replaced the fixed background with a dedicated
`body::before` layer and dropped the backdrop-filter for a
near-opaque solid; also fixed a CSS Grid min-content overflow bug
in the paytable on narrow phones. (3) Added `viewport-fit=cover`/
zoom-lock meta tags, a `100dvh` fallback for `#viewport`, a wider
(44px) tap target for the bet +/- buttons without changing their
visual size, and a landscape-phone-only "please rotate" overlay.
No reel/RNG/paylines/win/collector/bonus-feature/spin/balance/bet/
jackpot logic touched; no sound's event/volume/timing changed,
only whether/when playback is allowed to start on iOS. See
`docs/changelog.md` for full detail.

---

## v5.7 - Payline Visual Overlay + Base Game Audio/SFX

**Goal:** two milestones delivered together. (1) Show each
winning line's `assets/paylines/{N}.png` over the reels in exact
sync with its Column 3 amount - below the symbols, above the reel
background, using the SAME timing as the existing label, never an
independent timer. (2) Wire the 6 existing gameplay SFX files into
their real events (reel spin/stop, win line - once per
presentation not once per line, Pearl collection, collector
upgrade - genuine progression only, and a new shared button-click
across every interactive button), fully mute-aware and rapid-fire
safe, with zero changes to any underlying game logic. Verified via
live browser testing throughout, including one full real spin
with instrumented audio call logging. See `docs/changelog.md` for
full detail.

---

## v5.6 - Collector art/glow sync fix + stronger glow

**Goal:** fix the artwork changing instantly at spin-complete
while the upgrade glow waited ~450ms for the Pearl to arrive -
now both happen together, deferred to the Pearl's arrival for
Pearl-driven changes (immediate for the timer-driven auto-reset,
which has no Pearl to sync with). Also increased the upgrade
glow's intensity (larger/dual-layer drop-shadow, higher
brightness) on both the normal and completion pulses. Verified
via live before/after DOM checks, not just code review - see
`docs/changelog.md` for full detail.

---

## v5.5 - Collector Upgrade FX

**Goal:** give each collector a visible pulse/glow whenever its
own level actually changes - normal pulse at 0/3->1/3 and
1/3->2/3, a stronger completion pulse at 3/3 (not a feature
trigger), and a quieter reset pulse at 3/3->0/3, all fully
independent per collector. CollectorManager's own progression/
reset rules are completely untouched - this only adds a hook
that fires when its level changes. Also carries the jackpot
bet-multiplier work and a flat-gold jackpot value color, both
made since v5.4 but never packaged. No audio, no bonus-feature
trigger, per this milestone's explicit scope. See
`docs/changelog.md` for full detail.

---

## v5.4 - Pearl Collection FX

**Goal:** when a Pearl lands, visually show it travel from its
actual reel position to its collector (Reel N -> Collector N)
and give that collector a brief impact pulse, without touching
CollectorManager's existing progression/reset/artwork logic in
any way. No prior implementation existed despite the request
describing one as already started - see `docs/changelog.md` for
the inspection that confirmed this, plus a real coexistence bug
(a Symbol Win FX reset was silently killing the Pearl animation)
found and fixed via live browser testing rather than assumed
away. No audio added (out of scope for this milestone). See
`docs/changelog.md` for full detail.

---

## v5.3 - Line win presentation tuning + win-line SFX

**Goal:** polish the v5.2 line win presentation - the amount
stays up 30% longer and displays at double size, and each
winning line now plays the existing `winline.wav` sound effect
through the existing AudioManager (fully mute-aware). No win
math or positioning logic changed. See `docs/changelog.md` for
full detail.

---

## v5.2 - Symbol win FX + line win amount display

**Goal:** make the existing wins feel better visually - a short
glow/scale pulse on the symbols that actually contributed to a
win, and each winning line's own amount popping up over its
Reel 3 symbol - without touching the existing win math in any
way (positions and amounts are read straight from the existing
WinEvaluator/WinManager results). Also carries a follow-up
smoothing tweak to the v5.1 Mermaid idle animation. See
`docs/changelog.md` for full detail.

---

## v5.1 - Mermaid idle animation

**Goal:** make the existing Mermaid artwork feel gently alive
while the game is idle, via a subtle CSS-only float/breathe
loop (transform-based, no new assets, no layout shift). No
gameplay functionality was changed. See `docs/changelog.md`
for full detail.

---

## v4.7 - Background & jackpot asset framework

**Goal:** a clean asset-replacement framework so the main game
background and the four jackpot meter graphics can be dropped
in later by replacing image files only - no HTML/CSS/JS edits
needed. No gameplay functionality was changed.

### New asset folders
- `assets/background/background.png` - recommended export
  **3200 x 6400 px** (4x master; game resolution stays
  800 x 1600, scaled down by the existing `GameScaler`).
- `assets/jackpots/grand.png`, `major.png`, `minor.png`,
  `mini.png` - recommended export **1064 x 320 px EACH**
  (4x master; display area is ~266 x 80 px).

No final artwork was included in this build - both folders
currently contain only a `README.txt` describing the expected
filenames and dimensions. No placeholder/fake final art was
generated; the game falls back to its existing v4.6 placeholder
look (gradient background, bordered jackpot boxes) until real
art is dropped in.

### Files modified
- `index.html` - added one `.jackpot-art` layer `<div>` inside
  each of the four jackpot elements (smallest possible change);
  the jackpot **value** elements (`#grand-value`, `#major-value`,
  `#minor-value`, `#mini-value`) were not touched and keep
  working exactly as before. CSS cache-busting `?v=` bumped
  2 -> 3 (CSS only - no JS files changed, so JS `?v=` was left
  alone).
- `css/game.css` - `#background-layer` now layers
  `assets/background/background.png` (via `background-image`,
  `background-size:cover`) in front of the original placeholder
  gradient, which remains as the fallback.
- `css/ui.css` - added `.jackpot-art` (a `background-image`
  layer, `background-size:contain`, centered, non-stretching)
  plus one id-scoped rule per jackpot pointing at its
  `assets/jackpots/*.png` file.

### JavaScript changes
None. Every `.js` file is byte-for-byte identical to v4.6.

### Testing performed
See the full checklist in `docs/changelog.md` under this same
version. Summary: HTML/CSS syntax verified balanced, full
file-tree diff against v4.6 confirms only `index.html`,
`css/game.css`, `css/ui.css`, and the two new asset folders
changed, and the jackpot value elements/IDs are confirmed
untouched.

### Known issues
None. Both new asset folders are currently empty of artwork
(README only), so visuals render using the original v4.6
placeholder look until real art is dropped in.

### Gameplay confirmation
No gameplay systems were intentionally modified: reel engine,
reel strips, RNG, symbol manager, paytable, the 20 fixed
paylines, payline evaluator, win evaluator, win manager, spin
manager, balance manager, bet manager, collector manager, pearl
detection, collector progression, collector artwork system,
feature trigger logic, total win, bet functionality, and spin
functionality are all unchanged from v4.6.
