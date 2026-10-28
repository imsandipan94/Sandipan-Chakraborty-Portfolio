/* ==========================================
   BUBBLE BONUS FEATURE
   Pearl of Fortune

   Milestone - Free Spins Mermaid's Blessing / Automatic Bubble
   Bonus. This REPLACES the previous Mermaid's Blessing/Bubble Bonus
   requirements for Free Spins specifically - WildRespinFeature's OWN
   Mermaid's Blessing (sticky-wild secondary reel) is a completely
   separate mechanic and is never touched by anything in this file.

   A SUB-FEATURE of Free Spins only - owned/driven entirely by
   FreeSpinsFeature.maybeTriggerBubbleBonus() (see freeSpinsFeature.js).
   Deliberately NEVER registered with FeatureManager - it does not
   enter featureQueue, does not call lockSpin()/finishActiveFeature(),
   and FeatureManager has no idea this is running. Spin/Bet are
   already locked for the whole Free Spins session via
   FreeSpinsFeature.start()'s own featureManager.lockSpin() call, so
   nothing further is needed for that here. The pause itself reuses
   FreeSpinsFeature's OWN existing this.paused/pause()/resume()
   mechanism (the same one used when an external, higher-priority
   Feature interrupts Free Spins) - see start()/finish() below.

   Whether/when this actually fires is decided ONCE by FreeSpinsFeature
   itself (start()'s bubbleBonusArmed/bubbleBonusTriggerSpin) - this
   file only owns WHAT HAPPENS once it's told to start().

   Bubbles pop ONE AT A TIME (see runPopQueue() below), and each pop's
   value travels to its respective meter (Total Win for Cash/
   Multiplier/Jackpot, the "Spins Left" counter for Additional Spins)
   via a zap trail - reusing the SAME .pearl-fx-clone/#pearl-fx-layer
   technique AnimationManager.presentMermaidPearlZap() already uses
   for its own "magic bolt" travel effect, rather than inventing a
   parallel one. The meter only actually updates once the zap lands
   (see applyBubbleReward()) - there is no separate batched reward
   resolution step anymore.

   Reuses the EXISTING Mermaid state system (mermaidsBlessing/
   mermaid-blessing.png, mermaidStateManager.js) and the EXISTING jackpot
   values (jackpotManager.getValue()) rather than any new asset or a
   second jackpot-value system, per this milestone's own explicit
   instruction.
========================================== */

// Spawn count (4-8 inclusive) - every occurrence rolls its own
// count independently.
const BUBBLE_BONUS_MIN_SPAWN = 4;
const BUBBLE_BONUS_MAX_SPAWN = 8;

// Escaped (never popped) bubble count - kept small since the total
// count itself is now small, MOST bubbles pop. Capped in start()
// below so at least 2 always pop regardless of spawnCount.
const BUBBLE_BONUS_MAX_ESCAPE = 2;

// Empty (no-prize) bubble count - spawned IN ADDITION to the
// spawnCount prize bubbles above, never as a replacement for any of
// them. Deliberately a much SMALLER quantity, scaled proportionally
// to spawnCount rather than a fixed number (e.g. 4 prize bubbles ->
// 1-2 empty, 8 prize bubbles -> 2-4 empty) - see beginBubbleSequence()
// below. These can NEVER be selected to pop (they never enter
// bubbleRefs/popOrder at all) - they only ever drift and escape,
// exactly like an escaping prize bubble, just carrying no prize.
const BUBBLE_BONUS_EMPTY_RATIO_MIN = 0.25;
const BUBBLE_BONUS_EMPTY_RATIO_MAX = 0.5;

// ~40% of ALL spawned bubbles are Cash; the remaining ~60% split
// across Multiplier/Jackpot/Additional Spins (not equal thirds -
// see buildPrizeSet()/rollNonCashPrize() below).
const BUBBLE_BONUS_CASH_RATIO = 0.4;

// Cash prize value range ($1-$10).
const BUBBLE_CASH_MIN = 1;
const BUBBLE_CASH_MAX = 10;

// Bug fix - a revealed Cash prize must read as credits everywhere
// ($1 -> "100"), never with a "$" prefix - the SAME
// PICK_BONUS_CASH_CREDITS_PER_DOLLAR convention pickBonusFeature.js
// already established (see its own comment there for the full
// reasoning). rollCashPrize() below multiplies by this constant
// ONCE, immediately, so the displayed label and the value actually
// credited to featureManager.chainTotalWin/balanceManager always
// agree - a mismatch there (value staying in dollars while the
// label showed a "$" credits-shaped number) meant a revealed "$5"
// only ever added 5 to Total Win instead of 500.
const BUBBLE_CASH_CREDITS_PER_DOLLAR = 100;

// Only these values, per this milestone's own explicit list.
const BUBBLE_MULTIPLIER_VALUES = [2, 3, 4, 5, 10];
const BUBBLE_ADDITIONAL_SPINS_VALUES = [1, 2, 3];

// Matches CONFIG.JACKPOTS' own keys exactly - jackpotManager.getValue()
// is read with these same strings.
const BUBBLE_JACKPOT_TIERS = ["MINI", "MINOR", "MAJOR", "GRAND"];

// Timing (ms) - bubble lifecycle pacing only, never gameplay math.
const BUBBLE_SPAWN_STAGGER_MS = 150;
const BUBBLE_SPAWN_JITTER_MS = 120;
const BUBBLE_MIN_LIFETIME_MS = 1800;
const BUBBLE_MAX_LIFETIME_MS = 3600;
const BUBBLE_POP_FX_MS = 350;
const BUBBLE_ESCAPE_FX_MS = 220;

// Sequential pop queue - bubbles pop ONE AT A TIME, at this fixed
// cadence, rather than each on its own independent random timer.
// The initial delay gives the player a moment to see several
// bubbles on screen before the first one pops.
const BUBBLE_POP_QUEUE_START_DELAY_MS = 900;
const BUBBLE_POP_QUEUE_INTERVAL_MS = 700;

// If the pop queue's next bubble hasn't actually spawned yet (its
// own staggered spawn delay hasn't elapsed), retry at this cadence
// rather than skipping it or popping out of order.
const BUBBLE_POP_QUEUE_RETRY_MS = 100;

// Zap trail travel time from a popped bubble to its meter, and how
// long the meter's own brief "impact" flash lasts once it lands.
const BUBBLE_ZAP_TRAIL_MS = 480;
const BUBBLE_METER_IMPACT_MS = 300;

// Brief pause after the LAST bubble resolves (pop+zap, or escape)
// before handing control back to Free Spins.
const BUBBLE_BONUS_SETTLE_MS = 500;

// How long the "Mermaid's Blessings" intro popup stays up before
// the first bubble actually spawns - see showBlessingPopup() below.
const BUBBLE_BONUS_INTRO_POPUP_MS = 2000;

// Spawn zone - bug fix: bubbles must stay in the EMPTY area around
// the Mermaid, never over the reels. #mermaid-panel spans roughly
// y=170-770 (TOP_HEIGHT=170, MERMAID_HEIGHT=600 - config.js);
// #collector-panel sits at a fixed top:800px (never moved, per this
// project's own layout constraint) and #reel-panel starts at
// y=970. MAX_Y is kept well clear of both, accounting for the
// bubble's own 108px height (see ui.css) so its bottom edge never
// creeps into #collector-panel either. MIN/MAX_X account for that
// same 108px width so a bubble's edges never clip outside 0-800.
const BUBBLE_SPAWN_MIN_X = 30;
const BUBBLE_SPAWN_MAX_X = 662;
const BUBBLE_SPAWN_MIN_Y = 180;
const BUBBLE_SPAWN_MAX_Y = 640;

/* ==========================================
   QA TEMPORARY OVERRIDE
   ****************************************************************
   * TEMPORARY - QA TESTING ONLY.                                 *
   * Forces Bubble Bonus to trigger on EVERY Free Spins session,   *
   * per explicit user instruction, so the whole flow can be       *
   * verified repeatedly without waiting on the real                *
   * BUBBLE_BONUS_CHANCE_DEV probability (config.js). Still only    *
   * fires ONCE per session either way - see FreeSpinsFeature.      *
   * start()/maybeTriggerBubbleBonus(). REMOVE ONLY WHEN THE USER   *
   * EXPLICITLY ASKS - do not remove on your own judgement.         *
   ****************************************************************
========================================== */
const QA_FORCE_BUBBLE_BONUS = true;

function shouldTriggerBubbleBonus(){

    if(QA_FORCE_BUBBLE_BONUS){

        return true;

    }

    return Math.random() < CONFIG.FREE_SPINS.BUBBLE_BONUS_CHANCE_DEV;

}

class BubbleBonusFeature{

    constructor(){

        this.active = false;

        this.onComplete = null;

        this.layer = null;

        this.pearlFxLayer = null;

        this.totalBubbles = 0;

        this.resolvedBubbles = 0;

        // Index -> {wrap, bubble, prize} once spawnBubble() actually
        // creates it - the sequential pop queue (runPopQueue()) reads
        // from here rather than holding its own separate element
        // references.
        this.bubbleRefs = [];

        // The order (a list of spawn-indexes) bubbles will pop in -
        // built once in start(), consumed one at a time by
        // runPopQueue().
        this.popOrder = [];

        this.pendingTimeouts = [];

        // The "Mermaid's Blessings" intro popup element, while it's
        // on screen - see showBlessingPopup() below.
        this.introPopupEl = null;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Bubble Bonus Feature Initialized");

    }

    /* ======================================
       START
       Called by FreeSpinsFeature.maybeTriggerBubbleBonus() - Free
       Spins has already paused itself (this.paused=true, counter
       greyed) before calling this. onComplete is invoked once every
       bubble has resolved (popped-and-zapped, or escaped) - Free
       Spins' own resume() (called from that callback) is what
       actually starts the next automatic spin, matching the
       "player must NOT press Spin" requirement.
    ====================================== */

    start(onComplete){

        this.active = true;

        this.onComplete = onComplete;

        this.totalBubbles = 0;
        this.resolvedBubbles = 0;

        this.bubbleRefs = [];
        this.popOrder = [];

        this.pendingTimeouts = [];

        this.layer =
            document.getElementById("effects-layer");

        // Same layer AnimationManager.presentMermaidPearlZap() uses
        // for its own travel effect - position:fixed, covers the
        // whole viewport regardless of GameScaler's CSS scale, so
        // real getBoundingClientRect() coordinates (bubble position,
        // meter position) both land correctly here.
        this.pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        this.introPopupEl = null;

        this.showBlessingPopup(()=>{

            this.beginBubbleSequence();

        });

    }

    /* ======================================
       SHOW BLESSING POPUP
       Brief "Mermaid's Blessings" announcement, shown BEFORE any
       bubble actually spawns - its own dedicated audio cue
       (MERMAID_BLESSING_INTRO, config.js) starts LOOPING here and
       keeps playing for the WHOLE Bubble Bonus sequence (bubbles
       included) until finish() stops it, distinct from
       playMermaidsBlessing() (Wild Respin's own one-shot SFX,
       untouched).

       Mermaid shows mermaid-collect.png for this trigger/popup moment (the
       "bubbleBonusIntro" state, mermaidStateManager.js - reuses the
       EXISTING mermaid-collect.png asset, no new art requested) - she only
       switches to mermaid-blessing.png once bubbles actually start spawning,
       see beginBubbleSequence() below.
    ====================================== */

    showBlessingPopup(onComplete){

        mermaidStateManager.triggerState("bubbleBonusIntro");

        audioManager.startMermaidBlessingLoop();

        const popupLayer =
            document.getElementById("popup-layer");

        if(popupLayer){

            const el =
                document.createElement("div");

            el.className = "bubble-bonus-intro-popup";
            el.textContent = "Mermaid's Blessings";

            popupLayer.appendChild(el);

            this.introPopupEl = el;

        }

        const timeout = setTimeout(()=>{

            if(this.introPopupEl && this.introPopupEl.parentElement){

                this.introPopupEl.parentElement.removeChild(this.introPopupEl);

            }

            this.introPopupEl = null;

            onComplete();

        }, BUBBLE_BONUS_INTRO_POPUP_MS);

        this.pendingTimeouts.push(timeout);

    }

    /* ======================================
       BEGIN BUBBLE SEQUENCE
       The actual bubble spawn/pop mechanics - unchanged from before,
       just now gated behind showBlessingPopup() above finishing
       first instead of starting the instant start() is called.
    ====================================== */

    beginBubbleSequence(){

        if(!this.active){

            return;

        }

        // Mermaid switches to mermaid-blessing.png right as bubbles actually
        // start spawning - mermaid-collect.png (bubbleBonusIntro) already
        // played/reverted during showBlessingPopup() above. Uses
        // holdState() (no auto-revert timer), NOT triggerState() -
        // Bubble Bonus's own duration is variable and often longer
        // than mermaidsBlessing's normal fixed 1500ms flash, so she
        // needs to stay on mermaid-blessing.png for the WHOLE sequence, only
        // reverting once finish() below explicitly releases it.
        mermaidStateManager.holdState("mermaidsBlessing");

        const spawnCount =
            BUBBLE_BONUS_MIN_SPAWN + Math.floor(
                Math.random() * (BUBBLE_BONUS_MAX_SPAWN - BUBBLE_BONUS_MIN_SPAWN + 1)
            );

        // MOST bubbles pop now that the total count is small (4-8) -
        // escapeCount is capped at spawnCount-2 so at least 2 always
        // pop regardless.
        const escapeCount =
            Math.min(
                spawnCount - 2,
                Math.floor(Math.random() * (BUBBLE_BONUS_MAX_ESCAPE + 1))
            );

        const popCount =
            spawnCount - escapeCount;

        // Empty (no-prize) bubbles - a SMALL quantity IN ADDITION to
        // spawnCount above, scaled proportionally (roughly 25%-50% of
        // the prize count) rather than a fixed number, per this
        // milestone's own explicit examples (4 prize -> 1-2 empty, 8
        // prize -> ~2-4 empty). Always at least 1 so the category is
        // never silently skipped on a small spawnCount.
        const emptyMin =
            Math.max(1, Math.ceil(spawnCount * BUBBLE_BONUS_EMPTY_RATIO_MIN));

        const emptyMax =
            Math.max(emptyMin, Math.ceil(spawnCount * BUBBLE_BONUS_EMPTY_RATIO_MAX));

        const emptyCount =
            emptyMin + Math.floor(Math.random() * (emptyMax - emptyMin + 1));

        this.totalBubbles = spawnCount + emptyCount;
        this.bubbleRefs = new Array(this.totalBubbles).fill(null);

        const prizes =
            this.buildPrizeSet(spawnCount);

        const popIndexes =
            this.pickRandomIndexes(spawnCount, popCount);

        // Insertion order of a Set built from a shuffled array (see
        // pickRandomIndexes()) is already randomized - used directly
        // as the sequential pop order, no further shuffling needed.
        // Only ever built from spawnCount (the PRIZE bubbles) - empty
        // bubbles below are never added to this, so they can never be
        // selected to pop.
        this.popOrder = Array.from(popIndexes);

        for(let i=0; i<spawnCount; i++){

            const willPop =
                popIndexes.has(i);

            const delay =
                i * BUBBLE_SPAWN_STAGGER_MS + Math.random() * BUBBLE_SPAWN_JITTER_MS;

            const timeout = setTimeout(()=>{

                this.spawnBubble(i, prizes[i], willPop);

            }, delay);

            this.pendingTimeouts.push(timeout);

        }

        // Empty bubbles spawn in the SAME staggered sequence,
        // continuing right after the prize bubbles above - always
        // escape on their own timer (see spawnEmptyBubble()), never
        // part of the pop queue.
        for(let e=0; e<emptyCount; e++){

            const index =
                spawnCount + e;

            const delay =
                index * BUBBLE_SPAWN_STAGGER_MS + Math.random() * BUBBLE_SPAWN_JITTER_MS;

            const timeout = setTimeout(()=>{

                this.spawnEmptyBubble(index);

            }, delay);

            this.pendingTimeouts.push(timeout);

        }

        const popQueueTimeout = setTimeout(()=>{

            this.runPopQueue(0);

        }, BUBBLE_POP_QUEUE_START_DELAY_MS);

        this.pendingTimeouts.push(popQueueTimeout);

    }

    /* ======================================
       BUILD PRIZE SET
       ~40% Cash, remaining ~60% split across Multiplier/Jackpot/
       Additional Spins (see rollNonCashPrize()) - shuffled after
       assignment so Cash/non-Cash bubbles don't spawn grouped by
       category.
    ====================================== */

    buildPrizeSet(count){

        const cashCount =
            Math.round(count * BUBBLE_BONUS_CASH_RATIO);

        const prizes = [];

        for(let i=0; i<cashCount; i++){

            prizes.push(this.rollCashPrize());

        }

        for(let i=cashCount; i<count; i++){

            prizes.push(this.rollNonCashPrize());

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
            BUBBLE_CASH_MIN + Math.floor(
                Math.random() * (BUBBLE_CASH_MAX - BUBBLE_CASH_MIN + 1)
            );

        // Bug fix - value is the credits figure (the SAME number the
        // label displays), not the raw dollar roll - see
        // BUBBLE_CASH_CREDITS_PER_DOLLAR's own comment above.
        const value =
            dollarRoll * BUBBLE_CASH_CREDITS_PER_DOLLAR;

        return { category:"CASH", value, label:`${value}` };

    }

    rollNonCashPrize(){

        const roll =
            Math.floor(Math.random() * 3);

        if(roll===0){

            const value =
                BUBBLE_MULTIPLIER_VALUES[
                    Math.floor(Math.random() * BUBBLE_MULTIPLIER_VALUES.length)
                ];

            return { category:"MULTIPLIER", value, label:`${value}x` };

        }

        if(roll===1){

            const tier =
                BUBBLE_JACKPOT_TIERS[
                    Math.floor(Math.random() * BUBBLE_JACKPOT_TIERS.length)
                ];

            return { category:"JACKPOT", value:tier, label:tier };

        }

        const value =
            BUBBLE_ADDITIONAL_SPINS_VALUES[
                Math.floor(Math.random() * BUBBLE_ADDITIONAL_SPINS_VALUES.length)
            ];

        return { category:"ADDITIONAL_SPINS", value, label:`+${value}` };

    }

    /* ======================================
       PICK RANDOM INDEXES
       Chooses WHICH `count` of the `total` spawned bubbles will pop
       (the rest escape) - a plain Fisher-Yates shuffle of indexes,
       so it's independent of prize category (any category can pop
       or escape). The resulting Set's insertion order also becomes
       the sequential POP order (see start()/popOrder above).
    ====================================== */

    pickRandomIndexes(total, count){

        const indexes = [];

        for(let i=0; i<total; i++){

            indexes.push(i);

        }

        for(let i=indexes.length-1; i>0; i--){

            const j =
                Math.floor(Math.random() * (i+1));

            const temp = indexes[i];
            indexes[i] = indexes[j];
            indexes[j] = temp;

        }

        return new Set(indexes.slice(0, count));

    }

    /* ======================================
       SPAWN BUBBLE
       Two-layer DOM (see ui.css): an outer .bubble-wrap handles
       position/drift via a CSS animation (translate only), an inner
       .bubble handles the visual bubble + its own INDEPENDENT pop/
       escape animation - kept as separate elements specifically so
       popping a bubble mid-drift never fights the drift animation's
       own transform (see popBubble() below).

       Every bubble shows its prize immediately (label text set here,
       at spawn) - no click-to-reveal, per this milestone's own
       explicit requirement. A bubble that WILL pop is NOT given its
       own pop timer here - it just drifts like any other bubble
       until the sequential pop queue (runPopQueue()) reaches its
       turn; only escaping bubbles get their own timer, below.
    ====================================== */

    spawnBubble(index, prize, willPop){

        if(!this.active || !this.layer){

            return;

        }

        const wrap =
            document.createElement("div");

        wrap.className = "bubble-wrap";

        const startX =
            BUBBLE_SPAWN_MIN_X + Math.random() * (BUBBLE_SPAWN_MAX_X - BUBBLE_SPAWN_MIN_X);

        const startY =
            BUBBLE_SPAWN_MIN_Y + Math.random() * (BUBBLE_SPAWN_MAX_Y - BUBBLE_SPAWN_MIN_Y);

        wrap.style.left = startX + "px";
        wrap.style.top = startY + "px";

        // Each bubble drifts along its OWN slightly different
        // path/speed (staggered/overlapping, never identical) -
        // always upward (negative Y), horizontally/diagonally varied.
        // Purely cosmetic - popping bubbles are frozen mid-drift
        // whenever their pop-queue turn actually comes (see
        // popBubble()), never tied to this duration.
        const driftX =
            Math.random() * 160 - 80;

        const driftY =
            -(120 + Math.random() * 220);

        const lifetime =
            BUBBLE_MIN_LIFETIME_MS + Math.random() * (BUBBLE_MAX_LIFETIME_MS - BUBBLE_MIN_LIFETIME_MS);

        wrap.style.setProperty("--bubble-drift-x", driftX + "px");
        wrap.style.setProperty("--bubble-drift-y", driftY + "px");
        wrap.style.animationDuration = lifetime + "ms";

        const bubble =
            document.createElement("div");

        bubble.className = `bubble bubble-${prize.category.toLowerCase()}`;
        bubble.textContent = prize.label;

        wrap.appendChild(bubble);
        this.layer.appendChild(wrap);

        this.bubbleRefs[index] = { wrap, bubble, prize };

        if(!willPop){

            const timeout = setTimeout(()=>{

                this.escapeBubble(wrap);

            }, lifetime);

            this.pendingTimeouts.push(timeout);

        }

    }

    /* ======================================
       SPAWN EMPTY BUBBLE
       A no-prize bubble, spawned IN ADDITION to the normal prize
       bubbles above (see beginBubbleSequence()'s emptyCount). Same
       drift visual as any other bubble, but deliberately carries no
       label text and never gets a bubbleRefs entry pointing INTO
       popOrder - runPopQueue() only ever iterates popOrder, which is
       built exclusively from the prize bubbles, so an empty bubble
       can structurally never be selected to pop. It only ever
       escapes (see escapeBubble()) - "just float upward and move out
       of the screen", awarding nothing, per this milestone's own
       explicit requirement.
    ====================================== */

    spawnEmptyBubble(index){

        if(!this.active || !this.layer){

            return;

        }

        const wrap =
            document.createElement("div");

        wrap.className = "bubble-wrap";

        const startX =
            BUBBLE_SPAWN_MIN_X + Math.random() * (BUBBLE_SPAWN_MAX_X - BUBBLE_SPAWN_MIN_X);

        const startY =
            BUBBLE_SPAWN_MIN_Y + Math.random() * (BUBBLE_SPAWN_MAX_Y - BUBBLE_SPAWN_MIN_Y);

        wrap.style.left = startX + "px";
        wrap.style.top = startY + "px";

        const driftX =
            Math.random() * 160 - 80;

        const driftY =
            -(120 + Math.random() * 220);

        const lifetime =
            BUBBLE_MIN_LIFETIME_MS + Math.random() * (BUBBLE_MAX_LIFETIME_MS - BUBBLE_MIN_LIFETIME_MS);

        wrap.style.setProperty("--bubble-drift-x", driftX + "px");
        wrap.style.setProperty("--bubble-drift-y", driftY + "px");
        wrap.style.animationDuration = lifetime + "ms";

        const bubble =
            document.createElement("div");

        // Deliberately no textContent - an empty bubble shows no
        // value at all, unlike every prize bubble which always shows
        // its label immediately at spawn.
        bubble.className = "bubble bubble-empty";

        wrap.appendChild(bubble);
        this.layer.appendChild(wrap);

        this.bubbleRefs[index] = { wrap, bubble, prize:null };

        const timeout = setTimeout(()=>{

            this.escapeBubble(wrap);

        }, lifetime);

        this.pendingTimeouts.push(timeout);

    }

    /* ======================================
       RUN POP QUEUE
       Pops the bubbles in popOrder ONE AT A TIME, waiting
       BUBBLE_POP_QUEUE_INTERVAL_MS between each - never several at
       once. If the next queued bubble hasn't actually spawned yet
       (its own staggered spawn delay - see spawnBubble() above -
       hasn't elapsed), this waits and retries rather than skipping
       it or popping out of order.
    ====================================== */

    runPopQueue(queueIndex){

        if(!this.active){

            return;

        }

        if(queueIndex >= this.popOrder.length){

            return;

        }

        const bubbleIndex =
            this.popOrder[queueIndex];

        const ref =
            this.bubbleRefs[bubbleIndex];

        if(!ref){

            const retryTimeout = setTimeout(()=>{

                this.runPopQueue(queueIndex);

            }, BUBBLE_POP_QUEUE_RETRY_MS);

            this.pendingTimeouts.push(retryTimeout);

            return;

        }

        this.popBubble(ref.wrap, ref.bubble, ref.prize);

        const nextTimeout = setTimeout(()=>{

            this.runPopQueue(queueIndex + 1);

        }, BUBBLE_POP_QUEUE_INTERVAL_MS);

        this.pendingTimeouts.push(nextTimeout);

    }

    /* ======================================
       POP BUBBLE
       Freezes the wrapper's drift exactly where it currently is
       (animation-play-state:paused) so the inner bubble's own pop
       animation plays from its actual on-screen position rather than
       snapping back to its spawn point. The prize itself isn't
       applied here - launchZapTrail() below sends it toward its
       meter, and applyBubbleReward() only actually updates the
       meter once that zap lands (see there).
    ====================================== */

    popBubble(wrap, bubble, prize){

        if(!this.active){

            return;

        }

        wrap.style.animationPlayState = "paused";

        bubble.classList.add("popping");

        audioManager.playBubblePop();

        this.launchZapTrail(wrap, prize);

        const timeout = setTimeout(()=>{

            this.removeBubble(wrap);

        }, BUBBLE_POP_FX_MS);

        this.pendingTimeouts.push(timeout);

    }

    /* ======================================
       LAUNCH ZAP TRAIL
       Reuses the SAME travel technique AnimationManager.
       presentMermaidPearlZap() already established (a clone
       appended to #pearl-fx-layer, --dx/--dy computed from real
       getBoundingClientRect() deltas so it's correct regardless of
       GameScaler's current CSS scale) - here travelling from the
       popped bubble to its respective meter (Total Win for Cash/
       Multiplier/Jackpot, the Free Spins counter for Additional
       Spins) instead of from the Mermaid to a Collector.
    ====================================== */

    launchZapTrail(sourceEl, prize){

        const targetEl =
            prize.category==="ADDITIONAL_SPINS" ?
                freeSpinsFeature.counterEl :
                document.getElementById("total-win-value");

        if(!targetEl || !this.pearlFxLayer){

            // No visual possible (e.g. counter already gone) - apply
            // the reward immediately anyway so it's never silently
            // lost.
            this.applyBubbleReward(prize, targetEl);

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

        zap.className = `bubble-zap-trail bubble-zap-${prize.category.toLowerCase()}`;
        zap.textContent = prize.label;

        zap.style.left = sourceCenterX + "px";
        zap.style.top = sourceCenterY + "px";
        zap.style.setProperty("--dx", dx + "px");
        zap.style.setProperty("--dy", dy + "px");
        zap.style.setProperty("--zap-duration", BUBBLE_ZAP_TRAIL_MS + "ms");

        this.pearlFxLayer.appendChild(zap);

        // Reuses the EXISTING normal gameplay Pearl Collection SFX -
        // the value visibly travelling to its meter is conceptually
        // the same "collecting" moment, just for a Bubble Bonus
        // reward instead of a reel Pearl.
        audioManager.playPearlCollect();

        const timeout = setTimeout(()=>{

            if(zap.parentElement){

                zap.parentElement.removeChild(zap);

            }

            this.applyBubbleReward(prize, targetEl);

        }, BUBBLE_ZAP_TRAIL_MS);

        this.pendingTimeouts.push(timeout);

    }

    /* ======================================
       APPLY BUBBLE REWARD
       Called the instant a POPPED bubble's own zap trail lands -
       the meter updates live, per bubble, in POP ORDER (never
       batched/deferred to the end). Cash/Jackpot add to Total Win,
       Multiplier multiplies whatever Total Win currently IS at this
       exact moment (so it still only ever affects money already
       on the meter, just live rather than in a fixed end-of-round
       order), Additional Spins add directly to Free Spins' own
       authoritative counter. Reads/writes the SAME shared running
       total every feature in the current trigger chain uses
       (featureManager.chainTotalWin) and FreeSpinsFeature's own
       freeSpinsRemaining directly - never a second, parallel total.
    ====================================== */

    applyBubbleReward(prize, targetEl){

        if(!this.active){

            return;

        }

        if(prize.category==="ADDITIONAL_SPINS"){

            freeSpinsFeature.freeSpinsRemaining += prize.value;

            freeSpinsFeature.updateCounter();

        } else {

            const beforeTotal =
                featureManager.chainTotalWin;

            if(prize.category==="CASH"){

                featureManager.chainTotalWin += prize.value;

            } else if(prize.category==="MULTIPLIER"){

                featureManager.chainTotalWin =
                    Math.round(featureManager.chainTotalWin * prize.value * 100) / 100;

            } else if(prize.category==="JACKPOT"){

                featureManager.chainTotalWin += jackpotManager.getValue(prize.value);

            }

            winManager.updateUI(featureManager.chainTotalWin);

            // Total Win represents real credited money, same as
            // every normal spin - only the NET INCREASE this
            // specific pop just caused (a Cash/Jackpot add, or what
            // a Multiplier just added on top of the existing total)
            // is genuinely new money, credited the instant it lands,
            // same moment the player sees it happen.
            const delta =
                featureManager.chainTotalWin - beforeTotal;

            if(delta > 0){

                balanceManager.add(delta);

            }

        }

        if(targetEl){

            targetEl.classList.add("bubble-meter-impact");

            const timeout = setTimeout(()=>{

                targetEl.classList.remove("bubble-meter-impact");

            }, BUBBLE_METER_IMPACT_MS);

            this.pendingTimeouts.push(timeout);

        }

        this.onBubbleResolved();

    }

    /* ======================================
       ESCAPE BUBBLE
       Simply removed - no reveal beyond its already-visible label,
       no reward, never reaches applyBubbleReward(), per this
       milestone's own explicit requirement.
    ====================================== */

    escapeBubble(wrap){

        if(!this.active){

            return;

        }

        wrap.classList.add("escaping");

        const timeout = setTimeout(()=>{

            this.removeBubble(wrap);
            this.onBubbleResolved();

        }, BUBBLE_ESCAPE_FX_MS);

        this.pendingTimeouts.push(timeout);

    }

    removeBubble(wrap){

        if(wrap.parentElement){

            wrap.parentElement.removeChild(wrap);

        }

    }

    /* ======================================
       ON BUBBLE RESOLVED
       Counts a bubble as fully done only once its ENTIRE cycle has
       finished - for a popped bubble that means its reward has
       already been applied (called from the tail of
       applyBubbleReward(), i.e. AFTER its zap has landed and the
       meter updated), for an escaped bubble it's immediate. finish()
       only fires once every spawned bubble has reached this point.
    ====================================== */

    onBubbleResolved(){

        this.resolvedBubbles++;

        if(this.resolvedBubbles >= this.totalBubbles){

            const timeout = setTimeout(()=>{

                this.finish();

            }, BUBBLE_BONUS_SETTLE_MS);

            this.pendingTimeouts.push(timeout);

        }

    }

    /* ======================================
       FINISH
       Hands control back to FreeSpinsFeature via the callback it
       passed into start() - resume() there un-pauses/un-greys the
       counter and starts the next automatic spin. FeatureManager is
       never involved (this never entered its queue in the first
       place). Every reward was already applied live, per bubble, as
       it popped - nothing left to resolve here.
    ====================================== */

    finish(){

        this.active = false;

        // Whole Bubble Bonus sequence is done - stop the Mermaid's
        // Blessings loop (started in showBlessingPopup()) and let
        // the Mermaid revert off mermaid-blessing.png (held since
        // beginBubbleSequence()) back to her default idle art.
        audioManager.stopMermaidBlessingLoop();

        mermaidStateManager.releaseHold();

        // Defensive only - already removed by showBlessingPopup()'s
        // own timer in the normal flow, this just guarantees it can
        // never linger if something ended the session early.
        if(this.introPopupEl && this.introPopupEl.parentElement){

            this.introPopupEl.parentElement.removeChild(this.introPopupEl);

        }

        this.introPopupEl = null;

        this.pendingTimeouts.forEach((timeout)=>{

            clearTimeout(timeout);

        });

        this.pendingTimeouts = [];

        const onComplete =
            this.onComplete;

        this.onComplete = null;

        if(onComplete){

            onComplete();

        }

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.bubbleBonusFeature = new BubbleBonusFeature();
