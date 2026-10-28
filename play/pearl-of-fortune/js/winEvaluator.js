/* ==========================================
   WIN EVALUATOR
   Pearl of Fortune
========================================== */

// Symbol IDs must match SymbolManager.createSymbols() (id:0 = Pearl, id:8 = Wild).
// Matrix values coming from ReelMatrix/PaylineEvaluator.getSymbols() are these
// numeric IDs, NOT the strings "PEARL" / "WILD" - see root cause notes below.
const PEARL_SYMBOL_ID = 0;
const WILD_SYMBOL_ID = 8;

class WinEvaluator{

    constructor(){}

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        console.log("Win Evaluator Initialized");

    }

    /* ======================================
       EVALUATE ALL PAYLINES
    ====================================== */

    evaluate(){

        const results = [];

        let totalWin = 0;

        for(

            let line = 0;

            line < paylineManager.getCount();

            line++

        ){

            const result =
                this.evaluateLine(line);

            if(result.win){

                result.amount =
                    mathModel.calculateWin(

                        result.symbol,

                        result.count,

                        betManager.getBet()

                    );

                totalWin += result.amount;

                results.push(result);

            }

        }

        return{

            totalWin,

            winningLines:results

        };

    }

    /* ======================================
       EVALUATE ONE LINE
    ====================================== */

    evaluateLine(lineIndex){

        const symbols =
            paylineEvaluator.getSymbols(lineIndex);

        let baseSymbol = null;

        let count = 0;

        for(let i=0;i<symbols.length;i++){

            const symbol = symbols[i];

            if(symbol===PEARL_SYMBOL_ID){

                break;

            }

            if(baseSymbol===null){

                if(symbol===WILD_SYMBOL_ID){

                    count++;

                    continue;

                }

                baseSymbol = symbol;

                count++;

                continue;

            }

            if(

                symbol===baseSymbol ||

                symbol===WILD_SYMBOL_ID

            ){

                count++;

            }

            else{

                break;

            }

        }

        if(baseSymbol===null){

            baseSymbol=WILD_SYMBOL_ID;

        }

        return{

            line:lineIndex+1,

            symbol:baseSymbol,

            count:count,

            multiplier:

                mathModel.getMultiplier(

                    baseSymbol,

                    count

                ),

            win:

                mathModel.getMultiplier(

                    baseSymbol,

                    count

                )>0

        };

    }

}

window.winEvaluator =
    new WinEvaluator();