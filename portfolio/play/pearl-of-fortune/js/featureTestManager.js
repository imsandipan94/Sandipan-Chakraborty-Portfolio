/* ==========================================
   FEATURE TEST MANAGER (Developer Cheatbox)
   Pearl of Fortune

   DEVELOPMENT TOOL ONLY - lets a developer instantly launch any
   implemented Bonus Feature for testing, without waiting for its real
   Collector to fill. Deliberately does NOT duplicate feature logic or
   FeatureManager itself - simulateCollectorTrigger() below drives the
   EXACT SAME real function chain a genuine Pearl-driven completion
   already uses (CollectorManager.increment() -> FeatureManager.
   onSpinEvaluated() -> AnimationManager.playCollectorUpgradeFx() ->
   FeatureManager.onCollectorCompletionPresented() -> FeatureManager.
   triggerFeature() -> the real Feature's own .start()), just without
   an actual Pearl having travelled there first - the only thing this
   file "fakes" is the Collector's own current/completed fields.

   Whichever real feature CONFIG.FEATURES.MAPPING (config.js) routes a
   given Collector to is exactly what launches - Lucky Wheel currently
   falls through to FeatureManager's own existing generic placeholder
   (launchFeaturePlaceholder()) exactly like a real Collector 1 would
   today ("just show the feature trigger pop-up and continue", per
   explicit instruction), and will automatically launch the real Lucky
   Wheel the moment FeatureManager.triggerFeature() gets its own real
   branch for it, with ZERO changes needed in this file.

   Gated entirely behind CONFIG.DEBUG.CHEATBOX (config.js) - see
   initialize() below. When that flag is false, this file still loads
   and initialize() still runs (boot.js calls it unconditionally like
   every other manager), but wires up nothing at all; the panel stays
   hidden via its own CSS default (.feature-test-panel, ui.css) either
   way, so a missing/absent panel element is also handled gracefully.
========================================== */

// One real Collector index per dropdown option (0-based, matching
// CollectorManager.collectors/CONFIG.FEATURES.MAPPING) - the FIRST
// Collector CONFIG.FEATURES.MAPPING routes to a given feature type.
function findCollectorIndexForFeature(featureType){

    return CONFIG.FEATURES.MAPPING.findIndex(

        (mapping) => mapping.feature===featureType

    );

}

// Wild Respin has two real Collectors (Reel 2/"L" and Reel 4/"R") -
// per explicit request the dropdown now offers both separately
// (WILD_RESPIN_L/WILD_RESPIN_R, index.html) rather than always
// launching the first one. Returns every mapping index for a given
// feature type, in CONFIG.FEATURES.MAPPING's own order - launchFeature()
// below picks [0] for "L" and [1] for "R", rather than hardcoding the
// literal indexes (1/3) here.
function findAllCollectorIndexesForFeature(featureType){

    const indexes = [];

    CONFIG.FEATURES.MAPPING.forEach((mapping, index)=>{

        if(mapping.feature===featureType){

            indexes.push(index);

        }

    });

    return indexes;

}

// How often (ms) the PLAY button's own enabled state is resynced to
// the game's actual idle/feature-active state. There is no existing
// "feature ended" event to hook into instead (FeatureManager only
// ever dispatches FEATURE_TRIGGERED, never a matching "ended" event) -
// polling two plain booleans this rarely is negligible overhead for a
// developer-only tool, and keeps this file from needing to reach into
// FeatureManager's own internals to add one.
const FEATURE_TEST_SYNC_INTERVAL_MS = 300;

// Defensive-only upper bound (ms) on the "launching" spam guard below -
// every real feature's own start() already re-locks the spin
// synchronously (gameManager.isIdle() false / featureManager.
// isFeatureActive() true) well before this fires, so this only
// matters if triggerFeature() somehow silently no-op'd.
const FEATURE_TEST_LAUNCH_GUARD_MS = 500;

class FeatureTestManager{

    constructor(){

        this.panel = null;
        this.select = null;
        this.playButton = null;
        this.statusEl = null;

        this.enabled = false;

        // True for the brief window between a PLAY click and the
        // game actually becoming busy - see launchFeature()/
        // syncPlayButtonState().
        this.launching = false;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.panel =
            document.getElementById("feature-test-panel");

        this.select =
            document.getElementById("feature-test-select");

        this.playButton =
            document.getElementById("feature-test-play");

        this.statusEl =
            document.getElementById("feature-test-status");

        this.enabled =
            !!(CONFIG.DEBUG && CONFIG.DEBUG.CHEATBOX);

        if(!this.panel || !this.enabled){

            // Completely inert - no listeners wired, panel stays
            // hidden via its own CSS default either way.
            return;

        }

        this.panel.classList.add("visible");

        if(this.playButton){

            this.playButton.addEventListener("click", () => {

                this.onPlayClicked();

            });

        }

        setInterval(() => {

            this.syncPlayButtonState();

        }, FEATURE_TEST_SYNC_INTERVAL_MS);

        this.syncPlayButtonState();

        console.log("Feature Test Manager Initialized");

    }

    /* ======================================
       SYNC PLAY BUTTON STATE
       Disabled whenever the game isn't safely idle (a normal spin in
       progress) or a Bonus Feature (cheatbox-launched or organic) is
       already active - prevents starting a second feature on top of
       one already running/mid-transition, matching the existing Spin
       button's own disabled-while-busy convention (SpinManager.
       setEnabled()) rather than a second parallel lock.
    ====================================== */

    syncPlayButtonState(){

        if(!this.playButton){

            return;

        }

        const busy =
            this.launching ||
            !gameManager.isIdle() ||
            featureManager.isFeatureActive();

        this.playButton.disabled = busy;

        if(this.select){

            this.select.disabled = busy;

        }

        if(this.panel){

            this.panel.classList.toggle("busy", busy);

        }

    }

    /* ======================================
       ON PLAY CLICKED
    ====================================== */

    onPlayClicked(){

        if(!this.playButton || this.playButton.disabled){

            return;

        }

        // Same click SFX the real Spin button already uses - no new
        // asset, and never a second/feature-specific sound here (the
        // real feature's own trigger SFX still plays normally further
        // downstream, inside FeatureManager.triggerFeature()).
        audioManager.playButtonClick();

        const featureKey =
            this.select ? this.select.value : "BASE_GAME";

        if(featureKey==="BASE_GAME"){

            // "Exit test feature / return to normal gameplay" - PLAY
            // only ever reaches here while the game is ALREADY idle
            // with no Feature active (see syncPlayButtonState()), so
            // there is nothing to actually force - normal gameplay
            // (Collector-driven triggers) is already fully live.
            this.showStatus("Already in Base Game.");

            return;

        }

        this.launchFeature(featureKey);

    }

    /* ======================================
       LAUNCH FEATURE
       Resolves the dropdown's chosen feature to its own real
       Collector index (see findCollectorIndexForFeature()/
       findAllCollectorIndexesForFeature() above) and drives it
       through simulateCollectorTrigger() below - the exact same
       function chain a genuine Pearl completion already uses.
       WILD_RESPIN_L/WILD_RESPIN_R are special-cased here (not real
       FEATURE_TYPE values) to pick a SPECIFIC one of Wild Respin's
       two real Collectors instead of always the first match.
    ====================================== */

    launchFeature(featureKey){

        let featureType;
        let collectorIndex;

        if(featureKey==="WILD_RESPIN_L" || featureKey==="WILD_RESPIN_R"){

            featureType = FEATURE_TYPE.WILD_RESPIN;

            const wildRespinIndexes =
                findAllCollectorIndexesForFeature(featureType);

            collectorIndex = featureKey==="WILD_RESPIN_L" ?
                wildRespinIndexes[0] :
                wildRespinIndexes[1];

            if(collectorIndex===undefined){

                collectorIndex = -1;

            }

        } else {

            featureType = FEATURE_TYPE[featureKey];

            if(!featureType){

                this.showStatus(`Unknown feature "${featureKey}".`);

                return;

            }

            collectorIndex =
                findCollectorIndexForFeature(featureType);

        }

        if(collectorIndex===-1){

            this.showStatus(`${featureKey} has no Collector mapping.`);

            return;

        }

        if(!gameManager.isIdle() || featureManager.isFeatureActive()){

            this.showStatus("Game is busy - try again shortly.");

            return;

        }

        this.launching = true;

        this.syncPlayButtonState();

        try{

            this.simulateCollectorTrigger(collectorIndex);

            this.showStatus(`${CONFIG.COLLECTORS.DEFINITIONS[collectorIndex].name} launching...`);

        } catch(error){

            // Developer tool only - never let a bad test trigger take
            // the whole game down; report it and stay in a safe state.
            console.warn("FeatureTestManager: launch failed", error);

            this.showStatus("Launch failed - see console.");

        }

        setTimeout(() => {

            this.launching = false;

            this.syncPlayButtonState();

        }, FEATURE_TEST_LAUNCH_GUARD_MS);

    }

    /* ======================================
       SIMULATE COLLECTOR TRIGGER
       Drives the SAME real chain SpinManager.onSpinComplete() already
       uses once a genuine Pearl completes a Collector - never a
       parallel/fake trigger path. Only the INPUT is synthetic (no
       actual Pearl travelled here, so its own FX/audio are skipped);
       everything downstream of that - CollectorManager.increment()'s
       own progression rules, AnimationManager.playCollectorUpgradeFx()
       (the same glow/SFX/Mermaid-reaction a real arrival gets),
       FeatureManager's routing/queue, and the real Feature's own
       .start() - is completely unchanged, real, production code.
    ====================================== */

    simulateCollectorTrigger(collectorIndex){

        audioManager.stopReelSpin();

        const collector =
            collectorManager.collectors[collectorIndex];

        if(!collector){

            return;

        }

        if(collector.completed){

            collectorManager.reset(collectorIndex);
            collectorManager.updateCollectorArt(collectorIndex);

        }

        // Mirrors CollectorManager.evaluateSpin()'s own reset of this
        // array at the start of a real spin - increment() below pushes
        // to it directly, so it must start clean here too.
        collectorManager.justCompleted = [];

        collector.current = collector.max - 1;

        collectorManager.increment(collectorIndex);

        featureManager.onSpinEvaluated(collectorManager.getJustCompleted());

        const collectorArt =
            document.getElementById(`collector-art-${collectorIndex + 1}`);

        if(collectorArt){

            collectorManager.updateCollectorArt(collectorIndex);

            // The REAL Collector Upgrade FX - its own internal call to
            // FeatureManager.onCollectorCompletionPresented() is what
            // actually launches the feature, so that method is never
            // called a second time directly here.
            animationManager.playCollectorUpgradeFx(

                collectorArt,
                { level: collector.max, completed:true, isReset:false },
                collectorIndex

            );

        } else {

            // Defensive fallback only - the collector-art element is
            // always present in the real DOM, this just guarantees the
            // trigger still fires even if it somehow isn't.
            featureManager.onCollectorCompletionPresented(collectorIndex);

        }

    }

    /* ======================================
       SHOW STATUS
    ====================================== */

    showStatus(text){

        if(!this.statusEl){

            return;

        }

        this.statusEl.textContent = text;

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.featureTestManager = new FeatureTestManager();
