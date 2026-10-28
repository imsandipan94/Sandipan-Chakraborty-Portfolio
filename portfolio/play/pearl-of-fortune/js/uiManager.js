/* ==========================================
   UI MANAGER
   Pearl of Fortune
========================================== */

class UIManager{

    constructor(){

        this.betIncreaseButton = null;
        this.betDecreaseButton = null;
        this.infoButton = null;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.betIncreaseButton =
            document.getElementById("bet-plus");

        this.betDecreaseButton =
            document.getElementById("bet-minus");

        this.infoButton =
            document.getElementById("info-button");

        this.registerEvents();

        console.log("UI Manager Initialized");

    }

    /* ======================================
       EVENTS
    ====================================== */

    registerEvents(){

        if(this.betIncreaseButton){

            this.betIncreaseButton.addEventListener(

                "click",

                () => {

                    audioManager.playButtonClick();

                    betManager.increase();

                }

            );

        }

        if(this.betDecreaseButton){

            this.betDecreaseButton.addEventListener(

                "click",

                () => {

                    audioManager.playButtonClick();

                    betManager.decrease();

                }

            );

        }

        // Milestone - Game Information page. Opens info.html (a
        // separate static page, never modifies any game state) in
        // the same tab - a plain relative navigation, so it works
        // identically locally and when deployed through GitHub Pages.
        if(this.infoButton){

            this.infoButton.addEventListener(

                "click",

                () => {

                    audioManager.playButtonClick();

                    window.location.href = "info.html";

                }

            );

        }

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

const uiManager = new UIManager();