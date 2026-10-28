/* ==========================================
   SYMBOL MANAGER
   Pearl of Fortune
========================================== */

class SymbolManager{

    constructor(){

        this.symbols = [];

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.createSymbols();

        console.log("Symbol Manager Initialized");

    }

    /* ======================================
       CREATE SYMBOLS
    ====================================== */

    createSymbols(){

    this.symbols = [

        {
            id:0,
            name:"Pearl",
            image:"assets/symbols/pearl.png"
        },

        {
            id:1,
            name:"Mermaid",
            image:"assets/symbols/mermaid.png"
        },

        {
            id:2,
            name:"Seahorse",
            image:"assets/symbols/seahorse.png"
        },

        {
            id:3,
            name:"Conch",
            image:"assets/symbols/conch.png"
        },

        {
            id:4,
            name:"A",
            image:"assets/symbols/A.png"
        },

        {
            id:5,
            name:"K",
            image:"assets/symbols/K.png"
        },

        {
            id:6,
            name:"Q",
            image:"assets/symbols/Q.png"
        },

        {
            id:7,
            name:"J",
            image:"assets/symbols/J.png"
        },

        {
            id:8,
            name:"Wild",
            image:"assets/symbols/wild.png"
        },


    ];

}

    /* ======================================
       GET SYMBOL
    ====================================== */

    getSymbol(id){

        return this.symbols[id];

    }

    getRandomSymbol(){

    const randomIndex = Math.floor(
        Math.random() * this.symbols.length
    );

    return this.symbols[randomIndex];

    }

    /* ======================================
       RANDOM SYMBOL
    ====================================== */

    getRandomSymbol(){

        const index = Math.floor(

            Math.random() * this.symbols.length

        );

        return this.symbols[index];

    }

}

window.symbolManager = new SymbolManager();