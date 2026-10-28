/* ==========================================
   REEL MANAGER
   Pearl of Fortune
========================================== */

class ReelManager{

    constructor(){

        this.reels = [];

        this.animationFrame = null;

        this.isSpinning = false;

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

    this.createReels();

    this.createReelData();
    this.cacheReelSymbols();
    this.drawInitialSymbols();
    this.animate();

    console.log("Reel Manager Initialized");

    }

    createReels(){

    this.symbolElements = [];
    this.reelStrips = [];

    for(let reel=0; reel<CONFIG.REELS.COUNT; reel++){

        const reelElement =
            document.getElementById(`reel-${reel+1}`);

        reelElement.innerHTML = "";

        const strip =
            document.createElement("div");

        strip.className = "reel-strip";

        for(let i=0; i<6; i++){

            const symbolContainer =
                document.createElement("div");

            symbolContainer.className = "symbol";

            const image =
                document.createElement("img");

            image.className = "symbol-image";

            image.src =
                symbolManager.getRandomSymbol().image;

            symbolContainer.appendChild(image);

            strip.appendChild(symbolContainer);

            this.symbolElements.push(image);

        }

        reelElement.appendChild(strip);

            this.reelStrips.push(strip);

    }

}

    /* ======================================
        CREATE REEL DATA
    ====================================== */

    createReelData(){

        this.reels = [];

        for(let i=0; i<CONFIG.REELS.COUNT; i++){

            this.reels.push({

                index: i,

                stripElement: this.reelStrips[i],

                position: 0,

                speed: 20,

                stripIndex:0,

                stopIndex: 0,

                spinning: false,

                stopping: false,

                symbols: [],

                // Milestone - Wild Respin. True while this reel is
                // locked as 3 sticky Wilds - see setStickyWild()
                // below, which is the only thing that ever sets
                // this. startSpin() skips a sticky reel entirely,
                // and getVisibleSymbols() reports Wild for its 3
                // rows regardless of stopIndex/strip content.
                isStickyWild: false

            });

        }

    }

    /* ======================================
        CACHE REEL SYMBOLS
    ====================================== */

    cacheReelSymbols(){

        this.reels.forEach((reel)=>{

            reel.symbols = [

                ...reel.stripElement.querySelectorAll(

                    ".symbol-image"

                )

            ];

        });

    }
    
    /* ======================================
        RECYCLE SYMBOLS
    ====================================== */

    recycleSymbols(reel){

        while(reel.position >= 150){

            reel.position -= 150;

            reel.stripIndex++;

            const strip =
                reelStripManager.getStrip(reel.index);

            reel.stripIndex %= strip.length;

            const symbolID =
                strip[reel.stripIndex];

            const symbol =
                symbolManager.getSymbol(symbolID);

            const first =
                reel.symbols.shift();

            reel.symbols.push(first);

            first.src = symbol.image;

            first.alt = symbol.name;

            reel.stripElement.appendChild(
                first.parentElement
            );

        }

    }

    /* ======================================
        SNAP TO STOP
        Aligns the visible + buffered DOM symbols with
        reel.stopIndex so what the player sees exactly
        matches what getVisibleSymbols() / ReelMatrix
        will read for win evaluation.
    ====================================== */

    snapToStop(reel){

        const strip =
            reelStripManager.getStrip(reel.index);

        for(let i=0; i<reel.symbols.length; i++){

            const stripIndex =
                (reel.stopIndex + i) % strip.length;

            const symbolID =
                strip[stripIndex];

            const symbol =
                symbolManager.getSymbol(symbolID);

            reel.symbols[i].src = symbol.image;

            reel.symbols[i].alt = symbol.name;

        }

        reel.stripIndex =
            (reel.stopIndex + reel.symbols.length) % strip.length;

    }

    /* ======================================
        START SPIN
    ====================================== */

    startSpin(){

        this.isSpinning = true;

        const stops = rngManager.generateStops();

        this.reels.forEach((reel,index)=>{

            // Milestone - Wild Respin. A sticky Wild reel stays
            // completely stationary for the rest of the feature -
            // setStickyWild() below already forced its visible
            // symbols to Wild and left spinning=false, so it's
            // simply skipped here rather than getting a new
            // stopIndex/spin like every other reel.
            if(reel.isStickyWild){

                return;

            }

            reel.position = 0;

            reel.speed = 20;

            reel.spinning = true;

            reel.stopping = false;

            reel.stopIndex = stops[index];

            // Initialize strip position if this is the first spin
            if(reel.stripIndex === undefined){

                reel.stripIndex = reel.stopIndex;

            }

            setTimeout(()=>{

                reel.stopping = true;

            },1500 + index * 250);

        });

    }

    /* ======================================
        SET STICKY WILD (Milestone - Wild Respin)
        Marks/unmarks a reel as a locked Wild Respin reel. While
        sticky: startSpin() above skips it entirely, and
        getVisibleSymbols() below reports Wild for all 3 rows
        regardless of stopIndex/strip content, so the UNCHANGED
        Base Game win evaluator treats these as real Wild symbols.
        The visible DOM symbols are forced to the Wild artwork here
        so the player sees exactly what the matrix says. Clearing
        it only removes the lock/visual marker - the reel gets
        real symbols again the next time it actually spins.
    ====================================== */

    setStickyWild(reelIndex, isSticky){

        const reel =
            this.reels[reelIndex];

        if(!reel){

            return;

        }

        reel.isStickyWild = isSticky;

        if(!isSticky){

            reel.symbols.forEach((imgEl)=>{

                if(imgEl.parentElement){

                    imgEl.parentElement.classList.remove("sticky-wild");

                }

            });

            return;

        }

        reel.spinning = false;
        reel.stopping = false;
        reel.speed = 0;
        reel.position = 0;

        if(reel.stripElement){

            reel.stripElement.style.transform =
                "translateY(0px)";

        }

        const wildSymbol =
            symbolManager.getSymbol(WILD_SYMBOL_ID);

        reel.symbols.forEach((imgEl)=>{

            imgEl.src = wildSymbol.image;
            imgEl.alt = wildSymbol.name;

            if(imgEl.parentElement){

                imgEl.parentElement.classList.add("sticky-wild");

            }

        });

    }

    /* ======================================
        UPDATE
    ====================================== */

    update(){

        this.reels.forEach((reel)=>{

            if(

                this.isSpinning &&

                this.reels.every(reel => !reel.spinning)

            ){

                this.isSpinning = false;

                console.log("All Reels Stopped");

                spinManager.onSpinComplete();

            }

            if(!reel.spinning){

                return;

            }

            reel.position += reel.speed;

            this.recycleSymbols(reel);

            if(reel.stopping){

                reel.speed -- ;

                if(reel.speed <= 0){

                    reel.speed = 0;

                    reel.position = 0;

                    reel.stripElement.style.transform =
                        "translateY(0px)";

                    // Force the visible (and buffered) symbols to
                    // match reel.stopIndex. Without this, recycleSymbols()
                    // has been free-scrolling the strip independently of
                    // stopIndex, so the symbols on screen do not match
                    // what ReelMatrix/getVisibleSymbols() will read for
                    // win evaluation.
                    this.snapToStop(reel);

                    reel.spinning = false;

                    reel.stopping = false;

                    // This individual reel has now actually
                    // stopped (not merely "the button was
                    // clicked" or "the spin sequence started").
                    audioManager.playReelStop();

                }

            }

            if(reel.position >= 150){

            reel.position -= 150;

            }

            reel.stripElement.style.transform =
                `translateY(${reel.position}px)`;

        });

    }
    
    /* ======================================
        ANIMATION LOOP
    ====================================== */

    animate(){

        this.update();

        this.animationFrame =

            requestAnimationFrame(

                ()=>this.animate()

            );

    }

    /* ======================================
       CACHE SYMBOLS
    ====================================== */

    cacheSymbols(){

        this.symbolElements = [

            ...document.querySelectorAll(".symbol-image")

        ];

    }

    /* ======================================
       INITIAL SYMBOLS
    ====================================== */

    drawInitialSymbols(){

        this.updateReels(

            rngManager.generateStops()

        );

    }

    /* ======================================
        GET VISIBLE SYMBOLS
    ====================================== */

    getVisibleSymbols(){

        const visible = [];

        for(let reel = 0; reel < CONFIG.REELS.COUNT; reel++){

            // Milestone - Wild Respin. A sticky Wild reel reports
            // Wild for all 3 rows regardless of stopIndex/strip
            // content, so the UNCHANGED Base Game win evaluator
            // (winEvaluator.js) treats these as real Wild symbols -
            // never a separate win calculator.
            if(this.reels[reel] && this.reels[reel].isStickyWild){

                visible[reel] = [WILD_SYMBOL_ID, WILD_SYMBOL_ID, WILD_SYMBOL_ID];

                continue;

            }

            visible[reel] = [];

            const strip = reelStripManager.getStrip(reel);

            const stop = this.reels[reel].stopIndex;

            for(let row = 0; row < CONFIG.REELS.ROWS; row++){

                const stripIndex =
                    (stop + row) % strip.length;

                visible[reel].push(

                    strip[stripIndex]

                );

            }

        }

        return visible;

    }

    /* ======================================
       UPDATE REELS
    ====================================== */

    updateReels(stops){

        for(let reel=0; reel<CONFIG.REELS.COUNT; reel++){

            const strip =
                reelStripManager.getStrip(reel);

            const stop =
                stops[reel];

            for(let row=0; row<CONFIG.REELS.ROWS; row++){

                const stripIndex =
                    (stop+row)%strip.length;

                const symbolID =
                    strip[stripIndex];

                const symbol =
                    symbolManager.getSymbol(symbolID);

                if(!symbol){

                    console.error(
                        "Invalid Symbol ID:",
                        symbolID
                    );

                    continue;

                }           

                const index =
                    row*CONFIG.REELS.COUNT+reel;

                this.symbolElements[index].src =
                    symbol.image;

                this.symbolElements[index].alt =
                    symbol.name;

            }

        }

    }

    /* ======================================
       SPIN
    ====================================== */

    spin(){

        if(this.isSpinning){

            return;

        }

        this.isSpinning = true;

        let frame = 0;

        const animate = ()=>{

            frame++;

            this.updateReels(

                rngManager.generateStops()

            );

            if(frame<30){

                requestAnimationFrame(animate);

            }

            else{

                this.isSpinning = false;

            }

        };

        animate();

    }

    /* ======================================
       TEST ANIMATION
    ====================================== */

    animateTest(){

    this.reelStrips.forEach((strip,reel)=>{

        strip.style.transition =
            "transform 1s linear";

        strip.style.transform =
            "translateY(-600px)";

    });

    }

}

window.reelManager = new ReelManager();