/* ==========================================
   COLLECTOR MANAGER
   Pearl of Fortune
========================================== */

/*
    PHASE 1 - PROGRESSION FRAMEWORK
    PHASE 2 (v4.3) - ART INTEGRATION

    This manager tracks and displays 0/3 -> 3/3 progression
    for each of the 5 collectors. Each collector is bound to
    exactly one reel (see evaluateSpin()) and progresses
    independently, driven by Pearl symbols on the FINAL
    stopped reel matrix (never reel strips, RNG, or
    intermediate animation frames).

    It intentionally does NOT trigger any bonus feature yet.
    That is a later milestone.

    As of v4.3, updateUI() swaps each collector's <img>
    (id="collector-art-N") to collector.assets[current] on
    every progression change - idle/stage1/stage2/activate,
    per CONFIG.COLLECTORS.STAGE_NAMES. The debug "0/3" text
    still updates every call too, it's just hidden via CSS
    (see ui.css). `animations` (levelUp/activate) remain
    unused null placeholders - no playback yet.
*/

class CollectorManager{

    constructor(){

        this.collectors = [];

        this.progressElements = [];

        this.artElements = [];

        // How long a completed (3/3) collector stays visible
        // before automatically resetting back to 0/3, without
        // waiting for another Pearl.
        this.autoResetDelay = 3000;

        // Collector indexes that became completed (0/3->3/3)
        // DURING THE MOST RECENT evaluateSpin() call only - reset
        // at the start of every evaluateSpin(), read by
        // FeatureManager.onSpinEvaluated() right after that call
        // returns (see spinManager.js). Purely an observation of
        // what increment() below already decided; it never affects
        // progression itself.
        this.justCompleted = [];

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.createCollectors();

        this.cacheElements();

        this.updateUI();

        console.log("Collector Manager Initialized");

    }

    /* ======================================
       CREATE COLLECTORS
    ====================================== */

    createCollectors(){

        this.collectors = [];

        for(let i=0; i<CONFIG.COLLECTORS.COUNT; i++){

            const definition =
                CONFIG.COLLECTORS.DEFINITIONS[i];

            this.collectors.push({

                name: definition.name,

                current: 0,

                max: CONFIG.COLLECTORS.MAX_LEVEL,

                completed: false,

                // Handle for the pending auto-reset timeout
                // (see scheduleAutoReset) so it can be cleared
                // if the collector is reset before it fires.
                autoResetTimer: null,

                /* ==================================
                   ASSET PATHS (v4.3)
                   idle/stage1/stage2/activate per
                   collector.current - read and rendered
                   by updateUI() as of this version.
                ================================== */

                assets: this.buildAssetPaths(definition.key),

                /* ==================================
                   ANIMATION FRAMEWORK (Objective 2)
                   Placeholders only - no animation
                   playback is implemented yet.
                ================================== */

                animations:{

                    levelUp: null,

                    activate: null

                }

            });

        }

    }

    /* ======================================
       BUILD ASSET PATHS
       assets/collectors/<key>/idle.png
       assets/collectors/<key>/stage1.png
       assets/collectors/<key>/stage2.png
       assets/collectors/<key>/activate.png
       Array index lines up with collector.current
       (0=idle, 1=stage1, 2=stage2, 3=activate/completed).
    ====================================== */

    buildAssetPaths(key){

        return CONFIG.COLLECTORS.STAGE_NAMES.map(

            (stageName) =>
                `assets/collectors/${key}/${stageName}.png`

        );

    }

    /* ======================================
       CACHE UI ELEMENTS
       progressElements = the debug "0/3" text (kept in
       the DOM but hidden via CSS - see ui.css).
       artElements = the actual collector artwork <img>,
       swapped per progression state in updateUI().
    ====================================== */

    cacheElements(){

        this.progressElements = [];

        this.artElements = [];

        for(let i=0; i<CONFIG.COLLECTORS.COUNT; i++){

            this.progressElements.push(

                document.getElementById(`collector-progress-${i+1}`)

            );

            this.artElements.push(

                document.getElementById(`collector-art-${i+1}`)

            );

        }

    }

    /* ======================================
       EVALUATE SPIN (Objective 1)

       Reads the FINAL stopped reel matrix only - never
       reel strips, RNG, or intermediate animation frames.

       Each collector is bound to exactly ONE reel:
         Reel 1 -> collectors[0] Lucky Wheel
         Reel 2 -> collectors[1] Wild Respin (Left)
         Reel 3 -> collectors[2] Free Spins
         Reel 4 -> collectors[3] Wild Respin (Right)
         Reel 5 -> collectors[4] Pick Bonus
       (this 1:1 index mapping matches CONFIG.COLLECTORS.
       DEFINITIONS, which is already ordered reel 1 -> 5.)

       If a reel has one or more Pearls, its own collector
       gets incremented ONCE - multiple Pearls on the same
       reel never award more than one step, and a reel with
       no Pearl never touches any collector.

       Because this calls increment() at most once per
       collector per spin, a collector can only ever advance
       by one step OR reset to 0/3 in a given spin - never
       both - which is also what keeps the 3/3 -> 0/3 reset
       (Issue 2) from being skipped over.

       Call once per completed spin, after reelMatrix.build().
    ====================================== */

    evaluateSpin(matrix){

        this.justCompleted = [];

        const reelsWithPearl =
            this.findReelsWithPearl(matrix);

        reelsWithPearl.forEach((reelIndex) => {

            this.increment(reelIndex);

        });

        return reelsWithPearl.length;

    }

    /* ======================================
       GET JUST COMPLETED
       Collector indexes that reached 3/3 during the spin that
       just called evaluateSpin() - see justCompleted above.
    ====================================== */

    getJustCompleted(){

        return this.justCompleted.slice();

    }

    /* ======================================
       FIND REELS WITH PEARL
       Returns the index of every reel that contains at
       least one Pearl, each index appearing at most once
       (one reel = one possible progression, regardless of
       how many Pearls land on it).
       PEARL_SYMBOL_ID (0) is defined once in
       winEvaluator.js and reused here rather than
       re-declaring the same magic number.
    ====================================== */

    findReelsWithPearl(matrix){

        const reelIndexes = [];

        matrix.forEach((reelSymbols, reelIndex) => {

            const hasPearl =
                reelSymbols.some(

                    (symbolID) => symbolID === PEARL_SYMBOL_ID

                );

            if(hasPearl){

                reelIndexes.push(reelIndex);

            }

        });

        return reelIndexes;

    }

    /* ======================================
       INCREMENT

       Note: when a collector is already completed
       (sitting at 3/3), this call resets it back to
       0/3 instead of incrementing again - a safety
       fallback in case a Pearl lands on it before the
       auto-reset timer below has fired. Normally a
       completed collector resets on its own, see
       scheduleAutoReset().

       Milestone - Free Spins bug fix: that fallback must NEVER
       apply to a Collector the Feature Queue has already claimed
       (actively running its own Feature, or queued at 3/3 waiting
       its turn - see FeatureManager.isCollectorLocked()). Without
       this guard, a Pearl landing on that reel from ANOTHER
       Feature's automatic spin (or, for a Feature whose own reel
       isn't locked/sticky - Free Spins - from its OWN automatic
       spins) would incorrectly reset or re-increment it out from
       under the Feature, exactly the "Collector resets while
       waiting/running" bug this exists to prevent.
    ====================================== */

    increment(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        if(featureManager.isCollectorLocked(index)){

            return;

        }

        if(collector.completed){

            this.reset(index);

            // Artwork/progress text is deliberately NOT updated
            // here - registerPendingCollectorChange() defers that
            // to updateCollectorArt() below, called once this
            // reel's Pearl visually arrives, so the art change and
            // the upgrade glow happen together instead of the art
            // jumping instantly while the Pearl is still travelling.
            animationManager.registerPendingCollectorChange(

                index, 0, false, true

            );

            return;

        }

        collector.current++;

        if(collector.current >= collector.max){

            collector.current = collector.max;

            collector.completed = true;

            this.justCompleted.push(index);

            this.scheduleAutoReset(index);

        }

        // Collector Upgrade FX (Milestone 12.4) - registers the
        // actual level change so AnimationManager can play the
        // visual pulse (and, via updateCollectorArt() below, swap
        // the artwork itself) once this reel's Pearl finishes
        // travelling - see playPearlTravel() in animationManager.js.
        // Purely a presentation hook - the progression decision
        // above is completely unchanged.
        animationManager.registerPendingCollectorChange(

            index, collector.current, collector.completed

        );

    }

    /* ======================================
       SCHEDULE AUTO RESET

       Once a collector hits 3/3 it resets back to 0/3
       on its own after autoResetDelay, instead of
       waiting for another Pearl. Re-checks `completed`
       when the timer fires (rather than resetting
       unconditionally) in case a Pearl already reset it
       in the meantime, so this can never clobber fresh
       progress from a later spin.
    ====================================== */

    scheduleAutoReset(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        if(collector.autoResetTimer){

            clearTimeout(collector.autoResetTimer);

        }

        collector.autoResetTimer = setTimeout(() => {

            collector.autoResetTimer = null;

            if(collector.completed){

                this.reset(index);

                // No Pearl is travelling for this reel right now -
                // this reset is purely timer-driven - so update the
                // artwork and play the reset FX immediately instead
                // of deferring either to a Pearl that isn't coming.
                this.updateCollectorArt(index);

                animationManager.presentCollectorResetFx(index);

            }

        }, this.autoResetDelay);

    }

    /* ======================================
       CANCEL AUTO RESET
       Stops the fixed-delay auto-reset timer WITHOUT touching
       current/completed - the collector stays sitting at 3/3
       (still glowing). Used by FeatureManager.onSpinEvaluated()
       for the ONE collector chosen to trigger a feature this
       spin, so it doesn't reset on the fixed timer out from under
       the feature flow - FeatureManager drives that collector's
       reset itself once its feature placeholder completes (see
       FeatureManager.completeFeature(), which calls reset()
       below directly). Every other completed collector keeps
       this timer untouched and resets exactly as before.
    ====================================== */

    cancelAutoReset(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        if(collector.autoResetTimer){

            clearTimeout(collector.autoResetTimer);

            collector.autoResetTimer = null;

        }

    }

    /* ======================================
       DECREMENT FEATURE STAGE (Milestone - Wild Respin)
       Feature-specific Collector state transition - counts a
       completed Collector back down ONE step per automatic Wild
       Respin spin (3/3 -> 2/3 -> 1/3 -> 0/3), driven by
       WildRespinFeature, NEVER by a Pearl. Deliberately separate
       from increment()/reset() so this never touches the normal
       Pearl-driven progression path and never schedules/cancels
       the fixed auto-reset timer - the feature itself owns this
       Collector's lifecycle for its duration (its normal
       auto-reset timer was already cancelled once, at feature
       start - see FeatureManager.onSpinEvaluated()).
    ====================================== */

    decrementFeatureStage(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        collector.current =
            Math.max(0, collector.current - 1);

        collector.completed = false;

        this.updateCollectorArt(index);

    }

    /* ======================================
       SET COLLECTOR FULL (Milestone - Wild Respin,
       Mermaid's Blessing)
       Sets a Collector DIRECTLY to 3/3 - never increments through
       1/3/2/3 first. Used exclusively by Mermaid's Blessing
       activating the secondary Wild Respin reel. Deliberately does
       NOT call scheduleAutoReset() - WildRespinFeature resets this
       Collector itself once the current Wild Respin ends, so it
       can never race with the feature's own reset.
    ====================================== */

    setCollectorFull(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        collector.current = collector.max;

        collector.completed = true;

    }

    /* ======================================
       RESET
       Data-only - deliberately does NOT touch the artwork/
       progress text itself (that used to happen here
       unconditionally). Callers decide when the visual update
       should happen: immediately for the timer-driven auto-reset
       (see scheduleAutoReset(), which calls updateCollectorArt()
       right after this), or deferred to sync with a Pearl's
       arrival for the Pearl-driven reset in increment() (see
       registerPendingCollectorChange() there).
    ====================================== */

    reset(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        if(collector.autoResetTimer){

            clearTimeout(collector.autoResetTimer);

            collector.autoResetTimer = null;

        }

        collector.current = 0;

        collector.completed = false;

    }

    /* ======================================
       GET PROGRESS
    ====================================== */

    getProgress(index){

        return this.collectors[index];

    }

    /* ======================================
       UPDATE COLLECTOR ART
       Debug text ("0/3") is still written every call -
       kept in the DOM, just hidden via CSS (ui.css:
       .collector-progress{ display:none; }).

       Artwork swaps to match collector.current, using the
       paths already built in collector.assets. Falls back to
       doing nothing if an element isn't found, so this never
       breaks progression if markup is missing.

       Single-collector version of the old updateUI() loop body,
       extracted so increment()/scheduleAutoReset() can update
       just the one collector that actually changed, at whatever
       moment they choose - see the callers of this method.
    ====================================== */

    updateCollectorArt(index){

        const collector =
            this.collectors[index];

        if(!collector){

            return;

        }

        const textElement =
            this.progressElements[index];

        if(textElement){

            textElement.textContent =
                `${collector.current}/${collector.max}`;

        }

        const artElement =
            this.artElements[index];

        if(artElement){

            artElement.src =
                collector.assets[collector.current];

        }

    }

    /* ======================================
       UPDATE UI
       Updates every collector at once - only actually used at
       initial boot (see initialize()) to paint all 5 collectors'
       idle state. Individual progression changes go through
       updateCollectorArt() above instead, one collector at a time.
    ====================================== */

    updateUI(){

        for(let i=0; i<this.collectors.length; i++){

            this.updateCollectorArt(i);

        }

    }

}

window.collectorManager = new CollectorManager();
