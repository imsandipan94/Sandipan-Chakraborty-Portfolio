/* ==========================================
   HUD MANAGER
   Mystic Slot Prototype
========================================== */

class HUDManager {

    constructor(){

        this.cacheElements();

        this.initialize();

    }

    /* ======================================
       CACHE UI ELEMENTS
    ====================================== */

    cacheElements(){

        this.elements = {

            jackpots:{

                grand:document.getElementById("grand-jackpot"),
                major:document.getElementById("major-jackpot"),
                minor:document.getElementById("minor-jackpot"),
                mini:document.getElementById("mini-jackpot")

            },

            logo:

                document.getElementById("logo-area"),

            collectors:

                document.querySelectorAll(".collector"),

            totalWin:

                document.getElementById("total-win"),

            balance:

                document.getElementById("balance"),

            bet:

                document.getElementById("bet"),

            menu:

                document.getElementById("menu-button"),

            info:

                document.getElementById("info-button"),

            spin:

                document.getElementById("spin-button")

        };

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("HUD Manager Initialized");

        this.refresh();

    }

    /* ======================================
       REFRESH UI
    ====================================== */

    refresh(){

        this.updateJackpots();

        this.updateBalance(10000);

        this.updateBet(100);

        this.updateTotalWin(0);

    }

    /* ======================================
       UPDATE METHODS
    ====================================== */

    updateJackpots(){

        if(this.elements.jackpots.grand)
            this.elements.jackpots.grand.textContent = "GRAND";

        if(this.elements.jackpots.major)
            this.elements.jackpots.major.textContent = "MAJOR";

        if(this.elements.jackpots.minor)
            this.elements.jackpots.minor.textContent = "MINOR";

        if(this.elements.jackpots.mini)
            this.elements.jackpots.mini.textContent = "MINI";

    }

    updateBalance(value){

        if(this.elements.balance)
            this.elements.balance.textContent = `BALANCE\n${value}`;

    }

    updateBet(value){

        if(this.elements.bet)
            this.elements.bet.textContent = `BET\n${value}`;

    }

    updateTotalWin(value){

        if(this.elements.totalWin)
            this.elements.totalWin.textContent = `TOTAL WIN\n${value}`;

    }

}