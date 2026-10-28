/* ==========================================
   BUTTON MANAGER
   Mystic Slot Prototype
========================================== */

class ButtonManager {

    constructor(){

        this.bet = 100;

        this.minBet = 10;

        this.maxBet = 1000;

        this.step = 10;

        this.cacheElements();

        this.registerEvents();

        this.updateBetDisplay();

    }

    /* ======================================
       CACHE ELEMENTS
    ====================================== */

    cacheElements(){

        this.menuButton = document.getElementById("menu-button");

        this.infoButton = document.getElementById("info-button");

        this.spinButton = document.getElementById("spin-button");

        this.betMinusButton = document.getElementById("bet-minus");

        this.betPlusButton = document.getElementById("bet-plus");

        this.betValue = document.getElementById("bet-value");

    }

    /* ======================================
       REGISTER EVENTS
    ====================================== */

    registerEvents(){

        this.menuButton?.addEventListener("click",()=>{

            this.onMenu();

        });

        this.infoButton?.addEventListener("click",()=>{

            this.onInfo();

        });

        this.spinButton?.addEventListener("click",()=>{

            this.onSpin();

        });

        this.betMinusButton?.addEventListener("click",()=>{

            this.decreaseBet();

        });

        this.betPlusButton?.addEventListener("click",()=>{

            this.increaseBet();

        });

    }

    /* ======================================
       MENU
    ====================================== */

    onMenu(){

        console.log("Menu Button");

    }

    /* ======================================
       INFO
    ====================================== */

    onInfo(){

        console.log("Info Button");

    }

    /* ======================================
       SPIN
    ====================================== */

    onSpin(){

        console.log("Spin Button");

    }

    /* ======================================
       BET
    ====================================== */

    increaseBet(){

        if(this.bet < this.maxBet){

            this.bet += this.step;

            this.updateBetDisplay();

        }

    }

    decreaseBet(){

        if(this.bet > this.minBet){

            this.bet -= this.step;

            this.updateBetDisplay();

        }

    }

    updateBetDisplay(){

        if(this.betValue){

            this.betValue.textContent = this.bet;

        }

    }

    getBet(){

        return this.bet;

    }

}