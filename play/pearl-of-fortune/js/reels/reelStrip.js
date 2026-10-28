/* ==========================================
   REEL STRIPS
   Mystic Slot Prototype
========================================== */

class ReelStrip {

    constructor(){

        this.strips = [];

        this.initialize();

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.createStrips();

        console.log("Reel Strips Initialized");

    }

    /* ======================================
       CREATE STRIPS
    ====================================== */

    createStrips(){

        this.strips = [

            [0,1,2,3,4,5,6,0,1,2,3,7,4,5,1,2,3,4,6,5],

            [1,2,3,4,5,6,0,1,2,7,3,4,5,0,2,3,4,5,6,1],

            [2,3,4,5,6,0,1,2,3,4,7,5,6,1,2,3,4,5,0,6],

            [3,4,5,6,0,1,2,3,4,5,6,7,1,2,3,4,5,0,1,2],

            [4,5,6,0,1,2,3,4,5,6,0,7,2,3,4,5,1,2,3,6]

        ];

    }

    /* ======================================
       GET STRIP
    ====================================== */

    getStrip(reelIndex){

        return this.strips[reelIndex];

    }

    /* ======================================
       GET SYMBOL
    ====================================== */

    getSymbol(reelIndex, position){

        const strip = this.strips[reelIndex];

        return strip[position % strip.length];

    }

    /* ======================================
       STRIP LENGTH
    ====================================== */

    getLength(reelIndex){

        return this.strips[reelIndex].length;

    }

}