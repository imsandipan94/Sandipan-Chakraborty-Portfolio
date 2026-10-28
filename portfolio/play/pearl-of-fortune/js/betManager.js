/* ==========================================
   BET MANAGER
   Pearl of Fortune
========================================== */

class BetManager{

    constructor(){

        // Index into CONFIG.ECONOMY.BET_LEVELS - the fixed list is
        // the only source of valid bet values; nothing here ever
        // adds/subtracts an arbitrary step amount. Falls back to
        // index 0 if DEFAULT_BET somehow isn't in the list, so the
        // bet is always a valid level regardless.
        const defaultIndex =
            CONFIG.ECONOMY.BET_LEVELS.indexOf(CONFIG.ECONOMY.DEFAULT_BET);

        this.betIndex =
            defaultIndex!==-1 ? defaultIndex : 0;

        this.betValue = null;

        // Milestone - Free Spins. True while a Bonus Feature has
        // Bet locked (see setLocked() below, driven by FeatureManager.
        // lockSpin()/unlockSpin() - the same single choke point every
        // feature already goes through, so this applies consistently
        // without each feature controller needing its own bet-lock
        // call).
        this.locked = false;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.betValue = document.getElementById("bet-value");

        this.updateUI();

        console.log("Bet Manager Initialized");

    }

    /* ======================================
       UI
    ====================================== */

    updateUI(){

        if(this.betValue){

            this.betValue.textContent =
                this.getBet().toLocaleString();

        }

    }

    /* ======================================
       SET LOCKED (Milestone - Free Spins)
       Called by FeatureManager.lockSpin()/unlockSpin() - Bet cannot
       change while ANY Bonus Feature is active (a mid-feature bet
       change would make win math for spins already in progress
       ambiguous), and restores normal control once every queued
       Feature has finished. Also disables the buttons at the DOM
       level (they simply stop firing clicks), mirroring how
       SpinManager.setEnabled() locks the Spin button.
    ====================================== */

    setLocked(locked){

        this.locked = locked;

        const betPlus =
            document.getElementById("bet-plus");

        const betMinus =
            document.getElementById("bet-minus");

        if(betPlus){

            betPlus.disabled = locked;

        }

        if(betMinus){

            betMinus.disabled = locked;

        }

    }

    /* ======================================
       INCREASE
       Moves one step up CONFIG.ECONOMY.BET_LEVELS. Already at the
       last (highest) level - stays there, no wraparound.
    ====================================== */

    increase(){

        if(this.locked){

            return;

        }

        if(this.betIndex < CONFIG.ECONOMY.BET_LEVELS.length - 1){

            this.betIndex++;

            this.updateUI();

            jackpotManager.updateAll();

        }

    }

    /* ======================================
       DECREASE
       Moves one step down CONFIG.ECONOMY.BET_LEVELS. Already at
       the first (lowest) level - stays there, no wraparound.
    ====================================== */

    decrease(){

        if(this.locked){

            return;

        }

        if(this.betIndex > 0){

            this.betIndex--;

            this.updateUI();

            jackpotManager.updateAll();

        }

    }

    /* ======================================
       GET BET
    ====================================== */

    getBet(){

        return CONFIG.ECONOMY.BET_LEVELS[this.betIndex];

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

const betManager = new BetManager();