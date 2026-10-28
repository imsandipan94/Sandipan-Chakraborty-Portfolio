/* ==========================================
   MERMAID STATE MANAGER
   Pearl of Fortune

   Single #mermaid-art <img> element, swapped between the default
   idle image and one of 3 short-lived "reaction" states, driven
   entirely by EXISTING gameplay events (Pearl Collection FX,
   Symbol Win FX, Collector Upgrade FX) - this never detects a
   Pearl, evaluates a win, or decides collector progression itself,
   it only reacts to what those systems already decided.

   Static PNG swaps for now (no sprite/animation system), but every
   trigger point below calls triggerState() the same way regardless
   - swapping mermaid-collect/win/trigger.png for real animated
   assets later is a pure asset change, no gameplay-event logic to
   touch.
========================================== */

// How long each reaction state stays up before automatically
// returning to idle (ms). One place to tune - see returnToIdle().
const MERMAID_STATE_DURATION = {

    pearlCollection: 700,

    symbolWin: 1000,

    collectorComplete: 1400,

    // Milestone - Wild Respin + Mermaid's Blessing. Long enough to
    // cover the full Pearl-zap sequence (travel + impact pulse -
    // see AnimationManager.presentMermaidPearlZap()) plus a beat
    // for the player to actually register mermaid-blessing.png.
    mermaidsBlessing: 1500,

    // Milestone - Free Spins Mermaid's Blessing / Automatic Bubble
    // Bonus. Reuses the SAME mermaid-collect.png asset pearlCollection
    // already uses (see assetPaths below), just under its OWN
    // state/duration - kept in sync with BubbleBonusFeature's own
    // "Mermaid's Blessings" intro popup (BUBBLE_BONUS_INTRO_POPUP_MS,
    // bubbleBonusFeature.js) rather than pearlCollection's much
    // shorter 700ms, which would revert to idle long before that
    // popup actually closes.
    bubbleBonusIntro: 2000

    // Milestone - Pick Bonus. PickBonusFeature reuses the EXISTING
    // symbolWin/collectorComplete states above (mermaid-win.png/
    // mermaid-trigger.png) for its own selection/reward-collected
    // reactions and its own "Mermaid's Blessings" popup, rather than
    // a dedicated Pick-Bonus-only state - no entry needed here.

};

// Higher number = takes precedence over a currently-active state.
// idle has no duration/timer of its own, only used as a baseline
// so any real event can always interrupt it.
const MERMAID_STATE_PRIORITY = {

    idle: 0,

    pearlCollection: 1,

    symbolWin: 2,

    collectorComplete: 3,

    // Milestone - Wild Respin + Mermaid's Blessing. Highest
    // priority - the secondary Collector's own completion FX
    // (triggered a moment later in the same sequence) tries to
    // claim collectorComplete/mermaid3, but the priority guard in
    // triggerState() below already blocks anything lower from
    // interrupting this one, satisfying "do not let existing
    // Mermaid timers immediately overwrite it" with no new logic.
    mermaidsBlessing: 4,

    // Milestone - Free Spins Mermaid's Blessing / Automatic Bubble
    // Bonus. Same tier as mermaidsBlessing - both belong to the same
    // overall Bubble Bonus sequence (trigger popup -> bubbles), so
    // neither pre-empts the other; in practice no real gameplay
    // event competes with either while Bubble Bonus is running.
    bubbleBonusIntro: 4

};

class MermaidStateManager{

    constructor(){

        this.mermaidEl = null;

        // Captured from the existing #mermaid-art element's own
        // src attribute at initialize() - never hardcoded twice.
        this.defaultSrc = null;

        this.currentState = "idle";

        // Bumped on every applyState() call. A pending "return to
        // idle" timeout only acts if the token it captured when it
        // was scheduled still matches this - otherwise a NEWER,
        // higher-priority state has since taken over and the old
        // timer is stale, so it does nothing (see applyState()).
        // This is the "state/token/version approach" needed so an
        // old Pearl timer can never overwrite a newer Collector
        // 3/3 state.
        this.stateToken = 0;

        this.activeTimeout = null;

        this.assetPaths = {

            pearlCollection: "assets/mermaid/mermaid-collect.png",

            symbolWin: "assets/mermaid/mermaid-win.png",

            collectorComplete: "assets/mermaid/mermaid-trigger.png",

            mermaidsBlessing: "assets/mermaid/mermaid-blessing.png",

            // Reuses the SAME asset as pearlCollection - see
            // MERMAID_STATE_DURATION.bubbleBonusIntro above for why
            // this needs its own state rather than just reusing that
            // one directly.
            bubbleBonusIntro: "assets/mermaid/mermaid-collect.png"

        };

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.mermaidEl =
            document.getElementById("mermaid-art");

        if(this.mermaidEl){

            this.defaultSrc =
                this.mermaidEl.getAttribute("src");

        }

        console.log("Mermaid State Manager Initialized");

    }

    /* ======================================
       TRIGGER STATE
       Public entry point for the 3 existing-event hooks below.
       Silently ignored if a currently-active state already
       outranks it (see MERMAID_STATE_PRIORITY) - e.g. a Pearl
       Collection call while Symbol Win or Collector 3/3 is still
       showing never interrupts it. A call at the SAME or higher
       priority always applies (and, for the same state repeating -
       e.g. a second collector hitting 3/3 - simply refreshes the
       timer rather than being treated as a no-op).
    ====================================== */

    triggerState(state){

        if(!this.mermaidEl || !this.assetPaths[state]){

            return;

        }

        const incomingPriority =
            MERMAID_STATE_PRIORITY[state];

        const currentPriority =
            MERMAID_STATE_PRIORITY[this.currentState];

        if(

            this.currentState!=="idle" &&
            incomingPriority < currentPriority

        ){

            return;

        }

        this.applyState(state);

    }

    /* ======================================
       HOLD STATE / RELEASE HOLD (Milestone - Free Spins Mermaid's
       Blessing / Automatic Bubble Bonus)
       Same priority guard as triggerState() above, but with NO
       auto-revert timer at all - the image stays until releaseHold()
       is explicitly called. Bubble Bonus's own duration is variable
       (random bubble counts/pop timing), so none of the FIXED
       durations in MERMAID_STATE_DURATION could reliably cover it -
       this exists specifically for that "stay until I say so" case,
       used by BubbleBonusFeature to keep mermaid-blessing.png showing for
       its whole sequence rather than the state's own normal 1500ms
       flash. The 3 existing fixed-duration hooks (triggerState())
       are completely untouched by this.
    ====================================== */

    holdState(state){

        if(!this.mermaidEl || !this.assetPaths[state]){

            return;

        }

        const incomingPriority =
            MERMAID_STATE_PRIORITY[state];

        const currentPriority =
            MERMAID_STATE_PRIORITY[this.currentState];

        if(

            this.currentState!=="idle" &&
            incomingPriority < currentPriority

        ){

            return;

        }

        const isSameState =
            state===this.currentState;

        // Invalidate any pending auto-revert timer from an EARLIER
        // triggerState() call (e.g. the brief mermaid-blessing.png flash a
        // normal Wild Respin Blessing would have used) - this hold
        // has no timer of its own, it stays until releaseHold().
        this.stateToken++;

        if(this.activeTimeout){

            clearTimeout(this.activeTimeout);

            this.activeTimeout = null;

        }

        this.currentState = state;

        if(!isSameState){

            this.mermaidEl.onerror = () => {

                this.mermaidEl.onerror = null;

                this.mermaidEl.src = this.defaultSrc;

            };

            this.setImage(this.assetPaths[state]);

        }

    }

    releaseHold(){

        if(this.currentState!=="idle"){

            this.returnToIdle();

        }

    }

    /* ======================================
       SET IMAGE
       Plain instant src swap on the SAME single element (still
       just one #mermaid-art).
    ====================================== */

    setImage(src){

        this.mermaidEl.src = src;

    }

    /* ======================================
       APPLY STATE
    ====================================== */

    applyState(state){

        // A currently-active state re-triggering ITSELF (e.g. a
        // second collector hitting 3/3 while mermaid3 is already
        // showing, or a later winning line re-confirming Symbol
        // Win) only needs its duration timer refreshed below - the
        // image is already correct, so skip setImage() entirely
        // rather than fading out and back into the exact same
        // picture, which would just look like an unnecessary flicker.
        const isSameState =
            state===this.currentState;

        this.stateToken++;

        const myToken =
            this.stateToken;

        this.currentState = state;

        if(!isSameState){

            // Graceful fallback for now, while mermaid-collect/win/
            // trigger.png don't exist yet - a missing file quietly keeps/
            // reverts to the existing default Mermaid image instead
            // of a broken-image icon. Once real art is dropped in
            // at these exact paths, this listener simply never fires.
            this.mermaidEl.onerror = () => {

                this.mermaidEl.onerror = null;

                this.mermaidEl.src = this.defaultSrc;

            };

            this.setImage(this.assetPaths[state]);

        }

        if(this.activeTimeout){

            clearTimeout(this.activeTimeout);

        }

        this.activeTimeout = setTimeout(()=>{

            // Only this exact call's own state is still current -
            // otherwise a newer trigger already replaced it and
            // that newer state's own timeout owns returning to
            // idle, not this stale one.
            if(this.stateToken===myToken){

                this.returnToIdle();

            }

        }, MERMAID_STATE_DURATION[state]);

    }

    /* ======================================
       RETURN TO IDLE
    ====================================== */

    returnToIdle(){

        this.currentState = "idle";

        this.mermaidEl.onerror = null;

        this.setImage(this.defaultSrc);

        this.activeTimeout = null;

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.mermaidStateManager = new MermaidStateManager();
