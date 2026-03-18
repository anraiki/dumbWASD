export interface ProfileDrawerOptions {
  onSelect: (profileName: string) => void;
  onAdd: () => void;
}

export interface ProfileDrawer {
  setProfiles(names: string[]): void;
  setSelected(name: string | null): void;
}

export function createProfileDrawer(
  listEl: HTMLUListElement,
  addBtn: HTMLElement,
  options: ProfileDrawerOptions
): ProfileDrawer {
  let profiles: string[] = [];
  let selected: string | null = null;

  function render() {
    // Remove all items except the add button
    while (listEl.firstChild && listEl.firstChild !== addBtn) {
      listEl.removeChild(listEl.firstChild);
    }
    // Insert profile items before the add button
    for (const name of profiles) {
      const li = document.createElement("li");
      li.className = "profile-item" + (name === selected ? " selected" : "");
      li.textContent = name;
      li.addEventListener("click", () => options.onSelect(name));
      listEl.insertBefore(li, addBtn);
    }
  }

  addBtn.addEventListener("click", () => options.onAdd());

  return {
    setProfiles(names: string[]) {
      profiles = names;
      render();
    },
    setSelected(name: string | null) {
      selected = name;
      render();
    },
  };
}
