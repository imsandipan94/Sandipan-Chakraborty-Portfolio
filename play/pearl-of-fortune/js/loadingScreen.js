/* ==========================================
   LOADING SCREEN
   Pearl of Fortune

   Milestone - Loading Screen.

   Deliberately the FIRST script in index.html - starts preloading the
   assets the initial Base Game screen actually needs the instant the
   HTML/CSS above it have parsed, without waiting on config.js or any
   manager. Owns nothing about the game itself: it only drives
   #loading-screen's own progress bar/fade-out (css/loading.css) and,
   once ready, removes the SAME "game-loading" class already present
   on <body> in the raw HTML (css/loading.css hides #viewport while
   that class is present) - GameScaler/every manager's own
   initialize() call in js/boot.js is completely untouched, this only
   ever reveals what they already built.

   "Ready" requires BOTH, whichever finishes last:
   - every essential Base Game image below has loaded (or settled via
     its own timeout/error - see PRELOAD_TIMEOUT_MS)
   - js/boot.js has called markGameSystemsReady() below, at the very
     end of its own synchronous initialize() chain (the one additive
     line in that file)
========================================== */

// Only the assets the INITIAL Base Game screen actually needs -
// reels/symbols, the mermaid's own idle art, every collector's own
// idle art, the reel background/frame, jackpot art, core button art,
// the logo (already visible on the loading screen itself, preloaded
// again here so it's warm for #logo-area too), and the background
// layer. Deliberately excludes every feature-specific folder
// (assets/luckywheel, assets/pickbonus, assets/popups,
// assets/wildrespin, the Mermaid's own reaction states beyond idle) -
// those keep using their own existing lazy-load behavior once that
// feature actually triggers, per explicit instruction not to block
// the initial loading screen on them.
const LOADING_SCREEN_ASSETS = [

    "assets/logo/logo.png",

    "assets/symbols/pearl.png",
    "assets/symbols/mermaid.png",
    "assets/symbols/seahorse.png",
    "assets/symbols/conch.png",
    "assets/symbols/A.png",
    "assets/symbols/K.png",
    "assets/symbols/Q.png",
    "assets/symbols/J.png",
    "assets/symbols/wild.png",

    "assets/mermaid/mermaid-idle.png",

    "assets/collectors/luckyWheel/idle.png",
    "assets/collectors/wildRespinLeft/idle.png",
    "assets/collectors/freeSpins/idle.png",
    "assets/collectors/wildRespinRight/idle.png",
    "assets/collectors/pickBonus/idle.png",

    "assets/reels/reel-bg.png",
    "assets/reels/reel-frame.png",

    "assets/buttons/audio-on.png",
    "assets/buttons/audio-off.png",
    "assets/buttons/spin.png",
    "assets/buttons/panel-bg.png",

    "assets/jackpots/grand.png",
    "assets/jackpots/major.png",
    "assets/jackpots/minor.png",
    "assets/jackpots/mini.png",

    "assets/background/background.png"

];

// A single slow/missing asset must never freeze the loading screen
// forever - per explicit error-handling request, it's logged and
// treated as "settled" (counted toward progress either way) once this
// much time has passed with no load/error event yet.
const LOADING_SCREEN_ASSET_TIMEOUT_MS = 8000;

// Progress budget (must sum to 100) - real asset loading drives the
// large majority of the bar (the only genuinely time-variable part);
// the remaining stages are near-instant in practice (every manager's
// own initialize() call, and GameScaler, are fully synchronous - see
// js/scaler.js/js/boot.js) but still get their own brief, visible
// step rather than an instant jump, per explicit request ("do not
// make the loading bar simply jump from 0% to 100%").
const LOADING_SCREEN_WEIGHT_ASSETS = 70;
const LOADING_SCREEN_WEIGHT_SYSTEMS = 15;
const LOADING_SCREEN_WEIGHT_SCALER = 10;
const LOADING_SCREEN_WEIGHT_FINAL = 5;

// How long the final fade-out transition takes (ms) - kept in sync
// with #loading-screen.loading-screen-hidden's own transition
// duration in css/loading.css.
const LOADING_SCREEN_FADE_MS = 400;

// Brief pause between each of the later synthetic stages
// (systems/scaler/final) so the bar visibly steps rather than
// snapping - purely presentational, no real work happens during it.
const LOADING_SCREEN_STAGE_STEP_MS = 120;

// Per explicit request - once the bar actually reaches 100%, the game
// still waits this long before it's revealed/launched, rather than
// revealing in the same instant it hits 100%.
const LOADING_SCREEN_READY_DELAY_MS = 500;

class LoadingScreen{

    constructor(){

        this.assetsTotal = LOADING_SCREEN_ASSETS.length;
        this.assetsSettled = 0;

        this.gameSystemsReady = false;

        this.assetsLoadedPromise = null;

        this.revealed = false;

    }

    /* ======================================
       INITIALIZE
       Called once, immediately (bottom of this file) - starts
       preloading every asset above right away and sets the bar's own
       initial 0% state.
    ====================================== */

    initialize(){

        this.applyProgress(0);

        this.assetsLoadedPromise =
            Promise.all(

                LOADING_SCREEN_ASSETS.map((src) => this.preloadOne(src))

            ).then(()=>{

                this.onAssetsSettled();

            });

    }

    /* ======================================
       PRELOAD ONE
       Resolves once the image has loaded, errored, OR the per-asset
       timeout elapses - NEVER rejects, so Promise.all() above can
       never hang or short-circuit on a single bad/slow asset (error
       handling requirement - log it, keep going).
    ====================================== */

    preloadOne(src){

        return new Promise((resolve)=>{

            let settled = false;

            const settle = () => {

                if(settled){

                    return;

                }

                settled = true;

                this.assetsSettled++;

                this.applyProgress(

                    (this.assetsSettled / this.assetsTotal) * LOADING_SCREEN_WEIGHT_ASSETS

                );

                resolve();

            };

            const img =
                new Image();

            img.onload = settle;

            img.onerror = () => {

                console.warn(`LoadingScreen: failed to preload "${src}" - continuing without it.`);

                settle();

            };

            img.src = src;

            setTimeout(()=>{

                if(!settled){

                    console.warn(`LoadingScreen: "${src}" timed out after ${LOADING_SCREEN_ASSET_TIMEOUT_MS}ms - continuing without it.`);

                }

                settle();

            }, LOADING_SCREEN_ASSET_TIMEOUT_MS);

        });

    }

    /* ======================================
       ON ASSETS SETTLED
       Every asset above has loaded/errored/timed out. If boot.js has
       ALREADY called markGameSystemsReady() by this point (entirely
       possible - that chain is synchronous and can finish before a
       slow network settles every image), proceed straight into the
       staged reveal; otherwise wait - markGameSystemsReady() below
       picks up from here once it does fire.
    ====================================== */

    onAssetsSettled(){

        this.assetsPhaseDone = true;

        if(this.gameSystemsReady){

            this.beginFinalStages();

        }

    }

    /* ======================================
       MARK GAME SYSTEMS READY
       Called once, from the very end of js/boot.js's own synchronous
       initialize() chain (its one additive line) - the "every manager
       has finished initializing" signal this milestone's own spec
       asks to reuse rather than inventing a second one.
    ====================================== */

    markGameSystemsReady(){

        this.gameSystemsReady = true;

        if(this.assetsPhaseDone){

            this.beginFinalStages();

        }

    }

    /* ======================================
       BEGIN FINAL STAGES
       Both required signals have arrived - step the bar through the
       remaining synthetic-but-real stages (game systems already
       initialized above this point; GameScaler already ran, as the
       2nd script tag in index.html, long before boot.js even started)
       before revealing the game. verifyGameScaler() is a genuine
       sanity check, not purely theatrical - see its own comment.
    ====================================== */

    beginFinalStages(){

        this.applyProgress(LOADING_SCREEN_WEIGHT_ASSETS + LOADING_SCREEN_WEIGHT_SYSTEMS);

        setTimeout(()=>{

            const scalerOk =
                this.verifyGameScaler();

            this.applyProgress(

                LOADING_SCREEN_WEIGHT_ASSETS +
                LOADING_SCREEN_WEIGHT_SYSTEMS +
                LOADING_SCREEN_WEIGHT_SCALER

            );

            if(!scalerOk){

                // Critical failure - per explicit error-handling
                // request, this is NOT silently swallowed: logged
                // clearly, and the loading screen deliberately stays
                // up rather than ever revealing a broken/unscaled
                // game underneath it.
                console.error("LoadingScreen: GameScaler verification failed - keeping the loading screen up.");

                return;

            }

            setTimeout(()=>{

                this.applyProgress(100);

                // Per explicit request - once loading is actually
                // complete (100%), the game still waits
                // LOADING_SCREEN_READY_DELAY_MS before it's revealed/
                // launched, rather than revealing in the same instant
                // the bar fills.
                setTimeout(()=>{

                    this.reveal();

                }, LOADING_SCREEN_READY_DELAY_MS);

            }, LOADING_SCREEN_STAGE_STEP_MS);

        }, LOADING_SCREEN_STAGE_STEP_MS);

    }

    /* ======================================
       VERIFY GAME SCALER
       A real (if quick) check, not just a delay for its own sake -
       confirms window.scaler (js/scaler.js's own global instance) and
       #game actually exist and that a transform was actually applied
       to #game, i.e. GameScaler's own resize() has genuinely run at
       least once - exactly the condition that must hold before it's
       safe to reveal #viewport.
    ====================================== */

    verifyGameScaler(){

        if(typeof scaler==="undefined" || !scaler || !scaler.game){

            return false;

        }

        return !!scaler.game.style.transform;

    }

    /* ======================================
       APPLY PROGRESS
       Clamped 0-100, updates the fill's own width, the pearl
       indicator's own position along it, and the percent readout -
       all 3 always stay in sync since they're driven from this one
       shared value.
    ====================================== */

    applyProgress(percent){

        const clamped =
            Math.max(0, Math.min(100, percent));

        const fillEl =
            document.getElementById("loading-screen-progress-fill");

        const pearlEl =
            document.getElementById("loading-screen-pearl");

        const percentEl =
            document.getElementById("loading-screen-percent");

        if(fillEl){

            fillEl.style.width = `${clamped}%`;

        }

        if(pearlEl){

            pearlEl.style.left = `${clamped}%`;

        }

        if(percentEl){

            percentEl.textContent = `${Math.round(clamped)}%`;

        }

    }

    /* ======================================
       REVEAL
       Removes "game-loading" from <body> (the SAME class css/
       loading.css keys #viewport's own visibility:hidden off of) so
       the now-fully-ready game becomes visible, fades #loading-screen
       out, then removes it from the DOM entirely once the fade
       finishes so it can never linger as an invisible click-blocker.
    ====================================== */

    reveal(){

        if(this.revealed){

            return;

        }

        this.revealed = true;

        document.body.classList.remove("game-loading");

        const loadingScreenEl =
            document.getElementById("loading-screen");

        if(!loadingScreenEl){

            return;

        }

        loadingScreenEl.classList.add("loading-screen-hidden");

        setTimeout(()=>{

            if(loadingScreenEl.parentElement){

                loadingScreenEl.parentElement.removeChild(loadingScreenEl);

            }

        }, LOADING_SCREEN_FADE_MS);

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.loadingScreen = new LoadingScreen();

loadingScreen.initialize();
