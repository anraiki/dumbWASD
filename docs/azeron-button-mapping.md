# Azeron Cyborg Button Mapping Reference

## Mapping Chain

Physical button press → firmware reads pin → sends HID key based on active profile → Linux evdev reports KEY_* code

```
Azeron Button ID → Hardware Pin → Profile Binding (JS keyCode) → HID Usage Code → Linux evdev code
```

**Important**: The evdev code reported to Linux depends on the user's active Azeron profile.
If the user changes their button bindings in the Azeron software, the evdev codes will change.

## JS keyCode → evdev Code Conversion

| JS keyCode | Key Name   | evdev Name      | evdev Code |
|------------|------------|-----------------|------------|
| 37         | ArrowLeft  | KEY_LEFT        | 105        |
| 38         | ArrowUp    | KEY_UP          | 103        |
| 39         | ArrowRight | KEY_RIGHT       | 106        |
| 40         | ArrowDown  | KEY_DOWN        | 108        |
| 48         | 0          | KEY_0           | 11         |
| 49         | 1          | KEY_1           | 2          |
| 50         | 2          | KEY_2           | 3          |
| 51         | 3          | KEY_3           | 4          |
| 52         | 4          | KEY_4           | 5          |
| 53         | 5          | KEY_5           | 6          |
| 65         | A          | KEY_A           | 30         |
| 66         | B          | KEY_B           | 48         |
| 67         | C          | KEY_C           | 46         |
| 68         | D          | KEY_D           | 32         |
| 69         | E          | KEY_E           | 18         |
| 70         | F          | KEY_F           | 33         |
| 71         | G          | KEY_G           | 34         |
| 72         | H          | KEY_H           | 35         |
| 73         | I          | KEY_I           | 23         |
| 74         | J          | KEY_J           | 36         |
| 75         | K          | KEY_K           | 37         |
| 76         | L          | KEY_L           | 38         |
| 77         | M          | KEY_M           | 50         |
| 78         | N          | KEY_N           | 49         |
| 79         | O          | KEY_O           | 24         |
| 80         | P          | KEY_P           | 25         |
| 81         | Q          | KEY_Q           | 16         |
| 82         | R          | KEY_R           | 19         |
| 83         | S          | KEY_S           | 31         |
| 84         | T          | KEY_T           | 20         |
| 85         | U          | KEY_U           | 22         |
| 86         | V          | KEY_V           | 47         |
| 87         | W          | KEY_W           | 17         |
| 88         | X          | KEY_X           | 45         |
| 89         | Y          | KEY_Y           | 21         |
| 90         | Z          | KEY_Z           | 44         |
| 16         | Shift      | KEY_LEFTSHIFT   | 42         |
| 17         | Ctrl       | KEY_LEFTCTRL    | 29         |
| 18         | Alt        | KEY_LEFTALT     | 56         |
| 187        | = (+)      | KEY_EQUAL       | 13         |

## Default Keyboard Profile (from azeron-linux proving-ground)

Source: `~/Documents/projects/azeron-linux/app/src/resources/proving-ground-profiles/keyboard-profile.json`

| Az ID | Pin | Type         | JS Key | Key Name   | evdev Code | evdev Name      |
|-------|-----|--------------|--------|------------|------------|-----------------|
| 1     | 9   | 1 (Key)      | 65     | A          | 30         | KEY_A           |
| 2     | 8   | 1 (Key)      | 81     | Q          | 16         | KEY_Q           |
| 3     | 13  | 1 (Key)      | 81     | Q          | 16         | KEY_Q           |
| 4     | 12  | 1 (Key)      | 90     | Z          | 44         | KEY_Z           |
| 5     | 10  | 1 (Key)      | 65     | A          | 30         | KEY_A           |
| 6     | 11  | 1 (Key)      | 69     | E          | 18         | KEY_E           |
| 7     | 15  | 1 (Key)      | 71     | G          | 34         | KEY_G           |
| 8     | 14  | 1 (Key)      | 88     | X          | 45         | KEY_X           |
| 9     | 0   | 1 (Key)      | 67     | C          | 46         | KEY_C           |
| 10    | 1   | 1 (Key)      | 51     | 3          | 4          | KEY_3           |
| 11    | 2   | 1 (Key)      | 82     | R          | 19         | KEY_R           |
| 12    | 3   | 1 (Toggle)   | 65     | A          | 30         | KEY_A           |
| 13    | 3   | 1 (Key)      | 73     | I          | 23         | KEY_I           |
| 14    | 4   | 1 (Key)      | 67     | C          | 46         | KEY_C           |
| 15    | 5   | 1 (Key)      | 70     | F          | 33         | KEY_F           |
| 16    | 6   | 1 (Toggle)   | 69     | E          | 18         | KEY_E           |
| 17    | 7   | 1 (Toggle)   | 83     | S          | 31         | KEY_S           |
| 18    | 10  | 1 (Key)      | 77     | M          | 50         | KEY_M           |
| 19    | 11  | 1 (Key)      | 70     | F          | 33         | KEY_F           |
| 20    | 20  | 1 (Toggle)   | 84     | T          | 20         | KEY_T           |
| 21    | —   | 2 (ProfSwitch)| —     | —          | —          | (profile switch)|
| 22    | 22  | 1 (Key)      | 84     | T          | 20         | KEY_T           |
| 23    | 18  | 1 (Key)      | 187    | = (+)      | 13         | KEY_EQUAL       |
| 24    | 13,14| 4 (Joystick)| 87    | W (WASD)   | —          | (analog stick)  |
| 28    | 19  | 1 (Key)      | 38     | ArrowUp    | 103        | KEY_UP          |
| 29    | 18  | 1 (Key)      | 37     | ArrowLeft  | 105        | KEY_LEFT        |
| 30    | 16  | 1 (Key)      | 40     | ArrowDown  | 108        | KEY_DOWN        |
| 31    | 17  | 1 (Key)      | 39     | ArrowRight | 106        | KEY_RIGHT       |
| 36    | 21  | 1 (Key)      | 79     | O          | 24         | KEY_O           |
| 37    | 26  | 1 (Key)      | 80     | P          | 25         | KEY_P           |
| 38    | 20  | 1 (Key)      | 76     | L          | 38         | KEY_L           |

## User's Current Profile vs Default

The user has customized several buttons from the default profile.
Current layout TOML uses evdev codes matching the user's active profile:

| Az ID | Default Key | User's Key | User evdev | Match? |
|-------|-------------|------------|------------|--------|
| 1     | A           | A          | 30         | YES    |
| 2     | Q           | 1          | 2          | NO     |
| 3     | Q           | Q          | 16         | YES    |
| 4     | Z           | Z          | 44         | YES    |
| 5     | A           | Alt        | 56         | NO     |
| 6     | E           | 2          | 3          | NO     |
| 7     | G           | G          | 34         | YES    |
| 8     | X           | X          | 45         | YES    |
| 9     | C           | Shift      | 42         | NO     |
| 10    | 3           | 3          | 4          | YES    |
| 11    | R           | R          | 19         | YES    |
| 12    | A           | C          | 46         | NO     |
| 13    | I           | I          | 23         | YES    |
| 14    | C           | Ctrl       | 29         | NO     |
| 15    | F           | 4          | 5          | NO     |
| 16    | E           | E          | 18         | YES    |
| 17    | S           | V          | 47         | NO     |
| 18    | M           | M          | 50         | YES    |
| 19    | F           | F          | 33         | YES    |
| 20    | T           | Mouse L    | 272        | NO     |
| 22    | T           | T          | 20         | YES    |
| 23    | = (+)       | = (+)      | 13         | YES    |
| 24    | Joystick    | Joystick   | —          | YES    |
| 28    | ArrowUp     | Up         | 103        | YES    |
| 29    | ArrowLeft   | Left       | 105        | YES    |
| 30    | ArrowDown   | Down       | 108        | YES    |
| 31    | ArrowRight  | Right      | 106        | YES    |
| 36    | O           | O          | 24         | YES    |
| 37    | P           | P          | 25         | YES    |
| 38    | L           | L          | 38         | YES    |

## Input Types (from Azeron profiles)

| Type Code | Meaning                  |
|-----------|--------------------------|
| 1         | KeyboardKey              |
| 2         | ProfileSwitch            |
| 4         | AnalogJoystickWithKeys   |
| 6         | Toggle (key held)        |
| 11        | Disabled / None          |
| 15        | MouseButton              |
| 29        | Scroll (Y axis)          |
| 30        | Scroll (X axis)          |

## Key Insight

The layout TOML currently hardcodes evdev codes based on the user's active Azeron profile.
This means:
- If the user changes bindings in Azeron software, the layout file becomes stale
- A more robust approach would use Azeron physical button IDs (1-38) as the stable identifier
  and dynamically resolve evdev codes by reading the active profile from the device
- The `learn-layout --scan` CLI command can re-discover evdev codes by having the user press buttons
