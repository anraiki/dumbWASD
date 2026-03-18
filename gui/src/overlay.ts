import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ButtonStateEvent {
  code: number;
  pressed: boolean;
}

const EVDEV_NAMES: Record<number, string> = {
  1:"ESC",2:"1",3:"2",4:"3",5:"4",6:"5",7:"6",8:"7",9:"8",10:"9",11:"0",
  12:"-",13:"=",14:"BACKSPACE",15:"TAB",16:"Q",17:"W",18:"E",19:"R",20:"T",
  21:"Y",22:"U",23:"I",24:"O",25:"P",26:"[",27:"]",28:"ENTER",29:"L_CTRL",
  30:"A",31:"S",32:"D",33:"F",34:"G",35:"H",36:"J",37:"K",38:"L",39:";",
  40:"'",41:"`",42:"L_SHIFT",43:"\\",44:"Z",45:"X",46:"C",47:"V",48:"B",
  49:"N",50:"M",51:",",52:".",53:"/",54:"R_SHIFT",56:"L_ALT",57:"SPACE",
  58:"CAPSLOCK",59:"F1",60:"F2",61:"F3",62:"F4",63:"F5",64:"F6",65:"F7",
  66:"F8",67:"F9",68:"F10",69:"NUMLOCK",87:"F11",88:"F12",96:"NUMPAD_ENTER",
  97:"R_CTRL",100:"R_ALT",103:"UP",105:"LEFT",106:"RIGHT",108:"DOWN",
  110:"INSERT",111:"DELETE",113:"MUTE",114:"VOL_DOWN",115:"VOL_UP",
  272:"MOUSE_L",273:"MOUSE_R",274:"MOUSE_M",275:"MOUSE_4",276:"MOUSE_5",
};

const appWindow = getCurrentWindow();

const titleBar = document.querySelector<HTMLElement>(".overlay-titlebar")!;
const activeKeysEl = document.getElementById("active-keys")!;
const eventFeedEl = document.getElementById("event-feed")!;
const closeBtn = document.getElementById("btn-close")!;

// Drag the window by the titlebar (webkit2gtk doesn't support -webkit-app-region)
// Fire-and-forget — must not await or GTK loses the mouse event context
titleBar.addEventListener("mousedown", (e) => {
  if ((e.target as HTMLElement).closest(".overlay-close")) return;
  e.preventDefault();
  appWindow.startDragging();
});

const pressedKeys = new Set<number>();

function renderActiveKeys() {
  if (pressedKeys.size === 0) {
    activeKeysEl.innerHTML = `<span class="empty-state">No keys pressed</span>`;
    return;
  }
  activeKeysEl.innerHTML = "";
  for (const code of pressedKeys) {
    const el = document.createElement("span");
    el.className = "active-key";
    el.textContent = EVDEV_NAMES[code] || `${code}`;
    activeKeysEl.appendChild(el);
  }
}

function addFeedEntry(code: number, pressed: boolean) {
  const name = EVDEV_NAMES[code] || `?`;
  const action = pressed ? "PRESS" : "RELEASE";
  const entry = document.createElement("div");
  entry.className = `feed-entry ${pressed ? "feed-press" : "feed-release"}`;
  entry.textContent = `${name} (${code}) ${action}`;

  // Prepend so newest is on top
  eventFeedEl.insertBefore(entry, eventFeedEl.firstChild);

  // Cap at 30 entries
  while (eventFeedEl.children.length > 30) {
    eventFeedEl.removeChild(eventFeedEl.lastChild!);
  }
}

// Close button
closeBtn.addEventListener("click", () => {
  appWindow.close();
});

// Listen for button state events from the main window's monitoring
listen<ButtonStateEvent>("button-state", (event) => {
  const { code, pressed } = event.payload;

  if (pressed) {
    pressedKeys.add(code);
  } else {
    pressedKeys.delete(code);
  }

  renderActiveKeys();
  addFeedEntry(code, pressed);
});
