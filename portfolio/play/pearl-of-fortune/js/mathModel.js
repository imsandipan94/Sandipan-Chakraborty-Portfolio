/* ==========================================
   MATH MODEL
   Pearl of Fortune
========================================== */

class MathModel{

    constructor(){

        this.paytable = {};

    }

    initialize(){

        this.createPaytable();

        console.log("Math Model Initialized");

    }

    /* ======================================
   PAYTABLE
====================================== */

createPaytable(){

    this.paytable = {

        8:{ // Wild

            3:10,
            4:15,
            5:25

        },

        1:{ // Mermaid

            3:1.5,
            4:3,
            5:5

        },

        2:{ // Seahorse

            3:1,
            4:1.8,
            5:2.5

        },

        3:{ // Conch

            3:1,
            4:1.5,
            5:2

        },

        4:{ // A

            3:0.8,
            4:1,
            5:1.5

        },

        5:{ // K

            3:0.6,
            4:0.8,
            5:1.2

        },

        6:{ // Q

            3:0.4,
            4:0.6,
            5:1

        },

        7:{ // J

            3:0.3,
            4:0.5,
            5:0.8

        }

    };

    }


    /* ======================================
        GET MULTIPLIER
    ====================================== */

        getMultiplier(symbol, count){

            if(!this.paytable[symbol]){

                return 0;

            }

            return this.paytable[symbol][count] || 0;

        }

    /* ======================================
        CALCULATE WIN
    ====================================== */

    calculateWin(symbol, count, bet){

        const multiplier =
            this.getMultiplier(symbol, count);

        return multiplier * bet;

    }

}

window.mathModel = new MathModel();