# Azeron Device Data Reference

> Button layouts, key codes, grid positions, and default profiles per device.

---

## 1. Key Code Table (Numeric -> Display Name)

These are the key codes used in profile `keyValues` fields:

```
1: M1          2: M3          3: M2          4: M4          5: M5
8: Backspace   9: Tab         12: Clear      13: Enter      16: Shift
17: Ctrl       18: Alt        19: Pause/Break 20: Caps Lock
21: IME Hangul 23: IME Junja  24: IME Final  25: IME Kanji  27: Esc
28: IME Convert 29: IME Nonconvert 30: IME Accept 31: IME Mode Change
32: Space      33: Page Up    34: Page Down  35: End        36: Home
37: Left       38: Up         39: Right      40: Down
41: Select     42: Print      43: Execute    44: Prnt Scr   45: Insert
46: Delete     47: Help
48-57: 0-9
65-90: A-Z
91: Win        92: Win        93: Menu       95: Sleep
96-105: Numpad 0-9
106: Numpad *  107: Numpad +  109: Numpad -  110: Numpad .  111: Numpad /
112-123: F1-F12
124-127: F13-F16
144: Num Lock  145: Scroll Lock
160: Shift     161: Shift     162: Ctrl      163: Ctrl
164: L Menu    165: R Menu
166: Back      167: Forward   168: Refresh   169: Stop
170: Search    171: Fav       172: Browser
173: Mute      174: Volume Down 175: Volume Up
176: Next Track 177: Prev Track 178: Stop    179: Play/Pause
180: Mail      181: Select    182: My Computer 183: My Calculator
186: ;         187: =         188: ,         189: -
190: .         191: /         192: `
219: [         220: \         221: ]         222: '
250: Play      251: Zoom
```

## 2. JS KeyCode -> Device HID Usage Code Mapping

Used when sending key bindings to the device:

```
A(65)->61444  B(66)->61445  C(67)->61446  D(68)->61447  E(69)->61448
F(70)->61449  G(71)->61450  H(72)->61451  I(73)->61452  J(74)->61453
K(75)->61454  L(76)->61455  M(77)->61456  N(78)->61457  O(79)->61458
P(80)->61459  Q(81)->61460  R(82)->61461  S(83)->61462  T(84)->61463
U(85)->61464  V(86)->61465  W(87)->61466  X(88)->61467  Y(89)->61468
Z(90)->61469

1(49)->61470  2(50)->61471  3(51)->61472  4(52)->61473  5(53)->61474
6(54)->61475  7(55)->61476  8(56)->61477  9(57)->61478  0(48)->61479

Enter(13)->61480  Esc(27)->61481  Backspace(8)->61482  Tab(9)->61483
Space(32)->61484  -(189)->61485   =(187)->61486  [(219)->61487
](221)->61488  \(220)->61489  ;(186)->61491  '(222)->61492
`(192)->61493  ,(188)->61494  .(190)->61495  /(191)->61496
CapsLock(20)->61497

F1-F12(112-123)->61498-61509
PrintScreen(44)->61510  ScrollLock(145)->61511  Pause(19)->61512
Insert(45)->61513  Home(36)->61514  PageUp(33)->61515
Delete(46)->61516  End(35)->61517   PageDown(34)->61518
Right(39)->61519  Left(37)->61520   Down(40)->61521  Up(38)->61522

NumLock(144)->61523  Numpad/(111)->61524  Numpad*(106)->61525
Numpad-(109)->61526  Numpad+(107)->61527
Numpad1-9(97-105)->61529-61537  Numpad0(96)->61538  Numpad.(110)->61539
Menu(93)->61541

Ctrl(17)->57345  LCtrl(162)->57345  RCtrl(163)->57345
Shift(16)->57346  LShift(160)->57346  RShift(161)->57346
Alt(18)->57348  Win(91)->57352  RWin(92)->57352
Sleep(95)->57986
```

## 3. Media Key Codes

```
58545: Pause        58547: Fast Forward  58548: Rewind
58573: Play/Pause   58549: Next Track    58550: Prev Track
58551: Stop         58594: Mute          58601: Volume Up
58602: Volume Down
```

## 4. Mouse Button Codes

```
1: Left    2: Middle    3: Right    4: Back    5: Forward
```

## 5. XInput Button Codes

```
32768: Y        16384: X        8192: B       4096: A
1024: HOME      512: RB         256: LB
128: R STICK    64: L STICK     32: BACK      16: START
8: DPAD RIGHT   4: DPAD LEFT    2: DPAD DOWN  1: DPAD UP
LT, RT: separate trigger axis
```

## 6. DirectInput DPad Directions

```
0: UP    45: UPRIGHT    90: RIGHT     135: RIGHTDOWN
180: DOWN  225: DOWNLEFT  270: LEFT   315: LEFTUP
```

## 7. Input Type Enum

```
1:  KeyboardKey                11: None
2:  Switch (profile)           12: DirectInputDpad
3:  AnalogJoystick             13: ToggleAnalog
4:  AnalogJoystickWithKeys     14: ToggleAnalogShort
5:  DirectInput                15: MouseButton
6:  Disabled                   16: Macro
7:  AnalogJoystickWithKeysUp   17-20: AnalogJoystickAndWithKeys(Up/Right/Down/Left)
8:  AnalogJoystickWithKeysRight 21: XInputJoystick
9:  AnalogJoystickWithKeysDown  22: XInputButton
10: AnalogJoystickWithKeysLeft  23: XInputTrigger
24: SwitchProfile              25-28: AnalogJoystickWithDriftAndKeys(Up/Right/Down/Left)
29: MouseWheelUp               30: MouseWheelDown
31: MouseWheelTrigger          32: ProfileWheelModifier
33: DpiUp                      34: DpiDown
35: ButtonMouseWheel           36: AnalogWheel
37: InputSequence              38: MediaKeys
39: XInputJoystickAndKeys      40: JoystickMouse
```

## 8. Modifier Key Codes (excluded from binding display)

```
16, 160, 161 = Shift variants
17, 162, 163 = Ctrl variants
18 = Alt
91, 92 = Win variants
```

---

## 9. Button Codes Per Device

| Device | Button Codes | Total |
|---|---|---|
| Classic/ClassicTansy | 1-20, 22-24, 28-31 | 27 |
| Cyborg/CyborgTansy | 1-20, 22-24, 28-31, 36-38 | 30 |
| Cyro/CyroLefty | 1-12, 14-17, 20, 22, 24, 28-31, 39-40 | 25 |
| CyborgV2 | 1-20, 22-24, 28-31, 36-38, 41 | 31 |
| Keyzen | 1-20, 22-24, 28-31, 36-38, 41-43 | 33 |

All devices: button 21 = profile switch (not shown in grid). Button 24 = analog stick (2x2 cells).

---

## 10. CSS Grid Layouts (Button Positions)

### Cyborg (8 columns, right-hand)

```
".   .    .  .   .   .   b28 ."
".   b4   b8 b12 b17 b29 b22 b31"
".   b3   b7 b11 b16 .   b30 ."
"b36 b2   b6 b10 b15 b19 b24 b24"
".   b1   b5  b9 b14 .   b24 b24"
".   b37 b38 b13 b18 .   b23 b20"
```

### Cyborg Lefty (mirrored)

```
".   b28 .   .   .    .   .  ."
"b29 b22 b31 b17 b12  b8  b4 ."
".   b30 .   b16 b11  b7  b3 ."
"b24 b24 b19 b15 b10  b6  b2 b36"
"b24 b24 .   b14  b9  b5  b1 ."
"b20 b23 .   b18 b13 b38 b37 ."
```

### Classic (7 columns, right-hand)

```
".  .  b13 b18 .   b28 ."
"b4 b8 b12 b17 b29 b22 b31"
"b3 b7 b11 b16 .   b30 ."
"b2 b6 b10 b15 b19 b24 b24"
"b1 b5 b9  b14 .   b24 b24"
".  .  .   .   .   b23 b20"
```

### Classic Lefty (mirrored)

```
".   b28 .   b18 b13 .   ."
"b29 b22 b31 b17 b12 b8 b4"
".   b30 .   b16 b11 b7 b3"
"b24 b24 b19 b15 b10 b6 b2"
"b24 b24 .   b14 b9  b5 b1"
"b20 b23 .   .   .   .   ."
```

### Cyro (8 columns)

```
".   b28 .   .   .   .   .   ."
"b29 b20 b31 .   .   .   .   ."
".   b30 .   b4  b3  b2  b1  ."
".   b24 b24 b8  b7  b6  b5  ."
".   b24 b24 b39 b12 b11 b10 b9"
".   b22 .   .   b17 b16 b15 b14"
```

### CyroLefty (8 columns, mirrored)

```
".   .   .   .   .   .   b28 ."
".   .   .   .   .   b29 b20 b31"
".   b1  b2  b3  b4  .   b30 ."
".   b5  b6  b7  b8  b24 b24 ."
"b9  b10 b11 b12 b39 b24 b24 ."
"b14 b15 b16 b17 .   .   b22 ."
```

### CyborgV2 (9 columns, right-hand)

```
".   .    .  .   .   .   b28 .   ."
".   b4   b8 b12 b17 b29 b22 b31 ."
".   b3   b7 b11 b16 .   b30 .   ."
"b36 b2   b6 b10 b15 b19 b24 b24 b41"
".   b1   b5  b9 b14 .   b24 b24 b20"
".   b37 b38 b13 b18 .   b23 . ."
```

### Keyzen (9 columns, right-hand)

```
".   .    .  .   .   .   .   b28  ."
".   .   b8 b12 b17  .   b29 b22  b31"
".   b3  b7 b11 b16 b19 .   b30  ."
"b4  b2  b6 b10 b15 b42 b24 b24  b20"
"b36 b1  b5  b9 b14 b43 b24 b24  b41"
".   b37 b38 b13 b18 .   b23 .    ."
```

---

## 11. Cyborg Default Profile (Full)

| ID | Pin | Type | Default Key | Name |
|---|---|---|---|---|
| 1 | 25 | KeyboardKey | 32 | Space |
| 2 | 24 | KeyboardKey | 49 | 1 |
| 3 | 23 | KeyboardKey | 81 | Q |
| 4 | 22 | KeyboardKey | 90 | Z |
| 5 | 19 | KeyboardKey | 18 | Alt |
| 6 | 18 | KeyboardKey | 50 | 2 |
| 7 | 38 | KeyboardKey | 71 | G |
| 8 | 39 | KeyboardKey | 88 | X |
| 9 | 0 | KeyboardKey | 161 | Shift |
| 10 | 1 | KeyboardKey | 51 | 3 |
| 11 | 2 | KeyboardKey | 82 | R |
| 12 | 3 | KeyboardKey | 67 | C |
| 13 | 27 | KeyboardKey | 73 | I |
| 14 | 5 | KeyboardKey | 163 | Ctrl |
| 15 | 7 | KeyboardKey | 52 | 4 |
| 16 | 8 | KeyboardKey | 69 | E |
| 17 | 9 | KeyboardKey | 86 | V |
| 18 | 4 | KeyboardKey | 77 | M |
| 19 | 10 | KeyboardKey | 70 | F |
| 20 | 43 | KeyboardKey | 27 | Esc |
| 21 | 44,45 | Switch | 0 | (Profile Switch) |
| 22 | 17 | KeyboardKey | 84 | T |
| 23 | 40 | KeyboardKey | 187 | = |
| 24 | 41,42 | XInputJoystick | 87 | W (analog) |
| 25-27 | 255 | None | 0 | (unused) |
| 28 | 11 | KeyboardKey | 38 | Up |
| 29 | 14 | KeyboardKey | 37 | Left |
| 30 | 13 | KeyboardKey | 40 | Down |
| 31 | 12 | KeyboardKey | 39 | Right |
| 32-35 | 255 | None | 0 | (unused) |
| 36 | 21 | KeyboardKey | 79 | O |
| 37 | 26 | KeyboardKey | 80 | P |
| 38 | 20 | KeyboardKey | 76 | L |
| 39 | 255 | MouseWheelDown | 0 | Scroll Down |
| 40 | 255 | MouseWheelUp | 0 | Scroll Up |
| 41 | 255 | KeyboardKey | 0 | (unbound) |
| 42 | 28 | KeyboardKey | 0 | (unbound) |
| 43 | 29 | KeyboardKey | 0 | (unbound) |

---

## 12. Default Rotation Angles

```
Cyborg: 0        CyborgTansy: 0    CyborgV2: 0     Keyzen: 0
Classic: 90      ClassicTansy: 90
Cyro: 90         CyroLefty: -90
```

---

## 13. Macro Format

### JSON Storage

```json
{
  "macro": {
    "repeat": false,
    "steps": [
      { "type": "Button", "keyCode": 87, "duration": 50, "direction": "Full" },
      { "type": "Delay",  "keyCode": 0,  "duration": 100, "direction": "Full" },
      { "type": "Mouse",  "keyCode": 1,  "duration": 30, "direction": "Down" }
    ],
    "v": 1
  }
}
```

**Step types:** Button, Mouse, Delay, XInput, DInput, DPad
**Directions:** Full (press+wait+release), Down (press only), Up (release only)

Macros are software-only -- NOT sent to device over HID. Executed by the main process.

---

## 14. Latest Firmware Versions

```
Classic: 89      Cyborg: 89       Cyro: 102       CyroLefty: 102
CyborgTansy: 96  ClassicTansy: 97  CyborgV2: 100  Keyzen: 100
```
