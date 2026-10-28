/* ==========================================
   ANIMATION MANAGER
   Pearl of Fortune

   Pure presentation layer for win results. Consumes the
   results already produced by WinEvaluator/WinManager -
   never recalculates a payline, a symbol count, or a payout.
   Reads win positions from the SAME payline arrays
   PaylineManager already exposes, and reads win amounts
   straight from result.amount.
========================================== */

// Reel 3 (the visual center reel) is array index 2 - matches
// PaylineManager's payline arrays, which are 0-indexed per reel.
const LINE_WIN_REEL_INDEX = 2;

// How long one line-win amount stays on screen (ms). Must match
// the .line-win-amount CSS animation duration in ui.css.
// 650ms base, +30%.
const LINE_WIN_DISPLAY_MS = 845;

// Gap between the start of each successive line-win amount when
// several paylines win on the same spin (ms).
const LINE_WIN_STAGGER_MS = 500;

// Payline overlay PNGs are named 1.png-20.png, matching
// result.line directly (winEvaluator.js already returns
// line:lineIndex+1, i.e. 1-based - no off-by-one translation
// needed here).
const PAYLINE_ASSET_PATH = (line) => `assets/paylines/${line}.png`;

// Pearl Collection FX timings (ms). Phase 1/2/3 of the sequence
// described in animationManager.js's presentPearlCollectionFx().
const PEARL_HIGHLIGHT_MS = 220;
const PEARL_TRAVEL_MS = 450;
const PEARL_IMPACT_MS = 220;

// When more than one Pearl lands on the SAME reel in one spin,
// their travel animations start this far apart so they read as
// distinct events instead of one overlapping blur. Reels are
// otherwise all independent and start together (delay 0).
const PEARL_SAME_REEL_STAGGER_MS = 120;

// Collector Upgrade FX timings (ms).
const COLLECTOR_UPGRADE_FX_MS = 500;
const COLLECTOR_UPGRADE_COMPLETE_FX_MS = 650;
const COLLECTOR_RESET_FX_MS = 450;

// Mermaid's Blessing Pearl zap travel time (ms) - see
// presentMermaidPearlZap(). Slightly longer than a normal Pearl's
// PEARL_TRAVEL_MS above for a more deliberate "magical" feel.
const MERMAID_PEARL_ZAP_MS = 600;

// Feature transition glow duration (ms) - see
// presentFeatureTransition(). Kept in sync with
// .feature-transition-glow's own `animation` duration in ui.css.
const FEATURE_TRANSITION_GLOW_MS = 2000;

// Milestone - Bonus Feature intro/outro audio. How long the
// "FEATURE / COMPLETE" outro popup stays up (see
// presentFeatureCompletionPopup()) before the Feature's own outro
// transition begins.
const FEATURE_OUTRO_POPUP_MS = 2000;

class AnimationManager{

    constructor(){

        // .symbol elements currently wearing the win FX class,
        // so clearWinEffects() can remove it without a DOM query.
        this.activeSymbolElements = [];

        // Same idea as activeSymbolElements, for the Pearl
        // Collection FX's two brief highlight/impact classes.
        this.activePearlHighlightElements = [];
        this.activePearlImpactElements = [];

        // Temporary traveling Pearl <img> clones currently in
        // #pearl-fx-layer, so they can be force-removed if a new
        // spin starts before their own removal timeout fires.
        this.activePearlClones = [];

        // { [reel]: { level, completed } } - set by
        // CollectorManager.increment() (via
        // registerPendingCollectorChange()) the instant a
        // collector's level actually changes, and consumed by
        // playPearlTravel() once that reel's Pearl clone finishes
        // travelling, so the Collector Upgrade FX plays in sync
        // with "the Pearl arrived" rather than the instant
        // CollectorManager itself updates (which happens well
        // before any of this presentation layer even starts -
        // see spinManager.js). CollectorManager only ever writes
        // to this map; it never reads it back or decides how/when
        // it's consumed.
        this.pendingCollectorChanges = {};

        // { el, className } pairs currently wearing a Collector
        // Upgrade/Reset FX class, mirroring activePearlImpactElements.
        this.activeCollectorFxElements = [];

        // Pending setTimeout handles, kept as two SEPARATE arrays
        // rather than one shared list. Symbol Win FX/Line Win
        // Amount and Pearl Collection FX are both triggered inside
        // the same onSpinComplete() (see spinManager.js) but at
        // different points, and presentWin() resets its own prior
        // state every call - if both domains shared one array,
        // presentWin()'s reset would cancel/undo a Pearl Collection
        // FX that a moment earlier had just started travelling in
        // the very same spin. Keeping them separate lets each
        // domain clear only its own leftovers.
        this.winTimeouts = [];
        this.pearlTimeouts = [];

        this.effectsLayer = null;
        this.pearlFxLayer = null;
        this.paylineLayer = null;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.effectsLayer =
            document.getElementById("effects-layer");

        this.pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        this.paylineLayer =
            document.getElementById("payline-layer");

        this.preloadPaylineAssets();

        console.log("Animation Manager Initialized");

    }

    /* ======================================
       PRELOAD PAYLINE ASSETS
       Warms the browser's image cache for all 20 payline PNGs at
       boot, off the critical path of any actual win. Without this,
       the very first time a given payline number wins in a session
       its <img> would only finish decoding a beat after
       showLineWinAmount() creates it (each PNG is a large
       3000x1800 canvas), so the overlay would visibly lag behind
       the label it's supposed to appear in sync with. Purely a
       performance/timing detail - PAYLINE_ASSET_PATH is the same
       helper showLineWinAmount() itself uses, nothing duplicated.
    ====================================== */

    preloadPaylineAssets(){

        for(let line=1; line<=paylineManager.getCount(); line++){

            const preloadImg =
                new Image();

            preloadImg.src =
                PAYLINE_ASSET_PATH(line);

        }

    }

    /* ======================================
       PRESENT WIN
       Entry point - called once per completed spin with the
       exact object WinManager.evaluate() already returned
       ({ totalWin, winningLines }). Does nothing on a no-win
       spin.
    ====================================== */

    presentWin(result){

        this.clearWinPresentation();

        const winningLines =
            result && result.winningLines;

        if(!winningLines || winningLines.length===0){

            return;

        }

        this.showLineWinAmounts(winningLines);

    }

    /* ======================================
       LINE WINNING POSITIONS
       Reads ONE winning line's own payline and, using ONLY the
       existing result.count, returns the reel/row positions that
       actually contributed - never the full 5-position payline.
       Single-line version (each call is scoped to its own
       presentation window - see showLineWinAmount()), so no
       cross-line dedup is needed here.
    ====================================== */

    getLineWinningPositions(result){

        const payline =
            paylineManager.getPayline(result.line - 1);

        const positions = [];

        for(let reel=0; reel<result.count; reel++){

            positions.push({ reel, row: payline[reel] });

        }

        return positions;

    }

    /* ======================================
       SYMBOL LOOKUP
       Reads the live, already-stopped symbol <img> for a given
       reel/row from ReelManager's own per-reel symbol array
       (rows 0-2 of reel.symbols are exactly the visible rows
       once a spin has stopped - the same source ReelMatrix
       reads for evaluation). Returns the .symbol container
       (the img's parent), which is what the FX class targets.
    ====================================== */

    getSymbolElement(reel, row){

        const reelData =
            reelManager.reels[reel];

        if(!reelData || !reelData.symbols[row]){

            return null;

        }

        return reelData.symbols[row].parentElement;

    }

    /* ======================================
       SYMBOL WIN FX
       Returns the elements it actually highlighted so the caller
       (showLineWinAmount() - each line owns its own highlight
       window now) can later clear only THOSE, independent of
       whatever any other line's own window is doing.
    ====================================== */

    playSymbolWinFx(positions){

        const highlighted = [];

        positions.forEach(({ reel, row })=>{

            const el =
                this.getSymbolElement(reel, row);

            if(!el){

                return;

            }

            el.classList.add("symbol-win-fx");

            this.activeSymbolElements.push(el);

            highlighted.push(el);

        });

        return highlighted;

    }

    /* ======================================
       CLEAR SYMBOL FX FOR
       Removes .symbol-win-fx from exactly the given elements (one
       line's own highlight set), leaving any OTHER line's still-
       active highlights untouched - unlike clearSymbolFx() below,
       which is a blanket "clear everything" safety net.
    ====================================== */

    clearSymbolFxFor(elements){

        elements.forEach((el)=>{

            el.classList.remove("symbol-win-fx");

            const index =
                this.activeSymbolElements.indexOf(el);

            if(index!==-1){

                this.activeSymbolElements.splice(index, 1);

            }

        });

    }

    /* ======================================
       LINE WIN AMOUNTS
       Shows each winning line's result.amount as a short-lived
       label anchored to that line's Reel 3 symbol, one line at
       a time so simultaneous wins never stack on top of each
       other. Everything else about that line's presentation
       (symbol highlight, payline overlay, Win Line SFX, Mermaid)
       is scoped to the SAME per-line call/timeout in
       showLineWinAmount() below - one lifecycle per line, per
       this milestone, not one blanket lifecycle for the whole spin.
    ====================================== */

    showLineWinAmounts(winningLines){

        winningLines.forEach((result, index)=>{

            const timeout = setTimeout(()=>{

                this.showLineWinAmount(result);

            }, index * LINE_WIN_STAGGER_MS);

            this.winTimeouts.push(timeout);

        });

    }

    showLineWinAmount(result){

        if(!this.effectsLayer){

            return;

        }

        const payline =
            paylineManager.getPayline(result.line - 1);

        const reel3Row =
            payline[LINE_WIN_REEL_INDEX];

        const symbolEl =
            this.getSymbolElement(LINE_WIN_REEL_INDEX, reel3Row);

        if(!symbolEl){

            return;

        }

        // This line's own winning symbols, highlighted only for
        // this line's own window (see the matching clearSymbolFxFor()
        // call in this same timeout below) - a symbol shared by two
        // winning lines re-highlights (and its .symbol-win-fx pulse
        // replays) when the next line's window picks it back up,
        // rather than staying blanket-highlighted for the whole
        // multi-line presentation.
        const positions =
            this.getLineWinningPositions(result);

        const highlightedEls =
            this.playSymbolWinFx(positions);

        const pos =
            this.getGamePosition(symbolEl);

        const label =
            document.createElement("div");

        label.className = "line-win-amount";

        // Display-only rounding (matches WinManager's own total
        // win rounding) - result.amount itself is never touched.
        const amount =
            Math.round(result.amount * 100) / 100;

        label.textContent =
            "+" + amount.toLocaleString();

        // Symbol is 150x150 - center the label on its middle,
        // the CSS animation itself handles floating it upward.
        label.style.top = (pos.top + 75) + "px";
        label.style.left = (pos.left + 75) + "px";

        this.effectsLayer.appendChild(label);

        // One Win Line SFX per presented winning line (this
        // milestone's explicit choice, confirmed over the previous
        // "once for the whole presentation" behavior).
        audioManager.playWinLine();

        // Mermaid state system - re-triggered for every line rather
        // than once at the start of the whole presentation, so it
        // stays in the Symbol Win reaction for the full multi-line
        // sequence instead of reverting to idle partway through.
        // Re-triggering the SAME state only refreshes its timer
        // (see MermaidStateManager.applyState()'s isSameState check)
        // rather than replaying the fade, so this never flickers.
        mermaidStateManager.triggerState("symbolWin");

        // Payline overlay (Milestone 12.5) - a fresh <img> per call
        // rather than one shared/reused element, mirroring the
        // label above exactly, since multiple winning lines can be
        // visible at once (LINE_WIN_STAGGER_MS < LINE_WIN_DISPLAY_MS
        // means the next line's label - and now payline - appears
        // before the previous one has finished disappearing). Shows
        // and hides on this SAME timeout as the label, never an
        // independent timer.
        let paylineImg = null;

        if(this.paylineLayer){

            paylineImg =
                document.createElement("img");

            paylineImg.className = "payline-overlay";
            paylineImg.src = PAYLINE_ASSET_PATH(result.line);
            paylineImg.alt = "";

            this.paylineLayer.appendChild(paylineImg);

        }

        const timeout = setTimeout(()=>{

            if(label.parentElement){

                label.parentElement.removeChild(label);

            }

            if(paylineImg && paylineImg.parentElement){

                paylineImg.parentElement.removeChild(paylineImg);

            }

            // Restore just THIS line's own symbols - any other
            // line's own highlight (currently mid-window) is
            // completely unaffected.
            this.clearSymbolFxFor(highlightedEls);

        }, LINE_WIN_DISPLAY_MS);

        this.winTimeouts.push(timeout);

    }

    /* ======================================
       GAME-RELATIVE POSITION
       Sums offsetTop/offsetLeft up through the real DOM chain
       (symbol -> reel-strip -> reel -> reels-container ->
       reel-panel -> scene -> game) instead of any hardcoded
       coordinates, so the label always lands on the actual
       symbol regardless of panel positions defined elsewhere.
    ====================================== */

    getGamePosition(el){

        const gameEl =
            document.getElementById("game");

        let top = 0;
        let left = 0;
        let node = el;

        while(node && node!==gameEl){

            top += node.offsetTop || 0;
            left += node.offsetLeft || 0;

            node = node.offsetParent;

        }

        return { top, left };

    }

    /* ======================================
       PEARL COLLECTION FX
       Entry point - called once per completed spin with the
       SAME final matrix ReelMatrix/CollectorManager already
       used (reelMatrix.getMatrix()). Purely observational: it
       only reads the matrix to know where to START each
       traveling clone from and which collector to send it to.
       It never calls collector.increment()/reset() itself and
       never re-runs CollectorManager.evaluateSpin()'s own
       reel-has-Pearl decision - CollectorManager remains the
       only thing that decides progression. Does nothing if the
       spin had no Pearls.
    ====================================== */

    presentPearlCollectionFx(matrix){

        const positions =
            this.findPearlPositions(matrix);

        if(positions.length===0){

            return;

        }

        // Mermaid state system - Pearl Collection FX is beginning
        // right now for this spin (this early-return above already
        // confirmed at least one Pearl).
        mermaidStateManager.triggerState("pearlCollection");

        // Reels are independent and all start immediately; two
        // Pearls sharing a reel (and therefore a collector) are
        // staggered instead of firing on top of each other.
        const reelCounts = {};

        positions.forEach(({ reel, row })=>{

            const alreadyScheduled =
                reelCounts[reel] || 0;

            reelCounts[reel] = alreadyScheduled + 1;

            const delay =
                alreadyScheduled * PEARL_SAME_REEL_STAGGER_MS;

            const timeout = setTimeout(()=>{

                this.playPearlTravel(reel, row);

            }, delay);

            this.pearlTimeouts.push(timeout);

        });

    }

    /* ======================================
       FIND PEARL POSITIONS
       Read-only scan of the already-built matrix for animation
       SOURCING only (where should a clone start from) - this is
       not a second progression system and its result never
       feeds a collector.increment()/reset() call. Symbol id 0 is
       PEARL_SYMBOL_ID, already declared once in winEvaluator.js.
    ====================================== */

    findPearlPositions(matrix){

        const positions = [];

        for(let reel=0; reel<CONFIG.REELS.COUNT; reel++){

            for(let row=0; row<CONFIG.REELS.ROWS; row++){

                if(matrix[reel][row]===PEARL_SYMBOL_ID){

                    positions.push({ reel, row });

                }

            }

        }

        return positions;

    }

    /* ======================================
       PLAY PEARL TRAVEL
       Reel N's collector is #collector-art-(N+1) - the same
       fixed 1:1 mapping CollectorManager.evaluateSpin() already
       uses (reel index -> collectors[index]), read here only to
       find the DOM element the clone should travel to.
    ====================================== */

    playPearlTravel(reel, row){

        const pearlEl =
            this.getSymbolElement(reel, row);

        const collectorArt =
            document.getElementById(`collector-art-${reel + 1}`);

        if(!pearlEl || !collectorArt || !this.pearlFxLayer){

            return;

        }

        // Phase 1 - brief highlight on the actual Pearl symbol.
        pearlEl.classList.add("pearl-fx-highlight");
        this.activePearlHighlightElements.push(pearlEl);

        const highlightTimeout = setTimeout(()=>{

            pearlEl.classList.remove("pearl-fx-highlight");

            const index =
                this.activePearlHighlightElements.indexOf(pearlEl);

            if(index!==-1){

                this.activePearlHighlightElements.splice(index, 1);

            }

        }, PEARL_HIGHLIGHT_MS);

        this.pearlTimeouts.push(highlightTimeout);

        // Phase 2 - temporary clone travels from the Pearl's real
        // screen position to the collector's real screen position.
        // Real getBoundingClientRect() coordinates (not the
        // offsetTop/offsetLeft chain showLineWinAmount() uses) are
        // required here because the clone lives in #pearl-fx-layer,
        // deliberately OUTSIDE #game's own scaled coordinate space
        // - see the CSS comment on #pearl-fx-layer in game.css.
        const sourceRect =
            pearlEl.getBoundingClientRect();

        const targetRect =
            collectorArt.getBoundingClientRect();

        const dx =
            (targetRect.left + targetRect.width / 2) -
            (sourceRect.left + sourceRect.width / 2);

        const dy =
            (targetRect.top + targetRect.height / 2) -
            (sourceRect.top + sourceRect.height / 2);

        const clone =
            document.createElement("img");

        clone.className = "pearl-fx-clone";
        clone.src = symbolManager.getSymbol(PEARL_SYMBOL_ID).image;
        clone.alt = "";

        clone.style.width = sourceRect.width + "px";
        clone.style.height = sourceRect.height + "px";

        // The clone's own base position IS the Pearl's real
        // on-screen top-left (#pearl-fx-layer is position:fixed;
        // inset:0, so absolute left/top inside it are already
        // real viewport px - see the CSS comment on
        // #pearl-fx-layer in game.css). --dx/--dy (read back by
        // the shared pearlFxTravel keyframes in ui.css) are only
        // the ADDITIONAL travel distance from there to the
        // collector.
        clone.style.left = sourceRect.left + "px";
        clone.style.top = sourceRect.top + "px";
        clone.style.setProperty("--dx", dx + "px");
        clone.style.setProperty("--dy", dy + "px");
        clone.style.setProperty(
            "--pearl-travel-duration",
            PEARL_TRAVEL_MS + "ms"
        );

        this.pearlFxLayer.appendChild(clone);
        this.activePearlClones.push(clone);

        // Pearl has now started flying toward its collector -
        // played here (travel START), deliberately separate from
        // Collector Upgrade FX/SFX below, which only fires later
        // at actual arrival. Keeping these two audibly distinct
        // moments instead of both landing on the same instant.
        audioManager.playPearlCollect();

        const travelTimeout = setTimeout(()=>{

            if(clone.parentElement){

                clone.parentElement.removeChild(clone);

            }

            const cloneIndex =
                this.activePearlClones.indexOf(clone);

            if(cloneIndex!==-1){

                this.activePearlClones.splice(cloneIndex, 1);

            }

            // Phase 3 - brief impact pulse on the collector's own
            // artwork once the clone arrives. CollectorManager has
            // already swapped collector-art-N's src by this point
            // (evaluateSpin() runs synchronously before this FX is
            // even triggered - see spinManager.js) - this only
            // decorates that already-applied change, it never sets
            // .src itself.
            collectorArt.classList.add("pearl-fx-impact");
            this.activePearlImpactElements.push(collectorArt);

            const impactTimeout = setTimeout(()=>{

                collectorArt.classList.remove("pearl-fx-impact");

                const impactIndex =
                    this.activePearlImpactElements.indexOf(collectorArt);

                if(impactIndex!==-1){

                    this.activePearlImpactElements.splice(impactIndex, 1);

                }

            }, PEARL_IMPACT_MS);

            this.pearlTimeouts.push(impactTimeout);

            // Collector Upgrade FX - if CollectorManager registered
            // an actual level change for this reel (see
            // registerPendingCollectorChange()), apply the artwork
            // change AND play the glow together now that the Pearl
            // has visually arrived, rather than the artwork having
            // already jumped the instant the spin completed (well
            // before the Pearl even started travelling). Consumed
            // (deleted) so a second Pearl landing on this same reel
            // later in the same spin - which CollectorManager never
            // awards a second progression step for - never replays
            // it. updateCollectorArt() is CollectorManager's own
            // existing artwork-selection method - this never
            // decides the src itself, only when to call it.
            const pendingChange =
                this.pendingCollectorChanges[reel];

            if(pendingChange){

                delete this.pendingCollectorChanges[reel];

                collectorManager.updateCollectorArt(reel);

                this.playCollectorUpgradeFx(collectorArt, pendingChange, reel);

            }

        }, PEARL_TRAVEL_MS);

        this.pearlTimeouts.push(travelTimeout);

    }

    /* ======================================
       PRESENT MERMAID PEARL ZAP (Milestone - Wild Respin +
       Mermaid's Blessing)
       A lightweight variant of playPearlTravel() above, reusing
       the SAME .pearl-fx-clone/pearlFxTravel CSS technique and the
       existing Pearl artwork - no new asset, no new CSS animation.
       The only real difference is the source: the Mermaid's own
       element instead of a reel symbol, and a smaller fixed size
       (a "magical bolt" from her hand, not a full reel-sized icon).
       Purely presentational - never touches Collector data itself;
       onArrive() is where WildRespinFeature actually sets the
       secondary Collector to 3/3 and locks its reel as sticky Wild.

       Thin wrapper over launchMermaidPearlZap() below, resolving
       targetReelIndex to its own collector-art element - unchanged
       behavior/signature, callers (WildRespinFeature) untouched.
    ====================================== */

    presentMermaidPearlZap(targetReelIndex, onArrive){

        const collectorArt =
            document.getElementById(`collector-art-${targetReelIndex + 1}`);

        this.launchMermaidPearlZap(collectorArt, onArrive);

    }

    /* ======================================
       PRESENT MERMAID PEARL ZAP TO ELEMENT (Milestone - Pick Bonus)
       Same "magic bolt from the Mermaid's hand" effect as
       presentMermaidPearlZap() above, but toward an arbitrary target
       element instead of a Collector - used by PickBonusFeature's own
       Mermaid's Blessing to zap a Pearl at an unrevealed creature.

       sourcePoint is optional ({x, y}, real viewport coordinates) -
       when omitted, the zap starts from the Mermaid element's own
       bounding-box CENTER, same as before. PickBonusFeature passes
       the actual on-screen position of the pearl held in her hand
       instead (see getBlessingPearlSourcePoint() there), so the zap
       visibly starts from that pearl rather than the middle of her
       (much taller, mostly-empty) own panel.
    ====================================== */

    presentMermaidPearlZapToElement(targetEl, onArrive, sourcePoint){

        this.launchMermaidPearlZap(targetEl, onArrive, sourcePoint);

    }

    /* ======================================
       LAUNCH MERMAID PEARL ZAP
       Shared body both methods above delegate to - identical to the
       original presentMermaidPearlZap() implementation, just
       parameterized by the target element directly rather than
       resolving it from a reel index internally. sourcePoint is
       optional - see presentMermaidPearlZapToElement() above.
    ====================================== */

    launchMermaidPearlZap(targetEl, onArrive, sourcePoint){

        const mermaidEl =
            document.getElementById("mermaid-art");

        if(!mermaidEl || !targetEl || !this.pearlFxLayer){

            if(onArrive){

                onArrive();

            }

            return;

        }

        const sourceRect =
            mermaidEl.getBoundingClientRect();

        const targetRect =
            targetEl.getBoundingClientRect();

        const cloneSize = 60;

        const sourceCenterX =
            sourcePoint ? sourcePoint.x : sourceRect.left + sourceRect.width/2;

        const sourceCenterY =
            sourcePoint ? sourcePoint.y : sourceRect.top + sourceRect.height/2;

        const dx =
            (targetRect.left + targetRect.width/2) - sourceCenterX;

        const dy =
            (targetRect.top + targetRect.height/2) - sourceCenterY;

        const clone =
            document.createElement("img");

        // mermaid-pearl-zap adds a pulsing magical glow (see
        // ui.css) on top of the same base travel animation every
        // other .pearl-fx-clone already uses - distinguishing this
        // as Mermaid's Blessing's own Pearl, not a normal gameplay
        // Pearl Collection clone.
        clone.className = "pearl-fx-clone mermaid-pearl-zap";
        clone.src = symbolManager.getSymbol(PEARL_SYMBOL_ID).image;

        clone.style.width = cloneSize + "px";
        clone.style.height = cloneSize + "px";
        clone.style.left = (sourceCenterX - cloneSize/2) + "px";
        clone.style.top = (sourceCenterY - cloneSize/2) + "px";
        clone.style.setProperty("--dx", dx + "px");
        clone.style.setProperty("--dy", dy + "px");
        clone.style.setProperty(
            "--pearl-travel-duration",
            MERMAID_PEARL_ZAP_MS + "ms"
        );

        this.pearlFxLayer.appendChild(clone);
        this.activePearlClones.push(clone);

        audioManager.playMermaidPearlZap();

        const travelTimeout = setTimeout(()=>{

            if(clone.parentElement){

                clone.parentElement.removeChild(clone);

            }

            const cloneIndex =
                this.activePearlClones.indexOf(clone);

            if(cloneIndex!==-1){

                this.activePearlClones.splice(cloneIndex, 1);

            }

            targetEl.classList.add("pearl-fx-impact");
            this.activePearlImpactElements.push(targetEl);

            const impactTimeout = setTimeout(()=>{

                targetEl.classList.remove("pearl-fx-impact");

                const impactIndex =
                    this.activePearlImpactElements.indexOf(targetEl);

                if(impactIndex!==-1){

                    this.activePearlImpactElements.splice(impactIndex, 1);

                }

            }, PEARL_IMPACT_MS);

            this.pearlTimeouts.push(impactTimeout);

            if(onArrive){

                onArrive();

            }

        }, MERMAID_PEARL_ZAP_MS);

        this.pearlTimeouts.push(travelTimeout);

    }

    /* ======================================
       PRESENT FEATURE TRANSITION (Milestone - Free Spins)
       Generic, reusable "gradually fill the screen with a glow,
       then remove it" transition (see .feature-transition-glow in
       ui.css) - not tied to Free Spins specifically, so the same
       call can drive Pick Bonus's/Lucky Wheel's own transition
       later without duplicating this method. Reuses the existing
       #effects-layer (already the topmost in-game layer) - no new
       DOM structure. onMidpoint() fires at the glow's peak
       coverage (half the total duration) - the intended hook for
       swapping a feature's background underneath it, so the swap
       is masked rather than popping instantly; onComplete() fires
       once the glow has fully faded back out.
    ====================================== */

    presentFeatureTransition(onMidpoint, onComplete){

        if(!this.effectsLayer){

            if(onMidpoint){ onMidpoint(); }
            if(onComplete){ onComplete(); }

            return;

        }

        const glow =
            document.createElement("div");

        glow.className = "feature-transition-glow";

        this.effectsLayer.appendChild(glow);

        audioManager.playFeatureTransition();

        setTimeout(()=>{

            if(onMidpoint){ onMidpoint(); }

        }, FEATURE_TRANSITION_GLOW_MS / 2);

        setTimeout(()=>{

            if(glow.parentElement){

                glow.parentElement.removeChild(glow);

            }

            if(onComplete){ onComplete(); }

        }, FEATURE_TRANSITION_GLOW_MS);

    }

    /* ======================================
       PRESENT FEATURE INTRO POPUP (Milestone - Free Spins)
       Generic, reusable full-screen (down to the reel panel's
       bottom edge, never over the button bar - see
       .feature-intro-popup in ui.css) artwork popup, shown for
       durationMs then removed. Not tied to Free Spins specifically -
       Pick Bonus already reuses this with its own image (pb-intro.png),
       Lucky Wheel later too. Reuses the existing #effects-layer, same
       as presentFeatureTransition() above.

       Milestone - Bonus Feature intro/outro audio. FEATURE_INTRO_LOOP
       starts the instant the artwork appears and loops for as long
       as it stays visible; the instant it's removed,
       FEATURE_INTRO_END plays once instead (never both, never
       neither) - generic, so ANY Feature reusing this popup later
       gets the same audio sequence for free.

       Bug fix - shown behind the SAME dimming .feature-popup-overlay
       presentFeatureCompletionPopup() already uses for the outro
       popup, appended FIRST so plain DOM-order stacking puts the
       artwork on top of it - every Feature reusing this popup gets
       the overlay for free, no separate call needed.
    ====================================== */

    presentFeatureIntroPopup(imageSrc, durationMs, onComplete){

        if(!this.effectsLayer){

            if(onComplete){ onComplete(); }

            return;

        }

        const overlay =
            document.createElement("div");

        overlay.className = "feature-popup-overlay";

        const popup =
            document.createElement("img");

        popup.className = "feature-intro-popup";
        popup.src = imageSrc;
        popup.alt = "";

        this.effectsLayer.appendChild(overlay);
        this.effectsLayer.appendChild(popup);

        audioManager.startFeatureIntroLoop();

        setTimeout(()=>{

            audioManager.stopFeatureIntroLoop();
            audioManager.playFeatureIntroEnd();

            if(overlay.parentElement){

                overlay.parentElement.removeChild(overlay);

            }

            if(popup.parentElement){

                popup.parentElement.removeChild(popup);

            }

            if(onComplete){ onComplete(); }

        }, durationMs);

    }

    /* ======================================
       PRESENT WIN CELEBRATION POPUP (Milestone - Win Celebration
       Popups)
       Called by FeatureManager.presentWinCelebrationIfEligible() once
       a Feature's own chain has truly ended, if chainTotalWin/bet
       qualified for one of CONFIG.WIN_CELEBRATION.TIERS (config.js).
       Same overlay/full-screen-artwork/loop-then-end-SFX structure as
       presentFeatureIntroPopup() above (reuses the SAME
       .feature-popup-overlay), with two additions per explicit
       request: the win amount itself, placed into the artwork's own
       golden textbox (art already draws that box - see
       .win-celebration-amount in ui.css for the exact px placement,
       calibrated against the real bigwin.png/superwin.png/megawin.png
       art, which all three share the identical layout/box position),
       and BOTH the artwork and the amount pulsating together - done by
       applying ONE pulsate animation to their shared wrapper
       (.win-celebration-wrap) rather than two separate animation
       instances on each element, so they can never drift out of sync.
    ====================================== */

    presentWinCelebrationPopup(tier, amount, onComplete){

        if(!this.effectsLayer){

            if(onComplete){ onComplete(); }

            return;

        }

        const overlay =
            document.createElement("div");

        overlay.className = "feature-popup-overlay";

        const wrap =
            document.createElement("div");

        wrap.className = "win-celebration-wrap";

        const art =
            document.createElement("img");

        art.className = "win-celebration-art";
        art.src = tier.image;
        art.alt = "";

        const amountEl =
            document.createElement("div");

        amountEl.className = "win-celebration-amount";
        amountEl.textContent = Math.round(amount).toLocaleString();

        wrap.appendChild(art);
        wrap.appendChild(amountEl);

        this.effectsLayer.appendChild(overlay);
        this.effectsLayer.appendChild(wrap);

        audioManager.startWinCelebrationLoop(CONFIG.AUDIO.SFX[`${tier.key}_LOOP`]);

        setTimeout(()=>{

            audioManager.stopWinCelebrationLoop();
            audioManager.playWinCelebrationEnd(CONFIG.AUDIO.SFX[`${tier.key}_END`]);

            if(overlay.parentElement){

                overlay.parentElement.removeChild(overlay);

            }

            if(wrap.parentElement){

                wrap.parentElement.removeChild(wrap);

            }

            if(onComplete){ onComplete(); }

        }, CONFIG.WIN_CELEBRATION.DURATION_MS);

    }

    /* ======================================
       PRESENT FEATURE COMPLETION POPUP (Milestone - Bonus Feature
       intro/outro audio)
       Generic, reusable "FEATURE / COMPLETE" popup + backdrop overlay
       shown for a fixed FEATURE_OUTRO_POPUP_MS BEFORE a Feature's own
       outro transition begins - not tied to Free Spins specifically,
       same call will drive Pick Bonus's/Lucky Wheel's own outro
       later. Builds its OWN dedicated .feature-outro-popup (ui.css)
       rather than reusing FeatureManager's showPlaceholder() - that
       popup must stay exactly as it is for the "X / Triggered" intro
       moment (small, no overlay, no pulse), while this one is
       deliberately bigger/pulsating/backed by the SAME dimming
       .feature-popup-overlay presentFeatureIntroPopup() above also
       uses. Both appended into the SAME #effects-layer
       .feature-intro-popup already uses, overlay FIRST so the popup
       naturally paints on top of it (see ui.css's own comment on that
       stacking). #button-panel's own z-index:210 already sits above
       #effects-layer's 200, so it renders in front of this overlay
       automatically. FEATURE_OUTRO_LOOP starts the instant it appears
       and loops for the whole 2s; FEATURE_OUTRO_END plays once as
       it's removed, right as onComplete() hands off to the caller's
       own outro transition.
    ====================================== */

    presentFeatureCompletionPopup(onComplete){

        if(!this.effectsLayer){

            if(onComplete){ onComplete(); }

            return;

        }

        const overlay =
            document.createElement("div");

        overlay.className = "feature-popup-overlay";

        const popup =
            document.createElement("div");

        popup.className = "feature-outro-popup";

        const nameEl =
            document.createElement("div");

        nameEl.className = "feature-outro-popup-name";
        nameEl.textContent = "FEATURE";

        const statusEl =
            document.createElement("div");

        statusEl.className = "feature-outro-popup-status";
        statusEl.textContent = "COMPLETE";

        popup.appendChild(nameEl);
        popup.appendChild(statusEl);

        this.effectsLayer.appendChild(overlay);
        this.effectsLayer.appendChild(popup);

        audioManager.startFeatureOutroLoop();

        setTimeout(()=>{

            audioManager.stopFeatureOutroLoop();
            audioManager.playFeatureOutroEnd();

            if(overlay.parentElement){ overlay.parentElement.removeChild(overlay); }
            if(popup.parentElement){ popup.parentElement.removeChild(popup); }

            if(onComplete){ onComplete(); }

        }, FEATURE_OUTRO_POPUP_MS);

    }

    /* ======================================
       COLLECTOR UPGRADE FX
       Called by CollectorManager itself (increment()/
       scheduleAutoReset() - never by this file re-detecting a
       Pearl or recomputing a level). CollectorManager remains the
       only thing that decides progression; these three methods
       only ever consume the level/completed/reset state it hands
       them and turn that into a transform/filter pulse on the
       existing collector-art element - they never touch .src or
       any progression field themselves.
    ====================================== */

    /* Pearl-driven change (a reel that just had a Pearl land on
       it, per CollectorManager.increment()) - deferred, held here
       until playPearlTravel() above sees that reel's Pearl finish
       travelling. */
    registerPendingCollectorChange(reel, level, completed, isReset){

        this.pendingCollectorChanges[reel] =
            { level, completed, isReset: !!isReset };

    }

    /* Timer-driven auto-reset (CollectorManager.scheduleAutoReset()
       firing ~1s after a collector completed, with no new Pearl
       involved) - no Pearl is travelling to sync with, so this
       plays immediately instead of being deferred. */
    presentCollectorResetFx(reel){

        const collectorArt =
            document.getElementById(`collector-art-${reel + 1}`);

        if(!collectorArt){

            return;

        }

        this.playCollectorUpgradeFx(collectorArt, {

            level: 0,
            completed: false,
            isReset: true

        }, reel);

    }

    /* Shared by both paths above. Targets the whole .collector
       cell (not #collector-art-N itself) specifically so this
       never fights the existing .pearl-fx-impact animation - a
       different element means both can be present at once without
       one silently overriding the other's CSS `animation`
       property. `reel` is optional (both existing callers above
       now pass it) - only used to notify FeatureManager below,
       everything else about this method is unchanged. */
    playCollectorUpgradeFx(collectorArt, change, reel){

        const collectorEl =
            collectorArt.closest(".collector");

        if(!collectorEl){

            return;

        }

        let className = "collector-upgrade-fx";
        let duration = COLLECTOR_UPGRADE_FX_MS;

        if(change.isReset){

            className = "collector-reset-fx";
            duration = COLLECTOR_RESET_FX_MS;

            // The sustained max-stage glow (see below) stops the
            // instant an actual reset begins - collectorResetFx's
            // own cooler pulse takes over from here, whether this
            // reset is the auto-reset timer or a new Pearl forcing
            // an immediate one.
            collectorEl.classList.remove("collector-max-glow");

        } else if(change.completed){

            className = "collector-upgrade-fx-complete";
            duration = COLLECTOR_UPGRADE_COMPLETE_FX_MS;

        }

        // Actual progression increase only (Milestone 12.6) -
        // never for the reset path, matching this milestone's own
        // test list (0/3->1/3, 1/3->2/3, 2/3->3/3 need the SFX;
        // 3/3->0/3 is "existing reset behavior" only).
        if(!change.isReset){

            audioManager.playCollectorUpgrade();

        }

        // Mermaid state system - ONLY the genuine 2/3->3/3
        // completion step (never 0/3->1/3, 1/3->2/3, or the reset
        // path) - change.completed is only ever true once
        // collector.current has actually reached collector.max.
        if(!change.isReset && change.completed){

            mermaidStateManager.triggerState("collectorComplete");

        }

        // Feature Framework hook (Milestone - Collector -> Bonus
        // Feature Framework) - notifies FeatureManager exactly when
        // the EXISTING 2/3->3/3 completion FX/mermaid3 state above
        // actually plays for this reel, so a feature never launches
        // before the player has seen the completion happen.
        // FeatureManager itself decides (via its own pending-collector
        // bookkeeping from earlier in the same spin) whether this
        // particular reel is the one allowed to trigger this spin -
        // this call is a no-op for every other completing reel.
        if(!change.isReset && change.completed && typeof reel==="number"){

            featureManager.onCollectorCompletionPresented(reel);

        }

        collectorEl.classList.add(className);
        this.activeCollectorFxElements.push({ el: collectorEl, className });

        const timeout = setTimeout(()=>{

            collectorEl.classList.remove(className);

            const index =
                this.activeCollectorFxElements.findIndex(

                    (entry) =>
                        entry.el===collectorEl &&
                        entry.className===className

                );

            if(index!==-1){

                this.activeCollectorFxElements.splice(index, 1);

            }

            // Once the one-shot 2/3->3/3 completion burst above
            // finishes, hand off to a sustained glow for the rest
            // of CollectorManager's autoResetDelay - this collector
            // is sitting at its max stage until then. Started here
            // (never alongside the burst itself) so the two never
            // both try to animate .collector-art-wrap at once.
            // collector-reset-fx above (or clearPearlPresentation()
            // on the next spin) is what turns it back off.
            if(!change.isReset && change.completed){

                collectorEl.classList.add("collector-max-glow");

                this.activeCollectorFxElements.push(

                    { el: collectorEl, className: "collector-max-glow" }

                );

            }

        }, duration);

        this.pearlTimeouts.push(timeout);

    }

    /* ======================================
       CLEAR PRESENTATIONS
       Two independent reset methods, deliberately NOT sharing
       one timeout list or one "clear everything" call - Symbol
       Win FX/Line Win Amount and Pearl Collection FX are both
       triggered inside the same onSpinComplete() (see
       spinManager.js) but at different points, and presentWin()
       resets its own prior state every time it runs. If it reset
       Pearl Collection FX too, it would cancel/undo a pearl that
       had just started travelling moments earlier in that same
       spin (this is exactly what happened before this was split
       out - presentWin() ran after presentPearlCollectionFx()
       and immediately wiped the pearl clone it had just created).
       clearWinEffects() below remains the single "clear
       everything" entry point spinManager.js's spin() already
       calls at the start of every new spin - it just delegates
       to both of these rather than owning the logic itself.
    ====================================== */

    clearSymbolFx(){

        this.activeSymbolElements.forEach((el)=>{

            el.classList.remove("symbol-win-fx");

        });

        this.activeSymbolElements = [];

    }

    clearWinPresentation(){

        this.winTimeouts.forEach((timeout)=>{

            clearTimeout(timeout);

        });

        this.winTimeouts = [];

        this.clearSymbolFx();

        document.querySelectorAll(".line-win-amount")
            .forEach((el)=>el.remove());

        document.querySelectorAll(".payline-overlay")
            .forEach((el)=>el.remove());

    }

    clearPearlPresentation(){

        this.pearlTimeouts.forEach((timeout)=>{

            clearTimeout(timeout);

        });

        this.pearlTimeouts = [];

        this.activePearlHighlightElements.forEach((el)=>{

            el.classList.remove("pearl-fx-highlight");

        });

        this.activePearlHighlightElements = [];

        this.activePearlImpactElements.forEach((el)=>{

            el.classList.remove("pearl-fx-impact");

        });

        this.activePearlImpactElements = [];

        this.activePearlClones.forEach((clone)=>{

            if(clone.parentElement){

                clone.parentElement.removeChild(clone);

            }

        });

        this.activePearlClones = [];

        this.activeCollectorFxElements.forEach(({ el, className })=>{

            el.classList.remove(className);

        });

        this.activeCollectorFxElements = [];

        this.pendingCollectorChanges = {};

    }

    clearWinEffects(){

        this.clearWinPresentation();

        this.clearPearlPresentation();

    }

}

window.animationManager = new AnimationManager();
