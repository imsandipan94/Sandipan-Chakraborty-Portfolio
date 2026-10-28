/* ==========================================
   WILD RESPIN FEATURE
   Pearl of Fortune

   Milestone - Wild Respin + Mermaid's Blessing.

   Owns the Wild Respin flow end-to-end once FeatureManager routes a
   completed Collector 2/4 here (see FeatureManager.triggerFeature()) -
   FeatureManager stays the single entry/exit point (lockSpin()/
   unlockSpin()/clearActiveFeature()/showPlaceholder()); this never
   touches CollectorManager's progression fields directly except
   through two small, explicitly-scoped feature-specific methods
   (CollectorManager.decrementFeatureStage()/setCollectorFull()).

   Reuses the EXISTING Base Game spin/stop/win pipeline unchanged -
   every automatic feature spin goes through ReelManager.startSpin()
   and the SAME SpinManager.onSpinComplete() every real spin already
   uses (Collector evaluation, Pearl FX, win evaluation, win
   presentation, Total Win/balance). The only Wild-Respin-specific
   work here is: locking one or two reels as sticky Wilds (see
   ReelManager.setStickyWild()), decrementing the triggering
   Collector once per feature spin instead of via a Pearl, and the
   Mermaid's Blessing side-quest below - never a duplicate
   reel-resolution or win-calculation system.
========================================== */

// Reel/Collector indexes (0-based) that can host Wild Respin, per
// the GDD - Collector 2 -> Reel 2 (index 1), Collector 4 -> Reel 4
// (index 3). The OTHER of the pair is always Mermaid's Blessing's
// possible secondary target - see getSecondaryReelIndex() below.
const WILD_RESPIN_REEL_INDEXES = [1, 3];

// How many automatic feature spins the triggering Collector's 3/3
// counts down through (3/3 -> 2/3 -> 1/3 -> 0/3 = 3 spins).
const WILD_RESPIN_SPIN_COUNT = 3;

// Mermaid's Blessing is only ever rolled once per Wild Respin,
// after this many feature spins have resolved - matches this
// milestone's own worked example (rolled right after Spin 1, never
// on the LAST spin, which would grant a second sticky Wild with no
// remaining spins left to actually benefit from it).
const MERMAIDS_BLESSING_ROLL_AFTER_SPIN = 1;

// Brief pacing pauses (ms) - none of these affect game math, they
// only keep consecutive automatic spins/the Blessing sequence from
// feeling instantaneous or overlapping each other.
const WILD_RESPIN_INTRO_MS = 1200;
const WILD_RESPIN_NO_WIN_PAUSE_MS = 300;
const WILD_RESPIN_POST_WIN_BUFFER_MS = 300;
const MERMAIDS_BLESSING_SETTLE_MS = 500;

// Mermaid's Blessing - per explicit request, upgraded to reuse the
// SAME full "Mermaid's Blessings" treatment Free Spins/Lucky Wheel/
// Pick Bonus already established (the .bubble-bonus-intro-popup
// announcement + looping audio startMermaidBlessingLoop()/
// stopMermaidBlessingLoop() + a real Pearl zap), replacing the
// lighter one-shot version (triggerState()+playMermaidsBlessing()
// alone, no popup/zap) this used before. How long that popup stays up
// before the Pearl actually zaps - same value every other feature's
// own identical popup already uses.
const WILD_RESPIN_BLESSING_POPUP_MS = 2000;

// The Pearl zap needs to start from the actual pearl the Mermaid is
// holding in assets/mermaid/mermaid-blessing.png (shown for the whole
// Blessing sequence, via holdState("mermaidsBlessing")), not
// #mermaid-art's own bounding-box CENTER - same calibration
// PickBonusFeature/LuckyWheelFeature already established against that
// exact asset (see either one's own comment for the full reasoning);
// duplicated here (not imported/shared) per this project's existing
// convention of each feature file staying fully self-contained.
const WILD_RESPIN_BLESSING_PEARL_X_FRAC = 0.785;
const WILD_RESPIN_BLESSING_PEARL_Y_FRAC = 0.13;

class WildRespinFeature{

    constructor(){

        this.active = false;

        this.primaryReelIndex = null;
        this.secondaryReelIndex = null;

        // { [reelIndex]: pearlsRemaining } - one entry per CURRENTLY
        // sticky Wild Respin reel. The primary reel starts here with
        // WILD_RESPIN_SPIN_COUNT pearls the instant the feature
        // begins; if Mermaid's Blessing triggers, the secondary reel
        // is added here with its OWN fresh WILD_RESPIN_SPIN_COUNT -
        // it does NOT share/merge with the primary's remaining count.
        // Every automatic spin decrements EVERY key in here by one,
        // right as that spin starts (see runNextSpin()) - not after
        // it resolves. A reel is removed (and un-stuck) once the
        // spin where its own count reached 0 has finished resolving
        // (see onSpinResolved()). The feature only ends
        // once this is completely empty - i.e. once every reel that
        // was ever active has had all its own accumulated pearls
        // used for a respin, exactly like a real Wild Respin/
        // Extended Wild feature (this is what makes "1 respin
        // already used on the primary + Blessing grants a fresh 3 on
        // the secondary" correctly total 4 respins, not 3).
        this.activeReels = {};

        this.spinsCompleted = 0;

        this.blessingUsed = false;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Wild Respin Feature Initialized");

    }

    /* ======================================
       START
       Called by FeatureManager.triggerFeature() the instant the
       PRIMARY Collector's own completion FX/mermaid3 has already
       played (see AnimationManager.playCollectorUpgradeFx() ->
       FeatureManager.onCollectorCompletionPresented()). Keeps the
       triggering Collector at 3/3 - its normal fixed-delay
       auto-reset was already cancelled before this ever runs (see
       FeatureManager.onSpinEvaluated()); it only steps down via
       decrementFeatureStage() once the first automatic spin
       actually starts (see runNextSpin() below).
    ====================================== */

    start(mapping, collectorIndex){

        this.active = true;

        this.primaryReelIndex = collectorIndex;
        this.secondaryReelIndex = null;

        this.activeReels = { [collectorIndex]: WILD_RESPIN_SPIN_COUNT };

        this.spinsCompleted = 0;

        this.blessingUsed = false;

        // Bug fix - Total Win only resets to blank when Wild Respin
        // triggers FRESH from the Base Game (nothing paused). When it
        // triggers as an INTERRUPT during an active Free Spins
        // session instead (featureManager.pausedController is set),
        // it must NOT reset - it keeps adding its own spin wins on
        // top of Free Spins' existing running total (featureManager.
        // chainTotalWin, shared by every feature in the chain - see
        // onSpinResolved() below), and that combined value is exactly
        // what Free Spins picks back up once it resumes. Matches:
        // trigger=0 -> spin1=50 -> Wild Respin interrupts (still 50)
        // -> its own spin adds 40 (=90) -> ends -> Free Spins resumes
        // still at 90.
        if(!featureManager.pausedController){

            featureManager.chainTotalWin = 0;

            winManager.reset();

        }

        // Milestone - Feature Win Caps. A no-op if Free Spins (or
        // Lucky Wheel) already owns the current chain - see
        // FeatureManager.claimCapOwnership()'s own comment.
        featureManager.claimCapOwnership(FEATURE_TYPE.WILD_RESPIN);

        featureManager.lockSpin(FEATURE_STATE.BONUS_ACTIVE);

        // Immediately, all 3 symbol positions of the triggering
        // reel become sticky Wilds - see ReelManager.setStickyWild().
        reelManager.setStickyWild(this.primaryReelIndex, true);

        // Milestone - simultaneous dual Wild Respin trigger. If
        // Reel 2 AND Reel 4 both completed on the SAME Base Game
        // spin, FeatureManager.onSpinEvaluated() triggers this one
        // (the lower index) and leaves the other sitting queued,
        // waiting its turn - absorb it into THIS SAME session right
        // now instead, so both trigger together rather than one
        // waiting for the other to fully finish first. blessingUsed
        // is set so Mermaid's Blessing never tries to activate a
        // reel that's already active from the start - there's
        // nothing left for it to do.
        const otherReelIndex =
            this.getSecondaryReelIndex();

        const queuedIndex =
            featureManager.featureQueue.indexOf(otherReelIndex);

        if(queuedIndex!==-1){

            featureManager.featureQueue.splice(queuedIndex, 1);

            this.secondaryReelIndex = otherReelIndex;

            this.activeReels[otherReelIndex] = WILD_RESPIN_SPIN_COUNT;

            reelManager.setStickyWild(otherReelIndex, true);

            this.blessingUsed = true;

        }

        const label =
            FEATURE_LABEL[mapping.feature] || mapping.feature;

        featureManager.showPlaceholder(label);

        setTimeout(()=>{

            featureManager.hidePlaceholder();

            this.runNextSpin();

        }, WILD_RESPIN_INTRO_MS);

    }

    /* ======================================
       GET SECONDARY REEL INDEX
       The OTHER Wild Respin reel - never the same one twice.
    ====================================== */

    getSecondaryReelIndex(){

        return WILD_RESPIN_REEL_INDEXES.find(

            (index) => index!==this.primaryReelIndex

        );

    }

    /* ======================================
       ABSORB REEL (bug fix - instant absorption)
       Called by FeatureManager.onSpinEvaluated() the instant the
       OTHER Wild Respin reel (2/4) completes WHILE this feature is
       already active - on any LATER spin during this session's own
       automatic respins, not just the same-spin case start() above
       already handles. Reuses activeReels' existing multi-reel/
       independent-countdown support (the SAME mechanism Mermaid's
       Blessing already uses to add a secondary reel mid-session) -
       no new bookkeeping, no queueing, no waiting for the current
       session to finish first. Returns false (a safe no-op) if this
       reel is somehow already active, so the caller can fall back to
       the normal queue behavior instead.
    ====================================== */

    absorbReel(reelIndex){

        if(!this.active || this.activeReels[reelIndex]!==undefined){

            return false;

        }

        this.secondaryReelIndex = reelIndex;

        this.activeReels[reelIndex] = WILD_RESPIN_SPIN_COUNT;

        reelManager.setStickyWild(reelIndex, true);

        return true;

    }

    /* ======================================
       RUN NEXT SPIN
       The player does NOT press Spin for any of these - this is
       the sole automatic driver. Reuses ReelManager.startSpin()
       directly (never SpinManager.spin(), which would deduct
       another bet - a Wild Respin spin is free, the player already
       paid for the spin that filled the Collector to 3/3).
       ReelManager.startSpin() already skips any sticky Wild reel on
       its own (see reelManager.js) - the other reels resolve
       through the UNCHANGED Base Game pipeline the instant they all
       stop (ReelManager.update() -> SpinManager.onSpinComplete()).
    ====================================== */

    runNextSpin(){

        if(!this.active || Object.keys(this.activeReels).length===0){

            this.endFeature();

            return;

        }

        // Every CURRENTLY active reel's remaining pearl count steps
        // down right now, as this spin actually begins - NOT after
        // it resolves - so the Collector visibly shows its new
        // count (e.g. 3/3 -> 2/3) the instant the respin starts,
        // matching what the player sees happen. The reel itself
        // stays sticky Wild for the ENTIRE spin regardless of
        // whether its count just reached 0 here - see
        // onSpinResolved() below, which is where a reel that hit 0
        // actually un-sticks, only once IT has finished
        // participating in this spin's own win evaluation.
        Object.keys(this.activeReels).forEach((key)=>{

            const reelIndex = Number(key);

            this.activeReels[reelIndex]--;

            collectorManager.decrementFeatureStage(reelIndex);

        });

        // Leftover WIN presentation (payline overlay/line-win label)
        // from the previous feature spin, if any - the same cleanup
        // SpinManager.spin() itself does for a normal spin, done
        // here instead since this deliberately bypasses spin()'s own
        // balance/bet gate. Deliberately clearWinPresentation() only,
        // NOT the full clearWinEffects() (which also wipes Pearl/
        // Collector FX, including any OTHER collector's sustained
        // "waiting its turn" glow via FeatureManager's queue, or this
        // very feature's own primary/secondary Collector glow) - none
        // of that should be touched by a routine spin-to-spin cleanup
        // mid-feature.
        animationManager.clearWinPresentation();

        audioManager.playReelSpin();

        reelManager.startSpin();

    }

    /* ======================================
       ON SPIN RESOLVED
       Called by FeatureManager.onSpinResolved() - itself called
       once from the tail of SpinManager.onSpinComplete(), the SAME
       moment a normal spin finishes resolving. Everything before
       this point (reel stop, Collector evaluation, Pearl FX, win
       evaluation, win presentation) already ran through the
       UNCHANGED Base Game pipeline - this only reacts to it, never
       recalculates a win itself.
    ====================================== */

    onSpinResolved(result){

        if(!this.active){

            return;

        }

        this.spinsCompleted++;

        // Running Total Win across the WHOLE trigger chain (see
        // featureManager.chainTotalWin) - balance was already
        // credited once for THIS spin's own amount inside
        // WinManager.evaluate() itself, unchanged. Adds on top of
        // whatever was already there rather than a private feature-
        // local counter, so an interrupt-triggered Wild Respin
        // correctly continues Free Spins' own total instead of
        // starting a separate one.
        if(result && result.totalWin>0){

            featureManager.chainTotalWin =
                Math.round((featureManager.chainTotalWin + result.totalWin) * 100) / 100;

            winManager.updateUI(featureManager.chainTotalWin);

        }

        // Every reel whose remaining count already reached 0 when
        // THIS spin started (see runNextSpin() above, which does the
        // actual decrementing) has now finished participating in it
        // as a sticky Wild - un-stick/reset it now, even if another
        // reel (a later Mermaid's Blessing addition, or vice versa)
        // still has pearls left and keeps the feature going.
        const finishedReels =
            Object.keys(this.activeReels)
                .map(Number)
                .filter((reelIndex) => this.activeReels[reelIndex]<=0);

        finishedReels.forEach((reelIndex)=>{

            delete this.activeReels[reelIndex];

            reelManager.setStickyWild(reelIndex, false);

            collectorManager.reset(reelIndex);
            collectorManager.updateCollectorArt(reelIndex);
            animationManager.presentCollectorResetFx(reelIndex);

        });

        const winningLines =
            (result && result.winningLines) || [];

        // Waits for the existing win presentation to actually
        // finish being visible before doing anything else - mirrors
        // AnimationManager.showLineWinAmounts()' own stagger/display
        // math (LINE_WIN_STAGGER_MS/LINE_WIN_DISPLAY_MS, defined in
        // animationManager.js) rather than a second timing system.
        const presentationMs =
            winningLines.length===0 ?
                WILD_RESPIN_NO_WIN_PAUSE_MS :
                (winningLines.length-1) * LINE_WIN_STAGGER_MS +
                    LINE_WIN_DISPLAY_MS + WILD_RESPIN_POST_WIN_BUFFER_MS;

        setTimeout(()=>{

            this.maybeTriggerMermaidsBlessing();

        }, presentationMs);

    }

    /* ======================================
       MAYBE TRIGGER MERMAID'S BLESSING
    ====================================== */

    maybeTriggerMermaidsBlessing(){

        if(

            this.blessingUsed ||
            this.spinsCompleted!==MERMAIDS_BLESSING_ROLL_AFTER_SPIN ||
            !shouldTriggerMermaidsBlessing()

        ){

            this.runNextSpin();

            return;

        }

        this.triggerMermaidsBlessing();

    }

    /* ======================================
       TRIGGER MERMAID'S BLESSING
       Per explicit request, reuses the SAME full "Mermaid's Blessings"
       treatment Free Spins/Lucky Wheel/Pick Bonus already established
       (.bubble-bonus-intro-popup announcement + looping audio + a real
       Pearl zap starting from the actual pearl in the Mermaid's own
       hand - see getBlessingPearlSourcePoint() below), not the lighter
       one-shot version this used before. Flow: announcement popup ->
       Pearl zap toward the secondary Collector -> secondary Collector
       snaps directly to 3/3 -> secondary reel becomes sticky Wild ->
       next automatic spin. "Do NOT start a second Wild Respin on top
       of the current one" is already guaranteed here without any
       extra guard: the secondary Collector's 3/3 is set via
       CollectorManager.setCollectorFull() (never increment()), and the
       completion FX call below runs through AnimationManager.
       playCollectorUpgradeFx() only for its visual glow/audio -
       FeatureManager.onCollectorCompletionPresented() (which is what
       would normally route a NEW feature trigger) is already a safe
       no-op by this point, since pendingCollectorIndex was cleared
       back when THIS feature's own primary Collector triggered.
    ====================================== */

    triggerMermaidsBlessing(){

        this.blessingUsed = true;

        const secondaryReelIndex =
            this.getSecondaryReelIndex();

        this.secondaryReelIndex = secondaryReelIndex;

        // Highest-priority Mermaid state (see MERMAID_STATE_PRIORITY
        // in mermaidStateManager.js) - held (not a fixed duration) for
        // the whole announcement+zap sequence below, released only
        // once the Pearl actually arrives.
        mermaidStateManager.holdState("mermaidsBlessing");

        audioManager.startMermaidBlessingLoop();

        const popupLayer =
            document.getElementById("popup-layer");

        let popupEl = null;

        if(popupLayer){

            popupEl =
                document.createElement("div");

            popupEl.className = "bubble-bonus-intro-popup";
            popupEl.textContent = "Mermaid's Blessings";

            popupLayer.appendChild(popupEl);

        }

        setTimeout(()=>{

            if(popupEl && popupEl.parentElement){

                popupEl.parentElement.removeChild(popupEl);

            }

            const targetEl =
                document.getElementById(`collector-art-${secondaryReelIndex + 1}`);

            animationManager.presentMermaidPearlZapToElement(

                targetEl,

                () => {

                    audioManager.stopMermaidBlessingLoop();
                    mermaidStateManager.releaseHold();

                    // Immediately 3/3 - NOT a normal Pearl increment
                    // (0/3->1/3->2/3->3/3).
                    collectorManager.setCollectorFull(secondaryReelIndex);

                    // THE FIX: setCollectorFull() only writes the data
                    // (current/completed) - without this call the
                    // Collector's own artwork never actually swaps to
                    // its "activate"/3-3 art, so it visibly never
                    // looked full even though it correctly WAS 3/3
                    // underneath.
                    collectorManager.updateCollectorArt(secondaryReelIndex);

                    const collectorArt =
                        document.getElementById(`collector-art-${secondaryReelIndex + 1}`);

                    if(collectorArt){

                        animationManager.playCollectorUpgradeFx(

                            collectorArt,

                            { level: CONFIG.COLLECTORS.MAX_LEVEL, completed:true, isReset:false },

                            secondaryReelIndex

                        );

                    }

                    reelManager.setStickyWild(secondaryReelIndex, true);

                    // Starts its OWN independent countdown at a fresh
                    // WILD_RESPIN_SPIN_COUNT, regardless of how many
                    // spins the primary reel has already used - see
                    // the activeReels comment in the constructor
                    // above.
                    this.activeReels[secondaryReelIndex] = WILD_RESPIN_SPIN_COUNT;

                    setTimeout(()=>{

                        this.runNextSpin();

                    }, MERMAIDS_BLESSING_SETTLE_MS);

                },

                this.getBlessingPearlSourcePoint()

            );

        }, WILD_RESPIN_BLESSING_POPUP_MS);

    }

    /* ======================================
       GET BLESSING PEARL SOURCE POINT
       Identical calibration to PickBonusFeature/LuckyWheelFeature's
       own getBlessingPearlSourcePoint() - see either one's own comment
       for the full reasoning (the mermaid-blessing.png asset is
       authored at exactly 2x #mermaid-panel's own box, so
       object-fit:contain renders it with zero letterboxing and this
       fraction maps directly onto the panel's own bounding rect).
    ====================================== */

    getBlessingPearlSourcePoint(){

        const mermaidEl =
            document.getElementById("mermaid-art");

        if(!mermaidEl){

            return null;

        }

        const rect =
            mermaidEl.getBoundingClientRect();

        return {

            x: rect.left + rect.width * WILD_RESPIN_BLESSING_PEARL_X_FRAC,
            y: rect.top + rect.height * WILD_RESPIN_BLESSING_PEARL_Y_FRAC

        };

    }

    /* ======================================
       END FEATURE
       Called once activeReels is completely empty - every reel that
       was ever active this feature (primary, and the secondary if
       Mermaid's Blessing triggered) has already had ALL its own
       accumulated pearls used for a respin. Each one was already
       un-stuck/reset/reverted the instant ITS OWN count hit 0 (see
       onSpinResolved()'s finishedReels handling) - the sweep below
       is only a safety net for any reel that somehow wasn't already
       cleared. Hands control back to the Base Game via
       FeatureManager.unlockSpin(), exactly like the generic
       placeholder path does - no second lock/unlock system.
    ====================================== */

    endFeature(){

        this.active = false;

        Object.keys(this.activeReels).forEach((key)=>{

            const reelIndex = Number(key);

            reelManager.setStickyWild(reelIndex, false);

            collectorManager.reset(reelIndex);
            collectorManager.updateCollectorArt(reelIndex);

        });

        this.activeReels = {};

        this.primaryReelIndex = null;
        this.secondaryReelIndex = null;

        // featureManager.chainTotalWin is deliberately left untouched
        // here - if this Wild Respin was interrupting a paused Free
        // Spins session, that combined running total is exactly what
        // Free Spins needs to pick back up once it resumes (see
        // FeatureManager.finishActiveFeature() below).

        // Milestone - Feature Queue / Trigger Hierarchy bug fix.
        // Hands off to whichever Collector (if any) is next in
        // FeatureManager's queue instead of unconditionally
        // returning to the Base Game - see FeatureManager.
        // finishActiveFeature().
        featureManager.finishActiveFeature();

    }

}

/* ======================================
   MERMAID'S BLESSING PROBABILITY
   Isolated in one place per this milestone's own instruction, so
   the math can be adjusted later without touching the flow above.
   Reads CONFIG.WILD_RESPIN.MERMAIDS_BLESSING_CHANCE_DEV - a clearly
   marked DEVELOPMENT value (see config.js), not a finalized
   production probability. The temporary QA override that forced
   this to always trigger has been removed now that Reel 2 + Reel 4
   can both trigger together on their own (see the dual-trigger
   absorb in start() above) - back to normal random behavior.
====================================== */

function shouldTriggerMermaidsBlessing(){

    return Math.random() < CONFIG.WILD_RESPIN.MERMAIDS_BLESSING_CHANCE_DEV;

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.wildRespinFeature = new WildRespinFeature();
