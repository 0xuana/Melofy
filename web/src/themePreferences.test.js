import assert from "node:assert/strict";
import test from "node:test";
import { applyThemePreferences, loadThemePreferences, saveThemePreferences } from "./themePreferences.js";

function createStorage(value = null) {
  let saved = value;
  return {
    getItem: () => saved,
    setItem: (_key, next) => { saved = next; },
  };
}

test("theme and appearance mode persist locally", () => {
  const storage = createStorage();
  const preferences = { theme: "blue", mode: "dark" };
  saveThemePreferences(preferences, storage);

  assert.deepEqual(loadThemePreferences(storage), preferences);
});

test("migrates legacy browser-follow preference to an appearance mode", () => {
  assert.deepEqual(loadThemePreferences(createStorage()), { theme: "pink", mode: "system" });
  assert.deepEqual(loadThemePreferences(createStorage('{"theme":"green","followSystem":false}')), {
    theme: "green",
    mode: "light",
  });
  assert.deepEqual(loadThemePreferences(createStorage('{"theme":"violet","followSystem":"yes"}')), {
    theme: "pink",
    mode: "system",
  });
});

test("explicit dark and light modes override the system color scheme", () => {
  const root = { dataset: {} };
  applyThemePreferences(root, { theme: "green", mode: "dark" }, false);
  assert.deepEqual(root.dataset, { theme: "green", appearance: "dark", scheme: "dark" });

  applyThemePreferences(root, { theme: "green", mode: "light" }, true);
  assert.deepEqual(root.dataset, { theme: "green", appearance: "light", scheme: "light" });
});

test("system appearance mode follows the supplied browser scheme", () => {
  const root = { dataset: {} };
  applyThemePreferences(root, { theme: "orange", mode: "system" }, true);
  assert.deepEqual(root.dataset, { theme: "orange", appearance: "system", scheme: "dark" });

  applyThemePreferences(root, { theme: "orange", mode: "system" }, false);
  assert.equal(root.dataset.scheme, "light");
});
