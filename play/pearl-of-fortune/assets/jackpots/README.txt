JACKPOT ASSET FOLDER
=====================

Drop the final artwork here as:

    grand.png   -> GRAND jackpot meter
    major.png   -> MAJOR jackpot meter
    minor.png   -> MINOR jackpot meter
    mini.png    -> MINI jackpot meter

Recommended export size for EACH file:
    1064 x 320 px  (4x master asset)

Intended display area is approximately 266 x 80 px; the
game scales each image down automatically. No HTML/CSS/JS
changes are needed to swap these files; just replace them
with new files of the same names.

The jackpot VALUE text (GRAND/MAJOR/MINOR/MINI numbers) is
separate from this artwork and keeps working exactly as it
does today - it's driven by the existing HTML value
elements, not by these images.

Until these files are present, the game falls back to its
original bordered/colored jackpot boxes, so the project
remains playable with this folder empty.
