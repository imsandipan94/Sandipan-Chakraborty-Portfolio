# Mystic Slot Prototype

## Changelog

---

# v5.8 - Mobile Readiness (current)

## Summary
Two confirmed real-device mobile bugs (Part 0, priority) plus
general mobile/GitHub readiness work (Parts 1-3), delivered
together. No reel/RNG/reel-strip/payline/win-evaluation/collector/
bonus-feature/spin/balance/bet/jackpot logic touched anywhere in
this milestone; no panel position/size/z-index/artwork changed; no
sound's event/volume/loop/timing changed. `js/reels/`, `js/bonus/`,
`js/core/`, `js/ui/`, `js/animation/`, `js/game.js` reconfirmed
orphaned (not in any `index.html` `<script>` tag) and left
untouched.

---

## BUG A - iOS AUDIO UNLOCK

### Root cause (traced, not assumed)
Grepped every `audioManager.play*()`/`start*Loop()` call site: only
the two calls in `spinManager.js` (`playButtonClick()` on the Spin
button's own click handler, then `playReelSpin()` immediately after
inside the same synchronous `spin()` call) and the plain-button
clicks in `uiManager.js` run inside an actual gesture handler with
no boundary in between. Every other SFX - `playReelStop()`
(`reelManager.js`, inside the `requestAnimationFrame`-driven reel
update loop), and the entire win-line/Pearl-collect/collector-
upgrade/feature-trigger/transition/intro/outro/win-celebration set
(`animationManager.js`, `bubbleBonusFeature.js`, `wildRespinFeature.js`,
`luckyWheelFeature.js`, `pickBonusFeature.js`, `freeSpinsFeature.js`)
- fires from inside a `setTimeout` callback scheduled well after the
originating click's callstack has already returned. Confirmed the
codebase uses zero `async`/`await`/`Promise` anywhere outside
`loadingScreen.js` (grepped), so the original hypothesis's specific
mechanism ("async/await boundary") doesn't apply literally - the
real mechanism is the rAF game-loop/`setTimeout` animation
scheduling, which loses the user-gesture context on iOS the same
way an async boundary would. Confirms the hypothesis's underlying
diagnosis (gesture context lost by play() time) while correcting
its stated mechanism.

### Fix
`js/audioManager.js`:
- New `this.unlocked` flag (constructor).
- New `registerAudioUnlock()`, called once from `initialize()`.
  Adds `pointerdown`/`touchend`/`click` listeners on `document`
  (capture phase, removed after the first fire). On the first of
  any of these, synchronously creates a real `Audio(CONFIG.AUDIO.SFX.
  BUTTON_CLICK)` element (not a silent/dummy element), calls
  `.play()`, and `.pause()`s it once that play() promise resolves
  (swallowing rejection the same silent way every other play() call
  already does). Never added to `this.sounds`/`registerSound()` -
  it's not a gameplay SFX instance.
- No change to which sounds fire for which events, their volume,
  loop behavior, or timing - only whether/when playback is allowed
  to start.

### Testing performed
Live headless-browser rendering (Edge, `--headless=new`) of the
real `index.html` confirmed the game still boots and reaches 100%
load / renders the full game screen (reels, jackpots, mermaid,
collectors, button panel) with no JS errors after this change - the
unlock listener registration itself cannot be exercised headlessly
(it requires a real touch/click gesture), so this is a code-path/
regression check, not a live iOS confirmation. Gameplay behavior
verified pixel-identical to before the change at a 1280x900 desktop
viewport.

---

## BUG B - INFO.HTML MOBILE SCROLL/LAYOUT

### Suspect 1 - `body{background-attachment:fixed}` (confirmed, fixed)
`css/info.css`: replaced with a dedicated `body::before` layer
(`content:""; position:fixed; inset:0; z-index:-1;`) carrying the
same gradient+background-image, `body` itself keeping only its
solid color background. Same "background stays put while content
scrolls" visual, without iOS's known fixed-background scroll bugs.

### Suspect 2 - `#info-nav` `position:sticky` + `backdrop-filter:blur(4px)` (confirmed, fixed)
`css/info.css`: dropped `backdrop-filter:blur(4px)`, raised the
background from `rgba(4,15,28,.9)` to a near-opaque
`rgba(4,13,25,.97)` - visually near-identical against the page
background, without relying on backdrop-filter at all. Sticky-
while-scrolling behavior unchanged.

### Suspect 3 - narrow-width audit (375/390/414px)
Verified every section (How to Play, Symbols & Paytable, Paylines,
Collectors, Wild Respin, Free Spins, Pick Bonus, Lucky Wheel,
Mermaid's Blessing, Jackpots) via a real headless-Chromium render
at exact 375/390/414 CSS-pixel viewport widths (an `<iframe>` with
an explicit CSS pixel width, not `--window-size`, which was found
to NOT produce an accurate CSS viewport in this headless setup -
verified via a `window.innerWidth` probe page before trusting any
result). Found and fixed one real bug: `.paytable-row`'s
`grid-template-columns:1fr repeat(3,64px)` - a bare `1fr` track's
automatic minimum is its content's min-content, and `.pt-symbol`'s
fixed 34px icon refuses to shrink, so at phone widths this pushed
the whole paytable (and page) into horizontal overflow. Changed to
`minmax(0,1fr)` and added `flex-wrap:wrap; min-width:0` to
`.pt-symbol` so long symbol names wrap onto a second line instead.
Every other section (collector-grid, wheel-grid, jackpot-grid,
paylines-grid, creature-row, feature banners) confirmed clean at
all three widths with no code change needed.

---

## PART 1 - VIEWPORT & INPUT (index.html)

- `index.html`/`info.html` viewport meta: added `maximum-scale=1.0,
  user-scalable=no` (block accidental pinch/double-tap zoom) and
  `viewport-fit=cover` (notched-device safe-area support).
- `css/game.css`: `#viewport` gets `height:100dvh` after the
  existing `height:100vh`, which stays as the fallback.
- `css/ui.css`: `#bet-minus`/`#bet-plus` get a `::before{content:"";
  position:absolute; inset:-6px}` - expands the tappable area to
  ~44x44px (32+6+6) with zero visual change (the pseudo-element has
  no paint properties). Every other button confirmed already sized
  via a large `#button-panel` grid cell - left alone.
- `css/reset.css`'s existing global `touch-action:none` on
  `index.html`'s `body` confirmed present, not duplicated;
  `info.html` confirmed to still not have it (unchanged, per its
  own standalone-page design).
- New landscape-phone-only "please rotate your device" overlay:
  `#rotate-overlay` markup added to `index.html` (direct child of
  `<body>`, outside `#viewport`/`#game`, same as `#pearl-fx-layer`);
  CSS in `css/game.css`, hidden by default, shown only via
  `@media (orientation:landscape) and (max-height:500px)` - pure
  CSS, no `scaler.js` change.

### Testing performed
All via headless-Chromium `<iframe>` renders at exact CSS pixel
sizes (see Bug B testing note on why `--window-size` alone isn't
trustworthy for this): confirmed the rotate overlay fills the
screen at 667x375 (phone landscape), stays hidden and shows the
normal game at 1024x768 (tablet landscape) and 375x667 (phone
portrait), and confirmed the full game renders pixel-normal
(reels, jackpots, mermaid, collectors, button panel, spin) at a
1280x900 desktop size after every Part 0/1 change combined.

---

## PARTS 2-3 - ASSET AUDIT & REPO CLEANUP

Report-only/non-gameplay-code work - asset size audit + optimized
copies (`assets-optimized/`, `assets/` itself untouched), new
`.gitignore`, hardcoded-secret scan (none found), GitHub 100MB
per-file check (none over ~21.5MB), LICENSE/README review. See the
delivery report for this milestone for the full findings - not
duplicated here since none of it changed shipped game code.

---

# v5.7 - Payline Visual Overlay + Base Game Audio/SFX

## Summary
Two milestones delivered together (12.5 and 12.6, requested back
to back with no build checkpoint between them): the payline PNG
overlay that appears in sync with each winning line's amount, and
a full gameplay SFX system (reel spin/stop, win line, Pearl
collection, collector upgrade, and general button-click) wired
into the existing systems' own events. Kept as one version rather
than artificially reverting/reapplying code to force two builds.

---

## MILESTONE 12.5 - PAYLINE VISUAL OVERLAY

When a winning line's amount is shown in Column 3, that payline's
`assets/paylines/{N}.png` now appears over the reels at the same
time, and disappears with it - using the exact same timing this
milestone required, not an independent timer.

### Files modified
- `index.html` - one new empty `<div id="payline-layer">`, the
  FIRST child of `#reels-container` (before the 5 `.reel`
  elements, before `#reel-frame`).
- `css/game.css`/`css/ui.css` (actually both live in `ui.css`) -
  new `#payline-layer`/`.payline-overlay` rules. `#payline-layer`
  is `position:absolute` specifically because `#reels-container`
  is `display:flex` - without that it would become a 6th flex
  item and squeeze the 5 reels apart (a real layout shift), not
  sit invisibly on top of them. Layering requires zero z-index:
  being the FIRST child means plain DOM-order stacking already
  puts it above the container's own `reel-bg` background (which
  paints behind ALL children regardless of order) and below every
  reel's symbols (which come later in DOM order) - confirmed via
  `getBoundingClientRect()`/DOM order checks, not assumed.
- `js/animationManager.js`:
  - New `PAYLINE_ASSET_PATH(line)` helper -
    `assets/paylines/${line}.png`. `result.line` is already
    1-based (`winEvaluator.js` returns `line:lineIndex+1`), so
    there is no off-by-one translation to make.
  - `showLineWinAmount(result)` - one fresh `.payline-overlay`
    `<img>` created/appended alongside the existing label, removed
    on the exact SAME `setTimeout` that removes the label - never
    a shared/reused element, since multiple winning lines can be
    visible at once (their reveals overlap in time) exactly like
    the labels themselves already do.
  - New `preloadPaylineAssets()`, called once from `initialize()`.
    Not strictly required for correctness, but each payline PNG is
    a large 3000x1800 canvas - warming the browser's decode at
    boot (off the critical path of any real win) means the very
    first time a given payline wins in a session, its overlay pops
    in with the label instead of a beat behind it. Verified via
    `img.complete`/`naturalWidth` before and after adding this.
  - `clearWinPresentation()` - one additive line removing any
    `.payline-overlay` left over from a previous spin, mirroring
    the existing `.line-win-amount` cleanup right above it.

### Testing performed
All via the Chrome DevTools Protocol against a live page:
- Verified payline PNGs are genuinely transparent (`Format32bppArgb`,
  sampled alpha 0/255 at background/line pixels), not opaque with a
  white background as they first appeared in a static image viewer.
- Payline 1, 2, 10, 20 individually: confirmed exactly the matching
  `{N}.png` appears and no other.
- Sequential/overlapping multi-line test (lines 1, 7, 12, staggered
  500ms apart, each visible 845ms): sampled at 5 time points and
  confirmed the exact expected overlay set at each - including the
  overlap window where two are visible at once, matching the
  labels' own known overlap behavior precisely.
- No-win spin: confirmed zero `.payline-overlay` elements ever
  created.
- Full real-spin integration test (forced Payline 8 via a real
  reel stop, run through the actual `onSpinComplete()` sequence):
  confirmed `8.png` appears, Symbol Win FX still applies to all 3
  contributing symbols, Total Win/Balance update normally (80/
  10,080).
- Confirmed `#reels-container`'s 5 `.reel` elements sit at their
  original evenly-spaced x-positions (no squeeze from the new flex
  sibling), correct DOM child order
  (`payline-layer, reel-1..5, reel-frame`), and a clean console
  boot log.
- Diagnosed an initial "nothing renders" symptom down to headless
  screenshot virtual-time not accounting for real image-decode
  latency on the large PNGs (confirmed via live `img.complete`
  checks and an isolated raw-file/structure replica, both of which
  rendered correctly) - not an implementation bug, but real enough
  to matter for an actual player's first win in a session, which
  is what `preloadPaylineAssets()` above fixes.

---

## MILESTONE 12.6 - BASE GAME AUDIO / SFX INTEGRATION
### (+ button-click follow-up, same milestone)

Wires the existing 6 SFX files already present under
`assets/audio/sfx/` (button-click, reel-spin, reel-stop, win-line,
pearl-collect, collector-upgrade) into the game's own existing
events, through the existing `AudioManager` - no second audio
system, no new audio button, no music/ambience.

### AudioManager (`js/audioManager.js`) - extended, not replaced
- New named API: `playButtonClick()`, `playReelSpin()`/
  `stopReelSpin()`, `playReelStop()`, `playWinLine()`,
  `playPearlCollect()`, `playCollectorUpgrade()`. Every one is a
  thin wrapper around the EXISTING `play()`/`registerSound()`
  primitives - mute state, autoplay-rejection handling
  (`.catch(()=>{})`, unchanged), and central mute tracking
  (`this.sounds`) all still flow through exactly what was already
  there.
- `preloadSfx()`, called once from `initialize()` - creates and
  `.load()`s (never plays) an `Audio()` per `CONFIG.AUDIO.SFX`
  entry, so first playback has no decode delay.
- `playSfx(key, src, options, cooldownMs)` - shared cooldown guard
  (default 60ms, tuned per-SFX below) so rapid-fire events (rapid
  bet clicks, several Pearls close together) can't pile up
  overlapping copies of the SAME sound. Only ever throttles the
  SOUND; the game action that triggered it (bet change, progression,
  etc.) always runs independently and instantly - verified (see
  Testing).
- `playReelSpin()`/`stopReelSpin()` - looping, with the currently-
  playing instance tracked separately (`this.reelSpinAudio`) so a
  new spin can never stack a second loop; `playReelSpin()` also
  defensively stops any previous instance first.
- `play()` itself - one additive `error` listener so a missing/
  broken SFX file logs a `console.warn` and continues, rather than
  the game silently doing nothing or (worse) throwing.
- `toggle()` - one additive line, `this.playButtonClick()`, at the
  very top, before the mute/unmute branch. Because
  `registerSound()` applies the CURRENT mute state at creation
  time, turning audio OFF still plays this one last click audibly
  before going silent; turning audio back ON stays silent for that
  specific click (audio was still off when it started) but every
  click after works normally - exactly the sequencing this
  milestone asked for.
- `js/config.js` - new `CONFIG.AUDIO.SFX` object (6 paths), so
  swapping any placeholder for a final production sound later is
  purely an asset-path edit, no code changes.

### Event hooks (all additive single lines, no existing logic changed)
- **Reel Spin** - `spinManager.js`'s `spin()`: `playReelSpin()`
  right after the existing `reelManager.startSpin()` call (i.e.
  only once balance/idle checks have already passed - never
  merely because the button was clicked). `onSpinComplete()`:
  `stopReelSpin()` at the top (the real "reel sequence finished"
  event).
- **Reel Stop** - `reelManager.js`'s `update()`: `playReelStop()`
  added right where an individual reel's own physics already sets
  `reel.spinning = false` - the actual per-reel stop event, not a
  guessed timer.
- **Win Line** - moved to fire ONCE per whole presentation. Was
  previously (v5.3) called once per line inside
  `showLineWinAmount()`; now called once from
  `showLineWinAmounts()` (the entry point for the whole staggered
  sequence) instead, per this milestone's explicit correction.
  This also fixed a stale reference: `LINE_WIN_SFX` had pointed at
  `assets/audio/sfx/winline.wav` (no hyphen), a file that no
  longer exists - the asset is actually `win-line.wav`. Removed
  the stale constant; `playWinLine()` now reads the correct path
  from `CONFIG.AUDIO.SFX.WIN_LINE`.
- **Pearl Collection** - `animationManager.js`'s
  `playPearlTravel()`: `playPearlCollect()` added at the exact
  same line that already applies `.pearl-fx-impact` - "the Pearl
  reached its collector," never Pearl detection or travel-start.
- **Collector Upgrade** - `animationManager.js`'s
  `playCollectorUpgradeFx()`: `playCollectorUpgrade()` added,
  guarded by `if(!change.isReset)` - fires for genuine 0/3->1/3,
  1/3->2/3, 2/3->3/3 progressions only, never for the 3/3->0/3
  reset path, matching this milestone's own test list.
- **Button Click** - `playButtonClick()` added to every existing
  interactive button's click handler: `spin-button`
  (`spinManager.js`), `bet-plus`/`bet-minus` (`uiManager.js`,
  which also gained a new `info-button` click listener - Info had
  no existing handler in the loaded code at all, so this only adds
  the shared click SFX, no new functionality), and the audio
  toggle itself (`toggle()`, above).

### Testing performed
All via the Chrome DevTools Protocol against a live page, mostly
through REAL flows (actual button clicks, an actual physics-driven
spin) rather than direct method calls, with `audioManager.play`
temporarily instrumented to log every call:
- One real spin (clicked the actual Spin button, let it run its
  real ~3s physics): logged exactly
  `button-click(1) -> reel-spin(1) -> reel-stop(1) x5, each
  ~150-250ms apart -> pearl-collect(1) + collector-upgrade(1) at
  the identical timestamp` (this random spin happened to land a
  Pearl) - a single real playthrough exercising the whole system
  end-to-end correctly.
- Forced a real Payline 8 win (real reel stop, real
  `onSpinComplete()` sequence): confirmed exactly one `win-line.wav`
  call for one winning line.
- Synthetic 3-simultaneous-line win: confirmed still exactly one
  `win-line.wav` call, not three.
- Muted, then called a named SFX: new `Audio` instance was
  `muted:true`. Unmuted afterward: new instances `muted:false`
  again.
- Rapid-fired 5 real clicks on Bet+ : confirmed the bet value
  itself increased by all 5 steps (zero input delay/blocking) while
  only the FIRST click's sound actually started (cooldown correctly
  suppressed the 4 that landed within the 60ms window, matching
  "no uncontrolled stacking" without affecting game responsiveness).
- Confirmed a clean console boot log (`Audio Manager Initialized`
  in the expected position) with no errors and no missing-file
  warnings (all 6 SFX files already exist on disk).

### Gameplay confirmation (both milestones)
No gameplay systems were modified: reel strips, reel timing/stop
physics, symbol IDs/dimensions, Pearl detection, Pearl Collection
FX's own travel/highlight/impact mechanics, collector progression/
reset rules, collector artwork filenames, Collector Upgrade FX's
own visual mechanics, paylines, payline evaluation, payline PNG
files, win evaluation, Total Win, Balance, Bet, spin logic, jackpot
system, background, Mermaid idle animation, bottom UI layout, and
the audio button's own icon/design are all unchanged. No music or
ambience was added.

---

# v5.6 - Collector art/glow sync fix + stronger glow

## Summary
Follow-up fix to v5.5. The collector's artwork was swapping the
instant a spin completed (`CollectorManager.increment()`/`reset()`
ran synchronously, well before any Pearl Collection FX even
started), while the upgrade glow only appeared ~450ms later once
the Pearl's travel animation finished - so the artwork visibly
"jumped" to its new stage well before the glow played, instead of
the two happening together. Also increases the upgrade glow's
intensity.

## Root cause and fix
`CollectorManager.reset()` and the artwork-writing half of
`increment()`'s normal path both called `updateUI()`
unconditionally and immediately - there was no way for the
artwork change to wait for anything. Fixed by splitting
"decide/store the new level" (still instant - progression
authority is unchanged) from "paint that level to the DOM"
(now deferred to the same moment the glow plays, for Pearl-driven
changes):
- `js/collectorManager.js`:
  - Extracted `updateCollectorArt(index)` - a single-collector
    version of the old `updateUI()` loop body (same logic, same
    asset-path lookup, nothing duplicated). `updateUI()` now just
    calls it once per collector; still used for the initial boot
    paint.
  - `reset(index)` no longer calls `updateUI()` itself - it's now
    pure data (current/completed/timer only). Its two callers each
    decide when to paint: `scheduleAutoReset()`'s timer callback
    (no Pearl involved) calls `updateCollectorArt()` immediately,
    right next to the existing `presentCollectorResetFx()` call.
    `increment()`'s already-completed branch does NOT call it -
    the deferred path below handles it instead.
  - `increment()`'s normal path no longer calls `updateUI()`
    either - `registerPendingCollectorChange()` (already existed)
    is the only thing that runs immediately now.
- `js/animationManager.js` - `playPearlTravel()`'s existing
  pending-change consumption block (Phase 3, the same moment
  `.pearl-fx-impact` and the upgrade glow already fire) now also
  calls `collectorManager.updateCollectorArt(reel)` right before
  `playCollectorUpgradeFx()` - CollectorManager's own existing
  method, called at a different moment, never reimplemented.
- `css/ui.css` - `.collector-upgrade-fx` and
  `.collector-upgrade-fx-complete`'s keyframes (only these two -
  `.collector-reset-fx` untouched, wasn't asked for): larger
  `drop-shadow` blur radius, a second stacked outer glow layer for
  a wider halo, and higher `brightness()` at peak. Normal: 14px
  single-layer glow -> 22px + 40px two-layer. Completion: 26px ->
  34px + 60px, brightness 1.25 -> 1.4.
- `index.html` - CSS `?v=` bumped 11 -> 12, JS `?v=` bumped 9 -> 10.

## Testing performed
All via the Chrome DevTools Protocol against a live page, reading
both `collector.current` (the data) and the rendered `<img>` src
(the paint) separately at two points per step:
- Immediately after a spin completes (~30ms later): confirmed
  `collector.current` had ALREADY advanced (e.g. to 1) while the
  `<img>` src was STILL the previous stage's art and no FX class
  was present yet - proving the artwork genuinely no longer jumps
  ahead of the Pearl.
- ~470ms later (once the Pearl arrives): confirmed the `<img>` src
  updated to the new stage AND the upgrade FX class appeared in
  the same check - proving they're now synchronized. Verified for
  0/3->1/3, 1/3->2/3, and 2/3->3/3.
- Same before/after pairing for a new Pearl landing on an
  already-3/3 collector: `current` reset to 0 immediately, but art
  stayed at `activate.png` until the Pearl arrived, then jumped to
  `idle.png` together with `collector-reset-fx`.
- Confirmed the timer-driven auto-reset path (no Pearl involved)
  is unaffected - `updateCollectorArt()` and
  `presentCollectorResetFx()` still both fire immediately when the
  timer itself fires, with no deferral.
- Confirmed a clean console boot log with no errors.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel strips, reel timing/stop
logic, symbol IDs, Pearl detection, Pearl Collection FX travel/
highlight/impact mechanics, paylines, paytable, math model, win
evaluation, Total Win, balance, bet, spin logic, collector
progression/reset RULES (only the timing of when the resulting
level gets painted to the DOM changed), collector artwork
filenames, jackpot system, background, mermaid idle animation,
Symbol Win FX, Line Win Amount Display, audio system, and bottom
UI are all unchanged.

---

# v5.5 - Collector Upgrade FX

## Summary
Milestone 12.4. Adds a visual pulse/glow whenever an individual
collector's level actually changes - 0/3->1/3 and 1/3->2/3 get a
short upgrade pulse, 2/3->3/3 gets a visually stronger completion
pulse (not a feature trigger - none exists yet), and 3/3->0/3
gets a quieter "settle back to idle" pulse, whether that reset
happens because a new Pearl landed on an already-full collector
or because the existing auto-reset timer fired on its own.

CollectorManager's own progression/reset rules and artwork
selection are completely unchanged - this only adds a hook so
AnimationManager finds out when a level changed and plays a
transform/filter pulse on top of whatever CollectorManager
already decided.

Also carries forward two changes made since v5.4 that were never
packaged into their own build: jackpot values are now bet
multipliers (see below), and the jackpot value's gold fill was
changed from a gradient to flat `#ffd700`.

## New behavior
- **Normal upgrade** (0/3->1/3, 1/3->2/3): brief scale-up (~1.05)
  + gold glow, 500ms.
- **Completion** (->3/3): visually stronger version of the same
  pulse (~1.09 scale, brighter/wider glow), 650ms. Explicitly NOT
  a feature-trigger animation - just a stronger completion cue.
- **Reset** (3/3->0/3, either path): a quieter, cooler-toned
  "settle" pulse (light blue rather than gold, slight
  scale-down), 450ms - deliberately never reads as another
  completion.
- Each collector's FX is fully independent - verified via direct
  testing that upgrading Collector 1 never touches Collectors
  2-5's classes, artwork, or progression (see Testing below).

## Files modified
- `js/collectorManager.js`:
  - `increment(index)` - two additive lines, no existing
    statement changed or reordered. In the already-completed
    branch (a new Pearl landing on a full collector - this is
    what forces the 3/3->0/3 reset), right after the existing
    `this.reset(index)` call:
    `animationManager.registerPendingCollectorChange(index, 0,
    false, true)`. In the normal path, right after the existing
    `this.updateUI()` call:
    `animationManager.registerPendingCollectorChange(index,
    collector.current, collector.completed)`.
  - `scheduleAutoReset(index)` - one additive line, right after
    the existing timer callback's `this.reset(index)`:
    `animationManager.presentCollectorResetFx(index)` - this path
    has no Pearl to sync with (it fires ~1s after 3/3 with no new
    Pearl involved), so it plays immediately rather than being
    deferred.
  - `reset(index)` itself was NOT touched at all, in either
    caller's case - only its two callers gained one line each.
- `js/animationManager.js`:
  - New `registerPendingCollectorChange(reel, level, completed,
    isReset)` - CollectorManager calls this the instant a level
    changes; it only stores `{level, completed, isReset}` in a
    small `pendingCollectorChanges` map keyed by reel, it never
    plays anything itself.
  - `playPearlTravel(reel, row)` - extended (existing Phase 1/2/3
    Pearl logic untouched) so that once a reel's Pearl clone
    finishes travelling (the same moment `.pearl-fx-impact`
    already fires), it also checks `pendingCollectorChanges[reel]`
    and, if present, consumes (deletes) it and plays the Collector
    Upgrade FX - this is what makes the pulse happen in sync with
    "the Pearl visually arrived" rather than the instant
    CollectorManager's own data changed (which happens well
    before any presentation layer runs at all - see
    spinManager.js). If two Pearls land on the same reel in one
    spin (not reachable with the current reel strips, same as
    Pearl Collection FX's own note - verified with a synthetic
    matrix instead), only the first one to finish travelling
    finds the pending entry; the second finds nothing, so it
    never double-plays a level change CollectorManager itself
    only ever awarded once.
  - New `presentCollectorResetFx(reel)` - the auto-reset-timer
    path; plays the reset FX immediately (no Pearl involved to
    defer to).
  - New `playCollectorUpgradeFx(collectorArt, change)` - shared by
    both paths above. Applies `.collector-upgrade-fx` /
    `.collector-upgrade-fx-complete` / `.collector-reset-fx` to
    `collectorArt.closest(".collector")` (the whole cell) rather
    than `#collector-art-N` itself - a deliberately different
    element than the one `.pearl-fx-impact` already targets, so
    the two can never fight over the shared CSS `animation`
    property and instead play independently at once (verified -
    see Testing).
  - `clearPearlPresentation()` - extended (existing Pearl
    Collection FX cleanup untouched) with a few additive lines
    that also strip any active Collector Upgrade/Reset FX class
    and clear `pendingCollectorChanges`, so a fast re-spin can't
    leave one stuck mid-pulse or carry a stale pending entry into
    the next spin.
- `css/ui.css` - new `.collector-upgrade-fx` /
  `.collector-upgrade-fx-complete` / `.collector-reset-fx` rules
  + `@keyframes`, placed after the existing `.collector-progress`
  rule. `transform`/`filter` only (plus a `z-index` that only
  applies while one of these classes is present, so an upgrading
  collector renders above its idle neighbors in the gapless
  5-column grid instead of clipping under them) - no layout
  property touched, `#collector-panel` still exactly
  `top:800px; width:750px; height:200px` (verified).
- `index.html` - CSS `?v=` bumped 10 -> 11, JS `?v=` bumped 8 -> 9
  (jackpotManager.js's `?v=` was already at 8 from the untracked
  jackpot-multiplier work folded into this build - see below).

## Jackpot changes carried into this build (not part of Milestone 12.4)
- `js/config.js` / new `js/jackpotManager.js` / `js/betManager.js`
  - jackpot values are now `CONFIG.JACKPOTS[tier] * betManager.getBet()`,
    recalculated live on every bet change (GRAND 500x, MAJOR
    250x, MINOR 100x, MINI 50x - user-specified multipliers).
    Verified exactly correct across the full bet range including
    both `MIN_BET`/`MAX_BET` edges.
  - `css/ui.css` - `.jackpot-value`'s gold fill changed from a
    gradient to flat `color:#ffd700` (font-size also now 40px,
    stroke/shadow removed - picked up from an external edit to
    this file between milestones, not reverted).

## JavaScript changes (game logic)
None to progression/reset rules, artwork selection, Pearl
detection, win evaluation, or the math model. `CollectorManager.
increment()`'s and `.reset()`'s own decisions (when to bump
`current`, when to mark `completed`, when to reset) are
byte-for-byte the same as before this milestone.

## Testing performed
All via the Chrome DevTools Protocol against a live page (direct
manager calls plus one full real-spin integration test through
the actual `onSpinComplete()` sequence), not static screenshots:
- Drove one collector through its entire cycle in sequence and
  confirmed the exact class present at each step:
  0/3->1/3 => `collector-upgrade-fx`, 1/3->2/3 =>
  `collector-upgrade-fx` again, 2/3->3/3 =>
  `collector-upgrade-fx-complete`, then a new Pearl landing on
  that completed collector => data resets to 0/idle.png
  *synchronously* (existing logic, unchanged) while
  `collector-reset-fx` only appears ~450ms later once the Pearl
  visually arrives.
- Separately drove a collector to 3/3 and then waited with no
  further Pearl: confirmed the untouched auto-reset timer still
  fires on its own (existing behavior) and `collector-reset-fx`
  appears immediately at that moment (not deferred).
- Pearl on each of Reels 1-5 individually, and Pearls on Reels
  1/3/5 together in one spin: confirmed only the corresponding
  collector(s) ever gain a class, progression, or artwork change
  - the untouched collectors' classes/current/art stayed exactly
  `[]`/`0`/`idle.png` throughout every case.
- Confirmed `.pearl-fx-impact` (on `#collector-art-N`) and
  `.collector-upgrade-fx` (on `.collector`) are BOTH present at
  once on the same Pearl - `bothCoexist: true`.
- Full real-spin integration test (`collectorManager.evaluateSpin()`
  -> `presentPearlCollectionFx()` -> `winManager.evaluate()` ->
  `presentWin()`, the exact spinManager.js sequence): collector
  progressed correctly, both FX layers applied simultaneously to
  their own elements, and Total Win/Balance (80/10,080) updated
  normally alongside it all.
- Confirmed `#collector-panel` computed style is still exactly
  `top:800px; width:750px; height:200px`, a clean console boot
  log, and pixel-identical idle-state layout against the
  pre-milestone screenshot.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel strips, reel timing/stop
logic, symbol IDs, Pearl detection, Pearl Collection FX, paylines,
paytable, math model, win evaluation, Total Win, balance, bet,
spin logic, collector progression rules, collector reset rules,
collector artwork filenames, jackpot calculation logic (values
now scale with bet, per explicit request, but the calculation
itself is unchanged since it was introduced), background, mermaid
idle animation, Symbol Win FX, Line Win Amount Display, audio
system, audio assets, and bottom UI are all unchanged from this
milestone's own scope. No audio and no bonus-feature trigger were
added, per this milestone's explicit requirement.

---

# v5.4 - Pearl Collection FX

## Summary
Milestone 12.3. Note on scope: this milestone was requested as
"finish the existing Pearl Collection FX implementation," but
inspection (`grep`-ing the whole `js/` tree for any pearl-FX-
related identifier) found no prior implementation at all - only
`CollectorManager`'s existing progression logic, with its
`animations: { levelUp: null, activate: null }` placeholders
still unused. This milestone therefore implements the full
sequence from scratch, inside the existing `AnimationManager`
(per "if an AnimationManager already exists, use it").

When a Pearl lands on a reel, a temporary Pearl clone now visibly
travels from that Pearl's actual on-screen position to its
reel's collector, then gives the collector a brief impact pulse.
`CollectorManager`'s own progression (0/3 -> 3/3 -> 0/3, one step
per reel per spin, artwork selection) is untouched and remains
the sole source of truth - this milestone only observes its
existing matrix/DOM output to decide where to animate.

## New behavior
Three phases per Pearl, driven by `AnimationManager`:
1. **Highlight** (220ms) - the real Pearl `.symbol` element (the
   same one `Symbol Win FX` would target) gets a brief glow/scale
   pulse.
2. **Travel** (450ms) - a temporary `<img>` clone (never the real
   reel symbol, which stays under `ReelManager`'s control the
   whole time) flies from the Pearl's real screen position to its
   collector's real screen position, then is removed.
3. **Impact** (220ms) - the destination collector's own artwork
   (`#collector-art-N`) gets a brief glow/scale pulse once the
   clone arrives.

Reel N always targets `#collector-art-N` (1:1, matching
`CollectorManager`'s own `DEFINITIONS` order) - never determined
from artwork/name. Multiple Pearls on different reels all animate
independently and simultaneously; multiple Pearls sharing one
reel (not reachable with the current reel strips - see Testing
below - but supported in code) stagger 120ms apart instead of
overlapping.

## Files modified
- `js/animationManager.js`:
  - New `presentPearlCollectionFx(matrix)` - entry point, reads
    the same final matrix `ReelMatrix`/`CollectorManager` already
    used. Purely observational: finds Pearl positions and
    triggers the visual sequence, never calls
    `collector.increment()`/`reset()` and never re-runs
    `CollectorManager`'s own reel-has-Pearl decision.
  - New `findPearlPositions(matrix)` - read-only scan for
    animation sourcing only (not a second progression system).
  - New `playPearlTravel(reel, row)` - the 3-phase sequence
    above. Source/target positions come from real
    `getBoundingClientRect()` on the actual Pearl symbol element
    (reused via the existing `getSymbolElement()`) and the actual
    `#collector-art-N` element - never a hardcoded coordinate.
  - **Bug found and fixed during testing**: `presentWin()` reset
    its own prior state via `clearWinEffects()`, which (once
    broadened for Pearl FX cleanup) also wiped any Pearl
    Collection FX in progress - and in the real spin sequence,
    `presentWin()` always runs immediately after
    `presentPearlCollectionFx()` in the same `onSpinComplete()`,
    so it was silently killing the pearl clone the instant it
    was created. Root-caused via a live CDP test rather than
    guessed at - see Testing below. Fixed by splitting the single
    `pendingTimeouts` array/reset into independent
    `winTimeouts`/`clearWinPresentation()` and
    `pearlTimeouts`/`clearPearlPresentation()`, so each
    presentation only ever resets its own prior state.
    `clearWinEffects()` (the method `spinManager.js`'s `spin()`
    already calls at the start of every new spin) now just calls
    both, unchanged from the outside.
- `js/spinManager.js` - one additive line,
  `animationManager.presentPearlCollectionFx(reelMatrix.getMatrix())`,
  right after the existing `collectorManager.evaluateSpin(...)`
  call in `onSpinComplete()` - no existing line reordered or
  changed.
- `index.html` - one new empty `<div id="pearl-fx-layer">`, a
  direct child of `<body>` (NOT inside `#game`/`#viewport`) - see
  below for why. CSS `?v=` bumped 7 -> 8, JS `?v=` bumped 6 -> 7.
- `css/game.css` - new `#pearl-fx-layer` rule
  (`position:fixed; inset:0; pointer-events:none; z-index:400`).
  Deliberately NOT alongside `#background-layer`/`#popup-layer`/
  `#effects-layer` (which are `position:absolute` children of
  `#game`): the Pearl clone's position is computed from real
  `getBoundingClientRect()` viewport coordinates, and `#game` is
  dynamically scaled by `GameScaler` (`transform:scale(...)` in
  `scaler.js`) - an element living inside that scaled context
  can't use raw viewport px for its own `left`/`top`. z-index 400
  is comfortably above `#effects-layer`'s 200 (chosen
  deliberately, not an arbitrary large number).
- `css/ui.css` - new `.pearl-fx-highlight`, `.pearl-fx-clone`
  (+ `@keyframes pearlFxTravel`, reading a per-element `--dx`/
  `--dy` custom property pair since the travel distance differs
  per reel/row/collector), and `.pearl-fx-impact` rules.
  Transform/filter/opacity only - no layout properties touched,
  no change to `#collector-panel`'s `top:800px` or any existing
  dimension.

## JavaScript changes (game logic)
None. `CollectorManager` (progression, reset, artwork selection),
`WinEvaluator`, `PaylineManager`, `ReelManager`'s reel strips/
stop logic, and the Pearl symbol ID are all byte-for-byte
unchanged in their own logic - `CollectorManager.evaluateSpin()`
and `findReelsWithPearl()` were read, never modified.

## Testing performed
- Confirmed via `grep` across `js/` that no pearl-FX code existed
  before this milestone (see Summary).
- **Critical verification** (explicitly required): triggered a
  synthetic single-Pearl matrix for each of the 5 reels
  individually via the live page (Chrome DevTools Protocol, not
  static screenshots) and confirmed the resulting
  `.pearl-fx-impact` class landed on exactly
  `collector-art-1`/`2`/`3`/`4`/`5` respectively, with the
  clone's `--dy` negative (collectors sit above the reels) and
  zero clones left in the DOM after each travel completed.
- Multiple Pearls, different reels (1/3/5) in one matrix: all
  three collectors received their impact independently
  (`["collector-art-1","collector-art-3","collector-art-5"]`),
  simultaneously.
- Multiple Pearls, same reel (synthetic - see note below):
  confirmed via clone-count sampling that the second Pearl's
  travel starts ~120ms after the first (1 clone at t=30ms, 2
  clones at t=180ms) rather than firing on top of it, and both
  clean up fully afterward.
- No-Pearl spin: confirmed zero clones and zero impacts.
- Full real-spin integration test: forced an actual reel stop
  (via each reel's own `stopIndex`/`snapToStop()`, the same
  mechanism a real spin uses) that places a real Pearl at Reel 1/
  Row 0, then ran the exact `onSpinComplete()` sequence
  (`collectorManager.evaluateSpin()` ->
  `presentPearlCollectionFx()` -> `winManager.evaluate()` ->
  `presentWin()`). This is what caught the `presentWin()` bug
  above; after the fix, confirmed the collector's artwork updated
  idle.png -> stage1.png (existing logic, untouched), progress
  read `"1/3"`, the Pearl clone survived `presentWin()`, and its
  impact still landed on `collector-art-1` - Pearl Collection FX
  and a real Symbol Win FX/Line Win Amount presentation running
  in the same spin without either interfering with the other.
- Confirmed a clean console boot log (no `Uncaught`/error
  entries) and pixel-identical idle-state layout against the
  pre-milestone screenshot - `#collector-panel` still at
  `top:800px`, no shift in the mermaid, jackpot, reel, or bottom
  UI panels.
- Note: the current reel strips (`reelStripManager.js`) contain
  exactly one Pearl symbol each, so a real spin can never show 2
  Pearls in the same reel's 3 visible rows - the "same reel,
  multiple Pearls" case was verified with a synthetic matrix
  rather than a real spin outcome. The staggering code path is
  implemented and tested regardless, in case that ever changes.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel engine, reel strips, RNG,
symbol manager, Pearl symbol ID, paytable, the 20 fixed paylines,
payline evaluator, win evaluator, win manager, spin manager,
balance manager, bet manager, collector progression/reset rules,
collector artwork selection, Symbol Win FX, Line Win Amount
Display, jackpot system, jackpot artwork, background, mermaid
idle animation, audio system, and bottom UI layout are all
unchanged. No audio was added (per this milestone's explicit
scope).

---

# v5.3 - Line win presentation tuning + win-line SFX

## Summary
Follow-up polish pass on v5.2's line win presentation, plus a new
sound effect. No win math, positions, or the underlying dedup/
sequencing logic changed - only timing/sizing constants and one
new audio call.

## Files modified
- `js/animationManager.js`:
  - `LINE_WIN_DISPLAY_MS` 650 -> 845 (+30%), how long each line's
    amount stays on screen. The matching `.line-win-amount`
    keyframe animation duration in `css/ui.css` was updated to
    845ms in lockstep (a comment in each file cross-references the
    other so they can't drift apart).
  - New `LINE_WIN_SFX = "assets/audio/sfx/winline.wav"` constant
    and one `audioManager.play(LINE_WIN_SFX)` call inside
    `showLineWinAmount()`, so the existing `winline.wav` asset
    plays once per winning line, right as that line's amount
    appears. Routed entirely through the existing
    `AudioManager.play()` helper (built for exactly this - "any
    future system that plays a sound should route the actual
    playback through play()"), so it automatically inherits the
    current mute state and responds live to the audio toggle -
    no changes to `audioManager.js` were needed.
- `css/ui.css` - `.line-win-amount` `font-size` 26px -> 52px
  (+100%); `lineWinAmountPop` animation duration 650ms -> 845ms to
  match the JS change above. No layout properties touched, no
  change to the symbol win FX (`.symbol-win-fx`) sizing/timing.
- `index.html` - CSS `?v=` bumped 6 -> 7, JS `?v=` bumped 3 -> 5
  (two rounds: 3->4 for the duration/size tuning, 4->5 for the
  SFX addition).

## Testing performed
- Re-ran the same deterministic Payline 8 forced-win test as v5.2
  (real `stopIndex`/`snapToStop()`, RNG bypassed only) via the
  Chrome DevTools Protocol against a live page (not a static
  screenshot, to rule out headless virtual-time rendering
  flakiness): `getComputedStyle` on the live `.line-win-amount`
  element confirmed `fontSize:"52px"`, `opacity:"1"`,
  `display:"block"`, text `"+80"`, positioned at the exact
  Reel 3 / Row 0 coordinates computed by hand (`top:1050px,
  left:400px`), with `document.querySelectorAll(".symbol-win-fx")`
  confirming all 3 contributing symbols still correctly FX'd.
- Confirmed the SFX: after the same forced win,
  `audioManager.sounds` contained exactly one entry (matching the
  one winning line) pointed at `assets/audio/sfx/winline.wav`,
  actively playing (`currentTime` advancing, `paused:false`).
- Confirmed mute is respected: called `audioManager.mute()` before
  triggering the same forced win - the resulting sound instance's
  `muted` property was `true`.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel engine, reel strips, RNG,
symbol manager, paytable, the 20 fixed paylines, payline
evaluator, win evaluator, win manager, spin manager, balance
manager, bet manager, collector manager, collector progression,
collector artwork, jackpot system, jackpot artwork, background,
audio toggle, mermaid idle animation, and bottom UI layout are all
unchanged.

---

# v5.2 - Symbol win FX + line win amount display

## Summary
Milestone 12.2. Adds a visual presentation layer on top of the
existing, unmodified win math: winning symbols get a short glow/
scale pulse, and each winning payline's own amount pops up over
its Reel 3 symbol. Also carries forward a follow-up tweak to the
v5.1 Mermaid idle animation (smoothed after v5.1 shipped, never
previously repackaged) - see that section below.

Every number shown comes straight from the existing WinEvaluator/
WinManager results (`result.count`, `result.amount`); nothing here
recalculates a payline, a symbol count, or a payout.

## New file
- `js/animationManager.js` - new `AnimationManager` class,
  `window.animationManager`. Pure consumer of win results:
  - `presentWin(result)` - entry point, called once per completed
    spin with the exact `{ totalWin, winningLines }` object
    `winManager.evaluate()` already returns. No-ops on a no-win
    spin.
  - `collectWinningPositions(winningLines)` - for each winning
    line, reads `paylineManager.getPayline(result.line-1)` and
    walks reels `0..result.count-1` (never all 5 payline
    positions) to get the exact contributing reel/row cells,
    deduped via a `Set` so a position shared by two winning lines
    only plays its FX once.
  - `getSymbolElement(reel,row)` - reads the live, already-stopped
    `<img>` for that cell straight from
    `reelManager.reels[reel].symbols[row]` (rows 0-2 are exactly
    the visible rows once a spin has stopped - the same array
    `ReelMatrix`/win evaluation itself reads), returns its
    `.symbol` container.
  - `playSymbolWinFx(positions)` - adds `.symbol-win-fx` to each
    deduped winning position's `.symbol` element.
  - `showLineWinAmounts(winningLines)` - reveals each line's
    `result.amount` one at a time (500ms stagger) so simultaneous
    wins never stack on top of each other; sized to stay short
    even with several winning lines.
  - `getGamePosition(el)` - computes a symbol's position by
    summing `offsetTop`/`offsetLeft` up the real DOM chain
    (symbol -> reel-strip -> reel -> reels-container -> reel-panel
    -> scene -> game) instead of any hardcoded coordinate, so the
    label always lands on the actual Reel 3 symbol.
  - `clearWinEffects()` - cancels any pending reveals and strips
    the FX class / removes any leftover label immediately; called
    at the start of every new spin as well as automatically after
    a presentation finishes.

## Files modified
- `js/spinManager.js` - two additive calls, no existing lines
  changed or reordered: `animationManager.clearWinEffects()`
  alongside the existing `winManager.reset()` in `spin()`, and
  `animationManager.presentWin(result)` immediately after the
  existing `winManager.evaluate()` call in `onSpinComplete()`
  (before the existing `gameManager.changeState(IDLE)` line, which
  is untouched).
- `js/boot.js` - one line, `animationManager.initialize();`, added
  next to the existing `collectorManager.initialize();`.
- `css/ui.css` - two new self-contained rule blocks:
  - `.symbol-win-fx` + `@keyframes symbolWinFx` (next to the
    existing `.symbol`/`.symbol img` rules) - glow
    (`filter:drop-shadow`) + scale (~1.06, within the 1.05-1.10
    target) + soft pulse, 700ms `ease-in-out`, transform/filter
    only so the 150x150 symbol cell never changes size or
    position (no reel layout shift).
  - `.line-win-amount` + `@keyframes lineWinAmountPop` (same
    section) - reuses the existing UI's own fantasy font/gold-glow
    treatment (`var(--font-fantasy)`, `var(--controlbar-gold-bright)`,
    matching `#button-panel`/`#total-win-value`), appended to the
    existing `#effects-layer` overlay (already
    `position:absolute`/`pointer-events:none` over the whole game),
    so it can never affect reel/symbol layout. `top`/`left` are set
    inline per-label by `AnimationManager` from the live DOM; the
    animation itself only moves the label via `transform`.
- `index.html` - one new `<script src="js/animationManager.js">`
  tag (placed after `winManager.js`, before `collectorManager.js`).
  CSS `?v=` bumped 5 -> 6 and JS `?v=` bumped 2 -> 3 on every
  existing link/script (both CSS and JS changed this milestone).

## Mermaid idle animation follow-up (carried from v5.1)
`css/ui.css` `#mermaid-art` - simplified the idle-float keyframes
from four quarter-stops (0/25/50/75%) to a single continuous
0%-50%-100% arc, and slowed 3.6s -> 4s, so there is only one
smooth ease-in-out sweep per loop instead of several direction
reversals. No layout properties touched, same as v5.1.

## JavaScript changes (game logic)
None. `paylineManager`, `paylineEvaluator`, `winEvaluator`,
`winManager`, `mathModel`, `reelManager`, `reelMatrix`,
`reelStripManager`, `rngManager` are all byte-for-byte unchanged.
The 20 fixed paylines are unchanged.

## Testing performed
- Verified `js/animationManager.js` and the modified files parse
  and run with no console errors (headless Chrome boot log shows
  every manager initializing cleanly, including "Animation
  Manager Initialized", with no `Uncaught`/error entries).
- Deterministic win test: bypassed only the RNG (via each reel's
  own existing `stopIndex`/`snapToStop()` - the same code path a
  real stop uses) to force a real Payline 8 `[1,1,0,1,1]` win with
  `count:3`. The existing evaluator returned exactly
  `{line:8, symbol:4, count:3, multiplier:0.8, amount:80}` with
  every other one of the 20 paylines correctly evaluating to no
  win on that matrix - confirming the win math itself is
  untouched.
- Screenshotted that forced win mid-presentation: confirmed the
  `+80` label renders centered directly over the Reel 3 / Row 0
  symbol (the exact case called out for verification), Total Win
  and Balance updated normally (80 / 10,080) exactly as the
  existing system already does, and by 800ms every FX/label has
  cleared with no leftover artifacts and no shift in the mermaid,
  jackpot, collector, reel-frame, or bottom-UI panels.
- Code-reviewed the Wild/dedup/multi-line paths directly against
  `winEvaluator.js`: Wild (`id:8`) needs no special-casing since
  winning positions are collected generically from
  `result.count`, not by symbol; Pearl (`id:0`) can never appear
  inside a counted run (`winEvaluator` always `break`s on it),
  so it can never receive win FX or interfere with collector
  progression; deduplication uses a `Set` keyed by `reel-row`.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel engine, reel strips, RNG,
symbol manager, paytable, the 20 fixed paylines, payline
evaluator, win evaluator, win manager, spin manager, balance
manager, bet manager, collector manager, pearl detection,
collector progression, collector artwork system, jackpot system,
jackpot artwork, background, audio toggle, and bottom UI layout
are all unchanged.

---

# v5.1 - Mermaid idle animation

## Summary
Milestone 12.1. Adds a subtle, continuous procedural idle
animation to the existing Mermaid artwork so she feels gently
alive while the game is idle - a slow float/breathe loop
(translate + scale) on the existing image, no new assets, no
sprite sheet, no gameplay changes.

## Files modified
- `css/ui.css` - added a `#mermaid-art` rule (`animation:
  mermaidIdle 3.6s ease-in-out infinite`) plus the `mermaidIdle`
  `@keyframes` block, placed directly after the existing
  `#mermaid-panel img` rule. The animation is pure `transform`
  (`translate` + `scale`), so it never touches `top`/`left`/
  `width`/`height` on `#mermaid-panel` or the image - no layout
  shift, panel stays exactly 750 x 800 at its existing
  `top:170px; left:25px` position. Loop is seamless (0% and
  100% keyframes match) at ~3.6s per cycle, well inside the
  2.5-4s target, with `ease-in-out` timing throughout.
- `index.html` - CSS cache-busting `?v=` bumped 3 -> 4 on all
  five stylesheet links (CSS only changed; JS `?v=` params left
  untouched since no `.js` file was modified).

## JavaScript changes
None. No `.js` file was touched, and none reference `#mermaid-art`
or `#mermaid-panel` (confirmed via search), so the idle animation
runs independently of the game state machine and cannot conflict
with reel spinning, win evaluation, collector progression,
jackpot updates, balance, bet, spin, or audio.

## Testing performed
- Verified `css/ui.css` braces balance and the new rule/keyframes
  compile without syntax errors.
- Loaded the game in a browser (headless Chrome) and captured
  screenshots at two different points in the animation cycle:
  confirmed the Mermaid panel's position and size are unchanged,
  the float/breathe motion is subtle (a few px of translate, ~1-2%
  scale), and every other panel (jackpots, collectors, reels,
  total win, balance, bet, spin, audio, info) renders normally
  with no layout shift or visual glitches.
- Confirmed via search that no JavaScript file references
  `#mermaid-art` or `#mermaid-panel`, so no gameplay system
  (reels, paylines, win evaluation, collectors, jackpots,
  balance, bet, spin, audio) was at risk of being touched.

## Known issues
None.

## Gameplay confirmation
No gameplay systems were modified: reel engine, reel strips,
RNG, symbol manager, paytable, paylines, payline evaluator, win
evaluator, win manager, spin manager, balance manager, bet
manager, collector manager, collector artwork, jackpot artwork,
jackpot values, background, audio toggle, and bottom UI are all
unchanged.

---

# v4.7 - Background & jackpot asset framework

## Summary
Pure asset-replacement framework. Adds two dedicated, drop-in
artwork locations - the main game background and the four
jackpot meter graphics - so final art can be dropped in later
by replacing image files only, with no HTML/CSS/JS edits
required. No gameplay systems were modified.

## New asset folders
- `assets/background/` - drop in `background.png`
  (recommended 3200 x 6400 px, 4x master for the 800 x 1600
  game resolution). A `README.txt` in the folder documents
  this for whoever drops the art in.
- `assets/jackpots/` - drop in `grand.png`, `major.png`,
  `minor.png`, `mini.png` (recommended 1064 x 320 px EACH,
  4x master for the ~266 x 80 px display area). Also
  documented with a `README.txt`.
- No final artwork was included in this build - both folders
  ship with only their README so the framework is ready for
  artwork to be dropped in later. No placeholder/fake final
  art was generated.

## Files modified
- `index.html` - added one `.jackpot-art` layer div as the
  first child of each of the four `.jackpot` elements
  (`#grand-jackpot`, `#major-jackpot`, `#minor-jackpot`,
  `#mini-jackpot`). This is the smallest change that lets the
  new artwork sit behind the existing title/value text without
  touching the value elements (`#grand-value`, `#major-value`,
  `#minor-value`, `#mini-value`) at all - those keep receiving
  their values from the existing JS exactly as before. Also
  bumped the CSS `?v=` cache-busting query param 2 -> 3 since
  CSS files changed (JS `?v=` params were left untouched - no
  JS files were modified).
- `css/game.css` - `#background-layer` now paints
  `assets/background/background.png` as a `background-image`
  layered in front of the original placeholder gradient, using
  `background-size:cover` so the artwork fills the layer
  without stretching or distorting (crops instead, if a
  replacement's aspect ratio differs). If the file isn't
  present, that image layer simply doesn't render and the
  original gradient placeholder shows through, so the game
  stays playable with the folder empty. This is plain CSS on
  the existing `#background-layer` element - it scales with
  `#game` via the existing `GameScaler`; no second scaling
  system was added.
- `css/ui.css` - added a `.jackpot-art` layer (absolutely
  positioned, `inset:0`) plus four id-scoped rules
  (`#grand-jackpot .jackpot-art`, etc.) that each point at
  their respective `assets/jackpots/*.png` file via
  `background-image`, with `background-size:contain` so the
  full artwork is always visible, centered, and never
  stretched. Because the art div is a `background-image` on an
  empty div (not an `<img>`), a missing file paints nothing
  instead of a broken-image icon - the existing bordered/
  colored `.jackpot` box remains the fallback look. The div is
  the first child of each `.jackpot`, so with no `z-index` set
  it naturally paints behind the title/value text (later DOM
  order wins ties on equal stacking context) - no z-index
  changes were needed anywhere.

## JavaScript changes
- None. No `.js` file was touched.

## Testing performed
- Verified `index.html`'s `<div>` tags remain balanced and all
  four `.jackpot-art` divs are present and correctly nested.
- Verified `css/game.css` and `css/ui.css` braces balance and
  the new selectors compile without syntax errors.
- Diffed the full `MysticSlot_v4.6` and `MysticSlot_v4.7` trees
  file-by-file: confirmed the only changes are `index.html`,
  `css/game.css`, `css/ui.css`, and the two new asset folders -
  every `.js` file is byte-for-byte identical to v4.6.
- Confirmed the real jackpot value elements
  (`#grand-value`/`#major-value`/`#minor-value`/`#mini-value`)
  and their existing markup/IDs are untouched, so any existing
  or future JS that targets them keeps working unmodified.
- Confirmed `js/ui/hud.js` (a file that writes `textContent`
  onto the `.jackpot` containers) is not loaded by `index.html`
  in this build and remains not loaded in v4.7, so it cannot
  interfere with the new artwork layer or the value spans.

## Known issues
- None identified. Both new asset folders currently contain
  only a `README.txt` (no artwork), so the background and
  jackpot meters render using their original v4.6 placeholder
  look until real art is dropped in.

## Gameplay confirmation
No gameplay systems were intentionally modified: reel engine,
reel strips, RNG, symbol manager, paytable, the 20 fixed
paylines, payline evaluator, win evaluator, win manager, spin
manager, balance manager, bet manager, collector manager, pearl
detection, collector progression, collector artwork system,
feature trigger logic, total win, bet functionality, and spin
functionality are all byte-for-byte identical to v4.6.

---

# v4.3.3 - Mermaid/collector overlap

## UI change
- `#mermaid-panel` was ending at exactly the same boundary the
  collector row starts at (170px -> 770px, collectors from 770px),
  so the Mermaid's tail was scaled to fit a box that stopped dead
  at the collector row - not a CSS crop (`object-fit:contain`
  can't crop), just a hard box boundary.
- Grew `#mermaid-panel` height 600px -> 680px, extending its
  bottom edge 80px into the top of the collector row so more of
  her lower body/tail renders there instead of stopping abruptly.
- Added explicit `z-index` (`#mermaid-panel`:1, `#collector-panel`:
  2) so the collectors reliably layer in front of the Mermaid in
  that overlap zone, giving a "tail visible behind the collectors"
  look rather than her art covering the collector titles/art.

## Files modified
- `css/ui.css` only (`#mermaid-panel`, `#collector-panel`).

## Notes
- The exact overlap amount (80px) is a visual/creative call - easy
  to tune once real art is in by adjusting `#mermaid-panel`'s
  `height`. Larger reveals more tail but also covers more of the
  collector row; smaller keeps more separation.
- `#reel-panel` starts at 970px, still a clear 120px below the new
  850px mermaid-panel bottom edge - no overlap there.

---

# v4.3.2 - Collector box fix (current)

## Bug fix
- Same leftover-placeholder issue as the logo box (v4.3.1): each
  `.collector` cell still had `border:2px solid rgba(255,255,255,
  .25)` and `background:#1d3858` from before its artwork was added,
  showing as a visible box behind each collector's title/art.
  Removed both, keeping only the layout properties (flex centering)
  and `color`/`text-align`/`font-size` needed for the title text.
- `#collector-panel` (the outer wrapper) had no background/border
  of its own - nothing to change there.

## Files modified
- `css/ui.css` only.

## Verification
- Each collector cell now shows only its title text and swapped
  artwork, no background box or border. No other panel/rule
  touched.

---

# v4.3.1 - Logo box fix (current)

## Bug fix
- `#logo-area` still had its old placeholder-text styling
  (`background:#243f63`, `border:2px solid #ffffff55`,
  `border-radius:12px`) left over from before the logo image was
  added in v4.3, showing as a visible dark rounded box behind the
  logo art. Removed those (and the now-unused `color`/`font-size`/
  `font-weight` text properties) from `#logo-area`, keeping only
  the layout properties needed to center the image
  (`display:flex`, `justify-content`, `align-items`, grid
  placement).

## Files modified
- `css/ui.css` only.

## Verification
- `#logo-area` now has no background or border - only the logo
  image itself renders. No other panel/rule touched.

---

# v4.3 - UI Asset Integration (current)

Asset integration milestone only. No gameplay logic changed.

## Files modified
- `index.html` - logo, Mermaid, and 5 collector `<div>`s now contain
  `<img>` elements instead of text/dashed placeholders. Debug
  `collector-progress-N` text divs are unchanged and still present.
- `css/ui.css` - `#logo-area img`, `#mermaid-panel img`, and
  `.collector-art` sizing rules (`object-fit:contain`, max-width/
  max-height 100%) added; `.collector-progress` now `display:none`.
- `js/config.js` - `CONFIG.COLLECTORS.DEFINITIONS[].key` renamed to
  the new folder convention (`luckyWheel`, `wildRespinLeft`,
  `freeSpins`, `wildRespinRight`, `pickBonus`); added
  `STAGE_NAMES:["idle","stage1","stage2","activate"]`.
- `js/collectorManager.js` - `buildAssetPaths()` now builds
  `idle/stage1/stage2/activate` filenames from `STAGE_NAMES`
  instead of `level0..level3`; `cacheElements()` also caches each
  collector's `<img id="collector-art-N">`; `updateUI()` now sets
  that image's `src` to `collector.assets[collector.current]` in
  addition to the existing (now hidden) debug text update. No
  change to `evaluateSpin`, `findReelsWithPearl`, `increment`,
  `reset`, or `scheduleAutoReset`.

## Assets added
- `assets/logo/logo.png`
- `assets/mermaid/mermaid.png`
- `assets/collectors/{luckyWheel,wildRespinLeft,freeSpins,
  wildRespinRight,pickBonus}/{idle,stage1,stage2,activate}.png`
  (20 files)

All 22 are placeholder art (clearly labeled) - supplied final
artwork was not attached to this milestone's request, so these
placeholders are drop-in replacements: keep the exact same
filenames/folders and the real art will render automatically. No
image was resized manually; sizing is handled entirely via CSS
`object-fit`.

## UI changes
- Logo and Mermaid render as images, centered, aspect-ratio
  preserved, scaling with the existing fixed-resolution + scaler.js
  system (no changes to scaler.js were needed).
- Each collector's artwork now swaps automatically between
  idle -> stage1 -> stage2 -> activate as its own progression
  changes, and back to idle on auto-reset.
- The debug "0/3" progression text remains in the DOM and still
  updates every spin, just hidden via CSS.

## Bug fixes
None - this milestone did not touch gameplay logic.

## Verification
- Headless simulation: collector art confirmed to step
  idle -> stage1 -> stage2 -> activate -> idle in lockstep with
  `collector.current`, for the correct collector only - other 4
  collectors' art and progression untouched.
- Debug text element still receives `textContent` updates (just
  CSS-hidden).
- A full real spin (reel engine, RNG, paylines, win evaluation)
  still runs end-to-end with correct win output and no errors.
- Reel Engine, RNG, Reel Strips, Paylines, Win Evaluation, Collector
  Progression Logic, Pearl Detection, Spin Logic, Balance System,
  and Bet System were not modified.

---

# Milestone 7.2 - Auto-Reset on 3/3 (current)

## Fix
- A collector reaching 3/3 previously stayed there until the NEXT
  Pearl landed on that reel (in a future spin) triggered the reset.
- `increment()` now calls `scheduleAutoReset(index)` the moment a
  collector hits 3/3: a 1000ms timer (`this.autoResetDelay`) that
  resets it back to 0/3 on its own, no further Pearl required.
- The timer re-checks `collector.completed` before resetting, and
  any pending timer is cleared/replaced whenever a collector
  completes again or is reset - so a Pearl arriving on that reel
  before the delay elapses (fallback path, unchanged) can never
  have its fresh progress clobbered by the earlier, now-stale timer.

## Verified
- 3/3 stays visible, then auto-resets to 0/3 on its own after
  ~1s with zero further Pearls.
- Pearl arriving mid-delay still resets + starts fresh progress
  immediately (existing fallback), and the original timer does
  not later wipe that fresh progress out.
- Other collectors unaffected.

## Not touched
- Everything else in collectorManager.js (createCollectors,
  findReelsWithPearl, evaluateSpin, updateUI, asset/animation
  framework), spinManager.js, reel engine, paylines, win
  evaluation, config.js.

---

# Milestone 7.1 - Independent Collectors + Reset Fix (current)

## Issue 1 - Collectors now independent per reel
- Root cause: `evaluateSpin()` counted every Pearl across the whole
  matrix and called `incrementAll()` once per Pearl, so all 5
  collectors always moved together by design.
- Replaced with `findReelsWithPearl(matrix)`, which checks each
  reel independently and returns each reel index at most once
  (multiple Pearls on one reel still award only one progression).
  `evaluateSpin()` now calls `increment(reelIndex)` only for those
  reels - collectors[0..4] map 1:1 to reels 1-5 (Lucky Wheel, Wild
  Respin L, Free Spins, Wild Respin R, Pick Bonus), matching
  `CONFIG.COLLECTORS.DEFINITIONS`.

## Issue 2 - 3/3 now always resets to 0/3 (never skips to 1/3)
- Root cause was the same design: a single spin with 2+ Pearls
  anywhere on the grid could call `incrementAll()` more than once,
  so a collector at 3/3 could get reset to 0/3 AND advance to 1/3
  within the same spin's evaluation - the 0/3 state was real but
  never visibly separated from the next spin's result.
- Fixing Issue 1 structurally fixes this: `increment()` is now
  called at most once per collector per spin, so a collector can
  only ever advance by one step or reset to 0/3 in a given spin -
  never both.

## Verified (headless simulation against the real code)
- Pearl on each single reel (1-5) moves only that reel's collector.
- Two-reel case (Reel 2 + Reel 5) with Reel 2 pre-set to 1/3 ->
  exactly [0,2,0,0,1].
- Three-reel case (Reels 1,3,4) -> exactly [1,0,1,1,0].
- Three Pearls on the same reel -> still only +1.
- Collector pre-set to 3/3, then a spin with 2 Pearls (one on that
  reel, one elsewhere) -> resets to exactly 0/3, other collector
  advances to 1/3 - no skip.
- Four spins in a row on the same reel -> 1/3, 2/3, 3/3, 0/3.
- One full real spin still runs end-to-end (reel engine, paylines,
  win evaluation) with no errors.

## Not touched
- `spinManager.js` (still calls `collectorManager.evaluateSpin(
  reelMatrix.getMatrix())` with the same signature - no change
  needed), reel engine, paylines, win evaluation, config.js,
  asset/animation framework from the previous milestone.

---

# Milestone 7 - Collector Progression Framework (current)

## Objective 1 - Fixed Collector Progression
- Root cause: `CollectorManager.increment()` existed and cycled
  correctly (0/3 -> 1/3 -> 2/3 -> 3/3 -> 0/3), but nothing in the
  spin flow ever called it - its only caller was a manual SPACE-key
  debug hook in boot.js, disconnected from actual spins.
- Added `CollectorManager.countPearls(matrix)` /
  `evaluateSpin(matrix)`, reading only the FINAL stopped reel
  matrix from `ReelMatrix.getMatrix()` (never reel strips, RNG, or
  intermediate animation frames).
- Wired `collectorManager.evaluateSpin(reelMatrix.getMatrix())`
  into `SpinManager.onSpinComplete()`, right after
  `reelMatrix.build()`.
- Every Pearl (symbol ID 0) found increments all 5 collectors by
  one step, reusing the existing increment/reset cycle unchanged.
- Verified with a headless simulation of 40 real spins (30 Pearls
  landed -> every collector correctly at 2/3, i.e. 30 mod 4) plus
  synthetic 2-Pearl and 4-Pearl (cascade-through-reset) cases.

## Objective 2 - Future Asset/Animation Framework
- Each collector now stores `name`, `current`, `max`, `completed`,
  `assets` (level0..level3 image paths), and `animations`
  (`levelUp`/`activate`, both `null` placeholders - no playback
  implemented).
- `CONFIG.COLLECTORS` extended (additive only) with `MAX_LEVEL` and
  a `DEFINITIONS` list (name + asset-folder key per collector).
- Added placeholder level0-level3 art under
  `assets/collectors/<reelN-name>/` for all 5 collectors.
- UI still renders text-only ("0/3" ... "3/3"); the asset framework
  is stored but intentionally unused until a future art pass.

## Not touched (per brief - already complete/working)
- Reel engine, RNG, Reel Strip System, Symbol System, Paytable, 20
  Fixed Paylines, Payline Evaluation, Win Evaluation, Total Win
  Meter, collector panel layout (already correctly positioned
  between Mermaid and Reels in this build's CSS).
- No bonus feature triggering - out of scope for this milestone.

---

# Version 0.3.0

## Milestone 3 – Reel Engine

### Added

- Symbol Manager
- Reel Manager
- Reel Strip System
- Spin Manager

### Reel Engine

- 5 Reel Architecture
- 3 Row Configuration
- Symbol Library
- Reel Strip Definitions
- Reel State Management
- Spin State Machine

### Features

- Spin Request
- Stop Request
- Reel Data Structure
- Symbol Assignment API
- Reel Update Loop
- Future Animation Hooks

---

# Previous Versions

## Version 0.2.0

### Static Scene

- HUD Manager
- Button Manager
- UI Layout
- Static Reel Window
- Scene Manager

---

## Version 0.1.0

### Engine Foundation

- Project Structure
- Fixed Resolution
- Scaling System
- Theme System
- Boot System
- Configuration System

---

# Next Milestone

## Milestone 4 – Slot Logic

### Planned

- RNG
- Bet Manager
- Balance Manager
- Paytable
- Payline Manager
- Win Evaluator
- Win Calculator
- Total Win
- Credit Deduction
- Credit Award

---

## Future

### Milestone 5

- Free Spins
- Wilds
- Scatters
- Collector Features
- Pick Bonus

### Milestone 6

- Audio
- Animations
- Particle Effects
- Performance Optimization
- Production Build