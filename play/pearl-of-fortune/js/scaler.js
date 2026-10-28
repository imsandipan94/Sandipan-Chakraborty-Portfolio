/* ==========================================
   SCALER
   Mystic Slot Prototype
========================================== */

class GameScaler {

    constructor(){

        this.viewport = document.getElementById("viewport");

        this.game = document.getElementById("game");

        this.resize();

        window.addEventListener("resize", () => this.resize());

    }

    resize(){

        const windowWidth = window.innerWidth;

        const windowHeight = window.innerHeight;

        const scaleX = windowWidth / CONFIG.GAME.WIDTH;

        const scaleY = windowHeight / CONFIG.GAME.HEIGHT;

        const scale = Math.min(scaleX, scaleY);

        this.game.style.transform =
        `translate(-50%, -50%) scale(${scale})`;

    }

}

/* ==========================================
   CREATE SCALER
========================================== */

const scaler = new GameScaler();