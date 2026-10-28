/* ==========================================
   BOOT
========================================== */

console.log("Boot Complete");

gameManager.initialize();
balanceManager.initialize();
betManager.initialize();
jackpotManager.initialize();
uiManager.initialize();
audioManager.initialize();
spinManager.initialize();
symbolManager.initialize();
mathModel.initialize();
reelStripManager.initialize();
paylineManager.initialize();
reelMatrix.initialize();
paylineEvaluator.initialize();
winEvaluator.initialize();
rngManager.initialize();
reelManager.initialize();
winManager.initialize();
collectorManager.initialize();
featureManager.initialize();
wildRespinFeature.initialize();
luckyWheelFeature.initialize();
freeSpinsFeature.initialize();
bubbleBonusFeature.initialize();
pickBonusFeature.initialize();
animationManager.initialize();
mermaidStateManager.initialize();
featureTestManager.initialize();

/* ==========================================
   TEMP DEBUG - MANUAL COLLECTOR 1 TEST INPUT
   Collectors now progress automatically from Pearl
   symbols on the final reel matrix every spin (see
   CollectorManager.evaluateSpin). This key is kept
   only as a manual override for quick testing without
   waiting on RNG - it stacks on top of real spins,
   it does not replace them.

   Press SPACE to increment Collector 1
   (Lucky Wheel) for progression testing:
   0/3 -> 1/3 -> 2/3 -> 3/3 -> 0/3
========================================== */

window.addEventListener("keydown", (event) => {

    if(event.code === "Space"){

        event.preventDefault();

        collectorManager.increment(0);

    }

});

/* ==========================================
   LOADING SCREEN - GAME SYSTEMS READY
   Every manager/feature above has now finished its own synchronous
   initialize() call - signals js/loadingScreen.js (if present; this
   file has no dependency on it existing) that it's safe to move past
   its own "initializing game systems" stage. Purely additive - if
   this whole script throws ABOVE this line for any reason, this line
   simply never runs and the loading screen correctly stays up rather
   than ever revealing a broken game.
========================================== */

if(window.loadingScreen && loadingScreen.markGameSystemsReady){

    loadingScreen.markGameSystemsReady();

}

/* ========================================== */