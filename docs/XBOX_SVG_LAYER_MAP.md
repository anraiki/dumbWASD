# Xbox SVG Layer Map

Use these `inkscape:label` names for interactive Xbox controller shapes.

## File locations

| File | Role |
| --- | --- |
| `devices/xbox/layout.svg` | **Canonical rendered artwork.** Imported by `gui/src/devices/xbox.ts` via `@devices/xbox/layout.svg?raw`. This is the file the app ships. |
| `devices/xbox/source.svg` | Inkscape master/template the layout was derived from. Slightly richer than the shipped file (keeps `TEXT_MENU`/`TEXT_VIEW` labels; uses `BACKGROUND_LB`/`BACKGROUND_RB` where layout.svg uses `BG_LB`/`BG_RB`). Start here when creating artwork for a new controller. |
| `devices/xbox/source-analog.svg` | Older template variant using the pre-rename `BUTTON_ANALOG_*` zone labels. Kept as reference artwork. |

Inkscape crash-recovery autosaves (`name.svg.YYYY_MM_DD_*.svg`) are gitignored — never commit them.

## Core buttons

These are the primary mappable controls:

| Layer label | Xbox control | Common evdev name |
| --- | --- | --- |
| `BUTTON_A` | A | `BTN_SOUTH` |
| `BUTTON_B` | B | `BTN_EAST` |
| `BUTTON_X` | X | `BTN_WEST` |
| `BUTTON_Y` | Y | `BTN_NORTH` |
| `BUTTON_LB` | Left bumper | `BTN_TL` |
| `BUTTON_RB` | Right bumper | `BTN_TR` |
| `BUTTON_LT` | Left trigger | `BTN_TL2` |
| `BUTTON_RT` | Right trigger | `BTN_TR2` |
| `BUTTON_VIEW` | View / Back | `BTN_SELECT` |
| `BUTTON_MENU` | Menu / Start | `BTN_START` |
| `BUTTON_GUIDE` | Xbox / Guide | `BTN_MODE` |
| `BUTTON_LSTICK_PRESS` | Left stick press | `BTN_THUMBL` |
| `BUTTON_RSTICK_PRESS` | Right stick press | `BTN_THUMBR` |
| `BUTTON_DPAD_UP` | D-pad up | `BTN_DPAD_UP` |
| `BUTTON_DPAD_DOWN` | D-pad down | `BTN_DPAD_DOWN` |
| `BUTTON_DPAD_LEFT` | D-pad left | `BTN_DPAD_LEFT` |
| `BUTTON_DPAD_RIGHT` | D-pad right | `BTN_DPAD_RIGHT` |

## Optional analog direction overlays

If you want hover/highlight regions for stick directions, use a separate shape for each zone:

| Layer label | Meaning |
| --- | --- |
| `BUTTON_LSTICK_UP` | Left stick pushed up |
| `BUTTON_LSTICK_DOWN` | Left stick pushed down |
| `BUTTON_LSTICK_LEFT` | Left stick pushed left |
| `BUTTON_LSTICK_RIGHT` | Left stick pushed right |
| `BUTTON_LSTICK_PRESS` | Left stick press hotspot (used instead of `_CENTER` in the shipped file) |
| `BUTTON_RSTICK_UP` | Right stick pushed up |
| `BUTTON_RSTICK_DOWN` | Right stick pushed down |
| `BUTTON_RSTICK_LEFT` | Right stick pushed left |
| `BUTTON_RSTICK_RIGHT` | Right stick pushed right |
| `BUTTON_RSTICK_PRESS` | Right stick press hotspot (used instead of `_CENTER` in the shipped file) |

## Non-interactive layers

Keep these as decoration only. Prefix conventions in the shipped file:

- `BG_*` — background/shadow fills (`BG_Controller`, `BG_LB`, `BG_RB`)
- `TEXT_*` — button glyph text (`TEXT_A`, `TEXT_B`, `TEXT_X`, `TEXT_Y`)
- `OUTLINE_*` — stroke outlines per control (`OUTLINE_A`, `OUTLINE_LSTICK_INNER`, `OUTLINE_RSTICK_PRESS`, ...)

## Current state of the shipped SVG

The rename guide that used to live here has been carried out — `devices/xbox/layout.svg` now uses normalized `BUTTON_*` labels throughout (verified June 2026). Known gaps:

- `BUTTON_LT` / `BUTTON_RT` (triggers) are not drawn yet.
- Stick press hotspots are labeled `BUTTON_LSTICK_PRESS` / `BUTTON_RSTICK_PRESS` (not `_CENTER`).
- `TEXT_MENU` / `TEXT_VIEW` labels exist only in `devices/xbox/source.svg`, not the shipped file.

## Minimal set

If you only want click/hover support for physical buttons, this is the minimum useful set:

`BUTTON_A`, `BUTTON_B`, `BUTTON_X`, `BUTTON_Y`, `BUTTON_LB`, `BUTTON_RB`, `BUTTON_LT`, `BUTTON_RT`, `BUTTON_VIEW`, `BUTTON_MENU`, `BUTTON_GUIDE`, `BUTTON_LSTICK_PRESS`, `BUTTON_RSTICK_PRESS`, `BUTTON_DPAD_UP`, `BUTTON_DPAD_DOWN`, `BUTTON_DPAD_LEFT`, `BUTTON_DPAD_RIGHT`.
