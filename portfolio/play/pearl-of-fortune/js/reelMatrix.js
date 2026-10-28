/* ==========================================
   REEL MATRIX
   Pearl of Fortune
========================================== */

class ReelMatrix{

    constructor(){

        this.matrix = [];

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Reel Matrix Initialized");

    }

    /* ======================================
       BUILD MATRIX
    ====================================== */

    build(){

        this.matrix =
            reelManager.getVisibleSymbols();

    }

    /* ======================================
       GET MATRIX
    ====================================== */

    getMatrix(){

        return this.matrix;

    }

    /* ======================================
       GET SYMBOL
    ====================================== */

    getSymbol(reel,row){

        return this.matrix[reel][row];

    }

}

window.reelMatrix = new ReelMatrix();