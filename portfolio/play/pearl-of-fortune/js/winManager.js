/* ==========================================
   WIN MANAGER
   Pearl of Fortune
========================================== */

class WinManager{

    constructor(){

        this.lastWin = 0;

        this.totalWinText = null;

    }

    initialize(){

        this.totalWinText =
            document.getElementById("total-win-value");

        this.updateUI(0);

        console.log("Win Manager Initialized");

    }

    /* ======================================
        UI
    ====================================== */

    updateUI(value){

        this.lastWin = value;

        // Re-query defensively instead of relying only on the
        // cached reference, in case evaluate() ever runs before
        // initialize() has had a chance to cache the element.
        if(!this.totalWinText){

            this.totalWinText =
                document.getElementById("total-win-value");

        }

        if(this.totalWinText){

            this.totalWinText.textContent =
                this.lastWin.toLocaleString();

        }

        else{

            console.warn(

                "WinManager: #total-win-value element not found in DOM"

            );

        }

    }

    /* ======================================
        RESET
    ====================================== */

    reset(){

        this.updateUI(0);

    }

    /* ======================================
        EVALUATE
    ====================================== */

    evaluate(){

        const result =
            winEvaluator.evaluate();

        console.table(

            result.winningLines

        );

        console.log(

            "TOTAL WIN",

            result.totalWin

        );

        // Round to avoid floating point artifacts from
        // summing multiple line multipliers (e.g. 0.1+0.2).
        const totalWin =
            Math.round(result.totalWin * 100) / 100;

        this.updateUI(totalWin);

        if(totalWin > 0){

            balanceManager.add(totalWin);

        }

        return result;

    }

}

window.winManager = new WinManager();