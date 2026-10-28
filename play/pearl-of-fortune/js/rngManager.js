/* ==========================================
   RNG MANAGER
   Pearl of Fortune
========================================== */

class RNGManager{

    constructor(){

        this.currentStops = [];

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("RNG Manager Initialized");

    }

    /* ======================================
       GENERATE REEL STOPS
    ====================================== */

    generateStops(){

        this.currentStops = [];

        for(let reel = 0; reel < CONFIG.REELS.COUNT; reel++){

            const stop =
                reelStripManager.getRandomStop(reel);

            this.currentStops.push(stop);

        }

        return this.currentStops;

    }

    /* ======================================
       GET CURRENT STOPS
    ====================================== */

    getStops(){

        return this.currentStops;

    }

}

window.rngManager = new RNGManager();