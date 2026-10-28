# Mystic Slot Prototype

## Overview

Mystic Slot Prototype is a browser-based HTML5 slot game built using vanilla HTML, CSS, and JavaScript.

The project follows a modular architecture, allowing each game system to be developed independently while maintaining clean code and scalability.

---

# Internal Resolution

```
800 × 1600
```

The game world always remains at this resolution.

The browser only scales the game visually using `scaler.js`.

---

# Project Structure

```
assets/
│
├── audio/
├── background/   (v4.7 - drop-in background.png)
├── jackpots/      (v4.7 - drop-in grand/major/minor/mini.png)
├── fonts/
├── images/
└── animations/

css/
│
├── reset.css
├── theme.css
├── game.css
├── ui.css
└── debug.css

js/
│
├── config.js
├── scaler.js
├── boot.js
│
├── core/
├── reels/
├── ui/
├── bonus/
└── animation/

docs/
```

---

# Development Milestones

### Milestone 1
- Engine Foundation
- Fixed Resolution
- UI Layout
- Scaling System

### Milestone 2
- Static Scene
- Background
- Mermaid
- Collectors
- Reel Frame
- HUD

### Milestone 3
- Reel Engine
- Reel Animation
- Symbols
- Spin Logic

### Milestone 4
- Slot Logic
- Paylines
- Wins
- Bet
- Balance

### Milestone 5
- Bonus Features
- Free Spins
- Wilds
- Collectors
- Pick Bonus

### Milestone 6
- Audio
- Effects
- Optimization
- Final Polish

---

# Coding Standards

- Vanilla JavaScript
- No external frameworks
- Modular architecture
- One responsibility per file
- Fixed game resolution
- Fully documented code

---

# Version

Current Version

```
v0.1.0
```