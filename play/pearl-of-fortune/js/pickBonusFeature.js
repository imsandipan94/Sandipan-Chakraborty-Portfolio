/* ==========================================
   PICK BONUS FEATURE
   Pearl of Fortune

   Milestone - Pick Bonus.

   Owns the Pick Bonus flow end-to-end once FeatureManager routes a
   completed Collector 5 (Reel 5) here (see FeatureManager.
   triggerFeature()) - FeatureManager stays the single entry/exit
   point (lockSpin()/finishActiveFeature()), this never touches
   CollectorManager's progression fields directly except through its
   own existing reset()/updateCollectorArt() (the same pair every
   other feature's own completion already uses).

   Unlike Wild Respin/Free Spins, this feature never spins a reel
   itself - there is no automatic spin loop and no onSpinResolved()
   work to do. The whole feature is a single self-contained pick
   session: intro transition -> 3x3 grid reveal -> reward resolution
   (zapped to Total Win) -> outro transition -> back to the Base Game.
   Reuses the SAME AnimationManager.presentFeatureTransition()/
   presentFeatureCompletionPopup() intro/outro architecture Free
   Spins already established, and the SAME .bubble-zap-trail travel
   technique BubbleBonusFeature already established for sending a
   revealed value to its meter - neither is duplicated here.
========================================== */

// The 4 creature types (v1 = unrevealed, v2 = revealed) - exact
// asset filenames per this milestone's own spec, placeholders
// acceptable, final art drops in at these same paths with no code
// change needed.
const PICK_BONUS_CREATURE_TYPES = ["starfish", "jellyfish", "squid", "blobfish"];
const PICK_BONUS_ASSET_PATH = (type, version) => `assets/pickbonus/${type}${version}.png`;

const PICK_BONUS_GRID_SIZE = 9;

// Fallback only - CONFIG.FEATURES.MAPPING[4].picks (config.js) is the
// actual authoritative initial pick count.
const PICK_BONUS_DEFAULT_PICKS = 3;

// Prize ranges/values - per this milestone's own explicit lists.
const PICK_BONUS_CASH_MIN = 2;
const PICK_BONUS_CASH_MAX = 25;
const PICK_BONUS_MULTIPLIER_VALUES = [2, 3, 4, 5, 8, 10];
const PICK_BONUS_JACKPOT_TIERS = ["MINI", "MINOR", "MAJOR", "GRAND"];

// A revealed Cash prize reads as credits everywhere ($2 -> "200"),
// never with a "$" prefix, per explicit request. Bug fix - prize.value
// itself must be THIS SAME credits figure, not the underlying raw
// dollar roll - applyResolutionReward() adds prize.value directly to
// Total Win, so a mismatch there (value staying in dollars while the
// label/display showed credits) meant a revealed "1600" only ever
// added 16 to Total Win. rollCashPrize() below multiplies by this
// constant ONCE, immediately, so value and label always agree.
const PICK_BONUS_CASH_CREDITS_PER_DOLLAR = 100;

// Per explicit design requirement - across the 9-cell pool, Multiplier
// and Jackpot prizes are each capped at 1-2 cells (never 0, never more
// than 2); every other cell (always >=5 of the 9) is Cash - see
// buildPrizeSet() below, which rolls exactly this many of each
// category rather than a per-cell weighted roll.
const PICK_BONUS_PRIZE_MULTIPLIER_COUNT_MIN = 1;
const PICK_BONUS_PRIZE_MULTIPLIER_COUNT_MAX = 2;
const PICK_BONUS_PRIZE_JACKPOT_COUNT_MIN = 1;
const PICK_BONUS_PRIZE_JACKPOT_COUNT_MAX = 2;

// Mermaid's Blessing - checked once ALL 3 initial picks have been
// used (see checkForResolution()/maybeTriggerBlessing() below), never
// mid-picking. Reuses the SAME "Mermaid's Blessings" popup + looping
// audio BubbleBonusFeature's own showBlessingPopup() already
// established (bubbleBonusFeature.js) - not that class itself (a
// Free-Spins-only sub-feature, deliberately never reused directly),
// just the same building blocks (the .bubble-bonus-intro-popup CSS
// class, audioManager.startMermaidBlessingLoop()/
// stopMermaidBlessingLoop()). Once the popup disappears, 1-3 Pearls
// zap from the Mermaid to 1-3 random UNREVEALED creatures (capped at
// however many are actually still unrevealed), each one instantly
// revealing that cell exactly like a normal pick (same revealCell()
// call) - these extra reveals never consume a pick from
// picksRemaining, they're purely additive.
const PICK_BONUS_BLESSING_POPUP_MS = 2000;
const PICK_BONUS_BLESSING_MIN_ZAPS = 1;
const PICK_BONUS_BLESSING_MAX_ZAPS = 3;
const PICK_BONUS_BLESSING_ZAP_GAP_MS = 400;

// Idle/reveal pulse - every still-unrevealed cell's own V1 creature
// pulses/glows softly (.pick-cell-idle-pulse, ui.css) from the moment
// the grid becomes pickable until it's revealed or picking ends
// entirely (see buildGrid()/checkForResolution() below). The instant
// ANY cell reveals - a normal pick OR a Mermaid's Blessing zap, both
// funnel through revealCell() below - it gets one brief STRONGER
// pulse/glow (.reveal-pulse, matches this constant's own duration),
// then settles back to the original static look (no glow/pulse),
// exactly like the reveal always looked before this.
const PICK_BONUS_REVEAL_PULSE_MS = 650;

// Bug fix - the Pearl zap used to start from #mermaid-art's own
// bounding-box CENTER (AnimationManager.launchMermaidPearlZap()'s
// default) - since that box is the WHOLE 750x1260 Mermaid panel (see
// css/ui.css), its center sits roughly mid-screen, nowhere near the
// actual pearl she's holding in assets/mermaid/mermaid-blessing.png
// (the asset shown for the whole zap sequence - see runBlessingZaps()
// below). These are that pearl's own position as a FRACTION of the
// rendered image (0-1, left/top-based) - calibrated against that
// exact asset, which happens to be authored at exactly 2x the
// #mermaid-panel box (1500x2520 vs 750x1260), so object-fit:contain
// renders it with zero letterboxing and this fraction maps directly
// onto the panel's own bounding rect (see
// getBlessingPearlSourcePoint() below). Re-calibrate these two values
// if the art is ever replaced with something differently framed.
const PICK_BONUS_BLESSING_PEARL_X_FRAC = 0.785;
const PICK_BONUS_BLESSING_PEARL_Y_FRAC = 0.13;

/* ==========================================
   QA TEMPORARY OVERRIDE
   ****************************************************************
   * TEMPORARY - QA TESTING ONLY.                                 *
   * Forces Mermaid's Blessing to trigger EVERY time Pick Bonus     *
   * triggers, per explicit user instruction, so the whole sequence *
   * can be verified repeatedly without waiting on the real          *
   * CONFIG.PICK_BONUS.MERMAIDS_BLESSING_CHANCE_DEV probability.     *
   * Search "QA_FORCE_MERMAIDS_BLESSING" to find every related line  *
   * when removing this. REMOVE ONLY WHEN THE USER EXPLICITLY ASKS - *
   * do not remove on your own judgement.                            *
   ****************************************************************
========================================== */
const QA_FORCE_MERMAIDS_BLESSING = true;

// Intro popup shown AFTER the shared feature-transition glow fades
// (same "transition -> full-screen artwork" structure Free Spins
// already established - see FreeSpinsFeature.beginIntroTransition()).
// Picking stays locked (see buildGrid()/beginIntroTransition() below)
// until this popup itself disappears, exactly like Free Spins holds
// off its first automatic spin until its own intro popup completes.
const PICK_BONUS_INTRO_POPUP_SRC = "assets/popups/pb-intro.png";
const PICK_BONUS_INTRO_POPUP_MS = 3000;

// Brief pacing pauses/timings (ms) - none of these affect game math.
const PICK_BONUS_TRIGGER_POPUP_MS = 1200;
const PICK_BONUS_REVEAL_SETTLE_MS = 900;
const PICK_BONUS_ZAP_MS = 480;
const PICK_BONUS_RESOLUTION_GAP_MS = 250;
const PICK_BONUS_METER_IMPACT_MS = 300;

class PickBonusFeature{

    constructor(){

        this.active = false;

        // True once every pick has been used (or every cell
        // revealed) - blocks further cell clicks while the final
        // reveal's own swim-away animation/reward resolution plays.
        this.locked = false;

        this.collectorIndex = null;

        // { type, prize:{category,value,label}, revealed } per cell,
        // 0-8, index-aligned with cellEls below. Rebuilt fresh every
        // start() (see buildGrid()).
        this.cells = [];

        // { root, v1, prize, v2 } per cell - built ONCE in
        // initialize(), reused/reset across every session rather
        // than rebuilding the DOM each time.
        this.cellEls = [];

        this.picksRemaining = 0;
        this.totalPicksAwarded = 0;
        this.revealsCount = 0;

        // Reward storage (per this milestone's own explicit
        // requirement) - only revealed/selected cells ever push an
        // entry here; unselected cells never contribute. Consumed by
        // buildResolutionQueue() once every pick is exhausted.
        this.revealedCashValues = [];
        this.revealedMultipliers = [];
        this.revealedJackpots = [];

        // Same armed/used pattern as WildRespinFeature's own
        // Mermaid's Blessing (see maybeTriggerBlessing() below) -
        // rolled once per session, fires at most once.
        this.blessingArmed = false;
        this.blessingUsed = false;

        // Milestone - Pick Bonus/Lucky Wheel resolution rework.
        // featureManager.chainTotalWin's own value the instant THIS
        // resolution phase began (see beginResolution() below) - the
        // #you-won-box (index.html/ui.css) only ever displays the
        // DIFFERENCE between that snapshot and the current running
        // total, i.e. just what this feature itself has revealed so
        // far, never whatever a previous chained feature already
        // contributed.
        this.youWonStartTotal = 0;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.buildGridDom();

        this.preloadAssets();

        console.log("Pick Bonus Feature Initialized");

    }

    /* ======================================
       PRELOAD ASSETS
       Warms the browser's image cache for the intro popup at boot,
       off the critical path of any real trigger - matches
       FreeSpinsFeature.preloadAssets()' own established pattern.
    ====================================== */

    preloadAssets(){

        const introPopup =
            new Image();

        introPopup.src = PICK_BONUS_INTRO_POPUP_SRC;

    }

    /* ======================================
       BUILD GRID DOM
       Builds the 9 .pick-cell elements ONCE, into the existing
       static #pick-bonus-grid container (index.html) - not a
       conventional HTML table, no cell borders/boxes (see ui.css) -
       and wires each cell's click handler here. buildGrid() below
       only ever resets/repopulates these same elements per session,
       it never rebuilds the DOM.
    ====================================== */

    buildGridDom(){

        const gridEl =
            document.getElementById("pick-bonus-grid");

        if(!gridEl){

            return;

        }

        this.cellEls = [];

        for(let i=0; i<PICK_BONUS_GRID_SIZE; i++){

            const root =
                document.createElement("div");

            root.className = "pick-cell";

            const v2 =
                document.createElement("img");

            v2.className = "pick-cell-v2";
            v2.alt = "";

            const prize =
                document.createElement("div");

            prize.className = "pick-cell-prize";

            const v1 =
                document.createElement("img");

            v1.className = "pick-cell-v1";
            v1.alt = "";

            // Missing placeholder art (per this milestone's own
            // explicit instruction, not yet delivered) quietly
            // disappears instead of showing a broken-image icon -
            // the same graceful-fallback pattern used throughout
            // this project (mermaidStateManager.js/audioManager.js).
            v1.addEventListener("error", () => {

                v1.style.visibility = "hidden";

            });

            v2.addEventListener("error", () => {

                v2.style.visibility = "hidden";

            });

            root.appendChild(v2);
            root.appendChild(prize);
            root.appendChild(v1);

            const cellIndex = i;

            root.addEventListener("click", () => {

                this.onCellClick(cellIndex);

            });

            gridEl.appendChild(root);

            this.cellEls.push({ root, v1, prize, v2 });

        }

    }

    /* ======================================
       START
       Called by FeatureManager.triggerFeature() the instant Reel 5's
       Collector completion FX has already played. mapping.picks
       (CONFIG.FEATURES.MAPPING - config.js) is the single source of
       truth for the initial pick count.
    ====================================== */

    start(mapping, collectorIndex){

        this.active = true;
        this.locked = false;

        this.collectorIndex = collectorIndex;

        this.picksRemaining =
            mapping.picks || PICK_BONUS_DEFAULT_PICKS;

        this.totalPicksAwarded = this.picksRemaining;
        this.revealsCount = 0;

        this.revealedCashValues = [];
        this.revealedMultipliers = [];
        this.revealedJackpots = [];

        this.blessingArmed = shouldTriggerPickBonusBlessing();
        this.blessingUsed = false;

        featureManager.lockSpin(FEATURE_STATE.BONUS_ACTIVE);

        // "Pick Bonus / Triggered" popup - matches WildRespinFeature/
        // FreeSpinsFeature's own identical pattern.
        const label =
            FEATURE_LABEL[mapping.feature] || mapping.feature;

        featureManager.showPlaceholder(label);

        setTimeout(()=>{

            featureManager.hidePlaceholder();

            this.beginIntroTransition();

        }, PICK_BONUS_TRIGGER_POPUP_MS);

    }

    /* ======================================
       BEGIN INTRO TRANSITION
       Reuses the existing shared feature-transition glow - the Reel
       Panel/Collector Panel hide and the Mermaid area extends/the
       grid builds at the glow's own midpoint (masked by its peak
       coverage), exactly like Free Spins' own background swap. Once
       the glow fully fades, the SAME full-screen intro popup
       architecture Free Spins already established (AnimationManager.
       presentFeatureIntroPopup() - including its own feature-intro-
       loop/end audio sequence) shows pb-intro.png before picking is
       actually allowed - buildGrid() below leaves the grid locked
       until this popup itself disappears.
    ====================================== */

    beginIntroTransition(){

        animationManager.presentFeatureTransition(

            () => {

                this.setSceneActive(true);
                this.buildGrid();

                // Bug fix - Free Spins "Spins Left" counter. Pick
                // Bonus takes over the whole scene (Reel/Collector
                // Panels hidden, Mermaid extended) while interrupting
                // a paused Free Spins session - the counter has
                // nowhere sensible to show during that takeover, so
                // it hides at this SAME masked transition midpoint
                // (screen fully covered by the glow), exactly when
                // the Reel/Collector Panels themselves hide above -
                // never at trigger time, while the "Pick Bonus /
                // Triggered" popup is still showing over the
                // still-visible Free Spins layout. Wild Respin never
                // does this (no scene takeover, same Free Spins
                // layout throughout) - the counter always stays
                // visible/greyed for that one, per its own existing
                // pause() treatment.
                if(featureManager.pausedController===freeSpinsFeature){

                    freeSpinsFeature.setCounterTakeoverHidden(true);

                }

                // Bug fix - Total Win only resets to blank on a fresh
                // top-level trigger, never when Pick Bonus is
                // interrupting an already-active/paused session (same
                // guard WildRespinFeature.start()/FreeSpinsFeature.
                // beginIntroTransition() already use). Milestone -
                // Feature Win Caps - ALSO never reset when Lucky Wheel
                // just chained directly into this session (Lucky
                // Wheel's own cap needs the combined total preserved -
                // see FeatureManager.claimCapOwnership()) - that case
                // is already distinguishable here since capOwner would
                // already be set to LUCKY_WHEEL by this point.
                if(!featureManager.pausedController && !featureManager.capOwner){

                    featureManager.chainTotalWin = 0;

                    winManager.reset();

                }

                // A no-op if Free Spins/Lucky Wheel already owns the
                // current chain - see FeatureManager.
                // claimCapOwnership()'s own comment.
                featureManager.claimCapOwnership(FEATURE_TYPE.PICK_BONUS);

            },

            () => {

                animationManager.presentFeatureIntroPopup(

                    PICK_BONUS_INTRO_POPUP_SRC,
                    PICK_BONUS_INTRO_POPUP_MS,

                    () => {

                        this.locked = false;

                        // Bug fix - per explicit request: the instant
                        // the intro popup ends, the Mermaid shows the
                        // SAME "pearlCollection" state (mermaid-collect.png)
                        // an actual Pearl landing already uses, HELD
                        // (not a fixed duration - this waits on the
                        // player, not a timer) alongside an invitation
                        // speech bubble, both released together on the
                        // player's first selection (see onCellClick()).
                        mermaidStateManager.holdState("pearlCollection");

                        this.showSpeechBubble("Pick any 3");

                    }

                );

            }

        );

    }

    /* ======================================
       SET SCENE ACTIVE
       Hides (never destroys) the Reel Panel/Collector Panel, extends
       the Mermaid area down to the Button Panel's own top edge, and
       shows/hides the Pick Bonus panel itself - all via CSS classes
       only (see ui.css), never inline layout values, so
       #collector-panel's own top:800px is never touched.
    ====================================== */

    setSceneActive(active){

        const mermaidPanel =
            document.getElementById("mermaid-panel");

        const reelPanel =
            document.getElementById("reel-panel");

        const collectorPanel =
            document.getElementById("collector-panel");

        const pickBonusPanel =
            document.getElementById("pick-bonus-panel");

        if(mermaidPanel){

            mermaidPanel.classList.toggle("pick-bonus-active", active);

        }

        if(reelPanel){

            reelPanel.classList.toggle("pick-bonus-hidden", active);

        }

        if(collectorPanel){

            collectorPanel.classList.toggle("pick-bonus-hidden", active);

        }

        if(pickBonusPanel){

            pickBonusPanel.classList.toggle("active", active);

        }

    }

    /* ======================================
       BUILD GRID
       Resets every cell element back to its base "unrevealed" look
       and assigns a fresh random creature/prize distribution - see
       buildCreatureDistribution()/buildPrizeSet() below.
    ====================================== */

    buildGrid(){

        const types =
            this.buildCreatureDistribution();

        const prizes =
            this.buildPrizeSet(types.length);

        this.cells = types.map((type, i) => ({

            type,
            prize: prizes[i],
            revealed: false

        }));

        this.cellEls.forEach((refs, i)=>{

            refs.root.classList.remove("revealed");
            refs.root.classList.remove("reveal-pulse");
            refs.root.style.pointerEvents = "auto";

            refs.v1.style.visibility = "";
            refs.v1.src = PICK_BONUS_ASSET_PATH(this.cells[i].type, 1);
            refs.v1.classList.add("pick-cell-idle-pulse");

            refs.v2.style.visibility = "";
            refs.v2.removeAttribute("src");

            refs.prize.textContent = "";
            refs.prize.className = "pick-cell-prize";

        });

        // Stays locked (onCellClick() checks this) until the intro
        // popup that follows this same transition actually
        // disappears - see beginIntroTransition() above.
        this.locked = true;

        this.updateCounter();

        // Defensive reset only - normal play always hides this itself
        // on the first selection (see onCellClick()); this just
        // guarantees a fresh session never starts with a leftover
        // bubble showing from some earlier session ending abnormally.
        this.hideSpeechBubble();

    }

    /* ======================================
       SHOW SPEECH BUBBLE / HIDE SPEECH BUBBLE
       "Pick any 3" invitation shown alongside the held pearlCollection
       Mermaid state from the moment the intro popup ends until the
       player's first selection - see beginIntroTransition()/
       onCellClick() above.
    ====================================== */

    showSpeechBubble(text){

        const bubble =
            document.getElementById("pick-bonus-speech-bubble");

        const textEl =
            document.getElementById("pick-bonus-speech-bubble-text");

        if(!bubble || !textEl){

            return;

        }

        textEl.textContent = text;

        bubble.classList.add("active");

    }

    hideSpeechBubble(){

        const bubble =
            document.getElementById("pick-bonus-speech-bubble");

        if(bubble){

            bubble.classList.remove("active");

        }

    }

    /* ======================================
       BUILD CREATURE DISTRIBUTION
       9 cells, 4 types - every type appears at least twice (8 cells),
       the 9th is a random extra of one of the 4 - per this
       milestone's own explicit requirement. Shuffled afterward so
       identical types aren't grouped together.
    ====================================== */

    buildCreatureDistribution(){

        const assignment = [];

        PICK_BONUS_CREATURE_TYPES.forEach((type)=>{

            assignment.push(type, type);

        });

        const extraType =
            PICK_BONUS_CREATURE_TYPES[
                Math.floor(Math.random() * PICK_BONUS_CREATURE_TYPES.length)
            ];

        assignment.push(extraType);

        for(let i=assignment.length-1; i>0; i--){

            const j =
                Math.floor(Math.random() * (i+1));

            const temp = assignment[i];
            assignment[i] = assignment[j];
            assignment[j] = temp;

        }

        return assignment;

    }

    /* ======================================
       BUILD PRIZE SET
       Each cell's own prize is assigned BEFORE selection (hidden
       from the player until revealed). Per explicit design
       requirement, the category MIX across the whole pool is picked
       first (exactly 1-2 Multiplier, exactly 1-2 Jackpot, every
       remaining cell Cash - always leaving at least 1 Cash since
       Multiplier+Jackpot can never exceed 4 of the 9), THEN each
       cell's own individual value is rolled - never a per-cell
       weighted category roll.
    ====================================== */

    buildPrizeSet(count){

        const multiplierCount =
            PICK_BONUS_PRIZE_MULTIPLIER_COUNT_MIN + Math.floor(
                Math.random() * (PICK_BONUS_PRIZE_MULTIPLIER_COUNT_MAX - PICK_BONUS_PRIZE_MULTIPLIER_COUNT_MIN + 1)
            );

        const jackpotCount =
            PICK_BONUS_PRIZE_JACKPOT_COUNT_MIN + Math.floor(
                Math.random() * (PICK_BONUS_PRIZE_JACKPOT_COUNT_MAX - PICK_BONUS_PRIZE_JACKPOT_COUNT_MIN + 1)
            );

        const cashCount =
            count - multiplierCount - jackpotCount;

        const prizes = [];

        for(let i=0; i<cashCount; i++){

            prizes.push(this.rollCashPrize());

        }

        for(let i=0; i<multiplierCount; i++){

            prizes.push(this.rollMultiplierPrize());

        }

        for(let i=0; i<jackpotCount; i++){

            prizes.push(this.rollJackpotPrize());

        }

        for(let i=prizes.length-1; i>0; i--){

            const j =
                Math.floor(Math.random() * (i+1));

            const temp = prizes[i];
            prizes[i] = prizes[j];
            prizes[j] = temp;

        }

        return prizes;

    }

    rollCashPrize(){

        const dollarRoll =
            PICK_BONUS_CASH_MIN + Math.floor(
                Math.random() * (PICK_BONUS_CASH_MAX - PICK_BONUS_CASH_MIN + 1)
            );

        // Bug fix - value is the credits figure (the SAME number the
        // label displays), not the raw dollar roll - see
        // PICK_BONUS_CASH_CREDITS_PER_DOLLAR's own comment above for
        // why. applyResolutionReward() adds this value directly to
        // Total Win, so whatever the player sees revealed is exactly
        // what gets awarded.
        const value =
            dollarRoll * PICK_BONUS_CASH_CREDITS_PER_DOLLAR;

        return { category:"CASH", value, label:`${value}` };

    }

    rollMultiplierPrize(){

        const value =
            PICK_BONUS_MULTIPLIER_VALUES[
                Math.floor(Math.random() * PICK_BONUS_MULTIPLIER_VALUES.length)
            ];

        return { category:"MULTIPLIER", value, label:`${value}x` };

    }

    rollJackpotPrize(){

        const tier =
            PICK_BONUS_JACKPOT_TIERS[
                Math.floor(Math.random() * PICK_BONUS_JACKPOT_TIERS.length)
            ];

        return { category:"JACKPOT", value:tier, label:tier };

    }

    /* ======================================
       ON CELL CLICK
       Every unrevealed creature is clickable while picks remain and
       the session isn't already locked/resolving. Consumes exactly
       one pick, at the MOMENT of selection - never deferred to the
       V1 creature's own swim-away animation finishing.
    ====================================== */

    onCellClick(index){

        if(!this.active || this.locked){

            return;

        }

        const cell =
            this.cells[index];

        if(!cell || cell.revealed || this.picksRemaining<=0){

            return;

        }

        // Captured BEFORE incrementing below - true only for the
        // player's very first selection this session.
        const isFirstSelection =
            this.revealsCount===0;

        cell.revealed = true;

        this.picksRemaining--;
        this.revealsCount++;

        this.updateCounter();

        this.revealCell(index);

        // Reuses the existing Collector Upgrade SFX as a "something
        // just revealed" cue - no new asset needed.
        audioManager.playCollectorUpgrade();

        // Bug fix - per explicit request: the "Pick any 3" invitation
        // (speech bubble + held pearlCollection state, both started in
        // beginIntroTransition() above) disappears the instant the
        // player makes their FIRST selection, never again after that.
        if(isFirstSelection){

            this.hideSpeechBubble();

            mermaidStateManager.releaseHold();

        }

        // Bug fix - per explicit request, the Mermaid reacts to every
        // manual player selection with the SAME "symbolWin" state
        // (mermaid-win.png) a normal winning line already uses -
        // reused here rather than a new state/asset. Deliberately only
        // for the player's OWN picks (this method) - the Mermaid's own
        // auto-revealed blessing zaps (runNextBlessingZap() below)
        // never call this, they're not a player "selection".
        mermaidStateManager.triggerState("symbolWin");

        this.checkForResolution();

    }

    /* ======================================
       REVEAL CELL
       Instant reveal (per this milestone's own explicit requirement -
       no noticeable click->reveal delay): the prize value and V2
       creature are placed immediately (both start at opacity:0 in
       CSS, .revealed flips them to opacity:1 with no transition -
       see ui.css), while the V1 creature - still on top - plays its
       own swim-away animation, visually uncovering them. Exact
       layering per this milestone's spec: TOP V1 (z-index 3), MIDDLE
       prize (z-index 2), BOTTOM V2 (z-index 1).
    ====================================== */

    revealCell(index){

        const cell =
            this.cells[index];

        const refs =
            this.cellEls[index];

        if(!cell || !refs){

            return;

        }

        const prize =
            cell.prize;

        if(prize.category==="CASH"){

            this.revealedCashValues.push({ index, value:prize.value, label:prize.label });

        } else if(prize.category==="MULTIPLIER"){

            this.revealedMultipliers.push({ index, value:prize.value, label:prize.label });

        } else if(prize.category==="JACKPOT"){

            this.revealedJackpots.push({ index, value:prize.value, label:prize.label });

        }

        refs.v2.style.visibility = "";
        refs.v2.src = PICK_BONUS_ASSET_PATH(cell.type, 2);

        refs.prize.textContent = prize.label;
        refs.prize.classList.add(prize.category.toLowerCase());

        refs.root.classList.add("revealed");
        refs.root.style.pointerEvents = "none";

        // This cell is no longer "unselected" - stop its own idle
        // pulse right away, then flash the brief, stronger reveal
        // pulse (.reveal-pulse, ui.css) before settling back to the
        // static look, same for a normal pick or a Blessing zap.
        refs.v1.classList.remove("pick-cell-idle-pulse");

        refs.root.classList.add("reveal-pulse");

        setTimeout(()=>{

            refs.root.classList.remove("reveal-pulse");

        }, PICK_BONUS_REVEAL_PULSE_MS);

    }

    /* ======================================
       UPDATE COUNTER
       Single "PICKS LEFT" box, pearl icons below it (one per
       remaining pick) - reuses the existing Pearl symbol artwork
       rather than a new asset.
    ====================================== */

    updateCounter(){

        const pearlsEl =
            document.getElementById("pick-bonus-pearls");

        if(!pearlsEl){

            return;

        }

        pearlsEl.innerHTML = "";

        const pearlSrc =
            symbolManager.getSymbol(PEARL_SYMBOL_ID).image;

        for(let i=0; i<this.picksRemaining; i++){

            const img =
                document.createElement("img");

            img.className = "pick-bonus-pearl-icon";
            img.src = pearlSrc;
            img.alt = "";

            pearlsEl.appendChild(img);

        }

    }

    /* ======================================
       CHECK FOR RESOLUTION
       Picking stops once picksRemaining reaches 0 OR no unrevealed
       cell remains, whichever comes first - locks the grid, then
       gives the last V1 creature's own swim-away animation time to
       finish before checking Mermaid's Blessing/starting reward
       resolution.
    ====================================== */

    checkForResolution(){

        const anyUnrevealed =
            this.cells.some((cell)=>!cell.revealed);

        if(this.picksRemaining>0 && anyUnrevealed){

            return;

        }

        this.locked = true;

        this.cellEls.forEach((refs)=>{

            refs.root.style.pointerEvents = "none";

        });

        // Per explicit request - once all 3 picks are used (or the
        // grid is already full), every still-unrevealed cell stops
        // pulsing/glowing, whether or not a Blessing zap goes on to
        // reveal it afterward.
        this.stopIdlePulse();

        setTimeout(()=>{

            this.maybeTriggerBlessing();

        }, PICK_BONUS_REVEAL_SETTLE_MS);

    }

    /* ======================================
       STOP IDLE PULSE
       Removes .pick-cell-idle-pulse (ui.css) from every cell's own V1
       creature - safe to call unconditionally, revealCell() already
       removes it per-cell as each one is revealed, so only genuinely
       still-unrevealed cells are ever affected here.
    ====================================== */

    stopIdlePulse(){

        this.cellEls.forEach((refs)=>{

            refs.v1.classList.remove("pick-cell-idle-pulse");

        });

    }

    /* ======================================
       MAYBE TRIGGER BLESSING
       Checked exactly once, right as normal picking ends (all 3
       initial picks used, or every cell already revealed) - never
       mid-picking. blessingArmed was rolled once in start() via
       shouldTriggerPickBonusBlessing() (reads the SAME isolated
       CONFIG.PICK_BONUS.MERMAIDS_BLESSING_CHANCE_DEV pattern every
       other feature's own Blessing chance already uses). Falls
       straight through to reward resolution if not armed, already
       used, or nothing is left to bless (every cell already
       revealed - can happen if the player's own 3 picks happened to
       reveal all 9 cells, though normally 6 stay unrevealed).
    ====================================== */

    maybeTriggerBlessing(){

        const unrevealedIndexes =
            this.cells
                .map((cell, index) => cell.revealed ? -1 : index)
                .filter((index) => index!==-1);

        if(!this.blessingArmed || this.blessingUsed || unrevealedIndexes.length===0){

            this.beginResolution();

            return;

        }

        this.blessingUsed = true;

        this.showBlessingPopup(() => {

            this.runBlessingZaps(unrevealedIndexes);

        });

    }

    /* ======================================
       SHOW BLESSING POPUP
       The SAME "Mermaid's Blessings" announcement + looping audio
       BubbleBonusFeature.showBlessingPopup() already established
       (bubbleBonusFeature.js) - reusing its exact CSS class
       (.bubble-bonus-intro-popup, ui.css) and AudioManager loop
       (startMermaidBlessingLoop()/stopMermaidBlessingLoop()) rather
       than duplicating a second visual/audio pair, per this
       milestone's own explicit instruction. Not a call INTO
       BubbleBonusFeature itself - that class is a Free-Spins-only
       sub-feature, deliberately never reused directly by anything
       else (see its own header comment).

       Bug fix - per explicit request, shows the SAME "symbolWin"
       state (mermaid-win.png) a winning selection already uses (see
       onCellClick() above) the instant this popup appears, reused
       here rather than a dedicated state/asset.
    ====================================== */

    showBlessingPopup(onComplete){

        // holdState() (not triggerState()) - symbolWin's own normal
        // fixed duration (1000ms, MERMAID_STATE_DURATION) is shorter
        // than this popup's own PICK_BONUS_BLESSING_POPUP_MS (2000ms),
        // so a plain triggerState() call would have her revert to idle
        // while the popup is still visible. Held for the popup's whole
        // lifetime instead - runBlessingZaps() below always follows
        // this with its own holdState("mermaidsBlessing") (same-or-
        // higher priority), which naturally takes over without needing
        // an explicit releaseHold() in between.
        mermaidStateManager.holdState("symbolWin");

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

            onComplete();

        }, PICK_BONUS_BLESSING_POPUP_MS);

    }

    /* ======================================
       RUN BLESSING ZAPS
       1-3 Pearls (capped at however many cells are actually still
       unrevealed) zap from the Mermaid to that many random unrevealed
       creatures, ONE AT A TIME - each arrival instantly reveals that
       cell via the SAME revealCell() every normal pick already uses
       (identical layering/reward-storage), but WITHOUT touching
       picksRemaining/revealsCount - these are extra, additive reveals,
       never drawn from the player's own pick budget. Holds
       mermaidsBlessing (mermaid-blessing.png) for the whole sequence (same
       indefinite-hold pattern BubbleBonusFeature uses for its own
       bubble sequence), released once every zap has landed, right
       before reward resolution begins.
    ====================================== */

    runBlessingZaps(unrevealedIndexes){

        const zapCount =
            Math.min(

                unrevealedIndexes.length,

                PICK_BONUS_BLESSING_MIN_ZAPS + Math.floor(
                    Math.random() * (PICK_BONUS_BLESSING_MAX_ZAPS - PICK_BONUS_BLESSING_MIN_ZAPS + 1)
                )

            );

        const shuffled =
            [...unrevealedIndexes];

        for(let i=shuffled.length-1; i>0; i--){

            const j =
                Math.floor(Math.random() * (i+1));

            const temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;

        }

        const targetIndexes =
            shuffled.slice(0, zapCount);

        mermaidStateManager.holdState("mermaidsBlessing");

        this.runNextBlessingZap(targetIndexes, 0);

    }

    runNextBlessingZap(targetIndexes, i){

        if(i>=targetIndexes.length){

            mermaidStateManager.releaseHold();
            audioManager.stopMermaidBlessingLoop();

            this.beginResolution();

            return;

        }

        const index =
            targetIndexes[i];

        const refs =
            this.cellEls[index];

        if(!refs){

            this.runNextBlessingZap(targetIndexes, i+1);

            return;

        }

        animationManager.presentMermaidPearlZapToElement(refs.v1, () => {

            const cell =
                this.cells[index];

            if(cell){

                cell.revealed = true;

                this.revealCell(index);

            }

            setTimeout(()=>{

                this.runNextBlessingZap(targetIndexes, i+1);

            }, PICK_BONUS_BLESSING_ZAP_GAP_MS);

        }, this.getBlessingPearlSourcePoint());

    }

    /* ======================================
       GET BLESSING PEARL SOURCE POINT
       Real viewport coordinates of the pearl held in the Mermaid's
       own hand in assets/mermaid/mermaid-blessing.png (the asset
       shown for the whole blessing zap sequence), computed from
       #mermaid-art's own live bounding rect - so it's already correct
       under GameScaler's current CSS scale, exactly like every other
       real getBoundingClientRect()-based travel effect in this
       project (Pearl Collection FX, Bubble Bonus's own zap trail).
       Falls back to null (AnimationManager's own default - the
       element's center) if the Mermaid element isn't in the DOM.
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

            x: rect.left + rect.width * PICK_BONUS_BLESSING_PEARL_X_FRAC,
            y: rect.top + rect.height * PICK_BONUS_BLESSING_PEARL_Y_FRAC

        };

    }

    /* ======================================
       BUILD RESOLUTION QUEUE
       Reads directly from revealedCashValues/revealedMultipliers/
       revealedJackpots (never re-scans this.cells) - Cash first,
       then Multipliers, then Jackpots, each group in the order those
       cells were actually revealed - the exact resolution order this
       milestone requires.
    ====================================== */

    buildResolutionQueue(){

        const queue = [];

        this.revealedCashValues.forEach((entry)=>{

            queue.push({ ...entry, category:"CASH" });

        });

        this.revealedMultipliers.forEach((entry)=>{

            queue.push({ ...entry, category:"MULTIPLIER" });

        });

        this.revealedJackpots.forEach((entry)=>{

            queue.push({ ...entry, category:"JACKPOT" });

        });

        return queue;

    }

    /* ======================================
       BEGIN RESOLUTION / RUN RESOLUTION QUEUE
       Every revealed reward is applied ONE AT A TIME, in order, each
       visually zapped from its own cell to the #you-won-box overlay
       (NOT Total Win directly - see launchResolutionZap()/
       applyResolutionReward() below) before the NEXT one starts - "do
       not show rewards being awarded before Pick Bonus ends" is
       satisfied simply by this only ever running once picking has
       already stopped (see checkForResolution()). Once every reward
       has landed, the box's own accumulated total makes ONE final zap
       onward to the real Total Win meter - see
       bangUpYouWonToTotalWin() below.
    ====================================== */

    beginResolution(){

        this.youWonStartTotal =
            featureManager.chainTotalWin;

        this.showYouWonBox();

        const queue =
            this.buildResolutionQueue();

        this.runResolutionQueue(queue, 0);

    }

    runResolutionQueue(queue, i){

        if(i>=queue.length){

            this.bangUpYouWonToTotalWin(() => {

                this.finishResolution();

            });

            return;

        }

        this.launchResolutionZap(queue[i], () => {

            setTimeout(()=>{

                this.runResolutionQueue(queue, i+1);

            }, PICK_BONUS_RESOLUTION_GAP_MS);

        });

    }

    /* ======================================
       YOU WON BOX (Milestone - Pick Bonus/Lucky Wheel resolution
       rework)
       Shared element (index.html/ui.css) - showYouWonBox() resets its
       own displayed amount to 0 and reveals it; updateYouWonBoxAmount()
       keeps it in sync with THIS feature's own running contribution
       (featureManager.chainTotalWin - youWonStartTotal) as each
       reward lands; hideYouWonBox() removes it once the final bang-up
       zap (bangUpYouWonToTotalWin() below) has carried its own total
       onward to Total Win.
    ====================================== */

    showYouWonBox(){

        const amountEl =
            document.getElementById("you-won-box-amount");

        if(amountEl){

            amountEl.textContent = "0";

        }

        const boxEl =
            document.getElementById("you-won-box");

        if(boxEl){

            boxEl.classList.add("active");

        }

    }

    hideYouWonBox(){

        const boxEl =
            document.getElementById("you-won-box");

        if(boxEl){

            boxEl.classList.remove("active");

        }

    }

    updateYouWonBoxAmount(){

        const amountEl =
            document.getElementById("you-won-box-amount");

        if(!amountEl){

            return;

        }

        const amount =
            featureManager.chainTotalWin - this.youWonStartTotal;

        amountEl.textContent = amount.toLocaleString();

    }

    /* ======================================
       LAUNCH RESOLUTION ZAP
       Reuses the EXISTING .bubble-zap-trail/#pearl-fx-layer travel
       technique BubbleBonusFeature.launchZapTrail() already
       established (real getBoundingClientRect() deltas, so it's
       correct regardless of GameScaler's current CSS scale) -
       travelling from the revealed cell's own prize label to the
       #you-won-box overlay (NOT Total Win directly - per explicit
       request, see bangUpYouWonToTotalWin() below for the one final
       zap that actually reaches Total Win), reusing the same
       .bubble-zap-cash/-multiplier/-jackpot color classes so the same
       reward category reads as the same color the whole way, matching
       the existing Bubble Bonus visual language rather than inventing
       a new one.
    ====================================== */

    launchResolutionZap(entry, onLanded){

        const refs =
            this.cellEls[entry.index];

        const targetEl =
            document.getElementById("you-won-box-amount");

        const pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        if(!refs || !targetEl || !pearlFxLayer){

            this.applyResolutionReward(entry);

            onLanded();

            return;

        }

        const sourceRect =
            refs.prize.getBoundingClientRect();

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

        zap.className = `bubble-zap-trail bubble-zap-${entry.category.toLowerCase()}`;
        zap.textContent = entry.label;

        zap.style.left = sourceCenterX + "px";
        zap.style.top = sourceCenterY + "px";
        zap.style.setProperty("--dx", dx + "px");
        zap.style.setProperty("--dy", dy + "px");
        zap.style.setProperty("--zap-duration", PICK_BONUS_ZAP_MS + "ms");

        pearlFxLayer.appendChild(zap);

        // Reuses the EXISTING normal gameplay Pearl Collection SFX -
        // same "collecting" moment BubbleBonusFeature's own zap
        // already uses.
        audioManager.playPearlCollect();

        setTimeout(()=>{

            if(zap.parentElement){

                zap.parentElement.removeChild(zap);

            }

            this.applyResolutionReward(entry);

            targetEl.classList.add("bubble-meter-impact");

            setTimeout(()=>{

                targetEl.classList.remove("bubble-meter-impact");

            }, PICK_BONUS_METER_IMPACT_MS);

            onLanded();

        }, PICK_BONUS_ZAP_MS);

    }

    /* ======================================
       APPLY RESOLUTION REWARD
       Called the instant one reward's own zap lands. Cash sums onto
       Total Win, Multiplier multiplies the running Total Win
       (applied sequentially, never summed - matches this milestone's
       own worked example), Jackpot adds via the EXISTING jackpot
       value system (jackpotManager.getValue() - never a second
       jackpot-value source). Reads/writes the SAME shared running
       total every feature in the current trigger chain uses
       (featureManager.chainTotalWin) - never a second, parallel
       total; only its OWN DISPLAY is redirected to #you-won-box
       instead of Total Win (per explicit request - see
       bangUpYouWonToTotalWin() below for the one moment Total Win
       itself actually updates). Only the genuine NET INCREASE this
       reward just caused is credited to the balance, same pattern
       BubbleBonusFeature's own applyBubbleReward() already uses.
    ====================================== */

    applyResolutionReward(entry){

        const beforeTotal =
            featureManager.chainTotalWin;

        if(entry.category==="CASH"){

            featureManager.chainTotalWin += entry.value;

        } else if(entry.category==="MULTIPLIER"){

            // Bug fix - per explicit request, a revealed Multiplier
            // must only ever multiply THIS feature's own "you won box"
            // contribution (chainTotalWin - youWonStartTotal), never
            // the full chainTotalWin - which, the instant Pick Bonus
            // triggers as an INTERRUPT during an already-active Free
            // Spins/Lucky Wheel session, already carries that prior
            // feature's own accumulated total. Multiplying the full
            // value there blew up the combined chain total far past
            // this feature's own win cap. Scoping the multiply to only
            // the own-contribution delta, then re-adding it onto
            // youWonStartTotal, leaves whatever came in from before
            // this session started untouched while still compounding
            // correctly across multiple Multiplier reveals within THIS
            // SAME session (ownContribution already reflects any
            // earlier multiplier applied this session).
            const ownContribution =
                featureManager.chainTotalWin - this.youWonStartTotal;

            const multiplied =
                Math.round(ownContribution * entry.value * 100) / 100;

            featureManager.chainTotalWin =
                Math.round((this.youWonStartTotal + multiplied) * 100) / 100;

        } else if(entry.category==="JACKPOT"){

            featureManager.chainTotalWin += jackpotManager.getValue(entry.value);

        }

        this.updateYouWonBoxAmount();

        // Bug fix - per explicit request, the Mermaid reacts to every
        // revealed value actually landing on the you-won-box with the
        // SAME "collectorComplete" state (mermaid-trigger.png) a
        // Collector reaching 3/3 already uses - reused here rather
        // than a new state/asset. Called once per queued reward (see
        // runResolutionQueue()), so it re-fires (refreshing its own
        // timer, never restacking) for every Cash/Multiplier/Jackpot
        // value as it's collected, in order.
        mermaidStateManager.triggerState("collectorComplete");

        const delta =
            featureManager.chainTotalWin - beforeTotal;

        if(delta > 0){

            balanceManager.add(delta);

        }

    }

    /* ======================================
       BANG UP YOU WON TO TOTAL WIN
       Every reward has already landed in #you-won-box - one final zap
       carries its OWN accumulated total (featureManager.chainTotalWin
       - youWonStartTotal, i.e. just what THIS feature revealed, never
       whatever a previous chained feature already contributed) onward
       to the real Total Win meter, which only updates its own display
       right as that zap actually lands - never before, per explicit
       request. The box itself hides the instant the zap departs.
    ====================================== */

    bangUpYouWonToTotalWin(onComplete){

        const sourceEl =
            document.getElementById("you-won-box-amount");

        const targetEl =
            document.getElementById("total-win-value");

        const pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        if(!sourceEl || !targetEl || !pearlFxLayer){

            this.hideYouWonBox();

            winManager.updateUI(featureManager.chainTotalWin);

            onComplete();

            return;

        }

        // Bug fix - the box's own bounding rect MUST be measured
        // while it's still visible - hideYouWonBox() (below) sets
        // display:none, which collapses #you-won-box-amount's own
        // rect to nothing, so measuring AFTER hiding it sent every
        // zap flying from (0,0) instead of the box's own real on-
        // screen position.
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

        const wonAmount =
            featureManager.chainTotalWin - this.youWonStartTotal;

        const zap =
            document.createElement("div");

        zap.className = "bubble-zap-trail bubble-zap-cash";
        zap.textContent = wonAmount.toLocaleString();

        zap.style.left = sourceCenterX + "px";
        zap.style.top = sourceCenterY + "px";
        zap.style.setProperty("--dx", dx + "px");
        zap.style.setProperty("--dy", dy + "px");
        zap.style.setProperty("--zap-duration", PICK_BONUS_ZAP_MS + "ms");

        pearlFxLayer.appendChild(zap);

        // The total is now flying off on its own - the box itself
        // hides at this exact moment, matching the same "release the
        // source right as the zap departs" pattern every other
        // resolution zap in this file already uses.
        this.hideYouWonBox();

        audioManager.playPearlCollect();

        setTimeout(()=>{

            if(zap.parentElement){

                zap.parentElement.removeChild(zap);

            }

            winManager.updateUI(featureManager.chainTotalWin);

            targetEl.classList.add("bubble-meter-impact");

            setTimeout(()=>{

                targetEl.classList.remove("bubble-meter-impact");

            }, PICK_BONUS_METER_IMPACT_MS);

            onComplete();

        }, PICK_BONUS_ZAP_MS);

    }

    /* ======================================
       FINISH RESOLUTION / TEARDOWN SCENE / FINISH END FEATURE
       Every reward zap has already landed and Total Win is fully
       up to date - now the SAME "FEATURE / COMPLETE" popup +
       feature-transition glow outro Free Spins already uses. Pick
       Bonus's own UI is removed/scene restored at the glow's own
       midpoint (masked by its peak coverage), matching Free Spins'
       own background-revert precedent exactly. Only the triggering
       Collector (5) is reset - CollectorManager's progression logic
       for every other Collector is completely untouched.
    ====================================== */

    finishResolution(){

        animationManager.presentFeatureCompletionPopup(() => {

            animationManager.presentFeatureTransition(

                () => {

                    this.setSceneActive(false);

                    // Symmetric with beginIntroTransition() above -
                    // restore the counter at this SAME masked outro
                    // transition midpoint, exactly when the Reel/
                    // Collector Panels themselves reappear, rather
                    // than a beat later once the glow has already
                    // fully faded (FreeSpinsFeature.resume() below
                    // still repeats this call defensively once
                    // control actually hands back, but by then it
                    // should already be a no-op).
                    if(featureManager.pausedController===freeSpinsFeature){

                        freeSpinsFeature.setCounterTakeoverHidden(false);

                    }

                },

                () => {

                    this.finishEndFeature();

                }

            );

        });

    }

    finishEndFeature(){

        collectorManager.reset(this.collectorIndex);
        collectorManager.updateCollectorArt(this.collectorIndex);
        animationManager.presentCollectorResetFx(this.collectorIndex);

        this.active = false;
        this.locked = false;

        this.collectorIndex = null;

        // featureManager.chainTotalWin is deliberately left as-is -
        // the final total stays displayed until the player's next
        // Base Game spin resets it, same as every other feature.

        featureManager.finishActiveFeature();

    }

}

/* ======================================
   MERMAID'S BLESSING PROBABILITY (additional picks)
   Isolated in one place, same pattern as
   WildRespinFeature's own shouldTriggerMermaidsBlessing()/
   BubbleBonusFeature's own shouldTriggerBubbleBonus() - reads
   CONFIG.PICK_BONUS.MERMAIDS_BLESSING_CHANCE_DEV, a clearly marked
   DEVELOPMENT value (see config.js), not a finalized production
   probability.
====================================== */

function shouldTriggerPickBonusBlessing(){

    // TEMPORARY QA TEST CODE - see the QA TEMPORARY OVERRIDE block
    // near the top of this file. REMOVE when done testing.
    if(QA_FORCE_MERMAIDS_BLESSING){

        return true;

    }
    // END TEMPORARY QA TEST CODE

    return Math.random() < CONFIG.PICK_BONUS.MERMAIDS_BLESSING_CHANCE_DEV;

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.pickBonusFeature = new PickBonusFeature();
