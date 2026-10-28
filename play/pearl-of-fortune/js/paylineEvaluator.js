/* ==========================================
   PAYLINE EVALUATOR
   Pearl of Fortune
========================================== */

class PaylineEvaluator{

    constructor(){}

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Payline Evaluator Initialized");

    }

    /* ======================================
       READ PAYLINE
    ====================================== */

    getSymbols(lineIndex){

        const matrix =
            reelMatrix.getMatrix();

        const payline =
            paylineManager.getPayline(lineIndex);

        const symbols = [];

        for(let reel=0; reel<CONFIG.REELS.COUNT; reel++){

            const row =
                payline[reel];

            symbols.push(

                matrix[reel][row]

            );

        }

        return symbols;

    }

    /* ======================================
    EVALUATE LINE
    ====================================== */

    evaluateLine(lineIndex){

        const symbols =
            this.getSymbols(lineIndex);

        let baseSymbol = null;

        let count = 0;

        for(let i=0;i<symbols.length;i++){

            const symbol = symbols[i];

            if(symbol==="PEARL"){

                break;

            }

            if(baseSymbol===null){

                if(symbol==="WILD"){

                    count++;

                    continue;

                }

                baseSymbol = symbol;

                count++;

                continue;

            }

            if(

                symbol===baseSymbol ||

                symbol==="WILD"

            ){

                count++;

            }

            else{

                break;

            }

        }

        if(baseSymbol===null){

            baseSymbol="WILD";

        }

        const multiplier =
            mathModel.getMultiplier(

                baseSymbol,

                count

            );

        return{

            line:lineIndex+1,

            symbol:baseSymbol,

            count:count,

            multiplier:multiplier,

            win:multiplier>0

        };

    }

}

window.paylineEvaluator =
    new PaylineEvaluator();