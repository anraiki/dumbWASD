export interface SelectorItem {
  value: string;
  label: string;
  detail?: string;
}

export interface SelectorOptions {
  label: string;
  items: SelectorItem[];
  onChange: (value: string) => void;
}

export function createDeviceSelector(
  container: HTMLElement,
  options: SelectorOptions
) {
  const select = document.createElement("select");
  select.className = "selector";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = `-- ${options.label} --`;
  placeholder.disabled = true;
  placeholder.selected = true;
  select.appendChild(placeholder);

  for (const item of options.items) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    if (item.detail) {
      opt.title = item.detail;
    }
    select.appendChild(opt);
  }

  select.addEventListener("change", () => {
    if (select.value) {
      options.onChange(select.value);
    }
  });

  container.appendChild(select);
}
