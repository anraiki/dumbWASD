# Azeron HID Protocol Reference

> Extracted from azeron-linux Electron app v1.5.6 (render-process.js + main-process.js)

---

## 1. Device Identification

**Vendor ID:** 5840 (0x16D0)
**HID Usage:** 257 (0x0101)
**HID Usage Page:** 65281 (0xFF01)

| Product ID (dec) | Product ID (hex) | Device | KeypadType Enum |
|---|---|---|---|
| 3903 | 0x0F3F | Classic/Compact | 1 |
| 4284 | 0x10BC | Cyborg | 3 |
| 4355 | 0x1103 | Cyro | 4 |
| 4626 | 0x1212 | Cyro-lefty | 7 |
| 4412 | 0x113C | Cyborg (Tansy) | 5 |
| 4498 | 0x1192 | Classic/Compact (Tansy) | 6 |
| 4855 | 0x12F7 | Cyborg V2 | 8 |
| 5098 | 0x13EA | Keyzen | 9 |

---

## 2. Dual Protocol System

The device supports two protocols, selected based on firmware version:

- **String protocol** (legacy): text-based commands framed as `^<length>~<payload>\n`
- **Binary protocol** (modern): byte-array commands with 7-byte page headers

### Minimum Firmware for Binary Protocol

| Device | Min FW Version |
|---|---|
| Classic | 66 |
| Cyborg | 66 |
| Cyro | 72 |
| CyroLefty | 72 |
| CyborgTansy | 70 |
| ClassicTansy | 70 |
| CyborgV2 | 90 |
| Keyzen | 100 |

---

## 3. String Protocol

### Write Framing

```
^<decimal_length>~<command_string>\n
```

- `^` (0x5E) = start marker
- `<length>` = ASCII decimal of payload length
- `~` (0x7E) = separator
- `\n` (0x0A) = terminator

Written in 65-byte HID reports: byte 0 = 0x00 (report ID), bytes 1-64 = payload chunk.

### String Commands (Sent TO Device)

| Command | Purpose |
|---|---|
| `Hi` | Ping/heartbeat |
| `GET_PROFILES` | Request all profiles |
| `PS_<n>` | Request profile by index |
| `P_LIMIT` | Request profile limit |
| `PROFILE_ADD` | Add new profile |
| `GET_FW_VERSION` | Request firmware version |
| `GET_FW_TYPE` | Request firmware type |
| `GET_LEDS` | Request LED state |
| `LEDBRT` | Request LED brightness |
| `LED\|<value>` | Set LED brightness |
| `LEDS_ON` / `LEDS_OFF` | Toggle LEDs |
| `HW_MODE` / `SW_MODE` | Switch mode |
| `BTNTHT` | Request button throttle |
| `GET_THROTTLE_TYPE` | Request throttle type |
| `THROTTLE_TYPE_1` / `THROTTLE_TYPE_2` | Set throttle type |
| `PURE_ANALOG_ON` / `PURE_ANALOG_OFF` | Toggle pure analog |
| `HWANLGOFST` | Request analog offsets |
| `HWLWRDZ` | Request low deadzone |
| `HWUPRDZ` | Request high deadzone |
| `HWD\|<offX>\|<offY>\|<lowDZ>\|0` | Set analog calibration |
| `GET_GSN` | Request global mouse sensitivity |
| `GET_GSA` | Request global sensor angle |
| `GET_MOUSE_SENSOR` | Request mouse sensor state |
| `GET_RIGHT_ANALOG` | Request right analog status |
| `PI` | Request hardware profile index |
| `RESET` | Reset device |
| `DFU` | Enter DFU firmware update mode |

### String Response Prefixes

| Prefix | Meaning |
|---|---|
| `BP_<code>` / `BR_<code>` | Button press/release |
| `JOY_<code>_<x>_<y>` | Joystick data |
| `PJOY_<code>_<x>_<y>` | Pure joystick data |
| `FWV_<version>` | Firmware version |
| `FWT_<type>` | Firmware type |
| `LEDBRT_<value>` | LED brightness |
| `LEDS_ON` / `LEDS_OFF` | LED state |
| `PL_<count>` | Profile limit |
| `PI_<index>` | Profile index |
| `BOK` | Button bind ACK |
| `PROK` | Profile operation ACK |

### String Button Bind Format

```
B<profileId>|<buttonId>|<type>|<pinOne>|<pinTwo>|<keyValues>|<metaValues>|1
BX<profileId>|<buttonId>|<type>|<pinOne>|<pinTwo>|<keyValues>|<metaValues>|<featureDelay>|1   (long press)
BD<profileId>|<buttonId>|<type>|<pinOne>|<pinTwo>|<keyValues>|<metaValues>|<doubleDelay>|1   (double press)
```

### String Profile Wire Format (Device -> Host)

Each item is a separate line/message:

```
PROFILES
PROFILE
<index>
<name>
Q<btnId>%<pinOne>%<pinTwo>%<type>%<key1>%<key2>%<key3>%<key4>%<meta1>%<meta2>%<meta3>
Q<btnId>%<pinOne>%<pinTwo>%<type>%<key1>%<key2>%<key3>%<key4>%<meta1>%<meta2>%<meta3>
...
END_PROFILE
PROFILE
...
END_PROFILES
```

Button data: 11 `%`-delimited fields: `Q<buttonId>`, pinOne, pinTwo, type, key1-4, meta1-3.

---

## 4. Binary Protocol

### Write Framing (Xo function)

Each page is a HID report: `[0x00, ...page_data]` (65 bytes max).

**Page header (7 bytes):**

| Offset | Size | Field |
|---|---|---|
| 0-1 | 2 bytes | Total payload size (BE uint16) |
| 2 | 1 byte | Command type (Yo enum) |
| 3 | 1 byte | Echo/sequence number (0-254) |
| 4 | 1 byte | Total pages |
| 5 | 1 byte | Current page (1-indexed) |
| 6 | 1 byte | This page's payload size |
| 7+ | variable | Payload (max 57 bytes per page) |

### Binary Command Types (Yo Enum)

| Value | Name | Payload |
|---|---|---|
| 1 | KEYPAD_STATUS | [] |
| 2 | KEYPAD_DETAILS | [] |
| 3 | KEYPAD_DETAILS_SAVE | [...] |
| 4 | PROFILE_PAYLOAD | [] |
| 5 | FIRMWARE_VERSION | [] |
| 6 | MODE_SWITCH | [mode] (1=HW, 0=SW) |
| 7 | LED_STATE | [state] (1=on, 0=off) |
| 8 | SET_THROTTLE_TYPE | [type] |
| 9 | SET_LED_BRIGHTNESS | [brightness] |
| 10 | BUTTON_BIND | [profileId, btnId, triggerType, bindType, pinOne, pinTwo, ...keyValues(u16BE), ...metaValues(u16BE), isHold, holdTime(u16BE), featureDelay(u16BE), doubleDelay(u16BE)] |
| 11 | OBM_COPY | [...] |
| 12 | RESET | [] |
| 13 | DFU | [] |
| 14 | HARDWARE_PROFILE_INDEX | [] |
| 15 | PURE_ANALOG | [enabled] |
| 16 | PROFILE_NAME | [profileIndex, nameLength, ...nameBytes] |
| 17 | LEGACY_MODE_SWITCH | [...] |
| 18 | PING_DEVICE | [] |
| 19 | GET_ALL_GLOBAL_MOUSE_SETTINGS | [] |
| 20 | SET_GLOBAL_MOUSE_SENSOR_STATE | [...] |
| 21 | SET_GLOBAL_MOUSE_SENSOR_SENSITIVITY | [...] |
| 22 | SET_GLOBAL_MOUSE_SENSOR_ANGLE | [...] |
| 23 | SET_MOUSE_SENSOR_SENSITIVITY_SETTINGS | [...] |
| 24 | SET_MOUSE_SENSOR_STATE_SETTINGS | [...] |
| 25 | SET_MOUSE_SENSOR_ANGLE_SETTINGS | [...] |
| 26 | SWITCH_PROFILE | [profileIndex] |
| 27 | ADD_PROFILE | [] |
| 28 | DELETE_PROFILE | [profileIndex] |
| 29 | CHECK_PROFILE | [profileIndex] |
| 30 | REQUEST_PROFILE | [profileIndex] |
| 31 | PROFILE_LIMIT | [] |
| 32 | SOFTWARE_BUTTON | [isPress, buttonId, isRelease, triggerType, value>>8, value&0xFF] |
| 33 | RIGHT_ANALOG | [] |
| 34 | SET_THROTTLE_VALUE | [value] |
| 35 | ANALOG_CALIBRATION_DATA | [offX(u16BE), offY(u16BE), xMin(u16BE), xMax(u16BE), yMin(u16BE), yMax(u16BE), upperDZ(u16BE), lowerDZ(u16BE)] |
| 36 | SWITCH_BUTTON_STATE | [value] |
| 37 | DPI_BUTTON_STATE | [...] |
| 38 | SW_ANALOG_SETTINGS | [...] |
| 39 | SW_BUTTON_WHEEL | [...] |
| 40 | OBM_PROFILE_SETTINGS_COPY | [...] |
| 41 | UPDATE_DEVICE_ID | [id>>8, id&0xFF] |
| 42 | RELEASE_SW_BUTTONS | [] |
| 43 | PROFILE_INPUT_PIECE | [] |
| 44 | LED_EFFECT | [effectId, r, g, b] |
| 45 | ANALOG_BIND | [...] |
| 46 | PROFILE_PAYLOAD_V2 | [] |
| 47 | RGB_LED_STATE | [profileId, r, g, b] |
| 48 | SET_ANALOG_THROTTLE | [value] |
| 49 | SET_GLOBAL_ANGLE | [isOn, angle>>8, angle&0xFF] |
| 255 | MEMORY_DETAILS | [] |

### Binary Response Header Parsing

```
byte[0-1] = size (int16 LE)
byte[2]   = command type (Yo enum)
byte[3]   = echo/sequence number
byte[4]   = total pages
byte[5]   = current page
byte[6]   = payload size
byte[7+]  = payload data
```

### Multi-Page Profile Data Inner Header

Each profile page has a 4-byte inner header:
```
byte[0] = page counter
byte[1] = flag (0=PROFILE_HEADER, 1=PROFILE_SETTINGS, 2=BUTTON_SETTINGS)
byte[2] = isLast (1=yes)
byte[3] = XOR checksum of bytes 0-2
```

### KEYPAD_DETAILS Response

```
byte[0]    = isLedEnabled (1=yes)
byte[1]    = ledBrightness
byte[2]    = isBounceThrottle (1=yes)
byte[3]    = throttleValue
byte[4]    = isRightStick (1=yes)
byte[5]    = fwType
byte[6]    = keypadType
byte[9-10] = offsetX (int16 LE)
byte[11-12]= offsetY (int16 LE)
byte[13-14]= lowDeadzone (uint16 LE)
byte[15-16]= highDeadzone (uint16 LE)
byte[17]   = hasDefaultProfiles (1=yes)
byte[18-19]= uniqueDeviceId (uint16 LE)
byte[20-21]= xMin (int16 LE)
byte[22-23]= xMax (int16 LE)
byte[24-25]= yMin (int16 LE)
byte[26-27]= yMax (int16 LE)
byte[28]   = isGlobalAngle (1=yes) [V3+]
byte[29-30]= globalAngle (int16 LE) [V3+]
```

---

## 5. Firmware Update

### Teensy-based (Classic/Cyborg original)

Uses `teensy_loader_cli --mcu=at90usb1286 -w <firmware.hex>`

### STM32 DFU (Cyro, CyborgTansy, CyborgV2, Keyzen)

1. Send DFU command to device
2. Wait for device to enter bootloader (VID 0x0483, PID 0xDF11)
3. Flash with `dfu-util -d 0483:df11 -a <alt> -s <addr>:leave -S <serial> -D <firmware.bin>`

Firmware files: `azeron-fw-<type>-<version>.bin/.hex`
Types: cyborg, classic-compact, cyro, cyro-p, cyro-lefty, cyro-lefty-p, cyborg-tansy, classic-tansy, cyborg-v2, cyborg-v2-p, keyzen, keyzen-p

---

## 6. Connection Lifecycle

1. USB attach event triggers device scan
2. Filter devices by VID/PID/usage/usagePage
3. Open HID device by path (`new HID(path)`)
4. Send `connect` event to renderer with `{pid, path, serial}`
5. Start 3-second ping interval (`Hi` string or `PING_DEVICE` binary)
6. Request device details, firmware version, profiles, etc.
7. Binary pings only sent when idle > 3 seconds

### Command Queue

Commands are queued to avoid overwhelming the device:
- Default timeout: 2 seconds
- Profile request timeout: 20 seconds
- Software button timeout: 50ms
- Responses matched by echo/sequence number (binary) or prefix (string)
