/* ==========================================
   LUCKY WHEEL FEATURE
   Pearl of Fortune

   Milestone - Lucky Wheel.

   Owns the Lucky Wheel flow end-to-end once FeatureManager routes a
   completed Collector 1 (Reel 1) here (see FeatureManager.
   triggerFeature()) - FeatureManager stays the single entry/exit
   point (lockSpin()/finishActiveFeature()), this never touches
   CollectorManager's progression fields directly except through its
   own existing reset()/updateCollectorArt() (the same pair every
   other feature's own completion already uses).

   Unlike Wild Respin/Free Spins, this feature never spins a reel
   itself - there is no automatic spin loop, matching Pick Bonus. The
   whole feature is a single self-contained sequence: intro transition
   -> the 3 wheels spin in a staggered cascade (Bronze starts, then
   Silver while Bronze is still spinning, then Golden while both still
   are - see LW_WHEEL_START_STAGGER_MS/beginSpinSequence() below) ->
   reward resolution (Cash ->
   Multiplier -> Jackpot, zapped to Total Win one at a time, same as
   Pick Bonus) -> outro. Two different endings: normally, the outro is
   the SAME "FEATURE / COMPLETE" popup + transition back to the Base
   Game every other feature uses (finishEndFeature() below); if Golden
   landed on a BONUS result (FREE SPIN/PICK BONUS) instead, per
   explicit request there is NO "FEATURE / COMPLETE" popup and NO
   intermediate Base Game frame - it shows that OTHER feature's own
   "Triggered" popup and goes straight into its own intro transition
   via FeatureManager.triggerFeature(), the exact same real entry
   point a genuine Collector completion already uses
   (finishEndFeatureChained() below). Reuses the SAME AnimationManager.
   presentFeatureTransition()/presentFeatureIntroPopup()/
   presentFeatureCompletionPopup() intro/outro architecture Free
   Spins/Pick Bonus already established, and the SAME .bubble-zap-trail
   travel technique Pick Bonus already established for sending a
   revealed value to Total Win - neither is duplicated here.
========================================== */

// The 3 wheels, each with exactly 8 segments, in the EXACT clockwise
// order specified - never randomized, never rearranged. `type` drives
// both the upgrade rules (see getXUpgrade() below) and the resolution
// category (CASH/MULTIPLIER/JACKPOT/BONUS/EMPTY).
const LW_WHEEL_KEYS = ["BRONZE", "SILVER", "GOLDEN"];

const LW_BRONZE_SEGMENTS = [

    { type:"CASH", value:400,  label:"400"  },
    { type:"CASH", value:2000, label:"2000" },
    { type:"CASH", value:5000, label:"5000" },
    { type:"CASH", value:200,  label:"200"  },
    { type:"CASH", value:1000, label:"1000" },
    { type:"CASH", value:600,  label:"600"  },
    { type:"CASH", value:2500, label:"2500" },
    { type:"CASH", value:5000, label:"5000" }

];

const LW_SILVER_SEGMENTS = [

    { type:"MULTIPLIER", value:2,       label:"2x"    },
    { type:"JACKPOT",    value:"MINI",  label:"MINI"  },
    { type:"MULTIPLIER", value:5,       label:"5x"    },
    { type:"MULTIPLIER", value:15,      label:"15x"   },
    { type:"MULTIPLIER", value:8,       label:"8x"    },
    { type:"JACKPOT",    value:"MINOR", label:"MINOR" },
    { type:"MULTIPLIER", value:10,      label:"10x"   },
    { type:"MULTIPLIER", value:20,      label:"20x"   }

];

// value on a BONUS segment is one of FEATURE_TYPE's own short keys
// ("FREE_SPINS"/"PICK_BONUS") - resolved back to the real feature via
// FEATURE_TYPE[value] in finishEndFeature() below, never a second
// feature-name mapping.
const LW_GOLDEN_SEGMENTS = [

    { type:"JACKPOT", value:"MAJOR",      label:"MAJOR"      },
    { type:"EMPTY",   value:null,         label:"EMPTY"      },
    { type:"BONUS",   value:"FREE_SPINS", label:"FREE SPIN"  },
    { type:"EMPTY",   value:null,         label:"EMPTY"      },
    { type:"JACKPOT", value:"GRAND",      label:"GRAND"      },
    { type:"EMPTY",   value:null,         label:"EMPTY"      },
    { type:"BONUS",   value:"PICK_BONUS", label:"PICK BONUS" },
    { type:"EMPTY",   value:null,         label:"EMPTY"      }

];

const LW_SEGMENT_COUNT = 8;
const LW_SEGMENT_ANGLE = 360 / LW_SEGMENT_COUNT;

// The FIXED screen angle (clockwise from top/12 o'clock, same
// convention every segment's own center angle uses below) each
// wheel's own pointer sits at - see the CLIPPING/POSITIONING comment
// on #lucky-wheel-panel in ui.css for the geometry this is derived
// from (Bronze's pointer sits at its clip box's own RIGHT edge = the
// wheel's 3 o'clock/90 deg point, Silver's LEFT edge = 9 o'clock/270
// deg, Golden's TOP edge = 12 o'clock/0 deg).
const LW_POINTER_ANGLE = { BRONZE:90, SILVER:270, GOLDEN:0 };

// Per-wheel calibration offset (deg) - ONLY needed if the real
// artwork's own segment 0 doesn't start exactly at the top once it's
// dropped in (assets/luckywheel/*.png, still placeholders/missing
// today). Re-tune these three values then, nothing else needs to
// change - every other angle in this file is computed relative to
// this offset.
const LW_SEGMENT_ANGLE_OFFSET = { BRONZE:0, SILVER:0, GOLDEN:0 };

// Segment label text starts this many px OUT from the wheel's own
// true center (a visible gap over the hub, per explicit request) and
// extends further outward from there, along the segment's own spoke -
// never centered ON a radius. Text is NOT counter-rotated - it tilts
// to match its own segment's angle and turns WITH the wheel as it
// spins, exactly like a number printed on the wheel's own face.
//
// Calibrated against the real assets/luckywheel/*.png art (all 3
// share the same underlying model/proportions) - pixel-sampled the
// actual hub's own outer metal ring, which sits at ~31% of the
// wheel's own outer radius, i.e. ~99px of this wheel's own 320px
// radius (LW_WHEEL_DIAMETER/2 below); 140 clears that with a visible
// margin while staying well inside the rope-border ring (~86% of the
// radius, ~273px) that frames the open wood-colored face. Re-measure
// the same way if the art is ever replaced with a differently-
// proportioned wheel.
const LW_LABEL_GAP = 140;

// Exact px gap between the 2 stacked lines of a multi-word label
// ("FREE SPIN"/"PICK BONUS" - see buildSegmentLabels() below), per
// explicit request - applied as a plain margin-top on the second line
// (.lw-segment-label-line, ui.css) rather than an approximated
// line-height, so it's the same regardless of the font's own metrics.
const LW_LABEL_LINE_GAP = 2;

// Fixed extra rotation (deg, CSS convention - positive=clockwise,
// negative=counter-clockwise) baked into every label on top of its
// own spoke tilt - a pure text-orientation tweak, per-wheel and
// independently tunable. All 3 started at -90 (90deg counter-
// clockwise, per explicit request); Silver was then additionally
// rotated 180deg clockwise on top of that (-90 + 180 = 90), per a
// later explicit request scoped to Silver only - Bronze/Golden left
// untouched at -90.
const LW_LABEL_ROTATION_OFFSET = { BRONZE:-90, SILVER:90, GOLDEN:-90 };

const LW_WHEEL_DIAMETER = 640;

// Spin timings (ms) - a single eased CSS transition per spin (fast
// start, long gradual slowdown, natural stop) rather than a manual
// frame-by-frame physics loop; LW_SPIN_SETTLE_MS is just a small
// buffer added on top of the transition's own duration before the
// result is treated as fully landed. Per explicit request, 40% longer
// than the original 3600 (3600*1.4=5040).
const LW_SPIN_DURATION_MS = 5040;
const LW_SPIN_EASING = "cubic-bezier(.12,.72,.15,1)";
const LW_SPIN_SETTLE_MS = 120;
const LW_SPIN_MIN_EXTRA_TURNS = 5;
const LW_SPIN_MAX_EXTRA_TURNS = 7;

// Per explicit request - the 3 wheels no longer all start spinning at
// the exact same instant. Bronze starts first; Silver starts this
// many ms later, WHILE Bronze is still spinning; Golden starts
// another interval after that, while BOTH Bronze and Silver are still
// spinning (LW_SPIN_DURATION_MS above is comfortably longer than
// 2*LW_WHEEL_START_STAGGER_MS, so this always holds) - see
// beginSpinSequence() below.
const LW_WHEEL_START_STAGGER_MS = 500;

// Mermaid's Blessing nudge - a SHORTER, gentler eased transition than
// the main spin above, so it visibly reads as a small correction
// rather than another full spin.
const LW_NUDGE_DURATION_MS = 900;
const LW_NUDGE_EASING = "cubic-bezier(.34,1.15,.64,1)";

// Mermaid's Blessing - per explicit request, reuses the SAME full
// announcement PickBonusFeature/BubbleBonusFeature already established
// (the "Mermaid's Blessings" .bubble-bonus-intro-popup + looping audio
// startMermaidBlessingLoop()/stopMermaidBlessingLoop()), rather than
// WildRespinFeature's lighter one-shot version this used before. How
// long that popup stays up before the Pearl actually zaps - matches
// PICK_BONUS_BLESSING_POPUP_MS's own identical value in
// pickBonusFeature.js.
const LW_BLESSING_POPUP_MS = 2000;

// Bug fix - the Pearl zap needs to start from the actual pearl the
// Mermaid is holding in assets/mermaid/mermaid-blessing.png (shown for
// the whole Blessing sequence, via holdState("mermaidsBlessing")), not
// #mermaid-art's own bounding-box CENTER - same calibration
// PickBonusFeature.getBlessingPearlSourcePoint() already established
// against that exact asset (see its own comment there for the full
// reasoning); duplicated here (not imported/shared) per this project's
// existing convention of each feature file staying fully self-
// contained.
const LW_BLESSING_PEARL_X_FRAC = 0.785;
const LW_BLESSING_PEARL_Y_FRAC = 0.13;

// Resolution zap timings (ms) - same technique/pacing PickBonusFeature
// already established (launchResolutionZap()/applyResolutionReward()).
const LW_ZAP_MS = 480;
const LW_RESOLUTION_GAP_MS = 250;
const LW_METER_IMPACT_MS = 300;

// How long the landed segment's own label glows/scales up (1.5x, see
// .lw-winner in ui.css) before it actually zaps off to Total Win, per
// explicit request ("apply a glow effect and increase its size by
// 1.5x before banging it up to the win counter").
const LW_PRIZE_HIGHLIGHT_MS = 500;

// Intro/trigger popup timings (ms) - same pattern Free Spins/Pick
// Bonus already established.
const LUCKY_WHEEL_TRIGGER_POPUP_MS = 1200;
const LUCKY_WHEEL_INTRO_POPUP_SRC = "assets/popups/lw-intro.png";
const LUCKY_WHEEL_INTRO_POPUP_MS = 3000;

// Golden-Wheel-chained hand-off (finishEndFeatureChained() below) -
// per explicit request, the correct sequence is: show the target
// feature's OWN "Triggered" popup (Lucky Wheel's own wheels still
// visible behind it, exactly like a genuine fresh trigger leaves the
// Base Game's Reel Panel visible under that same popup) -> that
// feature's own transition glow covers the whole screen -> ONLY THEN,
// masked by the glow's peak coverage, do Lucky Wheel's own wheels
// actually disappear -> glow fades, revealing that feature's own UI ->
// its own intro popup -> gameplay continues. FreeSpinsFeature/
// PickBonusFeature already run exactly that popup->transition->intro
// sequence themselves the instant FeatureManager.triggerFeature()
// calls their own start() - this constant is simply WHEN their own
// transition glow reaches its own peak coverage (their own trigger
// popup's fixed 1200ms - the SAME value every feature's own
// _TRIGGER_POPUP_MS constant already uses - plus
// FEATURE_TRANSITION_GLOW_MS/2, animationManager.js's own shared
// glow-midpoint timing), computed here rather than hooked into
// directly since neither of those other feature files is ever
// modified.
const LW_CHAIN_HANDOFF_DELAY_MS = LUCKY_WHEEL_TRIGGER_POPUP_MS + FEATURE_TRANSITION_GLOW_MS/2;

class LuckyWheelFeature{

    constructor(){

        this.active = false;
        this.locked = false;

        this.collectorIndex = null;

        // { BRONZE, SILVER, GOLDEN } -> current cumulative rotation
        // (deg) applied to that wheel's own .lw-wheel-rotate element -
        // NEVER reset to 0 mid-spin-sequence (always increases), so a
        // new spin/nudge always visibly continues forward from where
        // the wheel currently sits rather than snapping backward.
        this.wheelRotations = { BRONZE:0, SILVER:0, GOLDEN:0 };

        // { BRONZE, SILVER, GOLDEN } -> the final landed segment
        // object for that wheel this session, or null before it spins.
        this.results = { BRONZE:null, SILVER:null, GOLDEN:null };

        // { BRONZE, SILVER, GOLDEN } -> the 0-7 segment index each
        // wheel actually landed/settled on (set in onSpinLanded()/
        // playBlessingNudge() below) - lets launchResolutionZap() find
        // that EXACT label element for the prize-triggered highlight.
        this.landedIndex = { BRONZE:null, SILVER:null, GOLDEN:null };

        // Reward storage (same pattern PickBonusFeature already
        // established) - only actually-landed segments ever push an
        // entry here. Each entry also carries its own wheelKey, so
        // the eventual resolution zap knows which wheel's own pointer
        // to visually launch from.
        this.revealedCashValues = [];
        this.revealedMultipliers = [];
        this.revealedJackpots = [];

        // Set if the Golden Wheel lands on (or is Blessed into) a
        // BONUS segment - "FREE_SPINS" or "PICK_BONUS" (FEATURE_TYPE's
        // own short keys). Consumed by finishEndFeature() below, which
        // chains into the REAL feature via the existing feature queue -
        // never a second Free Spins/Pick Bonus implementation.
        this.triggeredBonusFeature = null;

        // Same armed/used/target pattern as every other feature's own
        // Mermaid's Blessing (see maybeTriggerBlessing-equivalent
        // logic in onSpinLanded() below) - rolled once per session,
        // fires at most once, targeting exactly one of the 3 wheels
        // (chosen uniformly at random up front).
        this.blessingArmed = false;
        this.blessingUsed = false;
        this.blessingTargetWheel = null;

        // Milestone - Pick Bonus/Lucky Wheel resolution rework.
        // featureManager.chainTotalWin's own value the instant THIS
        // resolution phase began (see finishSpinSequence() below) -
        // the #you-won-box (index.html/ui.css) only ever displays the
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

        this.buildAllSegmentLabels();
        this.attachAssetFallbacks();
        this.preloadAssets();

        console.log("Lucky Wheel Feature Initialized");

    }

    /* ======================================
       PRELOAD ASSETS
       Matches PickBonusFeature/FreeSpinsFeature's own established
       pattern - warms the intro popup's decode at boot, off the
       critical path of any real trigger.
    ====================================== */

    preloadAssets(){

        const introPopup =
            new Image();

        introPopup.src = LUCKY_WHEEL_INTRO_POPUP_SRC;

    }

    /* ======================================
       ATTACH ASSET FALLBACKS
       assets/luckywheel/bronze-wheel.png/silver-wheel.png/
       gold-wheel.png are placeholders the user will drop in later
       (per explicit instruction, exact filenames, never renamed) - a
       missing file quietly hides just that <img> instead of a
       broken-image icon, the same graceful-fallback pattern used
       throughout this project (mermaidStateManager.js/
       pickBonusFeature.js's own creature art).
    ====================================== */

    attachAssetFallbacks(){

        LW_WHEEL_KEYS.forEach((wheelKey)=>{

            const img =
                document.querySelector(`#lw-wheel-${wheelKey.toLowerCase()} .lw-wheel-img`);

            if(img){

                img.addEventListener("error", () => {

                    img.style.visibility = "hidden";

                });

            }

        });

    }

    /* ======================================
       BUILD ALL SEGMENT LABELS
       The user supplies COMPLETE wheel artwork with EMPTY prize
       segments - this places the actual prize text into those
       segments via DOM overlays (never a second wheel image, never
       half-wheel PNGs). Built ONCE here, into the existing static
       #lw-wheel-*-segments containers (index.html) - ROTATE together
       with the wheel since they're children of the SAME
       .lw-wheel-rotate element the spin animation itself transforms,
       so they never need repositioning per spin, only built once.
    ====================================== */

    buildAllSegmentLabels(){

        LW_WHEEL_KEYS.forEach((wheelKey)=>{

            this.buildSegmentLabels(wheelKey);

        });

    }

    buildSegmentLabels(wheelKey){

        const container =
            document.getElementById(`lw-wheel-${wheelKey.toLowerCase()}-segments`);

        if(!container){

            return;

        }

        container.innerHTML = "";

        const segments =
            this.getWheelSegments(wheelKey);

        segments.forEach((segment, index)=>{

            const angle =
                this.segmentCenterAngle(wheelKey, index);

            // The SPOKE - a 0-size anchor point exactly at the
            // wheel's own true center, rotated to this segment's own
            // angle. STATIC - built once, never touched again; it
            // already inherits the wheel's own live rotation for free
            // just by living inside .lw-wheel-rotate (see
            // .lw-wheel-segments in ui.css), so the text below turns
            // WITH the wheel as it spins rather than staying upright.
            const position =
                document.createElement("div");

            position.className = "lw-segment-position";

            position.style.transform = `rotate(${angle}deg)`;

            // The LANDING GLOW - a soft blurred highlight over this
            // segment's own wedge, hidden (opacity:0) until
            // finalizeWheelResult() below adds .lw-active to the
            // matching one the instant the wheel actually settles on
            // it, per explicit request ("when a wheel stops, add a
            // glow around the wheel segment which has been chosen for
            // the win"). Appended BEFORE the label, so plain DOM order
            // keeps it visually behind the text.
            const glow =
                document.createElement("div");

            glow.className = "lw-segment-glow";

            glow.style.transform =
                `translate(-50%, -50%) translateY(-${LW_LABEL_GAP + 90}px)`;

            position.appendChild(glow);

            // The TEXT - still no counter-rotation (per the earlier
            // request, it must never stay screen-relative) - its tilt
            // still comes entirely from the spoke above, PLUS a fixed
            // per-wheel extra rotation (LW_LABEL_ROTATION_OFFSET) baked
            // into every label on that wheel the same way, purely a
            // text-orientation tweak that never touches its own anchor
            // position. translate(-50%,-100%) anchors the label's own
            // BOTTOM edge exactly at the wheel's true center, then
            // translateY(-LW_LABEL_GAP) pushes it further out along
            // that same spoke (leaving a clear visible gap over the
            // hub before the text itself starts) - the trailing
            // rotate() is applied LAST, spinning the already-
            // positioned label around its own center only.
            const label =
                document.createElement("div");

            label.className =
                `lw-segment-label ${segment.type.toLowerCase()}`;

            label.style.transform =
                `translate(-50%, -100%) translateY(-${LW_LABEL_GAP}px) rotate(${LW_LABEL_ROTATION_OFFSET[wheelKey]}deg)`;

            // The actual glyphs live in their own nested span (see
            // .lw-segment-label-text in ui.css) - the only thing a
            // win highlight (launchResolutionZap() below) ever scales/
            // glows, so the label's own position-critical transform
            // above is never touched by that effect. Per explicit
            // request, the two multi-word labels ("FREE SPIN"/"PICK
            // BONUS") split across 2 lines instead of one, each its
            // own block-level .lw-segment-label-line (ui.css - a
            // precise, font-metric-independent LW_LABEL_LINE_GAP px
            // margin between them, rather than approximating a gap via
            // line-height) - any label containing a space splits
            // there, every other (single-word) label is untouched.
            const textEl =
                document.createElement("span");

            textEl.className = "lw-segment-label-text";

            const words =
                segment.label.split(" ");

            words.forEach((word)=>{

                const lineEl =
                    document.createElement("span");

                lineEl.className = "lw-segment-label-line";
                lineEl.textContent = word;

                textEl.appendChild(lineEl);

            });

            label.appendChild(textEl);

            position.appendChild(label);
            container.appendChild(position);

        });

    }

    /* ======================================
       GEOMETRY HELPERS
    ====================================== */

    getWheelSegments(wheelKey){

        if(wheelKey==="BRONZE"){ return LW_BRONZE_SEGMENTS; }
        if(wheelKey==="SILVER"){ return LW_SILVER_SEGMENTS; }

        return LW_GOLDEN_SEGMENTS;

    }

    segmentCenterAngle(wheelKey, index){

        return (index * LW_SEGMENT_ANGLE + LW_SEGMENT_ANGLE_OFFSET[wheelKey]) % 360;

    }

    /* Smallest FORWARD (always positive) rotation, in degrees, that
       lands segment `index` under wheelKey's own fixed pointer angle,
       given the wheel's CURRENT cumulative rotation - the wheel only
       ever spins forward, never backward/resets, matching a real
       ship wheel. extraTurns adds whole 360deg laps on top for the
       "spin" feel (0 for a quiet Blessing nudge). */
    computeRotationForSegment(wheelKey, currentRotation, index, extraTurns){

        const targetResting =
            (((LW_POINTER_ANGLE[wheelKey] - this.segmentCenterAngle(wheelKey, index)) % 360) + 360) % 360;

        const currentNormalized =
            ((currentRotation % 360) + 360) % 360;

        let deltaForward =
            targetResting - currentNormalized;

        if(deltaForward <= 0){

            deltaForward += 360;

        }

        return currentRotation + extraTurns*360 + deltaForward;

    }

    applyWheelRotation(wheelKey, rotationDeg, durationMs, easing){

        const el =
            document.getElementById(`lw-wheel-${wheelKey.toLowerCase()}-rotate`);

        if(!el){

            return;

        }

        el.style.transition = `transform ${durationMs}ms ${easing}`;
        el.style.transform = `rotate(${rotationDeg}deg)`;

    }

    /* ======================================
       START
       Called by FeatureManager.triggerFeature() the instant Reel 1's
       Collector completion FX has already played.
    ====================================== */

    start(mapping, collectorIndex){

        this.active = true;
        this.locked = true;

        this.collectorIndex = collectorIndex;

        this.results = { BRONZE:null, SILVER:null, GOLDEN:null };

        this.revealedCashValues = [];
        this.revealedMultipliers = [];
        this.revealedJackpots = [];

        this.triggeredBonusFeature = null;

        this.blessingArmed = shouldTriggerLuckyWheelBlessing();
        this.blessingUsed = false;

        this.blessingTargetWheel = this.blessingArmed ?
            LW_WHEEL_KEYS[Math.floor(Math.random() * LW_WHEEL_KEYS.length)] :
            null;

        featureManager.lockSpin(FEATURE_STATE.BONUS_ACTIVE);

        // "Lucky Wheel / Triggered" popup - matches WildRespinFeature/
        // FreeSpinsFeature/PickBonusFeature's own identical pattern.
        const label =
            FEATURE_LABEL[mapping.feature] || mapping.feature;

        featureManager.showPlaceholder(label);

        setTimeout(()=>{

            featureManager.hidePlaceholder();

            this.beginIntroTransition();

        }, LUCKY_WHEEL_TRIGGER_POPUP_MS);

    }

    /* ======================================
       BEGIN INTRO TRANSITION
       Reuses the existing shared feature-transition glow - the Reel
       Panel/Collector Panel hide and the wheels reset to their idle
       (0deg) rotation at the glow's own midpoint (masked by its peak
       coverage), exactly like Free Spins'/Pick Bonus' own scene swap.
       The Mermaid area itself is NEVER touched here - it is already
       the correct universal 750x1260 box (see #mermaid-panel in
       ui.css), per explicit instruction not to extend/resize/
       reposition it again.
    ====================================== */

    beginIntroTransition(){

        animationManager.presentFeatureTransition(

            () => {

                this.setSceneActive(true);
                this.resetWheels();

                // Bug fix - Free Spins "Spins Left" counter. Same
                // takeover treatment PickBonusFeature already
                // established - Lucky Wheel also fully takes over the
                // scene (Reel/Collector Panels hidden), so the counter
                // has nowhere sensible to show during it either.
                if(featureManager.pausedController===freeSpinsFeature){

                    freeSpinsFeature.setCounterTakeoverHidden(true);

                }

                // Bug fix - Total Win only resets to blank on a fresh
                // top-level trigger, never when Lucky Wheel is
                // interrupting an already-active/paused session (same
                // guard every other feature's own start()/
                // beginIntroTransition() already uses).
                if(!featureManager.pausedController){

                    featureManager.chainTotalWin = 0;

                    winManager.reset();

                }

                // Milestone - Feature Win Caps. Nothing ever chains
                // directly INTO Lucky Wheel (only Lucky Wheel itself
                // chains OUT, via the Golden Wheel - see
                // finishEndFeatureChained() below), so this only ever
                // needs to defer to Free Spins if Lucky Wheel is
                // interrupting an already-active/paused session - same
                // condition as the reset guard just above. A no-op in
                // that case; otherwise Lucky Wheel claims the chain
                // for itself, including whatever it later chains into.
                featureManager.claimCapOwnership(FEATURE_TYPE.LUCKY_WHEEL);

            },

            () => {

                animationManager.presentFeatureIntroPopup(

                    LUCKY_WHEEL_INTRO_POPUP_SRC,
                    LUCKY_WHEEL_INTRO_POPUP_MS,

                    () => {

                        this.beginSpinSequence();

                    }

                );

            }

        );

    }

    /* ======================================
       SET SCENE ACTIVE
       Hides (never destroys) the Reel Panel/Collector Panel and
       shows/hides the Lucky Wheel panel itself - all via CSS classes
       only (see ui.css), never inline layout values, so
       #collector-panel's own top:800px is never touched. The Mermaid
       stays visible throughout (per explicit instruction) - this
       never toggles anything on #mermaid-panel.
    ====================================== */

    setSceneActive(active){

        const reelPanel =
            document.getElementById("reel-panel");

        const collectorPanel =
            document.getElementById("collector-panel");

        const panel =
            document.getElementById("lucky-wheel-panel");

        if(reelPanel){

            reelPanel.classList.toggle("lucky-wheel-hidden", active);

        }

        if(collectorPanel){

            collectorPanel.classList.toggle("lucky-wheel-hidden", active);

        }

        if(panel){

            panel.classList.toggle("active", active);

        }

    }

    /* ======================================
       RESET WHEELS
       Instantly (no transition) returns every wheel to its own 0deg
       resting rotation for a fresh session - never carries over a
       previous session's stopping angle.
    ====================================== */

    resetWheels(){

        this.wheelRotations = { BRONZE:0, SILVER:0, GOLDEN:0 };

        LW_WHEEL_KEYS.forEach((wheelKey)=>{

            const el =
                document.getElementById(`lw-wheel-${wheelKey.toLowerCase()}-rotate`);

            if(el){

                el.style.transition = "none";
                el.style.transform = "rotate(0deg)";

            }

            // Defensive reset - a fresh session never starts with a
            // leftover landing glow from a previous one.
            const segmentsContainer =
                document.getElementById(`lw-wheel-${wheelKey.toLowerCase()}-segments`);

            if(segmentsContainer){

                segmentsContainer.querySelectorAll(".lw-segment-glow.lw-active").forEach((el2)=>{

                    el2.classList.remove("lw-active");

                });

            }

        });

    }

    /* ======================================
       BEGIN SPIN SEQUENCE
       Staggered start, per explicit request - Bronze starts spinning
       first; Silver starts LW_WHEEL_START_STAGGER_MS later, WHILE
       Bronze is still spinning; Golden starts another
       LW_WHEEL_START_STAGGER_MS after that, while BOTH Bronze and
       Silver are still spinning. Every wheel still shares the same
       fixed LW_SPIN_DURATION_MS transition time (extraTurns only
       changes how many degrees it covers in that same time, never the
       duration itself), so they land in the SAME staggered order they
       started in, each LW_WHEEL_START_STAGGER_MS apart.
       finishSpinSequence() only runs once every wheel has reported
       back landed - order they happen to land in (a Blessing nudge on
       one can push it slightly later) never matters, only that all 3
       are in. Reward RESOLUTION still runs afterward in the required
       Cash -> Multiplier -> Jackpot order regardless of which wheel
       produced which reward - see buildResolutionQueue() below, which
       groups by category, not by spin order.
    ====================================== */

    beginSpinSequence(){

        let remaining =
            LW_WHEEL_KEYS.length;

        const onWheelDone = () => {

            remaining -= 1;

            if(remaining<=0){

                this.finishSpinSequence();

            }

        };

        LW_WHEEL_KEYS.forEach((wheelKey, i)=>{

            setTimeout(()=>{

                this.spinWheel(wheelKey, onWheelDone);

            }, i * LW_WHEEL_START_STAGGER_MS);

        });

    }

    /* ======================================
       SPIN WHEEL
       The logical reward is selected FIRST (targetIndex, a plain
       uniform 0-7 roll), THEN the rotation required to land exactly
       that segment under the pointer is computed and animated - the
       visual result and the logical result can never mismatch,
       because the visual rotation is derived FROM the already-chosen
       logical index, never the other way around.
    ====================================== */

    spinWheel(wheelKey, onDone){

        const targetIndex =
            Math.floor(Math.random() * LW_SEGMENT_COUNT);

        const extraTurns =
            LW_SPIN_MIN_EXTRA_TURNS + Math.floor(
                Math.random() * (LW_SPIN_MAX_EXTRA_TURNS - LW_SPIN_MIN_EXTRA_TURNS + 1)
            );

        const newRotation =
            this.computeRotationForSegment(wheelKey, this.wheelRotations[wheelKey], targetIndex, extraTurns);

        this.applyWheelRotation(wheelKey, newRotation, LW_SPIN_DURATION_MS, LW_SPIN_EASING);

        this.wheelRotations[wheelKey] = newRotation;

        setTimeout(()=>{

            // Landing "ding" - reuses the existing Collector Upgrade
            // SFX, same reveal cue PickBonusFeature's own cell reveals
            // already use, no new asset needed.
            audioManager.playCollectorUpgrade();

            this.onSpinLanded(wheelKey, targetIndex, onDone);

        }, LW_SPIN_DURATION_MS + LW_SPIN_SETTLE_MS);

    }

    /* ======================================
       ON SPIN LANDED
       Checked exactly once per wheel, right as its own spin lands -
       if THIS wheel is the pre-armed Blessing's own target (chosen
       once, in start(), before any wheel had even spun), attempt an
       upgrade; otherwise (or if no upgrade is actually possible for
       this exact result - see getBlessingUpgrade() below) the result
       stands as landed.
    ====================================== */

    onSpinLanded(wheelKey, index, onDone){

        const segment =
            this.getWheelSegments(wheelKey)[index];

        const shouldAttemptBlessing =
            this.blessingArmed &&
            !this.blessingUsed &&
            this.blessingTargetWheel===wheelKey;

        if(shouldAttemptBlessing){

            const upgraded =
                this.getBlessingUpgrade(wheelKey, segment);

            if(upgraded){

                this.blessingUsed = true;

                this.playBlessingNudge(wheelKey, upgraded, (landedAt) => {

                    this.landedIndex[wheelKey] = landedAt;

                    this.finalizeWheelResult(wheelKey, upgraded);

                    onDone();

                });

                return;

            }

        }

        this.landedIndex[wheelKey] = index;

        this.finalizeWheelResult(wheelKey, segment);

        onDone();

    }

    /* ======================================
       FINALIZE WHEEL RESULT
       Stores the (possibly Blessing-upgraded) landed segment into
       reward storage - only CASH/MULTIPLIER/JACKPOT ever get queued
       for the later Total Win resolution (see buildResolutionQueue()
       below); BONUS is stored separately (chained AFTER resolution,
       see finishEndFeature()); EMPTY awards nothing.
    ====================================== */

    finalizeWheelResult(wheelKey, segment){

        this.results[wheelKey] = segment;

        const index =
            this.landedIndex[wheelKey];

        this.activateSegmentGlow(wheelKey, index);

        if(segment.type==="CASH"){

            this.revealedCashValues.push({ wheelKey, index, value:segment.value, label:segment.label });

        } else if(segment.type==="MULTIPLIER"){

            this.revealedMultipliers.push({ wheelKey, index, value:segment.value, label:segment.label });

        } else if(segment.type==="JACKPOT"){

            this.revealedJackpots.push({ wheelKey, index, value:segment.value, label:segment.label });

        } else if(segment.type==="BONUS"){

            this.triggeredBonusFeature = segment.value;

        }

    }

    /* ======================================
       ACTIVATE SEGMENT GLOW
       Clears any previously-glowing segment on this SAME wheel first
       (matters for a Blessing nudge - the wheel's natural landing
       glows first, then the nudge moves it to a different segment,
       which should glow instead, never both at once), then fades in
       the landed index's own .lw-segment-glow (ui.css).
    ====================================== */

    activateSegmentGlow(wheelKey, index){

        const container =
            document.getElementById(`lw-wheel-${wheelKey.toLowerCase()}-segments`);

        if(!container){

            return;

        }

        container.querySelectorAll(".lw-segment-glow.lw-active").forEach((el)=>{

            el.classList.remove("lw-active");

        });

        const glowEl =
            container.querySelectorAll(".lw-segment-glow")[index];

        if(glowEl){

            glowEl.classList.add("lw-active");

        }

    }

    /* ======================================
       GET BLESSING UPGRADE
       The Mermaid may ONLY upgrade the existing reward WITHIN its own
       category (never Cash->Multiplier, Multiplier->Jackpot, etc.) -
       per this milestone's own explicit rule. Returns null (no
       upgrade applied) if the landed segment is already the best
       possible result in its own category. Dispatches per wheel since
       each has its own distinct category rules.
    ====================================== */

    getBlessingUpgrade(wheelKey, segment){

        if(wheelKey==="BRONZE"){ return this.getBronzeUpgrade(segment); }
        if(wheelKey==="SILVER"){ return this.getSilverUpgrade(segment); }

        return this.getGoldenUpgrade(segment);

    }

    getBronzeUpgrade(segment){

        const uniqueValues =
            [...new Set(LW_BRONZE_SEGMENTS.map((s) => s.value))].sort((a, b) => a-b);

        const candidates =
            uniqueValues.filter((v) => v > segment.value);

        if(candidates.length===0){

            return null;

        }

        const value =
            candidates[Math.floor(Math.random() * candidates.length)];

        return { type:"CASH", value, label:`${value}` };

    }

    getSilverUpgrade(segment){

        if(segment.type==="MULTIPLIER"){

            const uniqueValues =
                [...new Set(

                    LW_SILVER_SEGMENTS
                        .filter((s) => s.type==="MULTIPLIER")
                        .map((s) => s.value)

                )].sort((a, b) => a-b);

            const candidates =
                uniqueValues.filter((v) => v > segment.value);

            if(candidates.length===0){

                return null;

            }

            const value =
                candidates[Math.floor(Math.random() * candidates.length)];

            return { type:"MULTIPLIER", value, label:`${value}x` };

        }

        if(segment.type==="JACKPOT" && segment.value==="MINI"){

            return { type:"JACKPOT", value:"MINOR", label:"MINOR" };

        }

        // MINOR (already the top Silver jackpot tier) - no upgrade.
        return null;

    }

    getGoldenUpgrade(segment){

        // The one explicit cross-segment exception - EMPTY may become
        // ANY valid non-EMPTY Golden result (MAJOR/GRAND/FREE SPIN/
        // PICK BONUS), chosen at random among those four.
        if(segment.type==="EMPTY"){

            const options =
                LW_GOLDEN_SEGMENTS.filter((s) => s.type!=="EMPTY");

            return options[Math.floor(Math.random() * options.length)];

        }

        if(segment.type==="JACKPOT" && segment.value==="MAJOR"){

            return { type:"JACKPOT", value:"GRAND", label:"GRAND" };

        }

        // GRAND (top Golden jackpot), or a BONUS result (FREE SPIN/
        // PICK BONUS - explicitly never changed into another bonus
        // feature through a normal upgrade) - no upgrade.
        return null;

    }

    /* ======================================
       PLAY BLESSING NUDGE
       Per explicit request, reuses the SAME full "Mermaid's Blessings"
       treatment PickBonusFeature/BubbleBonusFeature already established
       (.bubble-bonus-intro-popup announcement + looping audio + a real
       Pearl zap), not WildRespinFeature's lighter one-shot version this
       used before - the zap travels from the Pearl in the Mermaid's own
       hand (getBlessingPearlSourcePoint() below) to the WHEEL she's
       boosting (its own fixed pointer, same visual landmark
       launchResolutionZap() above already sources FROM). Only once the
       zap actually arrives does the wheel nudge to the upgraded
       segment: a real, visible rotation (never an instant text swap),
       landing on whichever matching segment index needs the SHORTEST
       forward turn (reads as a deliberate small correction rather than
       another full spin). onComplete(landedIndex) reports back exactly
       which index it landed on, so onSpinLanded() above can record it
       for the later prize-highlight/resolution-zap lookup.
    ====================================== */

    playBlessingNudge(wheelKey, upgradedSegment, onComplete){

        mermaidStateManager.holdState("mermaidsBlessing");

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

            const targetEl =
                document.querySelector(`.lw-wheel-pointer-${wheelKey.toLowerCase()}`);

            animationManager.presentMermaidPearlZapToElement(

                targetEl,

                () => {

                    audioManager.stopMermaidBlessingLoop();
                    mermaidStateManager.releaseHold();

                    this.applyBlessingNudgeRotation(wheelKey, upgradedSegment, onComplete);

                },

                this.getBlessingPearlSourcePoint()

            );

        }, LW_BLESSING_POPUP_MS);

    }

    /* ======================================
       GET BLESSING PEARL SOURCE POINT
       Identical calibration to PickBonusFeature.
       getBlessingPearlSourcePoint() - see that method's own comment
       for the full reasoning (the mermaid-blessing.png asset is
       authored at exactly 2x #mermaid-panel's own box, so
       object-fit:contain renders it with zero letterboxing and this
       fraction maps directly onto the panel's own bounding rect).
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

            x: rect.left + rect.width * LW_BLESSING_PEARL_X_FRAC,
            y: rect.top + rect.height * LW_BLESSING_PEARL_Y_FRAC

        };

    }

    /* ======================================
       APPLY BLESSING NUDGE ROTATION
       The actual wheel nudge, split out from playBlessingNudge() above
       so the zap/announcement can happen first - unchanged math/
       pacing from before: finds whichever segment index matching the
       upgraded result needs the SHORTEST forward turn from the wheel's
       current position, then rotates there.
    ====================================== */

    applyBlessingNudgeRotation(wheelKey, upgradedSegment, onComplete){

        const segments =
            this.getWheelSegments(wheelKey);

        const candidateIndexes =
            segments
                .map((s, i) => this.segmentsMatch(s, upgradedSegment) ? i : -1)
                .filter((i) => i!==-1);

        let bestIndex = candidateIndexes[0];
        let bestDelta = Infinity;

        candidateIndexes.forEach((i)=>{

            const targetResting =
                (((LW_POINTER_ANGLE[wheelKey] - this.segmentCenterAngle(wheelKey, i)) % 360) + 360) % 360;

            const currentNormalized =
                ((this.wheelRotations[wheelKey] % 360) + 360) % 360;

            let delta =
                targetResting - currentNormalized;

            if(delta <= 0){

                delta += 360;

            }

            if(delta < bestDelta){

                bestDelta = delta;
                bestIndex = i;

            }

        });

        const newRotation =
            this.wheelRotations[wheelKey] + bestDelta;

        this.applyWheelRotation(wheelKey, newRotation, LW_NUDGE_DURATION_MS, LW_NUDGE_EASING);

        this.wheelRotations[wheelKey] = newRotation;

        setTimeout(()=>{

            onComplete(bestIndex);

        }, LW_NUDGE_DURATION_MS + LW_SPIN_SETTLE_MS);

    }

    segmentsMatch(a, b){

        return a.type===b.type && a.value===b.value;

    }

    /* ======================================
       FINISH SPIN SEQUENCE / RESOLUTION
       Every wheel has landed - resolve rewards in the exact required
       order (Cash -> Multipliers -> Jackpots), each visibly zapped to
       the #you-won-box overlay (NOT Total Win directly - per explicit
       request, see bangUpYouWonToTotalWin() below for the one final
       zap that actually reaches Total Win) ONE AT A TIME before the
       next starts, reusing the EXACT same .bubble-zap-trail technique/
       pacing PickBonusFeature.launchResolutionZap() already
       established. "Do not visually award a reward before it has been
       logically awarded" is satisfied simply by this only ever
       running once every wheel has already fully landed.
    ====================================== */

    finishSpinSequence(){

        this.youWonStartTotal =
            featureManager.chainTotalWin;

        this.showYouWonBox();

        const queue =
            this.buildResolutionQueue();

        this.runResolutionQueue(queue, 0);

    }

    /* ======================================
       YOU WON BOX (Milestone - Pick Bonus/Lucky Wheel resolution
       rework)
       Shared element (index.html/ui.css) - identical helpers to
       PickBonusFeature's own (each feature file stays self-contained,
       per this project's existing convention, rather than sharing a
       common module for 3 short methods). showYouWonBox() resets its
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

            }, LW_RESOLUTION_GAP_MS);

        });

    }

    /* ======================================
       LAUNCH RESOLUTION ZAP
       Per explicit request, the landed segment's OWN label glows and
       scales up 1.5x (.lw-winner, ui.css) for LW_PRIZE_HIGHLIGHT_MS
       FIRST - "look, this is your prize" - before it actually zaps
       off. The zap/travel itself is unchanged: reuses the EXISTING
       .bubble-zap-trail/#pearl-fx-layer travel technique
       PickBonusFeature.launchResolutionZap() already established
       (real getBoundingClientRect() deltas, correct regardless of
       GameScaler's current CSS scale) - travelling from the reward's
       own wheel's fixed pointer (the visual "this is the result"
       indicator) to the #you-won-box overlay (NOT Total Win directly -
       per explicit request, see bangUpYouWonToTotalWin() below for
       the one final zap that actually reaches Total Win).
    ====================================== */

    launchResolutionZap(entry, onLanded){

        const labelEl =
            document.querySelectorAll(`#lw-wheel-${entry.wheelKey.toLowerCase()}-segments .lw-segment-label`)[entry.index];

        if(labelEl){

            labelEl.classList.add("lw-winner");

        }

        setTimeout(()=>{

            this.launchResolutionZapTravel(entry, labelEl, onLanded);

        }, LW_PRIZE_HIGHLIGHT_MS);

    }

    launchResolutionZapTravel(entry, labelEl, onLanded){

        const sourceEl =
            document.querySelector(`.lw-wheel-pointer-${entry.wheelKey.toLowerCase()}`);

        const targetEl =
            document.getElementById("you-won-box-amount");

        const pearlFxLayer =
            document.getElementById("pearl-fx-layer");

        if(!sourceEl || !targetEl || !pearlFxLayer){

            if(labelEl){

                labelEl.classList.remove("lw-winner");

            }

            this.applyResolutionReward(entry);

            onLanded();

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

        zap.className = `bubble-zap-trail bubble-zap-${entry.category.toLowerCase()}`;
        zap.textContent = entry.label;

        zap.style.left = sourceCenterX + "px";
        zap.style.top = sourceCenterY + "px";
        zap.style.setProperty("--dx", dx + "px");
        zap.style.setProperty("--dy", dy + "px");
        zap.style.setProperty("--zap-duration", LW_ZAP_MS + "ms");

        pearlFxLayer.appendChild(zap);

        // The value is now flying off on its own - the label itself
        // releases its glow/scale right at this same moment, settling
        // back to its normal look as the zap travels the rest of the
        // way alone.
        if(labelEl){

            labelEl.classList.remove("lw-winner");

        }

        audioManager.playPearlCollect();

        setTimeout(()=>{

            if(zap.parentElement){

                zap.parentElement.removeChild(zap);

            }

            this.applyResolutionReward(entry);

            targetEl.classList.add("bubble-meter-impact");

            setTimeout(()=>{

                targetEl.classList.remove("bubble-meter-impact");

            }, LW_METER_IMPACT_MS);

            onLanded();

        }, LW_ZAP_MS);

    }

    /* ======================================
       APPLY RESOLUTION REWARD
       Exact same formula PickBonusFeature.applyResolutionReward()
       already established - Cash sums onto Total Win, Multiplier
       multiplies the running Total Win sequentially (never summed),
       Jackpot adds via the EXISTING jackpot value system
       (jackpotManager.getValue() - never a second jackpot-value
       source). Reads/writes the SAME shared running total every
       feature in the current trigger chain uses
       (featureManager.chainTotalWin) - never a second, parallel
       total; only its OWN DISPLAY is redirected to #you-won-box
       instead of Total Win (per explicit request - see
       bangUpYouWonToTotalWin() below for the one moment Total Win
       itself actually updates).
    ====================================== */

    applyResolutionReward(entry){

        const beforeTotal =
            featureManager.chainTotalWin;

        if(entry.category==="CASH"){

            featureManager.chainTotalWin += entry.value;

        } else if(entry.category==="MULTIPLIER"){

            // Bug fix - see the identical fix/comment in
            // PickBonusFeature.applyResolutionReward() - a revealed
            // Multiplier must only ever multiply THIS feature's own
            // "you won box" contribution (chainTotalWin -
            // youWonStartTotal), never the full chainTotalWin, which
            // already carries a prior chained feature's own total the
            // instant Lucky Wheel triggers as an interrupt during an
            // already-active Free Spins session.
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

        // Same reused "collectorComplete" state (mermaid-trigger.png)
        // PickBonusFeature.applyResolutionReward() already fires for
        // every value actually landing on the you-won-box - re-fires
        // (refreshing its own timer, never restacking) once per
        // queued reward, in order.
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
        zap.style.setProperty("--zap-duration", LW_ZAP_MS + "ms");

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

            }, LW_METER_IMPACT_MS);

            onComplete();

        }, LW_ZAP_MS);

    }

    /* ======================================
       FINISH RESOLUTION
       Every reward zap has already landed and Total Win is fully up
       to date. Two different endings from here, per explicit request:

       - Golden landed on a BONUS result (FREE SPIN/PICK BONUS) -
         finishEndFeatureChained() below skips the "FEATURE / COMPLETE"
         outro popup AND the scene-restore transition entirely (never
         shows the Base Game in between) - it shows that OTHER
         feature's own "Triggered" popup and goes straight into ITS
         OWN intro transition instead, exactly like a genuine Collector
         completion would.

       - Otherwise (the normal case) - unchanged: the SAME "FEATURE /
         COMPLETE" popup + feature-transition glow outro Free Spins/
         Pick Bonus already use, Lucky Wheel's own UI removed/scene
         restored at the glow's own midpoint (masked by its peak
         coverage), THEN back to the Base Game (or whatever was queued/
         paused) via finishEndFeature() below.
    ====================================== */

    finishResolution(){

        if(this.triggeredBonusFeature){

            this.finishEndFeatureChained();

            return;

        }

        animationManager.presentFeatureCompletionPopup(() => {

            animationManager.presentFeatureTransition(

                () => {

                    this.setSceneActive(false);

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

    /* ======================================
       FINISH END FEATURE
       Normal ending (no chained BONUS result) - only the triggering
       Collector (1) is reset, CollectorManager's progression logic for
       every other Collector is completely untouched. Hands control
       back to FeatureManager.finishActiveFeature() completely
       unmodified - it pops the next queued Collector, resumes a paused
       controller, or returns to the Base Game, exactly as it already
       does for every other feature.
    ====================================== */

    finishEndFeature(){

        collectorManager.reset(this.collectorIndex);
        collectorManager.updateCollectorArt(this.collectorIndex);
        animationManager.presentCollectorResetFx(this.collectorIndex);

        this.active = false;
        this.locked = false;

        this.collectorIndex = null;

        // featureManager.chainTotalWin is deliberately left as-is -
        // the final total stays displayed until either the player's
        // next Base Game spin resets it, or the next queued/resumed
        // feature's own fresh top-level trigger resets it, same as
        // every other feature transition.

        featureManager.finishActiveFeature();

    }

    /* ======================================
       FINISH END FEATURE CHAINED
       Golden landed on (or was Blessed into) a BONUS result - chains
       DIRECTLY into the REAL Free Spins/Pick Bonus implementation via
       FeatureManager.triggerFeature(), the EXACT SAME entry point a
       genuine Collector completion already uses (never a second/fake
       feature, never a new chaining mechanism) - this shows THAT
       feature's own "Triggered" popup and runs its own intro
       transition immediately, with no Lucky Wheel outro popup and no
       intermediate Base Game frame in between, per explicit request.

       Exact required sequence (per explicit request): show the target
       feature's own "Triggered" popup (Lucky Wheel's own wheels still
       visible behind it - exactly like a genuine fresh trigger leaves
       the Base Game's Reel Panel visible under that same popup) -> its
       own transition glow covers the full screen -> ONLY THEN, masked
       by the glow's own peak coverage, do Lucky Wheel's own wheels
       actually disappear (setSceneActive(false) below, on a delay -
       see LW_CHAIN_HANDOFF_DELAY_MS above for exactly why that timing)
       -> glow fades, revealing that feature's own UI -> its own intro
       popup -> gameplay continues. Never an abrupt instant cut, and
       never a second Base Game frame in between.

       Any OTHER Collector already queued behind Lucky Wheel
       (featureManager.featureQueue) is left completely untouched here -
       it still gets its own turn once the chained feature eventually
       finishes and calls the existing, unmodified
       FeatureManager.finishActiveFeature() itself.
    ====================================== */

    finishEndFeatureChained(){

        collectorManager.reset(this.collectorIndex);
        collectorManager.updateCollectorArt(this.collectorIndex);
        animationManager.presentCollectorResetFx(this.collectorIndex);

        this.active = false;
        this.locked = false;

        this.collectorIndex = null;

        const triggeredFeature =
            this.triggeredBonusFeature;

        this.triggeredBonusFeature = null;

        const targetFeatureType =
            FEATURE_TYPE[triggeredFeature];

        const targetCollectorIndex =
            CONFIG.FEATURES.MAPPING.findIndex(

                (mapping) => mapping.feature===targetFeatureType

            );

        if(targetCollectorIndex===-1){

            // Defensive fallback only - config.js always maps both
            // FREE_SPINS/PICK_BONUS, this can't actually happen.
            this.setSceneActive(false);

            featureManager.finishActiveFeature();

            return;

        }

        // featureManager.chainTotalWin is deliberately left as-is -
        // see the identical comment in finishEndFeature() above.

        featureManager.clearActiveFeature();
        featureManager.triggerFeature(targetCollectorIndex);

        // Lucky Wheel's own wheels stay visible until the target
        // feature's own transition glow is at its own peak coverage -
        // see LW_CHAIN_HANDOFF_DELAY_MS above.
        setTimeout(()=>{

            this.setSceneActive(false);

        }, LW_CHAIN_HANDOFF_DELAY_MS);

    }

}

/* ======================================
   MERMAID'S BLESSING PROBABILITY
   Isolated in one place, same pattern as every other feature's own
   shouldTriggerXBlessing() - reads CONFIG.LUCKY_WHEEL.
   MERMAIDS_BLESSING_CHANCE_DEV, a clearly marked DEVELOPMENT value
   (see config.js), not a finalized production probability.
====================================== */

function shouldTriggerLuckyWheelBlessing(){

    return Math.random() < CONFIG.LUCKY_WHEEL.MERMAIDS_BLESSING_CHANCE_DEV;

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.luckyWheelFeature = new LuckyWheelFeature();
