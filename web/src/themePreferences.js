const storageKey = "qqmusic-web.themePreferences";
const themes = new Set(["pink", "orange", "green", "blue"]);
const modes = new Set(["light", "dark", "system"]);

export const defaultThemePreferences = { theme: "pink", mode: "system" };

export function loadThemePreferences(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || "null");
    return {
      theme: themes.has(saved?.theme) ? saved.theme : defaultThemePreferences.theme,
      mode: modes.has(saved?.mode)
        ? saved.mode
        : typeof saved?.followSystem === "boolean"
          ? saved.followSystem ? "system" : "light"
          : defaultThemePreferences.mode,
    };
  } catch {
    return { ...defaultThemePreferences };
  }
}

export function saveThemePreferences(preferences, storage = globalThis.localStorage) {
  storage?.setItem(storageKey, JSON.stringify(preferences));
}

export function applyThemePreferences(root, preferences, systemPrefersDark = false) {
  root.dataset.theme = preferences.theme;
  root.dataset.appearance = preferences.mode;
  root.dataset.scheme = preferences.mode === "dark" || (preferences.mode === "system" && systemPrefersDark) ? "dark" : "light";
}
