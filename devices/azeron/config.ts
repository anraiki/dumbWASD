const config = {
  vendor_id: 0x16d0,
  product_id: 0x10bc,
  friendly_name: "Azeron Cyborg",
  button_count: 38,
  raw_name_aliases: [
    "Azeron LTD Azeron Keypad",
    "Azeron Keypad",
  ],
  capabilities: ["keyboard", "mouse", "joystick"],
  joystick: {
    center: 512,
    span: 512,
    keyboard_direction_codes: [17, 30, 31, 32],
  },
};

export default config;
