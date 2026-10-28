/* ==========================================
   SYMBOL MANAGER
   Mystic Slot Prototype
========================================== */

class SymbolManager {

    constructor(){

        this.symbols = [];

        this.initialize();

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.createLibrary();

        console.log("Symbol Manager Initialized");

    }

    /* ======================================
       SYMBOL LIBRARY
    ====================================== */

    createLibrary(){

        this.symbols = [

            {
                id:0,
                name:"Pearl"
            },

            {
                id:1,
                name:"Shell"
            },

            {
                id:2,
                name:"Starfish"
            },

            {
                id:3,
                name:"Coral"
            },

            {
                id:4,
                name:"Seahorse"
            },

            {
                id:5,
                name:"Fish"
            },

            {
                id:6,
                name:"Wild"
            },

            {
                id:7,
                name:"Scatter"
            }

        ];

    }

    /* ======================================
       GET SYMBOL
    ====================================== */

    get(id){

        return this.symbols.find(symbol => symbol.id === id);

    }

    /* ======================================
       RANDOM SYMBOL
    ====================================== */

    random(){

        const index = Math.floor(

            Math.random() * this.symbols.length

        );

        return this.symbols[index];

    }

}