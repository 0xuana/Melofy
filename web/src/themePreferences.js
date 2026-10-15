const storageKey = "qqmusic-web.themePreferences";
const themes = new Set(["pink", "orange", "green"]);

export const defaultThemePreferences = { theme: "pink", followSystem: true };

export function loadThemePreferences(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || "null");
    return {
      theme: themes.has(saved?.theme) ? saved.theme : defaultThemePreferences.theme,
      followSystem: typeof saved?.followSystem === "boolean" ? saved.followSystem : defaultThemePreferences.followSystem,
    };
  } catch {
    return { ...defaultThemePreferences };
  }
}

export function saveThemePreferences(preferences, storage = globalThis.localStorage) {
  storage?.setItem(storageKey, JSON.stringify(preferences));
}

export function applyThemePreferences(root, preferences) {
  root.dataset.theme = preferences.theme;
  root.dataset.followSystem = String(preferences.followSystem);
}
