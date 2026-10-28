/* ==========================================
   FEATURE MANAGER
   Pearl of Fortune

   Milestone - Collector -> Bonus Feature Framework.

   Routes a completed Collector to its GDD-mapped Bonus Feature
   (CONFIG.FEATURES.MAPPING in config.js is the single source of
   truth for that mapping - never duplicated here). This milestone
   builds the FRAMEWORK only: feature identification, routing, a
   single FEATURE_TRIGGERED event, a temporary placeholder entry
   point per feature, spin-locking while a feature is active, and
   Collector reset once the placeholder completes. It does NOT
   implement any actual bonus gameplay - see launchFeaturePlaceholder().

   Never recalculates Collector progression itself - CollectorManager
   remains the only thing that decides when a Collector completes.
   This only reacts to what it already decided (via
   CollectorManager.getJustCompleted(), read from SpinManager.
   onSpinComplete() right after evaluateSpin()) and to the EXISTING
   completion FX/mermaid3 trigger already firing inside
   AnimationManager.playCollectorUpgradeFx() (see the
   featureManager.onCollectorCompletionPresented() hook there).
========================================== */

// Own state enum, separate from CONFIG.STATE (GameManager's spin
// state machine). FeatureManager tracks its own more granular
// state here, and separately drives GameManager.state between
// IDLE and FEATURE_TRANSITION/BONUS_ACTIVE so SpinManager's
// existing gameManager.isIdle() gate stays the single source of
// truth for whether a new spin is allowed to start - no second,
// parallel lock flag.
const FEATURE_STATE = {

    BASE_GAME:"BASE_GAME",

    FEATURE_TRANSITION:"FEATURE_TRANSITION",

    BONUS_ACTIVE:"BONUS_ACTIVE",

    FEATURE_COMPLETE:"FEATURE_COMPLETE"

};

// How long the temporary feature placeholder stays up before
// automatically "completing" and returning control to the Base
// Game (ms). A development placeholder duration only - has no
// relationship to any real feature's eventual length.
const FEATURE_PLACEHOLDER_DURATION_MS = 2500;

// Human-readable label per FEATURE_TYPE (config.js), used only
// for the placeholder's own log/display text below.
const FEATURE_LABEL = {

    [FEATURE_TYPE.LUCKY_WHEEL]:"Lucky Wheel",

    [FEATURE_TYPE.WILD_RESPIN]:"Wild Respin",

    [FEATURE_TYPE.FREE_SPINS]:"Free Spins",

    [FEATURE_TYPE.PICK_BONUS]:"Pick Bonus"

};

// Bug fix - if two (or more) Collectors complete in the same spin
// (or one completes while another Bonus Feature is already
// active), only ONE Feature may ever run at a time, but every
// completed Collector must still eventually get its turn instead
// of silently auto-resetting unfired. This is the fixed hierarchy
// they queue up in when more than one is waiting - see
// resolveFeatureQueue() below, the single place this order lives.
const FEATURE_TRIGGER_PRIORITY_ORDER = [

    FEATURE_TYPE.WILD_RESPIN,

    FEATURE_TYPE.LUCKY_WHEEL,

    FEATURE_TYPE.PICK_BONUS,

    FEATURE_TYPE.FREE_SPINS

];

// Brief pacing pause (ms) between one queued Feature ending and the
// next one starting - not gameplay-affecting, just keeps the
// hand-off from feeling instantaneous.
const FEATURE_QUEUE_TRANSITION_MS = 800;

class FeatureManager{

    constructor(){

        this.featureState = FEATURE_STATE.BASE_GAME;

        // 0-based collector/reel index chosen by resolveFeatureQueue()
        // to trigger as soon as ITS OWN completion FX plays, or null -
        // set by onSpinEvaluated(), consumed (and cleared) by
        // onCollectorCompletionPresented() once that reel's own
        // completion FX actually plays.
        this.pendingCollectorIndex = null;

        // Every OTHER completed Collector waiting its turn, in
        // resolveFeatureQueue() hierarchy order (Wild Respin > Lucky
        // Wheel > Pick Bonus > Free Spins) - see finishActiveFeature()
        // below, which pops the next one once the current Feature
        // ends. Each queued Collector already got its own completion
        // FX/mermaid3/glow the instant its Pearl arrived (see
        // AnimationManager.playCollectorUpgradeFx() - unconditional,
        // not gated on pendingCollectorIndex), so it sits at 3/3
        // visibly complete/glowing while it waits - its normal
        // fixed-delay auto-reset was already cancelled too (see
        // onSpinEvaluated()), so it can never reset itself out from
        // under the queue.
        this.featureQueue = [];

        // { collectorId, reel, feature, ..., collectorIndex } while
        // FEATURE_TRANSITION/BONUS_ACTIVE, else null.
        this.activeFeature = null;

        // Milestone - Wild Respin + Mermaid's Blessing. Whichever
        // feature controller (currently only wildRespinFeature) owns
        // the CURRENTLY active feature's own spin-by-spin flow, or
        // null for the generic placeholder path/no feature active.
        // onSpinResolved() below delegates to it; nothing else in
        // this class needs to know it exists.
        this.activeFeatureController = null;

        // Milestone - Free Spins pause/resume. When a HIGHER-priority
        // Collector completes while the active feature controller
        // supports being paused (currently only FreeSpinsFeature -
        // see the pause() check in onSpinEvaluated() below), that
        // controller and its activeFeature snapshot are captured
        // here before triggerFeature() overwrites activeFeature/
        // activeFeatureController with the interrupting Feature.
        // finishActiveFeature() restores and resumes it once the
        // interrupting Feature (and anything else already queued
        // ahead of it) has fully finished, instead of returning to
        // the Base Game.
        this.pausedController = null;
        this.pausedFeature = null;

        // Bug fix - ONE shared Total Win accumulator for an entire
        // trigger chain, not a separate one per feature. A fresh
        // top-level trigger (nothing paused - see the guarded resets
        // in WildRespinFeature.start()/FreeSpinsFeature.
        // beginIntroTransition()/launchFeaturePlaceholder() below)
        // resets this to 0; a feature triggering AS AN INTERRUPT
        // while another is paused does NOT reset it - it keeps
        // adding its own spin wins on top of whatever was already
        // there (WildRespinFeature.onSpinResolved()/
        // FreeSpinsFeature.onSpinResolved()/BubbleBonusFeature.
        // applyBubbleReward() all read/write this SAME field), and
        // that combined value is exactly what the interrupted
        // feature picks back up once it resumes - matches:
        // trigger=0 -> spin1=50 -> Wild Respin interrupts (still 50)
        // -> its own spin adds 40 (=90) -> ends -> Free Spins resumes
        // still at 90.
        this.chainTotalWin = 0;

        // Milestone - Feature Win Caps. Whichever FEATURE_TYPE owns
        // the min/max bounds that govern the CURRENT chainTotalWin
        // chain, or null between chains - claimed via
        // claimCapOwnership() below (called once by each feature's
        // own start(), a no-op if something else already owns the
        // chain) and consumed/cleared in finishActiveFeature() below,
        // at the one moment a chain is confirmed to have truly ended
        // (queue empty, nothing paused - about to unlockSpin()).
        // capStartTotal is chainTotalWin's own value at the exact
        // moment the current owner claimed it, so the owner's cap
        // applies only to what accumulated AFTER that point (correct
        // even when the owner itself began mid-chain, at some already-
        // nonzero chainTotalWin).
        this.capOwner = null;
        this.capStartTotal = 0;

        this.completeTimer = null;

        this.placeholderEl = null;

    }

    /* ======================================
       CLAIM CAP OWNERSHIP (Milestone - Feature Win Caps)
       Called once by each feature's own start(), AFTER its own
       existing chainTotalWin reset guard - a no-op if another
       feature already owns the current chain (e.g. Free Spins already
       owns it because this call is happening from a Feature that's
       merely interrupting a paused Free Spins session, or Lucky Wheel
       already owns it because this feature was just chained into
       directly via LuckyWheelFeature.finishEndFeatureChained()) - in
       either case the EXISTING owner's own (wider) bounds are meant
       to govern the whole combined chain, never overwritten by
       whichever feature happens to be running at any given moment
       inside it.
    ====================================== */

    claimCapOwnership(featureType){

        if(this.capOwner){

            return;

        }

        this.capOwner = featureType;
        this.capStartTotal = this.chainTotalWin;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Feature Manager Initialized");

    }

    /* ======================================
       RESOLVE FEATURE QUEUE
       The existing implementation (CollectorManager) has no
       priority rule for two Collectors completing on the SAME
       spin (or completing while another Feature is already
       active) - each is evaluated completely independently. Per
       this milestone's own instruction, that decision is isolated
       here, in exactly one place, rather than scattered across
       CollectorManager/SpinManager/AnimationManager.

       Only ONE Bonus Feature ever runs at a time, but every
       completed Collector still gets a turn - this orders ALL of
       them by FEATURE_TRIGGER_PRIORITY_ORDER (Wild Respin > Lucky
       Wheel > Pick Bonus > Free Spins), tie-breaking same-tier
       collectors by lowest collector index. The caller triggers
       index 0 of the returned array now and queues the rest (see
       onSpinEvaluated()/finishActiveFeature() below).
    ====================================== */

    resolveFeatureQueue(completedCollectorIndexes){

        if(!completedCollectorIndexes || completedCollectorIndexes.length===0){

            return [];

        }

        return [...completedCollectorIndexes].sort((a, b)=>{

            const rankA =
                FEATURE_TRIGGER_PRIORITY_ORDER.indexOf(

                    CONFIG.FEATURES.MAPPING[a].feature

                );

            const rankB =
                FEATURE_TRIGGER_PRIORITY_ORDER.indexOf(

                    CONFIG.FEATURES.MAPPING[b].feature

                );

            if(rankA!==rankB){

                return rankA - rankB;

            }

            return a - b;

        });

    }

    /* ======================================
       ON SPIN EVALUATED
       Called once per spin by SpinManager.onSpinComplete(), right
       after CollectorManager.evaluateSpin() returns - synchronously,
       before any Pearl has even started travelling. Locks spin
       immediately (via GameManager.state) if a Collector completed
       and was chosen this spin, so there is never a window where
       another spin could start before that feature's own completion
       FX/placeholder has had a chance to play.
    ====================================== */

    onSpinEvaluated(justCompletedIndexes){

        if(this.isFeatureActive()){

            // A feature (e.g. an in-progress Wild Respin) is already
            // running - never start a second one on top of it (GDD
            // rule: only one Bonus Feature active at a time). Any
            // OTHER collector that completes WHILE this is active
            // still gets a turn instead of being left to auto-reset.
            //
            // EXCEPT the active Feature's own Collector re-completing
            // itself (a Free Spins "retrigger" - Collector 3 is
            // deliberately left live/collectible during Free Spins'
            // own automatic spins, see FreeSpinsFeature) - that is
            // NOT a new Feature trigger, it's handled directly by
            // the active feature controller's own onSpinResolved()
            // (FreeSpinsFeature.awardRetrigger()), so it's excluded
            // here entirely.
            //
            // Bug fix - this must ALSO exclude the PAUSED feature's
            // own Collector (pausedFeature), not just the CURRENTLY
            // active one. While Free Spins is paused for a higher-
            // priority interrupting Feature, this.activeFeature is
            // that interrupting Feature, not Free Spins - without
            // this second check, a retrigger landing on Collector 3
            // DURING the interrupting Feature's own automatic spins
            // (still entirely possible - every reel still spins
            // normally) was wrongly treated as a brand new trigger,
            // got queued, and eventually called
            // freeSpinsFeature.start() a SECOND time on the SAME
            // already-active session once its turn came up -
            // re-showing the intro transition/popup and corrupting
            // state (the game then stopped responding).
            if(justCompletedIndexes && justCompletedIndexes.length>0){

                const interrupting =
                    justCompletedIndexes.filter(

                        (index) =>
                            !(this.activeFeature && this.activeFeature.collectorIndex===index) &&
                            !(this.pausedFeature && this.pausedFeature.collectorIndex===index)

                    );

                if(interrupting.length>0){

                    interrupting.forEach((index)=>{

                        collectorManager.cancelAutoReset(index);

                    });

                    // Bug fix - instant Wild Respin absorption. The
                    // OTHER Wild Respin reel (2/4) completing WHILE a
                    // Wild Respin is already active must NOT wait for
                    // the current session to finish - it absorbs
                    // instantly (WildRespinFeature.absorbReel(),
                    // reusing the SAME multi-reel/independent-
                    // countdown mechanism Mermaid's Blessing already
                    // uses), never queued. Anything else that also
                    // completed this same spin still goes through the
                    // normal pause/queue decision below.
                    const stillInterrupting =
                        interrupting.filter((index)=>{

                            const isWildRespinCollector =
                                CONFIG.FEATURES.MAPPING[index] &&
                                CONFIG.FEATURES.MAPPING[index].feature===FEATURE_TYPE.WILD_RESPIN;

                            const wildRespinIsActive =
                                this.activeFeature &&
                                this.activeFeature.feature===FEATURE_TYPE.WILD_RESPIN;

                            if(
                                isWildRespinCollector &&
                                wildRespinIsActive &&
                                wildRespinFeature.absorbReel(index)
                            ){

                                return false;

                            }

                            return true;

                        });

                    if(stillInterrupting.length>0){

                        const ordered =
                            this.resolveFeatureQueue(stillInterrupting);

                        // Milestone - Free Spins pause/resume. If the
                        // CURRENTLY active feature controller supports
                        // being paused (only FreeSpinsFeature does today)
                        // and isn't already paused, pause it now and let
                        // the HIGHEST-priority interrupting Collector
                        // trigger immediately - via pendingCollectorIndex,
                        // the SAME pearl-arrival gate the very first
                        // trigger of a spin already uses, not the queue
                        // (queued entries only fire once
                        // finishActiveFeature() gets around to them,
                        // which would never happen while paused).
                        // Anything else that also completed this same
                        // spin still queues normally, to run after the
                        // interrupting one, before Free Spins resumes.
                        if(

                            this.activeFeatureController &&
                            this.activeFeatureController.pause &&
                            !this.pausedController

                        ){

                            this.pausedController = this.activeFeatureController;
                            this.pausedFeature = this.activeFeature;

                            this.activeFeatureController.pause();

                            const [interruptingIndex, ...rest] = ordered;

                            this.pendingCollectorIndex = interruptingIndex;

                            this.featureQueue =
                                this.resolveFeatureQueue([

                                    ...this.featureQueue,
                                    ...rest

                                ]);

                        } else {

                            // No pausable controller active (e.g. Wild
                            // Respin/Lucky Wheel/Pick Bonus can't be
                            // paused yet) - existing behavior: queue
                            // everything, it gets its turn once the
                            // current Feature (and everything already
                            // ahead of it) ends.
                            this.featureQueue =
                                this.resolveFeatureQueue([

                                    ...this.featureQueue,
                                    ...ordered

                                ]);

                        }

                    }

                }

            }

            // SpinManager.onSpinComplete() just unconditionally set
            // GameManager back to IDLE for this spin (exactly like it
            // does for a normal spin - see spinManager.js) before
            // calling this. Immediately re-assert the feature's own
            // lock so there is never an observable window, even
            // between an active Wild Respin's own automatic spins,
            // where a new player spin could sneak in.
            gameManager.changeState(

                this.featureState===FEATURE_STATE.BONUS_ACTIVE ?
                    CONFIG.STATE.BONUS_ACTIVE :
                    CONFIG.STATE.FEATURE_TRANSITION

            );

            return;

        }

        const ordered =
            this.resolveFeatureQueue(justCompletedIndexes);

        if(ordered.length===0){

            this.pendingCollectorIndex = null;

            return;

        }

        // Bug fix - if more than one Collector completed on this
        // exact spin, only the FIRST (highest FEATURE_TRIGGER_
        // PRIORITY_ORDER) triggers now; the rest queue up instead of
        // silently auto-resetting unfired - see finishActiveFeature().
        const [chosenIndex, ...rest] = ordered;

        this.pendingCollectorIndex = chosenIndex;
        this.featureQueue = rest;

        // Every completed Collector this spin - the one triggering
        // now AND everyone queued behind it - resets only once ITS
        // OWN turn actually completes (see completeFeature()/
        // WildRespinFeature.endFeature()), never on the fixed
        // auto-reset timer CollectorManager already scheduled for it
        // in increment().
        ordered.forEach((index)=>{

            collectorManager.cancelAutoReset(index);

        });

        this.lockSpin(FEATURE_STATE.FEATURE_TRANSITION);

    }

    /* ======================================
       ON SPIN RESOLVED
       Called once from the tail of SpinManager.onSpinComplete() -
       the SAME moment ANY spin (normal or an active feature's own
       automatic spin) finishes resolving, after win evaluation/
       presentation already ran. A no-op unless a feature controller
       is currently active (see activeFeatureController above) -
       normal Base Game spins never reach this.
    ====================================== */

    onSpinResolved(result){

        if(this.activeFeatureController && this.activeFeatureController.onSpinResolved){

            this.activeFeatureController.onSpinResolved(result);

        }

    }

    /* ======================================
       ON COLLECTOR COMPLETION PRESENTED
       Called by AnimationManager.playCollectorUpgradeFx() the
       instant the EXISTING 2/3->3/3 completion FX/mermaid3 state
       actually plays for a given reel (Pearl arrival). A no-op for
       any reel that isn't this spin's chosen collector (see
       onSpinEvaluated above).
    ====================================== */

    onCollectorCompletionPresented(reelIndex){

        if(this.pendingCollectorIndex!==reelIndex){

            return;

        }

        this.pendingCollectorIndex = null;

        this.triggerFeature(reelIndex);

    }

    /* ======================================
       TRIGGER FEATURE
       Identifies the feature from CONFIG.FEATURES.MAPPING (config.js
       - the single source of truth), fires the one FEATURE_TRIGGERED
       event, plays the Bonus Trigger SFX hook, fires the feature-
       background hook, then launches the temporary placeholder.
       Does NOT touch the Collector itself - see COLLECTOR RESET
       note in completeFeature() below.
    ====================================== */

    triggerFeature(collectorIndex){

        const mapping =
            CONFIG.FEATURES.MAPPING[collectorIndex];

        if(!mapping){

            return;

        }

        this.activeFeature = { ...mapping, collectorIndex };

        const detail = {

            collectorId: mapping.collectorId,
            reelId: mapping.reel,
            featureType: mapping.feature

        };

        window.dispatchEvent(

            new CustomEvent("FEATURE_TRIGGERED", { detail })

        );

        // Audio hook - whenever ANY Bonus Feature actually triggers.
        // AudioManager already stays silent on its own when Audio is
        // OFF.
        audioManager.playFeatureTrigger();

        // Feature-background hook only, per this milestone - no
        // actual visual background swap yet (GDD backgrounds:
        // Lucky Wheel/Free Spins/Pick Bonus each have their own;
        // Wild Respin stays an extension of the Base Game).
        this.triggerFeatureBackground(mapping.feature);

        // Milestone - Wild Respin + Mermaid's Blessing. Wild Respin
        // has a real implementation (wildRespinFeature.js).
        if(mapping.feature===FEATURE_TYPE.WILD_RESPIN){

            this.activeFeatureController = wildRespinFeature;

            wildRespinFeature.start(mapping, collectorIndex);

            return;

        }

        // Milestone - Lucky Wheel. Lucky Wheel never spins a reel
        // itself (no automatic spin loop, same as Pick Bonus), so
        // activeFeatureController is set here only for consistency
        // with the existing pattern - onSpinResolved() is simply
        // never reached while it's active.
        if(mapping.feature===FEATURE_TYPE.LUCKY_WHEEL){

            this.activeFeatureController = luckyWheelFeature;

            luckyWheelFeature.start(mapping, collectorIndex);

            return;

        }

        if(mapping.feature===FEATURE_TYPE.FREE_SPINS){

            this.activeFeatureController = freeSpinsFeature;

            freeSpinsFeature.start(mapping, collectorIndex);

            return;

        }

        // Milestone - Pick Bonus. Pick Bonus never spins a reel
        // itself (no automatic spin loop, unlike Wild Respin/Free
        // Spins), so activeFeatureController is set here only for
        // consistency with the existing pattern - onSpinResolved()
        // is simply never reached while it's active.
        if(mapping.feature===FEATURE_TYPE.PICK_BONUS){

            this.activeFeatureController = pickBonusFeature;

            pickBonusFeature.start(mapping, collectorIndex);

            return;

        }

        // Every real feature now has its own implementation - this
        // generic placeholder path is unreachable in practice, kept
        // only as a defensive fallback for any future/unmapped
        // feature type.
        this.launchFeaturePlaceholder(mapping, collectorIndex);

    }

    /* ======================================
       LAUNCH FEATURE PLACEHOLDER
       Temporary development entry point (Milestone - Collector ->
       Bonus Feature Framework). NOT actual bonus gameplay - each
       real feature (LuckyWheelFeature/WildRespinFeature/
       FreeSpinsFeature/PickBonusFeature) replaces this call in a
       later milestone without CollectorManager or this routing
       needing to change.
    ====================================== */

    launchFeaturePlaceholder(mapping, collectorIndex){

        this.lockSpin(FEATURE_STATE.BONUS_ACTIVE);

        // Bug fix - only reset the SHARED chain total on a genuinely
        // fresh top-level trigger, never when this placeholder is
        // standing in for a Feature that's interrupting an already-
        // active/paused session (see WildRespinFeature.start()'s
        // own identical guard for the full explanation).
        if(!this.pausedController){

            this.chainTotalWin = 0;

            winManager.reset();

        }

        const label =
            FEATURE_LABEL[mapping.feature] || mapping.feature;

        console.log(`${label} Feature Triggered`, mapping);

        this.showPlaceholder(label);

        this.completeTimer = setTimeout(()=>{

            this.completeFeature(collectorIndex);

        }, FEATURE_PLACEHOLDER_DURATION_MS);

    }

    /* ======================================
       COMPLETE FEATURE
       Feature placeholder is done - reset ONLY the triggering
       Collector (never any other) and hand control back to the
       Base Game. Reuses CollectorManager.reset()/updateCollectorArt()
       and AnimationManager.presentCollectorResetFx() exactly as the
       existing fixed-delay auto-reset already does - no second
       reset/FX system.
    ====================================== */

    completeFeature(collectorIndex){

        this.completeTimer = null;

        this.featureState = FEATURE_STATE.FEATURE_COMPLETE;

        this.hidePlaceholder();

        collectorManager.reset(collectorIndex);
        collectorManager.updateCollectorArt(collectorIndex);
        animationManager.presentCollectorResetFx(collectorIndex);

        this.finishActiveFeature();

    }

    /* ======================================
       CLEAR ACTIVE FEATURE (Milestone - Wild Respin +
       Mermaid's Blessing)
       Just the field reset, no queue/lock decisions - used
       internally by finishActiveFeature() below.
    ====================================== */

    clearActiveFeature(){

        this.activeFeature = null;
        this.activeFeatureController = null;

    }

    /* ======================================
       FINISH ACTIVE FEATURE
       The single place every Feature completion path (the generic
       completeFeature() above, WildRespinFeature.endFeature(),
       FreeSpinsFeature.finishEndFeature(), any future
       LuckyWheelFeature/PickBonusFeature) funnels through once its
       own flow is fully done. If another Collector is waiting in
       featureQueue (see onSpinEvaluated()), its turn starts next.
       Once the queue is fully drained, a PAUSED controller (Free
       Spins interrupted by a higher-priority Feature - see
       pausedController above) resumes exactly where it left off
       instead of returning to the Base Game. Control only actually
       returns to the Base Game once both are empty.
    ====================================== */

    finishActiveFeature(){

        this.clearActiveFeature();

        if(this.featureQueue.length>0){

            const nextIndex =
                this.featureQueue.shift();

            // Spin STAYS locked through this pause - unlockSpin()
            // below is only ever reached once the queue AND any
            // paused controller are both empty, never in between.
            setTimeout(()=>{

                this.triggerFeature(nextIndex);

            }, FEATURE_QUEUE_TRANSITION_MS);

            return;

        }

        if(this.pausedController){

            const controller = this.pausedController;
            const feature = this.pausedFeature;

            this.pausedController = null;
            this.pausedFeature = null;

            setTimeout(()=>{

                this.activeFeature = feature;
                this.activeFeatureController = controller;

                controller.resume();

            }, FEATURE_QUEUE_TRANSITION_MS);

            return;

        }

        this.applyWinCap();

        this.presentWinCelebrationIfEligible(() => {

            this.unlockSpin();

        });

    }

    /* ======================================
       PRESENT WIN CELEBRATION IF ELIGIBLE (Milestone - Win
       Celebration Popups)
       Checked exactly once, right after applyWinCap() above - the
       same "chain has truly ended" moment finishActiveFeature() only
       ever reaches once (queue empty, nothing paused), i.e. right as
       control is about to hand back to the Base Game - never mid-
       chain, never for a normal Base Game spin (this is only ever
       called from finishActiveFeature(), which normal spins never
       reach). Checked against the FINAL chainTotalWin for the WHOLE
       combined chain, same value the Total Win meter is already
       showing. CONFIG.WIN_CELEBRATION.TIERS (config.js) is the single
       source of truth for the Big/Super/Mega Win bet-multiplier
       thresholds and each tier's own artwork - per explicit request
       these are cascading/inclusive ("100x or more"/"500x or
       more"/"1000x or more"), so a 1000x+ win also clears Big/Super
       Win's own bar - the HIGHEST minMultiplier tier the multiplier
       actually clears wins (Mega beats Super beats Big), never just
       the first threshold reached. Spin stays locked for the popup's
       own fixed duration (onDone only unlocks once it's done) - a
       no-op straight to onDone() if nothing qualifies.
    ====================================== */

    presentWinCelebrationIfEligible(onDone){

        const bet =
            betManager.getBet();

        if(!bet || this.chainTotalWin<=0){

            onDone();

            return;

        }

        const multiplier =
            this.chainTotalWin / bet;

        const tier =
            CONFIG.WIN_CELEBRATION.TIERS

                .filter((t) => multiplier >= t.minMultiplier)

                .sort((a, b) => b.minMultiplier - a.minMultiplier)[0];

        if(!tier){

            onDone();

            return;

        }

        animationManager.presentWinCelebrationPopup(tier, this.chainTotalWin, onDone);

    }

    /* ======================================
       APPLY WIN CAP (Milestone - Feature Win Caps)
       Called exactly once, right here - the ONE moment a chain is
       confirmed to have truly ended (queue empty, nothing paused,
       about to unlockSpin() and hand control back to the Base Game).
       this.capOwner is whichever feature ended up owning the chain -
       ALWAYS the first one to claim it (see claimCapOwnership()
       above), which is correctly either: the single feature itself
       (a standalone Wild Respin/Pick Bonus session, nothing chained),
       Free Spins (if Wild Respin/Pick Bonus/Lucky Wheel interrupted a
       paused Free Spins session at any point), or Lucky Wheel (if it
       chained directly into Free Spins/Pick Bonus via the Golden
       Wheel) - per explicit request, that owner's own MIN_WIN_
       MULTIPLIER (config.js) governs the ENTIRE combined total
       accumulated since it first claimed the chain, not just its own
       individual contribution. A no-op if nothing currently owns a
       chain (this.capOwner is null - should not normally happen once
       any feature has triggered, but harmless either way).

       Bug fix - per explicit request, the MAX_WIN_MULTIPLIER ceiling
       is no longer enforced here (it was clamping combined multi-
       feature chains - e.g. a Multiplier resolving during Pick Bonus/
       Lucky Wheel while chained into Free Spins - to far below what
       the player actually earned). Only the MIN_WIN_MULTIPLIER floor
       still applies. CONFIG's own MAX_WIN_MULTIPLIER values are left
       in place (unused here) rather than deleted, in case a correct
       max-cap implementation is wanted again later.
    ====================================== */

    applyWinCap(){

        if(!this.capOwner){

            return;

        }

        const configKey =
            this.capOwner.replace("FEATURE_", "");

        const bounds =
            CONFIG[configKey];

        if(!bounds || bounds.MIN_WIN_MULTIPLIER===undefined){

            this.capOwner = null;
            this.capStartTotal = 0;

            return;

        }

        const bet =
            betManager.getBet();

        const rawDelta =
            this.chainTotalWin - this.capStartTotal;

        const minDelta =
            bounds.MIN_WIN_MULTIPLIER * bet;

        const clampedDelta =
            Math.max(rawDelta, minDelta);

        const adjustment =
            Math.round((clampedDelta - rawDelta) * 100) / 100;

        if(adjustment!==0){

            this.chainTotalWin =
                Math.round((this.chainTotalWin + adjustment) * 100) / 100;

            winManager.updateUI(this.chainTotalWin);

            // Positive adjustment (raised up to the floor) credits
            // more; negative (trimmed down to the ceiling) credits
            // less - either way, the SAME single correction balances
            // the books against whatever was already credited
            // per-reward/per-spin throughout the chain, exactly once,
            // here.
            balanceManager.add(adjustment);

        }

        this.capOwner = null;
        this.capStartTotal = 0;

    }

    /* ======================================
       SPIN LOCK
       Drives GameManager's own state (the single gate
       SpinManager.spin() already checks via isIdle()) plus the
       Spin button's own disabled attribute, so a locked spin is
       enforced at both the logic layer and the DOM layer.
    ====================================== */

    lockSpin(featureState){

        this.featureState = featureState;

        gameManager.changeState(

            featureState===FEATURE_STATE.BONUS_ACTIVE ?
                CONFIG.STATE.BONUS_ACTIVE :
                CONFIG.STATE.FEATURE_TRANSITION

        );

        spinManager.setEnabled(false);

        // Milestone - Free Spins. Bet locks alongside Spin for
        // every Feature (not just Free Spins) - the same single
        // choke point every Feature already calls, so this never
        // needs its own per-feature lock call.
        betManager.setLocked(true);

    }

    unlockSpin(){

        this.featureState = FEATURE_STATE.BASE_GAME;

        gameManager.changeState(CONFIG.STATE.IDLE);

        spinManager.setEnabled(true);

        betManager.setLocked(false);

    }

    /* ======================================
       FEATURE BACKGROUND HOOK
       Per this milestone: hook only. The real per-feature
       background (GDD: sunken pirate ship deck / underwater
       sanctuary / coral garden - Wild Respin has none, it stays an
       extension of the Base Game) is a later milestone.
    ====================================== */

    triggerFeatureBackground(featureType){

        console.log(`Feature background hook: ${featureType} (not implemented yet)`);

    }

    /* ======================================
       PLACEHOLDER DISPLAY
       Reuses the existing, currently-empty #popup-layer - no new
       layout element added, nothing else in the layout moves.
    ====================================== */

    showPlaceholder(label){

        this.hidePlaceholder();

        const popupLayer =
            document.getElementById("popup-layer");

        if(!popupLayer){

            return;

        }

        const el =
            document.createElement("div");

        el.className = "feature-placeholder";

        const nameEl =
            document.createElement("div");

        nameEl.className = "feature-placeholder-name";
        nameEl.textContent = label;

        const statusEl =
            document.createElement("div");

        statusEl.className = "feature-placeholder-status";
        statusEl.textContent = "Triggered";

        el.appendChild(nameEl);
        el.appendChild(statusEl);

        popupLayer.appendChild(el);

        this.placeholderEl = el;

    }

    hidePlaceholder(){

        if(this.placeholderEl && this.placeholderEl.parentElement){

            this.placeholderEl.parentElement.removeChild(this.placeholderEl);

        }

        this.placeholderEl = null;

    }

    /* ======================================
       QUERY HELPERS
    ====================================== */

    isFeatureActive(){

        return this.featureState!==FEATURE_STATE.BASE_GAME;

    }

    /* ======================================
       IS COLLECTOR LOCKED
       True for a Collector that's ABOUT to trigger its Feature (the
       instant its own completion FX plays - see pendingCollectorIndex
       above) or sitting at 3/3 queued, waiting its turn (see
       featureQueue above). CollectorManager.increment() checks this
       before its own "already completed -> reset" safety fallback,
       so a Pearl landing on this reel from ANOTHER Feature's
       automatic spin can never reset or re-increment it out from
       under the Feature Queue.

       Deliberately does NOT lock the CURRENTLY ACTIVE Feature's own
       Collector - Free Spins' own Collector 3 is reset to 0/3 and
       left live/collectible again during Free Spins' own automatic
       spins (see FreeSpinsFeature), collecting Pearls exactly like
       the Base Game and awarding more Free Spins on completion
       (FreeSpinsFeature.onSpinResolved() handles that "retrigger"
       award directly) - onSpinEvaluated() below is what stops that
       re-completion from ALSO being queued as a brand new Feature
       trigger.
    ====================================== */

    isCollectorLocked(index){

        if(index===this.pendingCollectorIndex){

            return true;

        }

        if(this.featureQueue.includes(index)){

            return true;

        }

        return false;

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.featureManager = new FeatureManager();
