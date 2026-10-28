/* ==========================================
   REEL STRIP MANAGER
   Pearl of Fortune
========================================== */

class ReelStripManager {

    constructor(){

        this.reelStrips = [];

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.createReelStrips();

        console.log("Reel Strip Manager Initialized");

    }

    /* ======================================
       CREATE REEL STRIPS
    ====================================== */

    createReelStrips(){

    this.reelStrips = [

        // Reel 1
        [ 
            4,5,6,7,
            0,4,5,1,
            6,7,2,4,
            5,3,6,7,
            8,4,5,6
        ],

        // Reel 2
        [
            5,6,7,4,
            1,5,6,2,
            7,4,0,5,
            3,6,7,4,
            8,5,6,7
        ],

        // Reel 3
        [
            6,7,4,5,
            2,6,7,3,
            4,5,1,6,
            7,0,4,5,
            8,6,7,4
        ],

        // Reel 4
        [
            7,4,5,6,
            3,7,4,0,
            5,6,2,7,
            4,1,5,6,
            8,7,4,5
        ],

        // Reel 5
        [
            4,5,6,7,
            0,4,5,1,
            6,7,2,4,
            5,3,6,7,
            8,4,5,6
        ]

    ];

    }

    /* ======================================
       GET REEL STRIP
    ====================================== */

    getStrip(reel){

        return this.reelStrips[reel];

    }

    /* ======================================
       RANDOM STOP
    ====================================== */

    getRandomStop(reelIndex){

        const strip = this.getStrip(reelIndex);

        return Math.floor(Math.random() * strip.length);

    }

}

window.reelStripManager = new ReelStripManager();