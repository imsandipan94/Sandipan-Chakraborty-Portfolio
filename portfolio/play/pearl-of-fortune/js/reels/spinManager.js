/* ==========================================
   SPIN MANAGER
   Mystic Slot Prototype
========================================== */

class SpinManager {

    constructor(reelManager){

        this.reelManager = reelManager;

        this.isSpinning = false;

        this.currentState = "IDLE";

    }

    /* ======================================
       START SPIN
    ====================================== */

    startSpin(){

        if(this.isSpinning){

            return;

        }

        this.isSpinning = true;

        this.currentState = "SPINNING";

        console.log("===== SPIN START =====");

        this.reelManager.spin();

    }

    /* ======================================
       STOP SPIN
    ====================================== */

    stopSpin(){

        if(!this.isSpinning){

            return;

        }

        this.reelManager.stop();

        this.isSpinning = false;

        this.currentState = "IDLE";

        console.log("===== SPIN COMPLETE =====");

    }

    /* ======================================
       TOGGLE
    ====================================== */

    toggle(){

        if(this.isSpinning){

            this.stopSpin();

        }
        else{

            this.startSpin();

        }

    }

    /* ======================================
       GET STATE
    ====================================== */

    getState(){

        return this.currentState;

    }

}