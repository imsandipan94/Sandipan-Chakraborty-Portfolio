/* ==========================================
   CONFIGURATION
   Pearl of Fortune
========================================== */

/* ==========================================
   FEATURE TYPES (Milestone - Collector -> Bonus
   Feature Framework)
   Defined once here, referenced both directly
   (FEATURE_TYPE.X) and via CONFIG.FEATURES.TYPE.X below,
   so FeatureManager and CONFIG.FEATURES.MAPPING never
   re-declare these strings themselves.
========================================== */

const FEATURE_TYPE = {

    LUCKY_WHEEL:"FEATURE_LUCKY_WHEEL",

    WILD_RESPIN:"FEATURE_WILD_RESPIN",

    FREE_SPINS:"FEATURE_FREE_SPINS",

    PICK_BONUS:"FEATURE_PICK_BONUS"

};

const CONFIG = {

    /* ======================================
       GAME
    ====================================== */

    GAME:{

        WIDTH:800,

        HEIGHT:1600,

        FPS:60

    },

    /* ======================================
       DEBUG (Developer Feature Test Cheatbox)
       Single source of truth for whether the developer-only Feature
       Test panel (index.html #feature-test-panel, driven by
       js/featureTestManager.js) is visible/active at all. Set to
       false for production - the panel then stays hidden (its own
       CSS default) and FeatureTestManager wires up zero listeners,
       so it has no effect on the game whatsoever.
    ====================================== */

    DEBUG:{

        CHEATBOX:true

    },

    /* ======================================
       PANELS
    ====================================== */

    PANELS:{

        TOP_HEIGHT:170,

        MERMAID_HEIGHT:600,

        COLLECTOR_HEIGHT:200,

        REEL_HEIGHT:460,

        BUTTON_HEIGHT:170

    },

    /* ======================================
       REELS
    ====================================== */

    REELS:{

        COUNT:5,

        ROWS:3,

        SYMBOL_WIDTH:150,

        SYMBOL_HEIGHT:150,

        GAP:0,

        SPIN_DURATION:2000,

        STOP_DELAY:200

    },

    /* ======================================
       COLLECTORS
    ====================================== */

    COLLECTORS:{

        COUNT:5,

        WIDTH:150,

        HEIGHT:200,

        MAX_LEVEL:3,

        // Filenames (no extension) for each progression stage,
        // in order: 0/3, 1/3, 2/3, 3/3 (completed). Used to build
        // the per-collector asset paths below.
        STAGE_NAMES:["idle","stage1","stage2","activate"],

        // One entry per reel (1-5). `key` is the folder name
        // under assets/collectors/ that will hold that
        // collector's idle/stage1/stage2/activate art.
        // Two collectors share the "Wild Respin" name (Reel 2
        // and Reel 4 per the GDD) so they need distinct keys.
        DEFINITIONS:[

            { name:"Lucky Wheel", key:"luckyWheel" },

            { name:"Wild Respin", key:"wildRespinLeft" },

            { name:"Free Spins",  key:"freeSpins" },

            { name:"Wild Respin", key:"wildRespinRight" },

            { name:"Pick Bonus",  key:"pickBonus" }

        ]

    },

    /* ======================================
       FEATURES (Milestone - Collector -> Bonus
       Feature Framework)
       Single source of truth for which Bonus Feature each
       Collector routes to - FeatureManager reads this array by
       index (same 0-4 index as COLLECTORS.DEFINITIONS above,
       collectorId/reel below are the 1-based numbers used
       everywhere else in the project). Never duplicate this
       mapping elsewhere - add a new collector/feature here only.

       Collector 2 and Collector 4 both route to WILD_RESPIN but
       are NOT interchangeable - targetReel keeps the originating
       reel's identity so the feature knows which reel it affects.
    ====================================== */

    FEATURES:{

        TYPE:FEATURE_TYPE,

        MAPPING:[

            { collectorId:1, reel:1, feature:FEATURE_TYPE.LUCKY_WHEEL },

            { collectorId:2, reel:2, feature:FEATURE_TYPE.WILD_RESPIN, targetReel:2 },

            { collectorId:3, reel:3, feature:FEATURE_TYPE.FREE_SPINS, freeSpins:12 },

            { collectorId:4, reel:4, feature:FEATURE_TYPE.WILD_RESPIN, targetReel:4 },

            { collectorId:5, reel:5, feature:FEATURE_TYPE.PICK_BONUS, picks:3 }

        ]

    },

    /* ======================================
       WILD RESPIN (Milestone - Wild Respin + Mermaid's
       Blessing)
       Mechanics constants (which reels can host Wild Respin, how
       many automatic feature spins) live as plain consts in
       wildRespinFeature.js, matching this project's existing
       convention for feature-timing constants. ONLY the
       probability lives here, per this milestone's own explicit
       instruction to keep it isolated/configurable.
    ====================================== */

    WILD_RESPIN:{

        // DEVELOPMENT-ONLY placeholder (0-1). Not a finalized GDD/
        // RTP-driven production probability - this milestone
        // explicitly says not to invent one. Read exclusively by
        // shouldTriggerMermaidsBlessing() in wildRespinFeature.js -
        // change this one value to retune it later.
        MERMAIDS_BLESSING_CHANCE_DEV:0.35,

        // Milestone - Feature Win Caps. Multiples of the current bet
        // (betManager.getBet()) - the final win THIS feature itself
        // is responsible for (see FeatureManager.capOwner/
        // claimCapOwnership()/finishActiveFeature() in
        // featureManager.js) is clamped into [MIN_WIN_MULTIPLIER,
        // MAX_WIN_MULTIPLIER]*bet once the whole chain it owns
        // actually finishes - topped up if it landed below the floor,
        // trimmed if it exceeded the ceiling.
        MIN_WIN_MULTIPLIER:5,
        MAX_WIN_MULTIPLIER:50

    },

    /* ======================================
       FREE SPINS (Milestone - Free Spins Mermaid's
       Blessing / Automatic Bubble Bonus)
       Mechanics constants (spawn count, pop count, prize ranges,
       timings) live as plain consts in bubbleBonusFeature.js,
       matching this project's existing convention. ONLY the
       trigger probability lives here, same pattern as
       WILD_RESPIN.MERMAIDS_BLESSING_CHANCE_DEV above - this is a
       SEPARATE, unrelated probability from that one.
    ====================================== */

    FREE_SPINS:{

        // DEVELOPMENT-ONLY placeholder (0-1). Not a finalized GDD/
        // RTP-driven production probability. Read exclusively by
        // shouldTriggerBubbleBonus() in bubbleBonusFeature.js -
        // change this one value to retune it later.
        BUBBLE_BONUS_CHANCE_DEV:0.25,

        // Milestone - Feature Win Caps. Same MIN/MAX_WIN_MULTIPLIER
        // pattern as WILD_RESPIN above - see its own comment for the
        // full explanation. Free Spins is one of the two "envelope"
        // features (Lucky Wheel is the other) whose own cap governs
        // the ENTIRE combined chain total if Wild Respin/Pick Bonus/
        // Lucky Wheel gets triggered/absorbed DURING it (per explicit
        // request), not just its own automatic spins' own winnings.
        MIN_WIN_MULTIPLIER:25,
        MAX_WIN_MULTIPLIER:2500

    },

    /* ======================================
       PICK BONUS
       Mechanics constants (grid size, prize ranges/weights,
       timings) live as plain consts in pickBonusFeature.js,
       matching this project's existing convention. ONLY the
       Mermaid's Blessing (additional picks) trigger probability
       lives here - same isolated-probability pattern as
       WILD_RESPIN.MERMAIDS_BLESSING_CHANCE_DEV/FREE_SPINS.
       BUBBLE_BONUS_CHANCE_DEV above, per this milestone's own
       explicit instruction not to implement it any differently.
    ====================================== */

    PICK_BONUS:{

        // DEVELOPMENT-ONLY placeholder (0-1). Read exclusively by
        // shouldTriggerPickBonusBlessing() in pickBonusFeature.js -
        // change this one value to retune it later.
        MERMAIDS_BLESSING_CHANCE_DEV:0.35,

        // Milestone - Feature Win Caps. Same MIN/MAX_WIN_MULTIPLIER
        // pattern as WILD_RESPIN above - see its own comment.
        MIN_WIN_MULTIPLIER:10,
        MAX_WIN_MULTIPLIER:600

    },

    /* ======================================
       LUCKY WHEEL
       Mechanics constants (segment orders/values, spin timings,
       geometry) live as plain consts in luckyWheelFeature.js, matching
       this project's existing convention. ONLY the Mermaid's Blessing
       (wheel nudge/upgrade) trigger probability lives here - same
       isolated-probability pattern as WILD_RESPIN/FREE_SPINS/
       PICK_BONUS above.
    ====================================== */

    LUCKY_WHEEL:{

        // DEVELOPMENT-ONLY placeholder (0-1). Read exclusively by
        // shouldTriggerLuckyWheelBlessing() in luckyWheelFeature.js -
        // change this one value to retune it later.
        MERMAIDS_BLESSING_CHANCE_DEV:0.35,

        // Milestone - Feature Win Caps. Same MIN/MAX_WIN_MULTIPLIER
        // pattern as WILD_RESPIN above - see its own comment. Lucky
        // Wheel is the other "envelope" feature (Free Spins is the
        // other) - its own cap governs the combined total of its own
        // wheel rewards PLUS whatever Free Spins/Pick Bonus session
        // it chains into via the Golden Wheel (per explicit request).
        MIN_WIN_MULTIPLIER:20,
        MAX_WIN_MULTIPLIER:1000

    },

    /* ======================================
       BUTTONS
    ====================================== */

    BUTTONS:{

        MENU_WIDTH:150,

        CENTER_WIDTH:250,

        SPIN_WIDTH:150,

        CELL_HEIGHT:80

    },

    /* ======================================
       ECONOMY
    ====================================== */

    ECONOMY:{

        STARTING_BALANCE:10000,

        // Fixed bet levels only - BetManager moves through this
        // list by index (see increase()/decrease()), it never
        // adds/subtracts a step amount. 100 is index 2, the
        // required default.
        BET_LEVELS:[25, 50, 100, 200, 500],

        DEFAULT_BET:100

    },

    /* ======================================
       JACKPOTS
       Values here are BET MULTIPLIERS, not flat amounts -
       JackpotManager multiplies each by betManager.getBet() to
       get the actual displayed jackpot value, live, every time
       the bet changes. At the default bet (100) these reproduce
       the project's original placeholder amounts exactly
       (500*100=50,000 / 250*100=25,000 / 100*100=10,000 /
       50*100=5,000), so nothing looks different until the
       player actually changes their bet.
    ====================================== */

    JACKPOTS:{

        GRAND:500,

        MAJOR:250,

        MINOR:100,

        MINI:50

    },

    /* ======================================
       AUDIO
    ====================================== */

    AUDIO:{

        // localStorage key the mute preference is persisted
        // under - see AudioManager.initialize().
        STORAGE_KEY:"mysticSlot_audioMuted",

        ICON_ON:"assets/buttons/audio-on.png",

        ICON_OFF:"assets/buttons/audio-off.png",

        // Gameplay SFX (Milestone 12.6). All under assets/audio/sfx/
        // per the project's asset convention - swapping any of
        // these for a final production sound later is just
        // replacing the file at that path, no code changes needed.
        SFX:{

            BUTTON_CLICK:"assets/audio/sfx/button-click.wav",

            REEL_SPIN:"assets/audio/sfx/reel-spin.wav",

            REEL_STOP:"assets/audio/sfx/reel-stop.wav",

            WIN_LINE:"assets/audio/sfx/win-line.wav",

            PEARL_COLLECT:"assets/audio/sfx/pearl-collect.wav",

            COLLECTOR_UPGRADE:"assets/audio/sfx/collector-upgrade.wav",

            // Played once from FeatureManager.triggerFeature() -
            // whenever ANY Bonus Feature (Wild Respin/Free Spins/
            // Lucky Wheel/Pick Bonus) actually triggers.
            FEATURE_TRIGGER:"assets/audio/sfx/feature-trigger.wav",

            // Played once from AnimationManager.presentFeatureTransition() -
            // whenever the shared glow-wipe transition (Free Spins'
            // intro/outro today, Pick Bonus/Lucky Wheel later) begins.
            FEATURE_TRANSITION:"assets/audio/sfx/feature-transition.wav",

            // Milestone - Wild Respin + Mermaid's Blessing.
            MERMAIDS_BLESSING:"assets/audio/sfx/mermaids-blessing.wav",

            // NOT the normal Pearl Collection SFX (PEARL_COLLECT
            // above) - the Mermaid's magical Pearl zap toward the
            // secondary Collector is a distinct event, per this
            // milestone's own "Pearl Collection Audio" section.
            MERMAID_PEARL_ZAP:"assets/audio/sfx/mermaid-pearl-zap.wav",

            // Milestone - Free Spins Mermaid's Blessing / Automatic
            // Bubble Bonus. Played once per POPPED bubble (never for
            // an escaped one).
            BUBBLE_POP:"assets/audio/sfx/bubble-pop.wav",

            // Played once from BubbleBonusFeature.showBlessingPopup() -
            // the "Mermaid's Blessings" announcement shown BEFORE any
            // bubble spawns. Deliberately a SEPARATE file from
            // MERMAIDS_BLESSING above (Wild Respin's own SFX, untouched).
            MERMAID_BLESSING_INTRO:"assets/audio/sfx/mermaid-blessing.wav",

            // Milestone - Bonus Feature intro/outro audio. Generic,
            // reusable for ANY Bonus Feature's own intro popup
            // (AnimationManager.presentFeatureIntroPopup() - Free
            // Spins today, Lucky Wheel/Pick Bonus later) - looped for
            // as long as that popup is visible, then this one-shot
            // plays once as it's removed.
            FEATURE_INTRO_LOOP:"assets/audio/sfx/feature_intro-loop.wav",
            FEATURE_INTRO_END:"assets/audio/sfx/feature_intro-end.wav",

            // Same pattern for the "FEATURE / COMPLETE" outro popup
            // (AnimationManager.presentFeatureCompletionPopup()) shown
            // for a fixed 2s right before a Feature's own outro
            // transition begins.
            FEATURE_OUTRO_LOOP:"assets/audio/sfx/feature_outro-loop.wav",
            FEATURE_OUTRO_END:"assets/audio/sfx/feature_outro-end.wav",

            // Milestone - Win Celebration Popups. One loop/end pair
            // per tier (CONFIG.WIN_CELEBRATION.TIERS below) - the loop
            // plays for as long as that tier's own popup is visible,
            // the end plays once as it's removed, same pattern as
            // FEATURE_INTRO_LOOP/FEATURE_INTRO_END above.
            BIG_WIN_LOOP:"assets/audio/sfx/bw-loop.wav",
            BIG_WIN_END:"assets/audio/sfx/bw-end.wav",

            SUPER_WIN_LOOP:"assets/audio/sfx/sw-loop.wav",
            SUPER_WIN_END:"assets/audio/sfx/sw-end.wav",

            MEGA_WIN_LOOP:"assets/audio/sfx/mw-loop.wav",
            MEGA_WIN_END:"assets/audio/sfx/mw-end.wav"

        }

    },

    /* ======================================
       WIN CELEBRATION (Milestone - Win Celebration Popups)
       Checked once by FeatureManager.presentWinCelebrationIfEligible()
       right as a Feature's own chain truly ends and control is about
       to return to the Base Game - never mid-chain. multiplier =
       chainTotalWin / bet at that moment; per explicit request these
       thresholds are cascading/inclusive ("100x or more" -> Big Win,
       "500x or more" -> Super Win, "1000x or more" -> Mega Win), so a
       1000x+ win technically also clears Big/Super Win's own bar too -
       presentWinCelebrationIfEligible() picks the HIGHEST-
       minMultiplier tier the multiplier actually clears (Mega beats
       Super beats Big), never the first match. Each tier's own
       LOOP/END sfx keys are read from CONFIG.AUDIO.SFX by convention
       (`${key}_LOOP`/`${key}_END}`) - see AnimationManager.
       presentWinCelebrationPopup().
    ====================================== */

    WIN_CELEBRATION:{

        DURATION_MS:3000,

        TIERS:[

            {
                key:"BIG_WIN",
                minMultiplier:100,
                image:"assets/popups/bigwin.png"
            },

            {
                key:"SUPER_WIN",
                minMultiplier:500,
                image:"assets/popups/superwin.png"
            },

            {
                key:"MEGA_WIN",
                minMultiplier:1000,
                image:"assets/popups/megawin.png"
            }

        ]

    },

    /* ======================================
       GAME STATE
    ====================================== */

    STATE:{

        IDLE:"IDLE",

        SPINNING:"SPINNING",

        EVALUATING:"EVALUATING",

        WIN:"WIN",

        // Milestone - Collector -> Bonus Feature Framework. Both
        // count as "not idle" for GameManager.isIdle(), which is
        // the same single gate SpinManager.spin() already checks -
        // no separate spin-lock flag needed, see FeatureManager.
        FEATURE_TRANSITION:"FEATURE_TRANSITION",

        BONUS_ACTIVE:"BONUS_ACTIVE"

    },

    /* ======================================
       SYMBOLS
    ====================================== */

    SYMBOLS:[

        "A",

        "K",

        "Q",

        "J",

        "10",

        "9",

        "WILD",

        "SCATTER"

    ]

};

Object.freeze(CONFIG);