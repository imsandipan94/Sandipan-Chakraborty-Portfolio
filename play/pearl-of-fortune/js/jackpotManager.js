/* ==========================================
   JACKPOT MANAGER
   Pearl of Fortune

   Each jackpot's displayed value is CONFIG.JACKPOTS[tier] (a
   bet multiplier - see config.js) times the current bet, read
   fresh from betManager.getBet() every time it's recalculated.
   Never a flat/accumulating amount, never something this
   manager tracks state for itself - betManager remains the only
   source of truth for the bet, this only reads it.
========================================== */

class JackpotManager{

    constructor(){

        this.valueElements = {};

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.valueElements = {

            GRAND: document.getElementById("grand-value"),

            MAJOR: document.getElementById("major-value"),

            MINOR: document.getElementById("minor-value"),

            MINI: document.getElementById("mini-value")

        };

        this.updateAll();

        console.log("Jackpot Manager Initialized");

    }

    /* ======================================
       GET VALUE (Milestone - Free Spins Bubble Bonus)
       The SAME formula updateAll() below already uses for every
       tier's own displayed value - the single source of truth for
       "what is this jackpot tier currently worth", reused here
       rather than a second jackpot-value system. tier is one of
       CONFIG.JACKPOTS' own keys (GRAND/MAJOR/MINOR/MINI).
    ====================================== */

    getValue(tier){

        const multiplier =
            CONFIG.JACKPOTS[tier];

        if(multiplier===undefined){

            return 0;

        }

        return multiplier * betManager.getBet();

    }

    /* ======================================
       UPDATE ALL
       Called on initial load and every time betManager's bet
       changes (see betManager.js increase()/decrease()).
    ====================================== */

    updateAll(){

        const bet =
            betManager.getBet();

        Object.keys(CONFIG.JACKPOTS).forEach((tier)=>{

            const value =
                CONFIG.JACKPOTS[tier] * bet;

            const el =
                this.valueElements[tier];

            if(el){

                el.textContent =
                    value.toLocaleString();

            }

        });

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

window.jackpotManager = new JackpotManager();
