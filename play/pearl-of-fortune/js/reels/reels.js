/* ==========================================
   REEL MANAGER
   Mystic Slot Prototype
========================================== */

class ReelManager {

    constructor(){

        this.grid = null;

        this.symbolElements = [];

        this.reels = [];

        this.reelCount = CONFIG.REELS.COUNT;

        this.rows = CONFIG.REELS.ROWS;

        this.initialize();

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.cacheElements();

        this.createReels();

        console.log("Reel Manager Initialized");

    }

    /* ======================================
       CACHE HTML ELEMENTS
    ====================================== */

    cacheElements(){

        this.grid = document.getElementById("reel-grid");

        this.symbolElements = [

            ...document.querySelectorAll(".symbol")

        ];

    }

    /* ======================================
       CREATE REELS
    ====================================== */

    createReels(){

        this.reels = [];

        for(let reel = 0; reel < this.reelCount; reel++){

            this.reels.push({

                id:reel,

                spinning:false,

                speed:0,

                stopPosition:0,

                symbols:new Array(this.rows).fill(null)

            });

        }

    }

    /* ======================================
       START SPIN
    ====================================== */

    spin(){

        console.log("Spin Requested");

        this.reels.forEach(reel=>{

            reel.spinning = true;

            reel.speed = 40;

        });

    }

    /* ======================================
       STOP SPIN
    ====================================== */

    stop(){

        console.log("Reels Stopped");

        this.reels.forEach(reel=>{

            reel.spinning = false;

            reel.speed = 0;

        });

    }

    /* ======================================
       UPDATE
    ====================================== */

    update(){

        this.reels.forEach(reel=>{

            if(!reel.spinning){

                return;

            }

            /*
                Reel animation
                will be implemented
                in Milestone 3.
            */

        });

    }

    /* ======================================
       GET REEL
    ====================================== */

    getReel(index){

        return this.reels[index];

    }

    /* ======================================
       GET SYMBOL
    ====================================== */

    getSymbol(reel,row){

        return this.reels[reel].symbols[row];

    }

    /* ======================================
       SET SYMBOL
    ====================================== */

    setSymbol(reel,row,symbol){

        this.reels[reel].symbols[row]=symbol;

    }

}