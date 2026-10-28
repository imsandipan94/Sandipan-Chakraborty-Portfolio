/* ==========================================
   FREE SPINS FEATURE
   Pearl of Fortune

   Milestone - Free Spins.

   Owns the Free Spins flow end-to-end once FeatureManager routes a
   completed Collector 3 here (see FeatureManager.triggerFeature()) -
   FeatureManager stays the single entry/exit point (lockSpin()/
   finishActiveFeature()), this never touches CollectorManager's
   progression fields directly except through its own existing
   reset()/updateCollectorArt() (the same pair every other feature's
   own completion already uses). The intro sequence (feature-
   transition glow -> background swap -> fs-intro.png popup) reuses
   AnimationManager's own generic presentFeatureTransition()/
   presentFeatureIntroPopup() rather than FeatureManager's generic
   text placeholder - see start() below.

   Reuses the EXISTING Base Game spin/stop/win pipeline unchanged -
   every automatic Free Spin goes through ReelManager.startSpin() and
   the SAME SpinManager.onSpinComplete() every real spin already uses
   (Collector evaluation, Pearl FX, win evaluation, win presentation,
   Total Win/balance). The only Free-Spins-specific work here is:
   driving the automatic spin loop, the "Spins Left - XX" counter,
   and the one authoritative freeSpinsRemaining value it reads from -
   never a duplicate reel-resolution or win-calculation system.
========================================== */

// Fallback only - CONFIG.FEATURES.MAPPING[2].freeSpins (config.js) is
// the actual authoritative award amount; this is never used unless
// that value is somehow missing.
const FREE_SPINS_DEFAULT_COUNT = 12;

// Brief pacing pauses (ms) - none of these affect game math, they
// only keep consecutive automatic spins from feeling instantaneous.
const FREE_SPINS_NO_WIN_PAUSE_MS = 300;
const FREE_SPINS_POST_WIN_BUFFER_MS = 300;

// Intro sequence (Milestone - Free Spins intro transition):
// AnimationManager.presentFeatureTransition() (the shared glow
// wipe, FEATURE_TRANSITION_GLOW_MS=2000ms - see animationManager.js)
// runs first, swapping in the Free Spins background at its
// midpoint, THEN this full-screen artwork popup shows for
// FREE_SPINS_POPUP_MS before the actual automatic spins begin.
const FREE_SPINS_INTRO_POPUP_SRC = "assets/popups/fs-intro.png";
const FREE_SPINS_POPUP_MS = 3000;

// Outro sequence: the counter disappears this much EARLIER than the
// outro transition's own midpoint (where the background reverts) -
// see endFeature() below.
const FREE_SPINS_COUNTER_EARLY_HIDE_MS = 500;

// Bug fix - "Free Spins Triggered" popup. Matches
// WildRespinFeature's own WILD_RESPIN_INTRO_MS pattern exactly
// (featureManager.showPlaceholder(label), shown briefly, THEN
// hidden before the feature's own flow begins) - Free Spins had
// been skipping straight to the transition glow with no trigger
// popup at all.
const FREE_SPINS_TRIGGER_POPUP_MS = 1200;

// Retrigger (Milestone - Free Spins retrigger): once Collector 3 is
// reset to 0/3 (see start() above), it collects Pearls again like
// any Base Game collector for the rest of the feature. Its own
// completion FX (glow pulse/mermaid3/audio) plays through the
// UNCHANGED, existing Pearl-arrival pipeline (PEARL_TRAVEL_MS +
// COLLECTOR_UPGRADE_COMPLETE_FX_MS, animationManager.js) - this
// delay just waits long enough for that to visually finish before
// awarding the extra spins and quietly resetting the Collector back
// to 0/3 for next time, so the "activate" art/pulse always gets a
// moment to actually be seen first.
const FREE_SPINS_RETRIGGER_RESET_DELAY_MS = 1300;

// Retrigger zap (per explicit request) - a "+N SPINS" bubble travels
// from the triggering Collector's own art to the "Spins Left" counter
// before the award's own NUMBER actually updates on screen - reuses
// the EXISTING .bubble-zap-trail/#pearl-fx-layer technique every other
// feature's own resolution zap already established, and the
// .bubble-zap-additional_spins color class (ui.css) that already
// existed but had nothing using it yet. Same timings every other
// zap/meter-impact in this project already uses.
const FREE_SPINS_RETRIGGER_ZAP_MS = 480;
const FREE_SPINS_RETRIGGER_IMPACT_MS = 300;

class FreeSpinsFeature{

    constructor(){

        this.active = false;

        this.collectorIndex = null;

        // The single authoritative value - the "Spins Left - XX"
        // counter (see updateCounter()) always reads straight from
        // this, never a separately-tracked UI number.
        this.freeSpinsRemaining = 0;

        this.totalSpinsAwarded = 0;

        this.counterEl = null;

        // Milestone - Free Spins pause/resume. True while a higher-
        // priority Feature (Wild Respin/Lucky Wheel/Pick Bonus) has
        // interrupted Free Spins - see pause()/resume() below.
        // runNextSpin() checks this and simply waits rather than
        // starting another automatic spin while it's true; nothing
        // else about Free Spins' own state (freeSpinsRemaining, the
        // triggering Collector) is touched by pausing, so resuming
        // continues exactly where it left off.
        this.paused = false;

        // Milestone - Free Spins pause/resume (counter freeze). True
        // when a Free Spin resolved AND completed an interrupting
        // Collector on the SAME spin - its own decrement/counter
        // update is deferred (not lost) until resume(), so the
        // counter's displayed number never changes while paused.
        this.pendingDecrement = false;

        // Milestone - Free Spins Mermaid's Blessing / Automatic
        // Bubble Bonus. Rolled ONCE per Free Spins trigger (see
        // start() below), never re-rolled per spin - bubbleBonusArmed
        // is this session's one-time result, bubbleBonusTriggerSpin
        // is which automatic spin (1-based, counted via spinsPlayed)
        // it actually fires on, and bubbleBonusFired guarantees it
        // can only ever fire once even if maybeTriggerBubbleBonus()
        // is somehow reached again after spinsPlayed has already
        // passed the target.
        this.bubbleBonusArmed = false;
        this.bubbleBonusTriggerSpin = null;
        this.bubbleBonusFired = false;
        this.spinsPlayed = 0;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Free Spins Feature Initialized");

        this.preloadAssets();

    }

    /* ======================================
       PRELOAD ASSETS
       Warms the browser's image cache for the intro popup/background
       at boot, off the critical path of any real trigger - matches
       AnimationManager.preloadPaylineAssets()' own established
       pattern. Without this, the FIRST time either image is actually
       needed, the browser has to fetch+decode it fresh, which is
       exactly the "short delay" that made the intro popup appear a
       beat after the transition glow had already finished instead of
       instantly.
    ====================================== */

    preloadAssets(){

        const introPopup =
            new Image();

        introPopup.src = FREE_SPINS_INTRO_POPUP_SRC;

        const background =
            new Image();

        background.src = "assets/background/fs-bg.png";

    }

    /* ======================================
       START
       Called by FeatureManager.triggerFeature() the instant the
       Collector's own completion FX/mermaid3 has already played.
       mapping.freeSpins (CONFIG.FEATURES.MAPPING - config.js) is
       the single source of truth for the award amount.

       Intro flow (Milestone - Free Spins intro transition):
       feature-transition glow (2s, background swaps at its
       midpoint - see setBackgroundActive()) -> full-screen
       fs-intro.png popup (3s) -> counter appears -> first automatic
       spin. The actual feature gameplay only starts once the popup
       has fully disappeared.
    ====================================== */

    start(mapping, collectorIndex){

        this.active = true;

        this.collectorIndex = collectorIndex;

        this.totalSpinsAwarded =
            mapping.freeSpins || FREE_SPINS_DEFAULT_COUNT;

        this.freeSpinsRemaining = this.totalSpinsAwarded;

        // Milestone - Free Spins Mermaid's Blessing / Automatic
        // Bubble Bonus. Rolled ONCE here, tied to this ONE Free
        // Spins trigger - never re-rolled on every subsequent
        // automatic spin (see maybeTriggerBubbleBonus() below). If
        // armed, it fires on a random spin somewhere within this
        // session's own award (1..totalSpinsAwarded) rather than
        // always immediately on spin 1, so it still reads as a
        // random in-session event.
        this.spinsPlayed = 0;
        this.bubbleBonusFired = false;
        this.bubbleBonusArmed = shouldTriggerBubbleBonus();
        this.bubbleBonusTriggerSpin = this.bubbleBonusArmed ?
            1 + Math.floor(Math.random() * this.totalSpinsAwarded) :
            null;

        featureManager.lockSpin(FEATURE_STATE.BONUS_ACTIVE);

        // Bug fix - "Free Spins Triggered" popup, shown BEFORE the
        // transition glow begins - matches WildRespinFeature.start()'s
        // own exact pattern (featureManager.showPlaceholder(label),
        // reused rather than a second popup system).
        const label =
            FEATURE_LABEL[mapping.feature] || mapping.feature;

        featureManager.showPlaceholder(label);

        setTimeout(()=>{

            featureManager.hidePlaceholder();

            this.beginIntroTransition();

        }, FREE_SPINS_TRIGGER_POPUP_MS);

    }

    /* ======================================
       BEGIN INTRO TRANSITION
       The existing transition/background-swap/fs-intro.png flow -
       unchanged, just now gated behind the "Free Spins Triggered"
       popup above finishing first instead of starting the instant
       start() is called.
    ====================================== */

    beginIntroTransition(){

        animationManager.presentFeatureTransition(

            () => {

                // Midpoint - screen fully covered by the glow -
                // swap the background here so the change is masked
                // by the glow's peak coverage instead of popping
                // instantly. Also reset Collector 3 back to 0/3 here,
                // hidden the same way - from this point on it's live/
                // collectible again for the rest of Free Spins (see
                // onSpinResolved()'s retrigger handling below), same
                // as any Base Game collector.
                this.setBackgroundActive(true);

                collectorManager.reset(this.collectorIndex);
                collectorManager.updateCollectorArt(this.collectorIndex);

                // Bug fix - Total Win (the SHARED chain accumulator,
                // featureManager.chainTotalWin) must start blank for
                // a feature triggered fresh from the Base Game, never
                // carrying over whatever a PREVIOUS feature (Wild
                // Respin, etc.) left showing. Free Spins can never
                // itself be "the interrupt" while paused (it's the
                // ONLY feature that supports pause() at all, so
                // pausedController can only ever refer to Free Spins
                // itself, never point to it as an incoming trigger) -
                // this used to reset unconditionally on that basis.
                // Milestone - Feature Win Caps bug fix - Lucky Wheel
                // can now chain DIRECTLY into Free Spins (via the
                // Golden Wheel, FeatureManager.triggerFeature() called
                // straight from LuckyWheelFeature.
                // finishEndFeatureChained() - no pausedController
                // involved at all, that mechanism is specific to
                // Free Spins being interrupted, not to being chained
                // INTO), which this reset previously always wiped -
                // discarding Lucky Wheel's own already-credited total
                // instead of preserving it. capOwner is already set to
                // LUCKY_WHEEL by that point (claimed when Lucky Wheel
                // itself started) - skip the reset in that one case so
                // its cap can correctly govern the combined total once
                // this Free Spins session eventually ends. Reset here,
                // at the glow's peak coverage, the same masked moment
                // the background swap above already uses - by the time
                // the glow fades back out and the player can see the
                // screen again, the meter is already correctly blank
                // (or, in the Lucky-Wheel-chained case, already
                // correctly showing the carried-over total).
                if(!featureManager.capOwner){

                    featureManager.chainTotalWin = 0;

                    winManager.reset();

                }

                // A no-op if Lucky Wheel already owns the current
                // chain (see above) - see FeatureManager.
                // claimCapOwnership()'s own comment.
                featureManager.claimCapOwnership(FEATURE_TYPE.FREE_SPINS);

            },

            () => {

                // Glow fully faded out - now the full-screen intro
                // artwork, on top of everything, for 3 seconds.
                animationManager.presentFeatureIntroPopup(

                    FREE_SPINS_INTRO_POPUP_SRC,
                    FREE_SPINS_POPUP_MS,

                    () => {

                        this.showCounter();

                        this.runNextSpin();

                    }

                );

            }

        );

    }

    /* ======================================
       SET BACKGROUND ACTIVE
       Toggles the Free Spins background (assets/background/fs-bg.png,
       see game.css) on/off - never touches #background-layer's
       inline style directly, just the one class, so the graceful
       missing-asset fallback (shared gradient underneath) already
       built into that CSS rule keeps working unchanged.
    ====================================== */

    setBackgroundActive(active){

        const backgroundLayer =
            document.getElementById("background-layer");

        if(!backgroundLayer){

            return;

        }

        backgroundLayer.classList.toggle("free-spins-active", active);

    }

    /* ======================================
       COUNTER DISPLAY
       Reuses the existing #popup-layer - no new layout element
       added, matches .feature-placeholder's own container styling
       (see ui.css) so it visually reads as part of the same
       feature-notification UI, just a separate, longer-lived
       element than the brief trigger flash.
    ====================================== */

    showCounter(){

        this.hideCounter();

        const popupLayer =
            document.getElementById("popup-layer");

        if(!popupLayer){

            return;

        }

        const el =
            document.createElement("div");

        el.className = "free-spins-counter";
        el.textContent = `Spins Left - ${this.freeSpinsRemaining}`;

        popupLayer.appendChild(el);

        this.counterEl = el;

    }

    updateCounter(){

        if(this.counterEl){

            this.counterEl.textContent =
                `Spins Left - ${this.freeSpinsRemaining}`;

        }

    }

    hideCounter(){

        if(this.counterEl && this.counterEl.parentElement){

            this.counterEl.parentElement.removeChild(this.counterEl);

        }

        this.counterEl = null;

    }

    /* ======================================
       AWARD RETRIGGER (Milestone - Free Spins retrigger)
       Collector 3 reached 3/3 again during Free Spins itself - "no
       pop-ups or transition needed for that": its own completion FX
       already plays through the unchanged, existing pipeline
       (collectorManager.increment() -> AnimationManager.
       playCollectorUpgradeFx(), completely normal since
       FeatureManager.isCollectorLocked() no longer protects it once
       Free Spins is the active feature - see featureManager.js).

       The award ITSELF (freeSpinsRemaining/totalSpinsAwarded) is
       still applied IMMEDIATELY (synchronously) here, even if this
       happens to be what would otherwise be the feature's LAST spin -
       onSpinResolved() below checks freeSpinsRemaining AFTER calling
       this, so the extended count is already in place before that
       decrement/end-of-feature check ever runs. This is what makes
       "meter fills on the last spin -> +12 and the feature continues"
       work correctly instead of the award being lost to a timing race
       against endFeature() (which is what happened when this used to
       be deferred - see git history). Per explicit request, only the
       counter's own DISPLAYED number is now held back - a "+N SPINS"
       zap (launchRetriggerZap() below) travels from the Collector to
       the counter first, and updateCounter() only actually refreshes
       the on-screen text once that zap lands, even though the real
       freeSpinsRemaining value underneath was already correct the
       whole time.

       Only the Collector's own reset-back-to-0/3 stays deferred -
       purely visual, so the player actually gets a moment to see
       its "activate" art/glow pulse (still playing via the pipeline
       above) before it resets for next time.
    ====================================== */

    awardRetrigger(){

        const mapping =
            CONFIG.FEATURES.MAPPING[this.collectorIndex];

        const awardedSpins =
            mapping.freeSpins || FREE_SPINS_DEFAULT_COUNT;

        this.freeSpinsRemaining += awardedSpins;
        this.totalSpinsAwarded += awardedSpins;

        this.launchRetriggerZap(awardedSpins);

        setTimeout(()=>{

            // Defensive only - under normal circumstances the
            // feature can no longer end before this fires, since the
            // award above already extended freeSpinsRemaining past
            // 0. Only guards the (now purely hypothetical) case of
            // the feature ending for some unrelated reason in the
            // meantime.
            if(!this.active){

                return;

            }

            collectorManager.reset(this.collectorIndex);
            collectorManager.updateCollectorArt(this.collectorIndex);
            animationManager.presentCollectorResetFx(this.collectorIndex);

        }, FREE_SPINS_RETRIGGER_RESET_DELAY_MS);

    }

    /* ======================================
       LAUNCH RETRIGGER ZAP
       Reuses the EXISTING .bubble-zap-trail/#pearl-fx-layer travel
       technique every other feature's own resolution zap already
       established (real getBoundingClientRect() deltas, correct
       regardless of GameScaler's current CSS scale) - travelling from
       the triggering Collector's own art to the "Spins Left" counter.
       updateCounter() is deliberately called ONLY once the zap lands
       (never before) - freeSpinsRemaining/totalSpinsAwarded themselves
       were already updated synchronously in awardRetrigger() above,
       this only delays when the counter's own TEXT catches up to that
       already-correct value.
    ====================================== */

    launchRetriggerZap(awardedSpins){

        const sourceEl =
            document.getElementById(`collector-art-${this.collectorIndex + 1}`);

        const targetEl =
            this.counterEl;

        const pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        if(!sourceEl || !targetEl || !pearlFxLayer){

            this.updateCounter();

            return;

        }

        const sourceRect =
            sourceEl.getBoundingClientRect();

        const targetRect =
            targetEl.getBoundingClientRect();

        const sourceCenterX =
            sourceRect.left + sourceRect.width/2;

        const sourceCenterY =
            sourceRect.top + sourceRect.height/2;

        const dx =
            (targetRect.left + targetRect.width/2) - sourceCenterX;

        const dy =
            (targetRect.top + targetRect.height/2) - sourceCenterY;

        const zap =
            document.createElement("div");

        zap.className = "bubble-zap-trail bubble-zap-additional_spins";
        zap.textContent = `+${awardedSpins} SPINS`;

        zap.style.left = sourceCenterX + "px";
        zap.style.top = sourceCenterY + "px";
        zap.style.setProperty("--dx", dx + "px");
        zap.style.setProperty("--dy", dy + "px");
        zap.style.setProperty("--zap-duration", FREE_SPINS_RETRIGGER_ZAP_MS + "ms");

        pearlFxLayer.appendChild(zap);

        audioManager.playPearlCollect();

        setTimeout(()=>{

            if(zap.parentElement){

                zap.parentElement.removeChild(zap);

            }

            this.updateCounter();

            if(this.counterEl){

                this.counterEl.classList.add("bubble-meter-impact");

                setTimeout(()=>{

                    if(this.counterEl){

                        this.counterEl.classList.remove("bubble-meter-impact");

                    }

                }, FREE_SPINS_RETRIGGER_IMPACT_MS);

            }

        }, FREE_SPINS_RETRIGGER_ZAP_MS);

    }

    /* ======================================
       RUN NEXT SPIN
       The player does NOT press Spin for any of these - this is
       the sole automatic driver. Reuses ReelManager.startSpin()
       directly (never SpinManager.spin(), which would deduct
       another bet - a Free Spin is free, no balance is touched
       here at all). The reels resolve through the UNCHANGED Base
       Game pipeline the instant they all stop (ReelManager.
       update() -> SpinManager.onSpinComplete()).
    ====================================== */

    runNextSpin(){

        // Milestone - Free Spins pause/resume. Checked BEFORE the
        // freeSpinsRemaining<=0 check below - even if this happened
        // to be the last spin, ending is deferred until AFTER
        // resuming (resume() calls back into this same method), so
        // FeatureManager.pausedController is always consumed exactly
        // once and Free Spins' own outro transition never plays
        // twice. A higher-priority Feature has taken over (see
        // pause() below) - simply wait here rather than starting
        // another automatic spin or ending. FeatureManager.
        // finishActiveFeature() calls resume() once that Feature
        // (and anything queued ahead of it) has fully finished.
        if(this.paused){

            return;

        }

        if(!this.active || this.freeSpinsRemaining<=0){

            this.endFeature();

            return;

        }

        // Leftover WIN presentation (payline overlay/line-win
        // label) from the previous Free Spin, if any - the same
        // cleanup SpinManager.spin() itself does for a normal spin,
        // done here instead since this deliberately bypasses
        // spin()'s own balance/bet gate. Deliberately
        // clearWinPresentation() only, NOT the full clearWinEffects()
        // (which also wipes Pearl/Collector FX, including any OTHER
        // collector's sustained "waiting its turn" glow via
        // FeatureManager's queue) - none of that should be touched
        // by a routine spin-to-spin cleanup mid-feature.
        animationManager.clearWinPresentation();

        audioManager.playReelSpin();

        reelManager.startSpin();

    }

    /* ======================================
       PAUSE / RESUME (Milestone - Free Spins pause/resume)
       Called by FeatureManager when a higher-priority Collector
       (Wild Respin/Lucky Wheel/Pick Bonus) completes while Free
       Spins is the active feature - see onSpinEvaluated() and
       finishActiveFeature() in featureManager.js. The counter keeps
       showing the same number throughout (see onSpinResolved()'s
       pendingDecrement) - pause() only greys its text out (see
       .free-spins-counter.paused in ui.css) so it visibly reads as
       "on hold" rather than actively counting down; resume() restores
       its normal color. Whether it stays VISIBLE while paused (Wild
       Respin - a same-scene extension of the Base Game, still the
       Free Spins layout) or is fully HIDDEN (Pick Bonus/Lucky Wheel -
       a full scene takeover with nowhere sensible to show it) is a
       separate decision - each such feature calls
       setCounterTakeoverHidden() below itself, at its OWN masked
       transition midpoint (see PickBonusFeature.beginIntroTransition()/
       finishResolution()), never at trigger time while the Free
       Spins layout is still fully visible underneath. Only the
       automatic spin loop (and that pending decrement) are
       actually held until resume() - freeSpinsRemaining and the
       triggering Collector are otherwise completely untouched, so
       resuming continues exactly where Free Spins left off, never
       restarting it.
    ====================================== */

    pause(){

        this.paused = true;

        if(this.counterEl){

            this.counterEl.classList.add("paused");

        }

    }

    resume(){

        this.paused = false;

        if(this.counterEl){

            this.counterEl.classList.remove("paused");

        }

        // Guarantees the counter is visible again the instant Free
        // Spins itself actually resumes, even if it was hidden for a
        // Pick Bonus/Lucky Wheel takeover (see setCounterTakeoverHidden()
        // below) right before this.
        this.setCounterTakeoverHidden(false);

        // Defensive resync - whatever interrupted (Wild Respin/etc.)
        // was ALREADY adding its own spin wins directly onto the
        // SAME shared featureManager.chainTotalWin the whole time it
        // was active (see its own onSpinResolved()), so the display
        // should already be correct by the time control returns
        // here; this just guarantees it, in case anything else
        // touched the display in between.
        winManager.updateUI(featureManager.chainTotalWin);

        // The spin that triggered the interruption still resolved
        // and still counts - its decrement was only held back so
        // the counter's displayed number never changed while
        // paused (see onSpinResolved()) - apply it now, right as
        // Free Spins actually resumes.
        if(this.pendingDecrement){

            this.pendingDecrement = false;

            this.freeSpinsRemaining--;

            this.updateCounter();

        }

        this.runNextSpin();

    }

    /* ======================================
       SET COUNTER TAKEOVER HIDDEN
       Called by a scene-takeover feature (Pick Bonus today, Lucky
       Wheel later) at its OWN masked transition midpoint - see
       PickBonusFeature.beginIntroTransition()/finishResolution() -
       never by Wild Respin, which has no scene takeover of its own
       and leaves the counter visible/greyed via pause() alone. A
       no-op if the counter doesn't currently exist (Free Spins isn't
       actually active/paused).
    ====================================== */

    setCounterTakeoverHidden(hidden){

        if(this.counterEl){

            this.counterEl.classList.toggle("hidden", hidden);

        }

    }

    /* ======================================
       ON SPIN RESOLVED
       Called by FeatureManager.onSpinResolved() - itself called
       once from the tail of SpinManager.onSpinComplete(), the SAME
       moment a normal spin finishes resolving. Everything before
       this point (reel stop, Collector evaluation, Pearl FX, win
       evaluation, win presentation) already ran through the
       UNCHANGED Base Game pipeline - this only reacts to it, never
       recalculates a win itself. The counter only decrements here,
       AFTER the spin (and its win presentation) has fully resolved -
       never before the spin starts.
    ====================================== */

    onSpinResolved(result){

        if(!this.active){

            return;

        }

        // Retrigger check - Collector 3 may have reached 3/3 AGAIN
        // this spin via a normal Pearl, since it's deliberately left
        // live/collectible during Free Spins' own automatic spins
        // (see the transition's midpoint reset in start()).
        // CollectorManager.evaluateSpin() already ran before this
        // call (inside SpinManager.onSpinComplete()), so its data is
        // already up to date here.
        if(collectorManager.collectors[this.collectorIndex].completed){

            this.awardRetrigger();

        }

        // Running Total Win across the WHOLE trigger chain (see
        // featureManager.chainTotalWin) - balance was already
        // credited once for THIS spin's own amount inside
        // WinManager.evaluate() itself, unchanged. Adds on top of
        // whatever was already there (rather than a private feature-
        // local counter) so a value left by an interrupting Feature
        // (or a still-in-progress Bubble Bonus) is never lost.
        if(result && result.totalWin>0){

            featureManager.chainTotalWin =
                Math.round((featureManager.chainTotalWin + result.totalWin) * 100) / 100;

        }

        // Bug fix - re-assert the running total UNCONDITIONALLY,
        // even on a zero-win spin. WinManager.evaluate() already ran
        // earlier in the SAME Base Game pipeline this spin went
        // through and unconditionally displayed THIS spin's own raw
        // win (0 on a no-win spin) - without this, a zero-win Free
        // Spin would leave "0" showing instead of the correct
        // running total until the next winning spin happened to
        // re-sync it.
        winManager.updateUI(featureManager.chainTotalWin);

        const winningLines =
            (result && result.winningLines) || [];

        // Waits for the existing win presentation to actually
        // finish being visible before doing anything else - mirrors
        // AnimationManager.showLineWinAmounts()' own stagger/display
        // math (LINE_WIN_STAGGER_MS/LINE_WIN_DISPLAY_MS, defined in
        // animationManager.js) rather than a second timing system.
        const presentationMs =
            winningLines.length===0 ?
                FREE_SPINS_NO_WIN_PAUSE_MS :
                (winningLines.length-1) * LINE_WIN_STAGGER_MS +
                    LINE_WIN_DISPLAY_MS + FREE_SPINS_POST_WIN_BUFFER_MS;

        setTimeout(()=>{

            // Milestone - Free Spins pause/resume (counter freeze).
            // If THIS spin is what triggered a pause (see
            // FeatureManager.onSpinEvaluated()), hold the decrement
            // rather than applying it now - the counter must show
            // the SAME number for the whole time the interrupting
            // Feature is running, only updating once resume() applies
            // it. runNextSpin() itself already no-ops while paused,
            // so it's still safe to call here unconditionally.
            if(this.paused){

                this.pendingDecrement = true;

                this.runNextSpin();

                return;

            }

            this.freeSpinsRemaining--;

            this.updateCounter();

            this.spinsPlayed++;

            // Milestone - Free Spins Mermaid's Blessing / Automatic
            // Bubble Bonus. Only CHECKED here, on a spin that wasn't
            // ALREADY paused by an external Feature interrupt (see
            // above) - the trigger itself was already decided once,
            // in start(), never re-rolled per spin (see
            // maybeTriggerBubbleBonus() below). It calls runNextSpin()
            // itself either way, so this is a straight replacement
            // for the old unconditional call.
            this.maybeTriggerBubbleBonus();

        }, presentationMs);

    }

    /* ======================================
       MAYBE TRIGGER BUBBLE BONUS (Milestone - Free Spins
       Mermaid's Blessing / Automatic Bubble Bonus)
       Whether it happens at ALL was already decided ONCE, in
       start() (bubbleBonusArmed/bubbleBonusTriggerSpin) - this only
       checks whether THIS spin is the one it lands on, it never
       rolls the chance itself. bubbleBonusFired guarantees it can
       only actually fire once per Free Spins session even though
       this runs after every spin.

       A THIRD, fully internal pause - deliberately bypasses
       FeatureManager entirely (never enters featureQueue, never
       calls lockSpin()/pausedController - Spin/Bet are already
       locked for the whole Free Spins session via start()'s own
       featureManager.lockSpin() call). Reuses the SAME pause()/
       resume() this.paused mechanism the external-interrupt path
       already uses, so runNextSpin()'s existing pause guard and the
       counter's existing grey-out styling both just work unchanged.
    ====================================== */

    maybeTriggerBubbleBonus(){

        if(
            this.bubbleBonusArmed &&
            !this.bubbleBonusFired &&
            this.spinsPlayed >= this.bubbleBonusTriggerSpin
        ){

            this.bubbleBonusFired = true;

            this.pause();

            bubbleBonusFeature.start(() => {

                this.resume();

            });

            return;

        }

        this.runNextSpin();

    }

    /* ======================================
       END FEATURE
       freeSpinsRemaining reached 0 - Milestone - Bonus Feature
       intro/outro audio: a "FEATURE / COMPLETE" popup (with its own
       loop -> end audio sequence) shows for a fixed 2s FIRST, then
       the SAME feature-transition glow used for the intro plays
       before anything actually tears down, so leaving Free Spins
       visually mirrors entering it. The background reverts at the
       glow's own midpoint (masked by its peak coverage, same as the
       intro's own reveal). The counter disappears separately,
       FREE_SPINS_COUNTER_EARLY_HIDE_MS before that midpoint - its own
       dedicated, earlier timer (now correctly scheduled from the
       moment the transition itself actually begins, i.e. AFTER the
       completion popup, not from endFeature()'s own call time), not
       tied to AnimationManager.presentFeatureTransition()'s fixed
       midpoint callback. Everything else only finishes once the glow
       has fully faded back out - see finishEndFeature() below.
    ====================================== */

    endFeature(){

        this.active = false;

        animationManager.presentFeatureCompletionPopup(() => {

            setTimeout(()=>{

                this.hideCounter();

            }, (FEATURE_TRANSITION_GLOW_MS / 2) - FREE_SPINS_COUNTER_EARLY_HIDE_MS);

            animationManager.presentFeatureTransition(

                () => {

                    this.setBackgroundActive(false);

                },

                () => {

                    this.finishEndFeature();

                }

            );

        });

    }

    /* ======================================
       FINISH END FEATURE
       Hand control back to the Base Game (or the next queued
       Feature, if any - see FeatureManager.finishActiveFeature()).
       The counter itself was already removed earlier, above - this
       hideCounter() call is a defensive safety net only (idempotent/
       harmless if already gone), so the counter is GUARANTEED gone
       by the time control actually returns to the Base Game no
       matter what.

       Collector 3 itself is only reset if it has NO genuine
       in-progress pearls to preserve (0/3), or is still sitting
       fully completed (3/3 - e.g. a retrigger award dropped by the
       race guard in awardRetrigger() above, which never happens in
       the normal flow). Any real partial progress (1/3 or 2/3)
       collected DURING Free Spins carries over into the Base Game
       exactly like any other Collector's progress always does,
       rather than being wiped just because the feature itself is
       ending.
    ====================================== */

    finishEndFeature(){

        this.hideCounter();

        const collector =
            collectorManager.collectors[this.collectorIndex];

        const hasPartialProgress =
            collector && collector.current>0 && !collector.completed;

        if(!hasPartialProgress){

            collectorManager.reset(this.collectorIndex);
            collectorManager.updateCollectorArt(this.collectorIndex);
            animationManager.presentCollectorResetFx(this.collectorIndex);

        }

        this.collectorIndex = null;

        // featureManager.chainTotalWin is deliberately left as-is -
        // the final total stays displayed (standard slot behavior)
        // until the player's next Base Game spin, which resets it
        // via winManager.reset() (see spinManager.js spin()) same as
        // always; the next fresh Feature trigger resets it too.

        featureManager.finishActiveFeature();

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.freeSpinsFeature = new FreeSpinsFeature();
