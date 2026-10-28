/* ==========================================
   GAME MANAGER
   Pearl of Fortune
========================================== */

class GameManager {

    constructor(){

        this.state = CONFIG.STATE.IDLE;

        this.isInitialized = false;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        if(this.isInitialized){

            return;

        }

        console.log("=================================");
        console.log(" Pearl of Fortune");
        console.log(" Game Manager Initialized");
        console.log("=================================");

        this.isInitialized = true;

        this.changeState(CONFIG.STATE.IDLE);

    }

    /* ======================================
       GAME STATE
    ====================================== */

    changeState(newState){

        this.state = newState;

        console.log("Game State :", this.state);

    }

    getState(){

        return this.state;

    }

    isIdle(){

        return this.state === CONFIG.STATE.IDLE;

    }

    isSpinning(){

        return this.state === CONFIG.STATE.SPINNING;

    }

    isEvaluating(){

        return this.state === CONFIG.STATE.EVALUATING;

    }

    isWin(){

        return this.state === CONFIG.STATE.WIN;

    }

    /* ======================================
       UPDATE
    ====================================== */

    update(){

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

const gameManager = new GameManager();