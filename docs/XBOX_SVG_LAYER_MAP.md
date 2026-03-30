# Xbox SVG Layer Map

Use these `inkscape:label` names for interactive Xbox controller shapes.

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
| `BUTTON_LSTICK_CENTER` | Left stick neutral / press hotspot |
| `BUTTON_RSTICK_UP` | Right stick pushed up |
| `BUTTON_RSTICK_DOWN` | Right stick pushed down |
| `BUTTON_RSTICK_LEFT` | Right stick pushed left |
| `BUTTON_RSTICK_RIGHT` | Right stick pushed right |
| `BUTTON_RSTICK_CENTER` | Right stick neutral / press hotspot |

## Non-interactive layers

Keep these as decoration only:

- `BG_CONTROLLER`
- `TEXT_A`
- `TEXT_B`
- `TEXT_X`
- `TEXT_Y`
- `OUTLINE`
- `SHADOW`

## Rename guide for the current SVG

The current [`gui/src/assets/xbox.svg`](/home/anri/Documents/projects/dumbWASD/gui/src/assets/xbox.svg) is close, but these names should be normalized:

| Current label | Recommended label |
| --- | --- |
| `LB` | `BUTTON_LB` |
| `RB` | `BUTTON_RB` |
| `BUTTON_START` | `BUTTON_VIEW` |
| `BUTTON_SELECT` | `BUTTON_MENU` |
| `BUTTON_HOME` or `HOME` | `BUTTON_GUIDE` |
| `PAD_TOP` | `BUTTON_DPAD_UP` |
| `PAD_DOWN` | `BUTTON_DPAD_DOWN` |
| `PAD_LEFT` | `BUTTON_DPAD_LEFT` |
| `PAD_RIGHT` | `BUTTON_DPAD_RIGHT` |
| `BUTTON_L_ANALOG_TOP` | `BUTTON_LSTICK_UP` |
| `BUTTON_L_ANALOG_BOTTOM` | `BUTTON_LSTICK_DOWN` |
| `BUTTON_L_ANALOG_LEFT` | `BUTTON_LSTICK_LEFT` |
| `BUTTON_L_ANALOG_RIGHT` | `BUTTON_LSTICK_RIGHT` |
| `BUTTON_L_ANALOG_MIDDLE` | `BUTTON_LSTICK_CENTER` |
| Right stick copies still named `BUTTON_L_ANALOG_*` | Rename them to `BUTTON_RSTICK_*` |

## Minimal set

If you only want click/hover support for physical buttons, this is the minimum useful set:

`BUTTON_A`, `BUTTON_B`, `BUTTON_X`, `BUTTON_Y`, `BUTTON_LB`, `BUTTON_RB`, `BUTTON_LT`, `BUTTON_RT`, `BUTTON_VIEW`, `BUTTON_MENU`, `BUTTON_GUIDE`, `BUTTON_LSTICK_PRESS`, `BUTTON_RSTICK_PRESS`, `BUTTON_DPAD_UP`, `BUTTON_DPAD_DOWN`, `BUTTON_DPAD_LEFT`, `BUTTON_DPAD_RIGHT`.
