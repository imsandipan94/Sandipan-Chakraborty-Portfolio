/* ==========================================
   BALANCE MANAGER
   Pearl of Fortune
========================================== */

class BalanceManager{

    constructor(){

        this.balance = CONFIG.ECONOMY.STARTING_BALANCE;

        this.balanceText = null;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.balanceText = document.getElementById("balance-value");

        this.updateUI();

        console.log("Balance Manager Initialized");

    }

    /* ======================================
       UI
    ====================================== */

    updateUI(){

        if(this.balanceText){

            this.balanceText.textContent =
                this.balance.toLocaleString();

        }

    }

    /* ======================================
       GET BALANCE
    ====================================== */

    getBalance(){

        return this.balance;

    }

    /* ======================================
       ADD
    ====================================== */

    add(amount){

        this.balance += amount;

        this.updateUI();

    }

    /* ======================================
       SUBTRACT
    ====================================== */

    subtract(amount){

        if(amount > this.balance){

            return false;

        }

        this.balance -= amount;

        this.updateUI();

        return true;

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

const balanceManager = new BalanceManager();