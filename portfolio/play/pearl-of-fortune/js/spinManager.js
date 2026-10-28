console.log("spinManager.js loaded");

/* ==========================================
   SPIN MANAGER
   Pearl of Fortune
========================================== */

/* ==========================================
   TEMPORARY QA TEST CODE - REMOVE WHEN DONE TESTING
   Forces the Pick Bonus Collector (Collector 5 / reel index 4) to
   complete on EVERY base-game spin, for rapid Pick Bonus testing.
   Works by pre-setting it to 2/3 and guaranteeing a real Pearl
   symbol on reel 5 that spin (see onSpinComplete() below) - it
   completes through the EXACT SAME real Pearl-arrival pipeline
   (FX, mermaid3, "Pick Bonus Triggered" popup, transition) as an
   organic completion; only the INPUT to that pipeline is forced,
   nothing about the pipeline itself changes.

   Only applies from the Base Game (isFeatureActive() guard below) -
   it deliberately does NOT force retriggers during an already-
   active Pick Bonus/Wild Respin/etc. session.

   Search "QA_FORCE_PICK_BONUS_EVERY_SPIN" to find every related
   line when removing this.
========================================== */
const QA_FORCE_PICK_BONUS_EVERY_SPIN = false;

class SpinManager{

    constructor(){

        this.spinButton = null;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.spinButton =
            document.getElementById("spin-button");

        this.registerEvents();

        console.log("Spin Manager Initialized");

    }

    /* ======================================
       SET ENABLED
       Milestone - Collector -> Bonus Feature Framework.
       FeatureManager calls this to visually/functionally disable
       the Spin button while a feature is active (a disabled
       button doesn't fire click events at all) - GameManager.state
       (see lockSpin()/unlockSpin() in featureManager.js) remains
       the actual logical gate spin() checks below; this is the
       DOM-level enforcement the milestone also explicitly asks for.
    ====================================== */

    setEnabled(enabled){

        if(!this.spinButton){

            return;

        }

        this.spinButton.disabled = !enabled;

    }

    /* ======================================
       EVENTS
    ====================================== */

    registerEvents(){

        if(this.spinButton){

            this.spinButton.addEventListener(

                "click",

                () => {

                    audioManager.playButtonClick();

                    this.spin();

                }

            );

        }

    }

    /* ======================================
       SPIN
    ====================================== */

    spin(){

        if(!gameManager.isIdle()){

            return;

        }

        const bet = betManager.getBet();

        const success =
            balanceManager.subtract(bet);

        if(!success){

            console.log("Not enough balance.");

            return;

        }

        gameManager.changeState(
            CONFIG.STATE.SPINNING
        );

        winManager.reset();
        animationManager.clearWinEffects();

        console.log("Spin Started");

        reelManager.startSpin();

        // Spin has now actually begun (balance/idle checks above
        // already passed) - this is deliberately NOT in the click
        // listener, which fires on every click regardless of
        // whether a spin actually starts.
        audioManager.playReelSpin();

    }

    /* ======================================
    SPIN COMPLETE
    ====================================== */

    onSpinComplete(){

        console.log("Spin Finished");

        // Reel sequence has now actually finished (all 5 reels
        // stopped - see reelManager.js update()).
        audioManager.stopReelSpin();

        reelMatrix.build();

        // TEMPORARY QA TEST CODE - see the big comment block near
        // the top of this file. REMOVE when done testing.
        if(QA_FORCE_PICK_BONUS_EVERY_SPIN && !featureManager.isFeatureActive()){

            const pickBonusCollectorIndex = 4;

            const collector =
                collectorManager.collectors[pickBonusCollectorIndex];

            if(

                collector &&
                !collector.completed &&
                !featureManager.isCollectorLocked(pickBonusCollectorIndex)

            ){

                collector.current = collector.max - 1;

                reelMatrix.getMatrix()[pickBonusCollectorIndex][0] = PEARL_SYMBOL_ID;

            }

        }
        // END TEMPORARY QA TEST CODE

        // Pearl collection reads the FINAL stopped matrix,
        // same source of truth ReelMatrix just built above -
        // never reel strips, RNG, or animation frames.
        collectorManager.evaluateSpin(

            reelMatrix.getMatrix()

        );

        animationManager.presentPearlCollectionFx(

            reelMatrix.getMatrix()

        );

        const result =
            winManager.evaluate();

        console.log(result);

        animationManager.presentWin(result);

        gameManager.changeState(

            CONFIG.STATE.IDLE

        );

        // Milestone - Collector -> Bonus Feature Framework.
        // Deliberately AFTER the IDLE transition above, not before -
        // if a Collector completed and was chosen to trigger this
        // spin, this immediately overrides gameManager's state to
        // FEATURE_TRANSITION in the same synchronous tick, so there
        // is never an observable moment where a new spin could slip
        // in before the feature flow has locked it out. A no-op
        // when no Collector completed this spin.
        featureManager.onSpinEvaluated(

            collectorManager.getJustCompleted()

        );

        // Milestone - Wild Respin + Mermaid's Blessing. Fires for
        // EVERY spin (normal or an active feature's own automatic
        // spin) - a no-op unless a feature controller is currently
        // active, see FeatureManager.onSpinResolved().
        featureManager.onSpinResolved(result);

    }

}

const spinManager = new SpinManager();