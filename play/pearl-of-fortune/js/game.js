/* ==========================================
   GAME
   Mystic Slot Prototype
========================================== */

class Game {

    constructor(){

        this.initialize();

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("====================================");
        console.log("Starting Mystic Slot Prototype");
        console.log("====================================");

        this.createManagers();

        this.start();

    }

    /* ======================================
       CREATE MANAGERS
    ====================================== */

    createManagers(){

        this.hud = new HUDManager();

        this.buttons = new ButtonManager();

        this.reels = new ReelManager();

        console.log("Managers Created");

    }

    /* ======================================
       START GAME
    ====================================== */

    start(){

        console.log("Game Ready");

    }

    /* ======================================
       FUTURE GAME LOOP
    ====================================== */

    update(){

        /*
            Future Updates

            - Reel Animation
            - Particles
            - UI Animation
            - Timers
            - Audio
            - Bonus Features

        */

    }

}

/* ==========================================
   CREATE GAME
========================================== */

window.addEventListener("DOMContentLoaded", ()=>{

    window.game = new Game();

});