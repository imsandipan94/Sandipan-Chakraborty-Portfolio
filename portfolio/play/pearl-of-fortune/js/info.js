/* ==========================================
   GAME INFORMATION PAGE
   Pearl of Fortune

   Drives info.html only - never touches any of the real game's own
   managers/state, this page is a fully standalone static document.
========================================== */

const INFO_PAYLINE_COUNT = 20;

document.addEventListener("DOMContentLoaded", () => {

    buildPaylinesGrid();
    registerToolbar();
    registerNav();

});

/* ======================================
   BUILD PAYLINES GRID
   Renders all 20 real payline diagrams (assets/paylines/1.png..20.png,
   the SAME assets AnimationManager uses in-game) over the same reel
   background art the reels themselves use, so every diagram matches
   the live game exactly rather than a redrawn approximation.
====================================== */

function buildPaylinesGrid(){

    const grid =
        document.getElementById("paylines-grid");

    if(!grid){

        return;

    }

    for(let line=1; line<=INFO_PAYLINE_COUNT; line++){

        const card =
            document.createElement("div");

        card.className = "payline-card";

        const visual =
            document.createElement("div");

        visual.className = "payline-visual";

        // 5x3 cell outline, appended BEFORE the payline image below so
        // plain DOM-order stacking keeps the line drawn on top of it -
        // makes the 3x5 grid the line runs across actually visible,
        // not just a bare line floating over the reel backdrop.
        const cellGrid =
            document.createElement("div");

        cellGrid.className = "payline-cellgrid";

        for(let cell=0; cell<15; cell++){

            cellGrid.appendChild(document.createElement("span"));

        }

        visual.appendChild(cellGrid);

        const img =
            document.createElement("img");

        img.src = `assets/paylines/${line}.png`;
        img.alt = `Payline ${line}`;
        img.loading = "lazy";

        visual.appendChild(img);

        const label =
            document.createElement("span");

        label.className = "payline-label";
        label.textContent = `Line ${line}`;

        card.appendChild(visual);
        card.appendChild(label);

        grid.appendChild(card);

    }

}

/* ======================================
   TOOLBAR - EXPAND ALL / COLLAPSE ALL
====================================== */

function registerToolbar(){

    const sections =
        document.querySelectorAll(".info-section");

    const expandBtn =
        document.getElementById("expand-all-btn");

    const collapseBtn =
        document.getElementById("collapse-all-btn");

    if(expandBtn){

        expandBtn.addEventListener("click", () => {

            sections.forEach((section) => { section.open = true; });

        });

    }

    if(collapseBtn){

        collapseBtn.addEventListener("click", () => {

            sections.forEach((section) => { section.open = false; });

        });

    }

}

/* ======================================
   SECTION NAV
   Clicking a nav pill force-opens its target <details> section (in
   case the browser's own native fragment-navigation auto-open
   behavior isn't supported) and smooth-scrolls to it; an
   IntersectionObserver keeps the currently-visible section's own
   pill highlighted as the page is scrolled manually.
====================================== */

function registerNav(){

    const links =
        document.querySelectorAll(".info-nav-link");

    links.forEach((link) => {

        link.addEventListener("click", (event) => {

            const targetId =
                link.getAttribute("href").slice(1);

            const target =
                document.getElementById(targetId);

            if(!target){

                return;

            }

            event.preventDefault();

            target.open = true;

            target.scrollIntoView({ behavior:"smooth", block:"start" });

            history.replaceState(null, "", `#${targetId}`);

        });

    });

    const sections =
        document.querySelectorAll(".info-section[id]");

    if(!("IntersectionObserver" in window) || sections.length===0){

        return;

    }

    const setActive = (id) => {

        links.forEach((link) => {

            link.classList.toggle(

                "active",

                link.getAttribute("href")===`#${id}`

            );

        });

    };

    const observer = new IntersectionObserver((entries) => {

        entries.forEach((entry) => {

            if(entry.isIntersecting){

                setActive(entry.target.id);

            }

        });

    }, {

        rootMargin:"-140px 0px -70% 0px",

        threshold:0

    });

    sections.forEach((section) => { observer.observe(section); });

}
