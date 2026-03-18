# Azeron Electron App Analysis - Progress Checkpoint

## Status: IN PROGRESS (paused for restart)

## What Has Been Found So Far

### 1. JSON Profile Structure (COMPLETE)

Three proving-ground profiles exist: `keyboard-profile.json`, `joystick-profile.json`, `xbox-profile.json`.

Each profile has:
```json
{
  "version": "1.4.0-qa",
  "profiles": [{
    "id": "uuid",
    "name": "ProfileName",
    "isFavorite": true,
    "isSoftware": true,
    "inputs": [/* array of button input objects */],
    "profileSettings": {
      "profileSensitivitySettings": {
        "currentSensitivityIndex": 1,
        "sensitivityValues": [1000, 4000, 7500, 10000, 15000]
      },
      "isSensorOn": true,
      "mouseSensorAngle": 0
    }
  }]
}
```

Each input object:
```json
{
  "id": 1,              // button ID (1-40)
  "pinOne": 9,          // physical pin number (0-26, 255=none)
  "pinTwo": 255,        // second pin (for joystick axes: 255=none)
  "types": ["1", "11", "11"],  // [singlePress, longPress, doublePress] type codes
  "keyValues": ["65", "0", "0", "0"],  // key code + up to 3 modifiers
  "metaValues": ["0", "0", "0"],       // meta/modifier values
  "keyValuesLong": ["0", "0", "0", "0"],
  "metaValuesLong": ["0", "0", "0"],
  "keyValuesDouble": ["0", "0", "0", "0"],
  "metaValuesDouble": ["0", "0", "0"],
  "macro": {"repeat": false, "steps": [], "v": 1},
  "longMacro": {"repeat": false, "steps": [], "v": 1},
  "doubleMacro": {"repeat": false, "steps": [], "v": 1},
  "featureDelay": 500,    // long-press delay ms
  "doubleDelay": 200,     // double-press window ms
  "x": 0, "y": 0,        // mouse movement values
  "interval": 20, "yInterval": 20,
  "isHold": false, "isHoldLong": false, "isHoldDouble": false,
  "holdTime": 0, "holdTimeLong": 0, "holdTimeDouble": 0,
  "sequenceTriggerSettings": {"isPingPongLoop": false, "sequenceSteps": []},
  "label": ""             // optional custom label
}
```

### 2. Device Type Enum (Jr)

```
Jr.Classic      = 1   "Classic/Compact"
Jr.Cyborg       = 3   "Cyborg"
Jr.Cyro         = 4   "Cyro"
Jr.CyborgTansy  = 5   "Cyborg" (Tansy variant)
Jr.ClassicTansy = 6   "Classic/Compact" (Tansy variant)
Jr.CyroLefty    = 7   "Cyro-lefty"
Jr.CyborgV2     = 8   "Cyborg V2"
Jr.Keyzen       = 9   "Keyzen"
```

### 3. Input Type Enum (Oa) - COMPLETE

The types field in profiles uses string-encoded numbers:
```
Oa.KeyboardKey                        = "1"
Oa.Switch                             = "2"   (profile switching)
Oa.AnalogJoystick                     = "3"
Oa.AnalogJoystickWithKeys             = "4"
Oa.DirectInput                        = "5"
Oa.Disabled                           = "6"
Oa.AnalogJoystickWithKeysUp           = "7"
Oa.AnalogJoystickWithKeysRight        = "8"
Oa.AnalogJoystickWithKeysDown         = "9"
Oa.AnalogJoystickWithKeysLeft         = "10"
Oa.None                               = "11"
Oa.DirectInputDpad                    = "12"
Oa.ToggleAnalog                       = "13"
Oa.ToggleAnalogShort                  = "14"
Oa.MouseButton                        = "15"
Oa.Macro                              = "16"
Oa.AnalogJoystickAndWithKeysUp        = "17"
Oa.AnalogJoystickAndWithKeysRight     = "18"
Oa.AnalogJoystickAndWithKeysDown      = "19"
Oa.AnalogJoystickAndWithKeysLeft      = "20"
Oa.XInputJoystick                     = "21"
Oa.XInputButton                       = "22"
Oa.XInputTrigger                      = "23"
Oa.SwitchProfile                      = "24"
Oa.AnalogJoystickWithDriftAndKeysUp   = "25"
Oa.AnalogJoystickWithDriftAndKeysRight= "26"
Oa.AnalogJoystickWithDriftAndKeysDown = "27"
Oa.AnalogJoystickWithDriftAndKeysLeft = "28"
Oa.MouseWheelUp                       = "29"
Oa.MouseWheelDown                     = "30"
Oa.MouseWheelTrigger                  = "31"
Oa.ProfileWheelModifier               = "32"
Oa.DpiUp                              = "33"
Oa.DpiDown                            = "34"
Oa.ButtonMouseWheel                   = "35"
Oa.AnalogWheel                        = "36"
Oa.InputSequence                      = "37"
Oa.MediaKeys                          = "38"
Oa.XInputJoystickAndKeys              = "39"
Oa.JoystickMouse                      = "40"
```

### 4. Bind Mode Categories (xa)

```
NONE, KEYBOARD, JOYSTICK, JOYSTICK_DPAD, MOUSE, MEDIA, MACRO,
SPECIAL, SHORTCUT, DISABLE, XINPUT, X360_STICK, KEYBOARD_STICK,
ANALOG_JOYSTICK, ANALOG_WHEEL, TOGGLE_ANALOG, TOGGLE_ANALOG_SHORT,
LAYERING, MOUSE_WHEEL, MOUSE_WHEEL_TRIGGER, PROFILE_WHEEL_MODIFIER,
DPI_BUTTON, BUTTON_MOUSE_WHEEL, INPUT_SEQUENCE, X360_KEYBOARD_STICK,
JOYSTICK_MOUSE
```

### 5. Macro Step Types (Ea)

```
Ea.Button = "Button"
Ea.Mouse  = "Mouse"
Ea.Delay  = "Delay"
Ea.XInput = "XInput"
Ea.DInput = "DInput"
Ea.DPad   = "DPad"
```

Macro step actions (Sa):
```
Sa.Up   = "Up"
Sa.Down = "Down"
Sa.Full = "Full"
```

### 6. XInput Button Names (Pa)

```
Y, X, B, A, HOME, PUSH L STICK, PUSH R STICK, BACK, START,
DPAD RIGHT, DPAD LEFT, DPAD DOWN, DPAD UP, LB, RB, LT, RT
```

### 7. HID Device IDs

Vendor ID: 5840 (0x16D0)
HID Usage: 257 (0x0101)
HID Usage Page: 65281 (0xFF01)

Product IDs:
```
3903 (0x0F3F)
4284 (0x10BC)
4355 (0x1103)
4626 (0x1212)
4412 (0x113C)
4498 (0x1192)
4855 (0x12F7)
5098 (0x13EA)
```

### 8. Profile Parsing State Machine (Da/Ta)

For wire protocol profile parsing:
```
Da.SEQ_START     = "PROFILES"      (Ta = 0)
Da.PROFILE_START = "PROFILE"       (Ta = 1)
                                    Ta.PROFILE_INDEX = 2
                                    Ta.PROFILE_NAME  = 3
                                    Ta.PROFILE_DATA  = 4
Da.PROFILE_END   = "END_PROFILE"   (Ta = 5)
Da.SEQ_END       = "END_PROFILES"  (Ta = 6)
```

### 9. Profile Validation Error Types (ka)

```
ka.INVALID_INDEX        = "invalid-index"
ka.INVALID_BINDING      = "invalid-binding"
ka.INVALID_PIN          = "invalid-pin"
ka.INVALID_TYPE         = "invalid-type"
ka.INVALID_KEY_VALUES   = "invalid-key-values"
ka.INVALID_META_VALUES  = "invalid-meta-values"
ka.INVALID_PROFILE_DATA = "invalid-profile-data"
```

### 10. Mouse Button Labels

```
Va = {1:"L", 2:"M", 3:"R", 4:"B", 5:"F"}
```

### 11. Joystick Button Labels (DirectInput)

```
Ha = {1:"#1", 2:"#2", ..., 32:"#32"}
```

### 12. Redux Action Types Found

Profile actions (Zl enum):
- ADD_HW_PROFILES, ADD_PROFILE, SELECT_PROFILE, ACTIVATE_PROFILE
- ADD_PROFILE_BUTTON_BIND_MODE, REMOVE_PROFILE_BUTTON_BIND_MODE_ACTIVE_PROF
- RENAME_PROFILE, SELECT_BUTTON, SET_SINGLE/LONG/DOUBLE_BUTTON_BIND_MODE
- KEY_DOWN, KEY_UP, CLEAR_KEYS_DOWN, SET_BINDS_STRING
- UPDATE_BUTTON_INPUT_ACTIVE_PROF, UPDATE_BUTTON_INPUT_NON_ACTIVE
- SWAP_BUTTON, DELETE_SW_PROFILE, REPLACE_PROFILE
- SET_ACTIVE_HW_PROFILE, SET_PROFILE_FAVORITE
- UPDATE_BUTTON_MACRO_ACTIVE_PROF, SET_INPUT_CUSTOM_LABEL_ACTIVE_PROF
- SET_LAYERING_BUTTON_DATA, SET_MOUSE_SENSITIVITY, SET_MOUSE_SENSOR
- SET_FEATURE_DELAY_ACTIVE_PROF, SET_DOUBLE_DELAY_ACTIVE_PROF
- SET_HOLD_FLAG_ACTIVE_PROF, SET_HOLD_TIME_ACTIVE_PROF
- UPDATE_INPUT_SEQUENCE_ACTIVE_PROF, SET_PROFILE_ORDER_LIST
- SET_RGB_LED_STATE, UPDATE_KEYBOARD_ANALOG_SETTINGS
- UPDATE_ANALOG_SETTINGS, UPDATE_ANALOG_ADVANCED_SETTINGS, UPDATE_ANALOG_ANGLE

Global actions (Qu enum):
- SET_DEVICE_VERSION, SET_FW_TYPE, SET_KEYPAD_TYPE, SET_LEFTIE
- SET_MODE, SET_DEVICE_PATH, SET_DEVICE_SERIAL, SET_UNIQUE_DEVICE_ID
- SET_GLOBAL_BUTTON_THROTTLE, SET_BUTTON_BOUNCE_THROTTLE, SET_ANALOG_THROTTLE
- SET_GLOBAL_ANGLE, SET_TEENSY_ANGLE
- SET_ANALOG_LOW_DEADZONE, SET_ANALOG_HIGH_DEADZONE
- SET_ANALOG_X_OFFSET, SET_ANALOG_Y_OFFSET
- SET_LED_BRIGHTNESS, SET_LED_STATE
- SET_FW_UPDATE_STATUS, SET_FW_UPDATE_PERCENTAGE
- SET_PROFILE_LIMIT, SET_RIGHT_ANALOG
- SET_STICK_AXES (xMax, xMin, yMax, yMin)
- SET_PERFORMANCE_FW

### 13. Cyborg Default Button Inputs (us) - Pin Mapping

Variable `us` is the Cyborg default profile. Extracted id -> pinOne mapping:
```
Button ID | Pin  | Default Key
----------|------|------------
1         | 25   | 32 (Space)
2         | 24   | 49 (1)
3         | 23   | 81 (Q)
4         | 22   | 90 (Z)
5         | 10   | 65 (A)  -- NOTE: older profile uses pin 10
6         | 11   | 69 (E)  -- older profile uses pin 11
7         | 15   | 71 (G)
8         | 14   | 88 (X)
9         | 0    | 67 (C)
10        | 1    | 51 (3)
11        | 2    | 82 (R)
... (need to extract remaining)
```

### 14. Default Angle per Device Type

```
Cyro:         90
CyroLefty:   -90
CyborgTansy:   0
Classic:      90
Cyborg:        0
ClassicTansy: 90
CyborgV2:      0
Keyzen:        0
```

### 15. FW Version Requirements per Device

```
Latest FW:  Classic=89, Cyborg=89, Cyro=102, CyroLefty=102,
            CyborgTansy=96, ClassicTansy=97, CyborgV2=100, Keyzen=100

Min Binary FW: Classic=66, Cyborg=66, Cyro=72, CyroLefty=72,
               CyborgTansy=70, ClassicTansy=70, CyborgV2=90, Keyzen=100
```

### 16. Grid Layout per Device

The CSS grid uses 8 columns for Cyborg/CyborgTansy, 7 for others.
Layout selection function maps device type to CSS styled-component:
```
Classic/ClassicTansy -> HL/jL (lefty variant)
Cyborg/CyborgTansy   -> BL/FL (lefty variant)
Cyro                  -> UL
CyroLefty             -> $L
CyborgV2              -> GL/KL (lefty variant)
Keyzen                -> WL/zL (lefty variant)
```

## STILL TO DO

1. **Extract full Cyborg button definitions** - The `us` variable contains all ~38+ inputs with pin mappings. Need to extract them all cleanly.

2. **Find button label arrays** - Variables `bi` (Cyborg), `yi` (Classic), `_i` (Cyro), `vi` (CyborgV2), `Li` (Keyzen) map button IDs to visual labels/names. Need to locate and extract these.

3. **Extract grid position CSS** - The styled-components `BL`, `FL`, etc. contain CSS grid-area definitions that specify visual button positions.

4. **Find key code table** - Need the full mapping of numeric key codes to key names (the keyValues numbers like "65"="A", "81"="Q", etc.).

5. **Extract IPC channel names** - Already found some (`_r`, `yr`, `zo`, `qo`, "profile-name-set", "set-ui-font-size", "set-theme"). Need to extract the full list of IPC invoke channel constants.

6. **Search main-process.js** - For HID write/read logic, command framing, and the actual wire protocol.

7. **Extract pipe-delimited profile format** - The Da/Ta state machine suggests profiles are sent over HID as: `PROFILES|PROFILE|<index>|<name>|<data>|END_PROFILE|...|END_PROFILES`. Need to find the actual formatting/parsing code.

8. **Extract macro step format** - How macro steps are serialized.

## Search Strategy Notes

- The render-process.js is webpack-bundled on a single line (or few lines), making grep hard.
- Splitting on `;` and `,` helps isolate statements.
- Key variable names found:
  - `us` = Cyborg defaults, `ds` = CyborgTansy, `cs` = ClassicTansy, `ps` = Classic, `ms` = Cyro, `gs` = CyroLefty, `Ls` = CyborgV2, `Ds` = Keyzen
  - `bi` = Cyborg button labels, `yi` = Classic labels, `_i` = Cyro labels, `vi` = CyborgV2 labels, `Li` = Keyzen labels
  - `Oa` = InputType enum, `Jr` = DeviceType enum, `xa` = BindMode enum
  - `Da`/`Ta` = Profile parsing state machine
  - `Zl` = Profile Redux actions, `Qu` = Global Redux actions
  - `Va` = mouse button labels, `Ha` = joystick button labels
  - `yl` = service object with HID communication methods
