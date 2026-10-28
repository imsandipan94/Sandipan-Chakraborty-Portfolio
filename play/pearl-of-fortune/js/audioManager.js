/* ==========================================
   AUDIO MANAGER
   Pearl of Fortune

   Single source of truth for the game's mute state. Nothing
   else in the codebase should track "is audio on" itself -
   any future system that plays a sound should either:

     a) route the actual playback through play()/registerSound()
        below, so it automatically inherits the current mute
        state and stays in sync with later toggle() calls, or

     b) just check audioManager.isMuted() before playing.

   The audio button (id="audio-button", formerly the MENU
   button - see index.html) is owned entirely by this manager;
   no other script touches it.
========================================== */

// Minimum gap (ms) between two starts of the SAME named SFX - see
// playSfx(). Purely a stacking guard; it never delays or blocks
// the game action that triggered the sound, only a duplicate
// overlapping copy of that one sound.
const DEFAULT_SFX_COOLDOWN_MS = 60;

class AudioManager{

    constructor(){

        this.muted = false;

        // iOS Safari (unlike Android) only allows an HTMLMediaElement
        // to start audible playback if that play() call happens
        // synchronously inside a real user-gesture event handler. Most
        // of this game's SFX are triggered later, from inside the
        // rAF-driven reel-update loop or setTimeout-scheduled
        // animation steps (see registerAudioUnlock() below) - by the
        // time those fire, the originating click/tap's gesture context
        // is gone, so on iOS specifically their play() calls are
        // silently blocked. This flag guards a one-time, gesture-
        // synchronous play()+pause() of a real sound (done in
        // registerAudioUnlock()) that unlocks audio playback for the
        // rest of the session.
        this.unlocked = false;

        this.button = null;

        this.icon = null;

        // Any Audio()/HTMLAudioElement instances a future sound
        // system hands us via registerSound() - kept so mute()/
        // unmute() can apply instantly to everything already
        // playing, not just future play() calls.
        this.sounds = [];

        // The currently-playing reel-spin loop (or null) - see
        // playReelSpin()/stopReelSpin(). Tracked separately from
        // `sounds` above so a new spin can never stack a second
        // looping copy on top of one still playing.
        this.reelSpinAudio = null;

        // Milestone - Free Spins Mermaid's Blessing / Automatic
        // Bubble Bonus. The currently-playing Mermaid's Blessings
        // loop (or null) - see startMermaidBlessingLoop()/
        // stopMermaidBlessingLoop(). Same dedicated-field pattern as
        // reelSpinAudio above, for the same reason (never let a
        // second overlapping loop stack on top of one already
        // playing).
        //
        // NOTE: a true sample-accurate (Web Audio API) gapless loop
        // was attempted here and reverted - it requires fetch()/XHR
        // to load the raw audio bytes for decodeAudioData(), and
        // Chrome blocks BOTH entirely on file:// pages (confirmed:
        // fetch rejects with "Failed to fetch", XHR returns status
        // 0) - this project currently runs via file://, so that
        // approach produced silence instead of fixing the gap. See
        // the chat response for what unblocks the real fix.
        this.mermaidBlessingAudio = null;

        // Milestone - Win Celebration Popups. The currently-playing
        // Big/Super/Mega Win loop (or null) - see
        // startWinCelebrationLoop()/stopWinCelebrationLoop(). Same
        // single-field pattern as featureIntroAudio/featureOutroAudio
        // (only one tier is ever shown at a time).
        this.winCelebrationAudio = null;

        // performance.now() of the last time each named SFX key
        // was actually started, for the cooldown in playSfx().
        this.lastPlayedAt = {};

    }

    /* ======================================
       INITIALIZE
    ====================================== */

    initialize(){

        this.button =
            document.getElementById("audio-button");

        this.icon =
            document.getElementById("audio-icon");

        this.muted = this.loadPreference();

        this.applyMuteState();

        this.updateUI();

        this.registerEvents();

        this.registerAudioUnlock();

        this.preloadSfx();

        console.log("Audio Manager Initialized");

    }

    /* ======================================
       AUDIO UNLOCK (iOS gesture requirement)
       Listens for the very first user gesture anywhere on the page
       and, synchronously within that event, plays then immediately
       pauses a real sound from this game's own SFX set. On iOS this
       one gesture-synchronous play() "unlocks" HTMLMediaElement
       playback for the rest of the session, so every later SFX
       (fired from the reel-update loop/setTimeout animation steps,
       none of which run inside a user-gesture callstack) is then
       allowed to actually play instead of being silently blocked.
       Runs once per session - removes its own listeners immediately
       after the first gesture, whether or not play() ends up
       succeeding.
    ====================================== */

    registerAudioUnlock(){

        const unlock = () => {

            if(this.unlocked){

                return;

            }

            this.unlocked = true;

            document.removeEventListener("pointerdown", unlock, true);
            document.removeEventListener("touchend", unlock, true);
            document.removeEventListener("click", unlock, true);

            // A real gameplay sound, not a silent/dummy element -
            // iOS's unlock is tied to an actual successful playback.
            // Never registered via registerSound()/added to
            // this.sounds - it is not a gameplay SFX instance, it
            // exists only to establish the unlock and is discarded
            // immediately after.
            const unlockElement = new Audio(CONFIG.AUDIO.SFX.BUTTON_CLICK);

            unlockElement.addEventListener("error", () => {});

            const playResult = unlockElement.play();

            if(playResult && typeof playResult.then === "function"){

                playResult.then(() => {

                    unlockElement.pause();
                    unlockElement.currentTime = 0;

                }).catch(() => {

                    // Blocked/errored even on this first gesture -
                    // gameplay never depends on it; later SFX simply
                    // keep using their own existing silent-catch
                    // behavior, same as before this fix.

                });

            }

        };

        document.addEventListener("pointerdown", unlock, true);
        document.addEventListener("touchend", unlock, true);
        document.addEventListener("click", unlock, true);

    }

    /* ======================================
       EVENTS
    ====================================== */

    registerEvents(){

        if(!this.button){

            return;

        }

        this.button.addEventListener(

            "click",

            () => {

                this.toggle();

            }

        );

    }

    /* ======================================
       PERSISTENCE
    ====================================== */

    loadPreference(){

        try{

            // No stored preference yet -> default to Audio ON
            // (unmuted), per spec.
            return localStorage.getItem(CONFIG.AUDIO.STORAGE_KEY) === "true";

        } catch(error){

            // Storage unavailable (private browsing, etc.) -
            // fall back to the same default rather than throwing.
            return false;

        }

    }

    savePreference(){

        try{

            localStorage.setItem(

                CONFIG.AUDIO.STORAGE_KEY,

                String(this.muted)

            );

        } catch(error){

            // Non-fatal - the mute state itself still works for
            // the rest of this session, it just won't persist.

        }

    }

    /* ======================================
       PUBLIC API
    ====================================== */

    toggle(){

        // Played with whatever the CURRENT mute state still is at
        // the moment of the click (registerSound() below applies
        // it at creation time) - so toggling OFF plays this one
        // last click audibly before going silent, and toggling ON
        // stays silent for this specific click (audio was still
        // off when it started) but every click after works normally.
        this.playButtonClick();

        if(this.muted){

            this.unmute();

        } else {

            this.mute();

        }

    }

    mute(){

        this.muted = true;

        this.applyMuteState();

        this.updateUI();

        this.savePreference();

    }

    unmute(){

        this.muted = false;

        this.applyMuteState();

        this.updateUI();

        this.savePreference();

    }

    isMuted(){

        return this.muted;

    }

    /* ======================================
       SOUND REGISTRY

       Lets a future sound system hand this manager its Audio
       instances so mute()/unmute() can control them centrally,
       instead of every system re-checking isMuted() itself.
    ====================================== */

    registerSound(audioElement){

        if(!audioElement){

            return audioElement;

        }

        audioElement.muted = this.muted;

        this.sounds.push(audioElement);

        return audioElement;

    }

    /* ======================================
       PLAY
       Convenience helper for future sound systems - creates
       (or reuses) an Audio element, applies the current mute
       state before playback ever starts, and registers it so
       a later toggle() still reaches it.
    ====================================== */

    play(src, options){

        const audioElement = new Audio(src);

        if(options && options.loop){

            audioElement.loop = true;

        }

        if(options && typeof options.volume === "number"){

            audioElement.volume = options.volume;

        }

        // A missing/broken file (or a browser codec issue) fires
        // "error", not a play() rejection - caught here so it
        // never bubbles up as an uncaught error. Gameplay is
        // unaffected either way; this just continues silently.
        audioElement.addEventListener("error", () => {

            console.warn(

                `AudioManager: could not load "${src}" - continuing without it.`

            );

        });

        this.registerSound(audioElement);

        // Muted audio elements are still allowed to play() -
        // they just produce no sound - so new audio genuinely
        // stays silent while OFF is active, per spec, rather
        // than erroring out or queuing. Also how browser autoplay
        // restrictions are respected: a blocked play() rejects
        // this promise instead of throwing, so it's silently
        // swallowed the same way - the game never depends on a
        // sound actually having played.
        audioElement.play().catch(() => {});

        return audioElement;

    }

    /* ======================================
       PRELOAD SFX
       Warms every gameplay SFX's decode at boot, off the critical
       path of any real event, so the FIRST reel stop/win/Pearl/
       collector upgrade in a session doesn't lag behind its sound.
       Creating and .load()-ing an element here is enough for the
       browser to fetch+decode it; it's never played or registered
       (registerSound()/this.sounds is only for ACTUALLY playing
       instances, which playSfx() creates fresh each call).
    ====================================== */

    preloadSfx(){

        Object.values(CONFIG.AUDIO.SFX).forEach((src) => {

            const preloadElement =
                new Audio();

            preloadElement.preload = "auto";
            preloadElement.src = src;

            preloadElement.addEventListener("error", () => {

                console.warn(

                    `AudioManager: could not preload "${src}" - continuing without it.`

                );

            });

        });

    }

    /* ======================================
       COOLDOWN-GUARDED PLAY
       Shared by every named SFX method below. Skips starting a
       new copy of the SAME key if it was already started within
       `cooldownMs` - this only ever prevents a literal audio
       pile-up (e.g. a key repeating on bet+, or a synthetic test
       firing several events back to back); it never delays or
       withholds the game action itself, which callers always run
       independently of this.
    ====================================== */

    playSfx(key, src, options, cooldownMs){

        const limit =
            cooldownMs===undefined ? DEFAULT_SFX_COOLDOWN_MS : cooldownMs;

        const now =
            performance.now();

        const last =
            this.lastPlayedAt[key] !== undefined ?
                this.lastPlayedAt[key] : -Infinity;

        if(now - last < limit){

            return null;

        }

        this.lastPlayedAt[key] = now;

        return this.play(src, options);

    }

    /* ======================================
       NAMED GAMEPLAY SFX (Milestone 12.6)
       One method per event, each just a thin call into play()/
       playSfx() above - callers never touch CONFIG.AUDIO.SFX or
       Audio() directly, so every gameplay sound stays swappable
       for a final production file later by editing config.js
       alone.
    ====================================== */

    playButtonClick(){

        return this.playSfx(

            "buttonClick",
            CONFIG.AUDIO.SFX.BUTTON_CLICK,
            { volume:0.5 }

        );

    }

    /* Looping - startSpin()/onSpinComplete() are exactly "spin
       begins"/"reel sequence finishes" (see spinManager.js), so
       this starts once per spin and stopReelSpin() ends it once
       all 5 reels have actually stopped. stopReelSpin() is also
       called defensively before starting a new loop, so two spins
       can never overlap into a doubled-up loop. */
    playReelSpin(){

        this.stopReelSpin();

        this.reelSpinAudio = this.play(

            CONFIG.AUDIO.SFX.REEL_SPIN,
            { loop:true, volume:0.35 }

        );

    }

    stopReelSpin(){

        if(!this.reelSpinAudio){

            return;

        }

        this.reelSpinAudio.pause();
        this.reelSpinAudio.currentTime = 0;

        const index =
            this.sounds.indexOf(this.reelSpinAudio);

        if(index!==-1){

            this.sounds.splice(index, 1);

        }

        this.reelSpinAudio = null;

    }

    /* Called once per reel from the same place ReelManager already
       flips reel.spinning=false - see reelManager.js. A short
       cooldown just guards against a theoretical double-fire; the
       5 reels stopping in sequence are always spaced well beyond
       it (~200ms+ apart), so every real stop still plays. */
    playReelStop(){

        return this.playSfx(

            "reelStop",
            CONFIG.AUDIO.SFX.REEL_STOP,
            { volume:0.4 },
            40

        );

    }

    /* One SFX for the WHOLE winning presentation, not once per
       payline - called once from AnimationManager.
       showLineWinAmounts() (the entry point for the whole
       sequence), never from showLineWinAmount() (the per-line
       reveal), even when several lines win and are presented in
       sequence. */
    playWinLine(){

        return this.playSfx(

            "winLine",
            CONFIG.AUDIO.SFX.WIN_LINE,
            { volume:0.55 }

        );

    }

    /* Called once per Pearl from AnimationManager.playPearlTravel()
       at the moment the Pearl clone actually starts flying toward
       its collector - deliberately NOT at arrival, so it stays an
       audibly separate moment from Collector Upgrade FX/SFX, which
       only fires later once the Pearl actually reaches the
       collector. Multiple Pearls landing close together are
       already staggered by Pearl Collection FX itself
       (PEARL_SAME_REEL_STAGGER_MS); this cooldown is just a
       defensive backstop. */
    playPearlCollect(){

        return this.playSfx(

            "pearlCollect",
            CONFIG.AUDIO.SFX.PEARL_COLLECT,
            { volume:0.5 },
            80

        );

    }

    /* Called only for an ACTUAL progression increase (0/3->1/3,
       1/3->2/3, 2/3->3/3), from the same place/moment Collector
       Upgrade FX's glow is applied - see
       AnimationManager.playCollectorUpgradeFx(). Deliberately
       never called for the 3/3->0/3 reset path (change.isReset),
       matching this milestone's own test list. */
    playCollectorUpgrade(){

        return this.playSfx(

            "collectorUpgrade",
            CONFIG.AUDIO.SFX.COLLECTOR_UPGRADE,
            { volume:0.6 },
            80

        );

    }

    /* Feature Trigger hook - called once from FeatureManager.
       triggerFeature() the instant ANY Bonus Feature (Wild Respin/
       Free Spins/Lucky Wheel/Pick Bonus) is actually identified/
       routed. */
    playFeatureTrigger(){

        return this.playSfx(

            "featureTrigger",
            CONFIG.AUDIO.SFX.FEATURE_TRIGGER,
            { volume:0.7 },
            200

        );

    }

    /* Feature Transition hook - called once from AnimationManager.
       presentFeatureTransition() the instant the shared glow-wipe
       transition begins (Free Spins' intro/outro today, Pick Bonus/
       Lucky Wheel later). */
    playFeatureTransition(){

        return this.playSfx(

            "featureTransition",
            CONFIG.AUDIO.SFX.FEATURE_TRANSITION,
            { volume:0.6 },
            200

        );

    }

    /* Mermaid's Blessing hook (Milestone - Wild Respin + Mermaid's
       Blessing) - called once from WildRespinFeature.
       triggerMermaidsBlessing() the instant mermaid-blessing.png is
       triggered. No asset exists yet - see config.js. */
    playMermaidsBlessing(){

        return this.playSfx(

            "mermaidsBlessing",
            CONFIG.AUDIO.SFX.MERMAIDS_BLESSING,
            { volume:0.65 },
            200

        );

    }

    /* The Mermaid's magical Pearl zap toward the secondary
       Collector - deliberately NOT playPearlCollect() (this is not
       a normal gameplay Pearl collection, per this milestone's own
       "Pearl Collection Audio" section). Called once from
       AnimationManager.presentMermaidPearlZap(). */
    playMermaidPearlZap(){

        return this.playSfx(

            "mermaidPearlZap",
            CONFIG.AUDIO.SFX.MERMAID_PEARL_ZAP,
            { volume:0.6 },
            200

        );

    }

    /* Bubble Pop hook (Milestone - Free Spins Mermaid's Blessing /
       Automatic Bubble Bonus) - called once per POPPED bubble from
       BubbleBonusFeature.popBubble(). Never called for an escaped
       bubble (those award nothing and stay silent). */
    playBubblePop(){

        return this.playSfx(

            "bubblePop",
            CONFIG.AUDIO.SFX.BUBBLE_POP,
            { volume:0.55 },
            60

        );

    }

    /* Mermaid's Blessings loop (Milestone - Free Spins Mermaid's
       Blessing / Automatic Bubble Bonus) - started once from
       BubbleBonusFeature.showBlessingPopup(), the instant the
       "Mermaid's Blessings" announcement appears, and kept looping
       for the WHOLE Bubble Bonus sequence (bubbles included) until
       BubbleBonusFeature.finish() stops it. Deliberately separate
       from playMermaidsBlessing() (Wild Respin's own one-shot SFX) -
       different config key, different moment, and this one loops
       where that one doesn't. Same reelSpinAudio-style dedicated-
       field pattern as playReelSpin()/stopReelSpin() above - a
       fresh start always stops any previous copy first, so this can
       never stack two overlapping loops. */
    startMermaidBlessingLoop(){

        this.stopMermaidBlessingLoop();

        this.mermaidBlessingAudio = this.play(

            CONFIG.AUDIO.SFX.MERMAID_BLESSING_INTRO,
            { loop:true, volume:0.55 }

        );

    }

    stopMermaidBlessingLoop(){

        if(!this.mermaidBlessingAudio){

            return;

        }

        this.mermaidBlessingAudio.pause();
        this.mermaidBlessingAudio.currentTime = 0;

        const index =
            this.sounds.indexOf(this.mermaidBlessingAudio);

        if(index!==-1){

            this.sounds.splice(index, 1);

        }

        this.mermaidBlessingAudio = null;

    }

    /* Feature intro popup loop (Milestone - Bonus Feature intro/
       outro audio) - started the instant AnimationManager.
       presentFeatureIntroPopup()'s artwork appears, stopped the
       instant it's removed (playFeatureIntroEnd() below plays right
       after). Generic - the SAME popup/call every Bonus Feature's
       own intro reuses (Free Spins today, Lucky Wheel/Pick Bonus
       later), so this needs no per-feature parameter. Same plain
       Audio()-element loop as playReelSpin()/startMermaidBlessingLoop()
       above - not a gapless Web Audio loop, per explicit instruction
       (that approach left this silent). */
    startFeatureIntroLoop(){

        this.stopFeatureIntroLoop();

        this.featureIntroAudio = this.play(

            CONFIG.AUDIO.SFX.FEATURE_INTRO_LOOP,
            { loop:true, volume:0.5 }

        );

    }

    stopFeatureIntroLoop(){

        if(!this.featureIntroAudio){

            return;

        }

        this.featureIntroAudio.pause();
        this.featureIntroAudio.currentTime = 0;

        const index =
            this.sounds.indexOf(this.featureIntroAudio);

        if(index!==-1){

            this.sounds.splice(index, 1);

        }

        this.featureIntroAudio = null;

    }

    /* Played once from AnimationManager.presentFeatureIntroPopup() -
       the instant the intro popup/loop above is removed. */
    playFeatureIntroEnd(){

        return this.playSfx(

            "featureIntroEnd",
            CONFIG.AUDIO.SFX.FEATURE_INTRO_END,
            { volume:0.6 },
            200

        );

    }

    /* Feature outro "FEATURE / COMPLETE" popup loop (Milestone -
       Bonus Feature intro/outro audio) - started the instant
       AnimationManager.presentFeatureCompletionPopup() shows that
       popup, stopped 2s later right before the Feature's own outro
       transition begins (playFeatureOutroEnd() below plays at that
       same moment). Same plain Audio()-element loop as the intro
       loop above. */
    startFeatureOutroLoop(){

        this.stopFeatureOutroLoop();

        this.featureOutroAudio = this.play(

            CONFIG.AUDIO.SFX.FEATURE_OUTRO_LOOP,
            { loop:true, volume:0.5 }

        );

    }

    stopFeatureOutroLoop(){

        if(!this.featureOutroAudio){

            return;

        }

        this.featureOutroAudio.pause();
        this.featureOutroAudio.currentTime = 0;

        const index =
            this.sounds.indexOf(this.featureOutroAudio);

        if(index!==-1){

            this.sounds.splice(index, 1);

        }

        this.featureOutroAudio = null;

    }

    /* Played once from AnimationManager.presentFeatureCompletionPopup() -
       the instant its 2s "FEATURE / COMPLETE" popup/loop above ends,
       right before the Feature's own outro transition begins. */
    playFeatureOutroEnd(){

        return this.playSfx(

            "featureOutroEnd",
            CONFIG.AUDIO.SFX.FEATURE_OUTRO_END,
            { volume:0.6 },
            200

        );

    }

    /* Win Celebration popup loop (Milestone - Win Celebration Popups) -
       started the instant AnimationManager.presentWinCelebrationPopup()'s
       artwork appears, stopped CONFIG.WIN_CELEBRATION.DURATION_MS
       later right before it's removed
       (playWinCelebrationEnd() below plays at that same moment). Only
       ONE tier (Big/Super/Mega Win) is ever shown at a time, so this
       reuses the SAME single dedicated-field pattern as
       featureIntroAudio/featureOutroAudio above rather than one field
       per tier - sfxPath is caller-provided (CONFIG.AUDIO.SFX.
       BIG_WIN_LOOP/SUPER_WIN_LOOP/MEGA_WIN_LOOP) since which tier is
       showing is only known by the caller. */
    startWinCelebrationLoop(sfxPath){

        this.stopWinCelebrationLoop();

        this.winCelebrationAudio = this.play(

            sfxPath,
            { loop:true, volume:0.6 }

        );

    }

    stopWinCelebrationLoop(){

        if(!this.winCelebrationAudio){

            return;

        }

        this.winCelebrationAudio.pause();
        this.winCelebrationAudio.currentTime = 0;

        const index =
            this.sounds.indexOf(this.winCelebrationAudio);

        if(index!==-1){

            this.sounds.splice(index, 1);

        }

        this.winCelebrationAudio = null;

    }

    /* Played once from AnimationManager.presentWinCelebrationPopup() -
       the instant its own loop above is removed (CONFIG.AUDIO.SFX.
       BIG_WIN_END/SUPER_WIN_END/MEGA_WIN_END, per the same tier). */
    playWinCelebrationEnd(sfxPath){

        return this.playSfx(

            "winCelebrationEnd",
            sfxPath,
            { volume:0.7 },
            200

        );

    }

    /* ======================================
       APPLY MUTE STATE
       Immediately mutes/unmutes every sound this manager
       knows about (registered Audio elements) plus any plain
       <audio> tags sitting in the DOM, so flipping the toggle
       affects currently-playing audio at once, not just audio
       started afterwards.
    ====================================== */

    applyMuteState(){

        this.sounds.forEach((audioElement) => {

            audioElement.muted = this.muted;

        });

        document.querySelectorAll("audio").forEach((audioElement) => {

            audioElement.muted = this.muted;

        });

    }

    /* ======================================
       UPDATE UI
    ====================================== */

    updateUI(){

        if(this.icon){

            this.icon.src = this.muted ?
                CONFIG.AUDIO.ICON_OFF :
                CONFIG.AUDIO.ICON_ON;

            this.icon.alt = this.muted ?
                "Audio Off" :
                "Audio On";

        }

        if(this.button){

            this.button.setAttribute(

                "aria-pressed",

                String(this.muted)

            );

        }

    }

}

/* ==========================================
   GLOBAL INSTANCE
========================================== */

const audioManager = new AudioManager();
